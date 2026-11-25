from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Generator, Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import AnyHttpUrl, BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./tracker.db"
    frontend_origin: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:8000"
    provider_mode: str = "demo"
    provider_api_url: str = ""
    provider_api_key: str = ""
    provider_webhook_secret: str = ""


settings = Settings()
db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(db_url, connect_args={"check_same_thread": False} if db_url.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), default="Tracked product")
    source_url: Mapped[str] = mapped_column(Text)
    tracking_url: Mapped[str] = mapped_column(Text)
    provider_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    short_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    marketplace: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    clicks: Mapped[list["Click"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    conversions: Mapped[list["Conversion"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class Click(Base):
    __tablename__ = "clicks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    visitor_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    referer: Mapped[str | None] = mapped_column(Text, nullable=True)
    product: Mapped[Product] = relationship(back_populates="clicks")


class Conversion(Base):
    __tablename__ = "conversions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    revenue: Mapped[float] = mapped_column(Float, default=0)
    commission: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    product: Mapped[Product] = relationship(back_populates="conversions")


Base.metadata.create_all(bind=engine)
app = FastAPI(title="Product Link Tracker API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ProductCreate(BaseModel):
    url: AnyHttpUrl
    title: str = Field(default="", max_length=200)
    marketplace: Literal["Amazon", "Flipkart", "Others"] | None = None
    provider_tracking_url: AnyHttpUrl | None = None


class ProductUpdate(BaseModel):
    active: bool


class ConversionEvent(BaseModel):
    event_id: str = Field(min_length=1, max_length=200)
    tracking_url: str | None = None
    tracking_code: str | None = Field(default=None, max_length=64)
    provider_id: str | None = Field(default=None, max_length=200)
    product_id: int | None = None
    revenue: float = Field(default=0, ge=0)
    commission: float = Field(default=0, ge=0)


def provider_create(source_url: str) -> tuple[str, str | None]:
    if settings.provider_mode.lower() == "demo":
        return source_url, "demo"
    if not settings.provider_api_url or not settings.provider_api_key:
        raise HTTPException(503, "Provider is not configured. Set PROVIDER_API_URL and PROVIDER_API_KEY.")
    try:
        response = httpx.post(settings.provider_api_url, json={"url": source_url}, headers={"Authorization": f"Bearer {settings.provider_api_key}"}, timeout=20)
        response.raise_for_status()
        data = response.json()
        tracking_url = data.get("tracking_url") or data.get("tracked_url") or data.get("url")
        if not tracking_url:
            raise ValueError("Provider response must contain tracking_url")
        return str(tracking_url), str(data.get("id") or "") or None
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(502, f"Provider request failed: {exc}") from exc


def add_utm_tags(destination: str, product: Product) -> str:
    """Add Linkwise campaign tags while preserving any provider query parameters."""
    parts = urlsplit(destination)
    params = parse_qsl(parts.query, keep_blank_values=True)
    existing = {key for key, _ in params}
    tags = {
        "utm_source": "linkwise",
        "utm_medium": "referral",
        "utm_campaign": f"product-{product.marketplace.lower()}-{product.id}",
        "utm_content": product.short_code,
    }
    for key, value in tags.items():
        if key not in existing:
            params.append((key, value))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(params), parts.fragment))


def product_payload(product: Product, db: Session) -> dict:
    clicks = db.scalar(select(func.count(Click.id)).where(Click.product_id == product.id)) or 0
    conversions = db.scalar(select(func.count(Conversion.id)).where(Conversion.product_id == product.id)) or 0
    revenue = db.scalar(select(func.coalesce(func.sum(Conversion.revenue), 0)).where(Conversion.product_id == product.id)) or 0
    commission = db.scalar(select(func.coalesce(func.sum(Conversion.commission), 0)).where(Conversion.product_id == product.id)) or 0
    return {"id": product.id, "title": product.title, "source_url": product.source_url, "tracking_url": product.tracking_url, "utm_url": product.tracking_url,
            "short_url": f"{settings.public_base_url.rstrip('/')}/r/{product.short_code}", "provider_id": product.provider_id,
            "marketplace": product.marketplace, "active": product.active, "created_at": product.created_at,
            "clicks": clicks, "purchases": conversions, "revenue": float(revenue), "commission": float(commission),
            "conversion_rate": round(conversions / clicks * 100, 2) if clicks else 0}


@app.get("/")
def root():
    return {"name": "Product Link Tracker API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def public_config():
    return {"provider_mode": settings.provider_mode.lower()}


@app.post("/api/products")
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    source_url = str(payload.url)
    host = (urlparse(source_url).hostname or "").lower().removeprefix("www.")
    if payload.marketplace:
        marketplace = payload.marketplace
    elif host == "flipkart.com" or host.endswith(".flipkart.com"):
        marketplace = "Flipkart"
    elif host == "amazon.com" or host.endswith(".amazon.com") or host == "amazon.in" or host.endswith(".amazon.in"):
        marketplace = "Amazon"
    else:
        marketplace = "Others"
    if payload.provider_tracking_url:
        destination_url, provider_id = str(payload.provider_tracking_url), "manual"
    else:
        destination_url, provider_id = provider_create(source_url)
    product = Product(title=payload.title.strip() or "Tracked product", source_url=source_url, tracking_url=destination_url,
                      provider_id=provider_id, short_code=secrets.token_urlsafe(7), marketplace=marketplace)
    db.add(product)
    db.flush()
    product.tracking_url = add_utm_tags(destination_url, product)
    db.commit()
    db.refresh(product)
    return product_payload(product, db)


@app.get("/api/products")
def list_products(db: Session = Depends(get_db)):
    products = db.scalars(select(Product).order_by(Product.created_at.desc())).all()
    return [product_payload(product, db) for product in products]


@app.patch("/api/products/{product_id}")
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    product.active = payload.active
    db.commit()
    db.refresh(product)
    return product_payload(product, db)


@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    db.delete(product)
    db.commit()
    return {"deleted": True}


@app.get("/api/analytics")
def analytics(db: Session = Depends(get_db)):
    total_products = db.scalar(select(func.count(Product.id))) or 0
    active_products = db.scalar(select(func.count(Product.id)).where(Product.active.is_(True))) or 0
    clicks = db.scalar(select(func.count(Click.id))) or 0
    conversions = db.scalar(select(func.count(Conversion.id))) or 0
    revenue = db.scalar(select(func.coalesce(func.sum(Conversion.revenue), 0))) or 0
    commission = db.scalar(select(func.coalesce(func.sum(Conversion.commission), 0))) or 0
    daily = []
    for offset in range(6, -1, -1):
        day = datetime.now(timezone.utc).date().toordinal() - offset
        date = datetime.fromordinal(day).date()
        start = datetime.combine(date, datetime.min.time(), tzinfo=timezone.utc)
        end = datetime.combine(date, datetime.max.time(), tzinfo=timezone.utc)
        day_clicks = db.scalar(select(func.count(Click.id)).where(Click.clicked_at >= start, Click.clicked_at <= end)) or 0
        daily.append({"date": date.isoformat(), "clicks": day_clicks})
    return {"total_products": total_products, "active_products": active_products, "clicks": clicks, "purchases": conversions,
            "revenue": float(revenue), "commission": float(commission), "conversion_rate": round(conversions / clicks * 100, 2) if clicks else 0, "daily_clicks": daily}


@app.get("/api/products/{product_id}/analytics")
def product_analytics(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product_payload(product, db)


@app.get("/r/{code}")
def redirect_click(code: str, request: Request, db: Session = Depends(get_db)):
    product = db.scalar(select(Product).where(Product.short_code == code))
    if not product:
        raise HTTPException(404, "Tracking link not found")
    if not product.active:
        raise HTTPException(410, "Tracking is paused for this product")
    ip = request.client.host if request.client else ""
    visitor_hash = hashlib.sha256(ip.encode()).hexdigest() if ip else None
    db.add(Click(product_id=product.id, visitor_hash=visitor_hash, referer=request.headers.get("referer")))
    db.commit()
    return RedirectResponse(product.tracking_url, status_code=307)


@app.post("/api/webhooks/conversions")
def conversion_webhook(payload: ConversionEvent, x_webhook_secret: str | None = Header(default=None), db: Session = Depends(get_db)):
    if settings.provider_webhook_secret and x_webhook_secret != settings.provider_webhook_secret:
        raise HTTPException(401, "Invalid webhook secret")
    existing = db.scalar(select(Conversion).where(Conversion.external_id == payload.event_id))
    if existing:
        return {"accepted": True, "duplicate": True}
    product = db.get(Product, payload.product_id) if payload.product_id else None
    if not product and payload.tracking_code:
        product = db.scalar(select(Product).where(Product.short_code == payload.tracking_code))
    if not product and payload.provider_id:
        product = db.scalar(select(Product).where(Product.provider_id == payload.provider_id))
    if not product and payload.tracking_url:
        product = db.scalar(select(Product).where(Product.tracking_url == payload.tracking_url))
    if not product:
        raise HTTPException(404, "No product matches this conversion")
    db.add(Conversion(product_id=product.id, external_id=payload.event_id, revenue=payload.revenue, commission=payload.commission))
    db.commit()
    return {"accepted": True, "duplicate": False}
