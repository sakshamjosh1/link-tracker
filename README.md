# Linkwise Product Link Tracker

A deployable product link tracking dashboard. Add a product page URL, choose one of the three platform labels (Amazon, Flipkart, Others), and Linkwise creates a UTM-tagged destination plus a short click-tracking URL. An optional affiliate provider URL or API can supply the affiliate destination. Purchases and commission appear only when a provider reports conversion events to the webhook.

## What is included

- **Backend:** FastAPI + SQLAlchemy, SQLite for local development and PostgreSQL in production.
- **Frontend:** React + Vite responsive dashboard.
- **Tracking:** Unique `/r/{code}` redirect records clicks before sending visitors to the UTM-tagged destination. Share this short URL to count clicks in Linkwise.
- **Purchases and commission:** Idempotent provider webhook records each purchase event, gross order revenue, and commission.
- **UTM tags:** The app adds `utm_source=linkwise`, `utm_medium=referral`, a product-specific `utm_campaign`, and a unique `utm_content` tracking code. Existing UTM keys are preserved.
- **Affiliate destination:** Paste an affiliate URL or configure a provider API when one is available; otherwise the app uses the product page URL.

Adding UTM tags does **not** create an affiliate relationship or guarantee Amazon/Flipkart purchase attribution. The UTM destination is useful to systems that read UTM parameters. Linkwise click counts are recorded only when a shopper opens the short `/r/{code}` URL; sharing the destination UTM URL directly bypasses Linkwise click counting. Sales and commission require an affiliate provider or program that attributes orders and reports conversion events. Neither UTM tags nor click tracking identifies a shopper.

## Run locally

Use Python 3.12+ and Node 20+. Render selects the latest Python 3.12 patch from `backend/.python-version`.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The backend API docs are at http://localhost:8000/docs. Local SQLite data is stored in `backend/tracker.db`.

## Provider API contract

Set `PROVIDER_MODE=api`, `PROVIDER_API_URL`, and `PROVIDER_API_KEY` on the backend. The adapter sends:

```json
{"url":"https://www.amazon.in/dp/..."}
```

with `Authorization: Bearer <key>`. It expects a JSON response containing `tracking_url` (also accepts `tracked_url` or `url`) and optionally `id`. Edit `provider_create` in `backend/app.py` to match your provider's actual authentication, request, and response schema.

If your affiliate provider returns a link outside an API flow, paste it in **Affiliate tracking URL** when adding a product. Linkwise adds its UTM tags to that destination while preserving existing UTM parameters. Choose the platform label from Amazon, Flipkart, or Others. Share the generated short link to count clicks in this dashboard.

## Conversion webhook

Configure `PROVIDER_WEBHOOK_SECRET` and provide it to your provider. Post events to `POST /api/webhooks/conversions` with `X-Webhook-Secret`:

```json
{
  "event_id": "provider-event-unique-id",
  "tracking_code": "the-utm-content-value",
  "revenue": 2499.0,
  "commission": 124.95
}
```

Each unique event represents one purchase. The provider can identify the product by `product_id`, `tracking_code` (the value sent in `utm_content`), `provider_id`, or the exact stored `tracking_url`. Repeated event IDs are ignored safely. The provider must support purchase attribution and postbacks/webhooks or reporting you can import; UTM parameters alone do not send sales into Linkwise. Check the provider's official webhook fields and authentication, then adapt the endpoint if needed. Commission currency/amount is whatever the provider reports; configure/report INR if that is your desired dashboard currency.

## Deploy backend to Render

1. Push this repo to GitHub.
2. Create a Render PostgreSQL database.
3. Create a Render Web Service with root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn app:app --host 0.0.0.0 --port $PORT`.
4. Set backend environment variables:
   - `DATABASE_URL`: Render PostgreSQL **Internal Database URL**.
   - `FRONTEND_ORIGIN`: deployed Vercel origin, such as `https://your-app.vercel.app`.
   - `PUBLIC_BASE_URL`: Render service origin, such as `https://your-api.onrender.com` (used in generated redirect links).
   - `PROVIDER_MODE`: `demo` until real API credentials are available, then `api`.
   - `PROVIDER_API_URL`, `PROVIDER_API_KEY`: from your provider.
   - `PROVIDER_WEBHOOK_SECRET`: a long random secret shared with the provider.

`backend/render.yaml` is provided as a starting blueprint. If creating the database separately, remove or adjust its database section and connect the service to the database's internal URL.
Render's current setup follows its [FastAPI deployment guide](https://render.com/docs/deploy-fastapi); the `.python-version` file pins this service to Python 3.12.

## Deploy frontend to Vercel

1. Import the GitHub repo into Vercel.
2. Set the project root directory to `frontend`.
3. Set `VITE_API_URL` to the Render service URL (no trailing slash), for example `https://your-api.onrender.com`.
4. Deploy. The Vite build command is `npm run build` and output directory is `dist`.

After deployment, ensure the Render `FRONTEND_ORIGIN` exactly matches the Vercel domain. If you use a custom domain, update it there as well.
Vercel's [monorepo deployment guide](https://vercel.com/docs/monorepos) documents setting the project root to `frontend`; Vite reads build-time environment variables prefixed with `VITE_`.

## API summary

- `POST /api/products` — add a product page and either provide a UTM destination URL or request one from the provider adapter.
- `GET /api/products` — list products with platform, clicks, purchases, commission, and conversion rate.
- `PATCH /api/products/{id}` — set `{ "active": true|false }`.
- `DELETE /api/products/{id}` — remove a product and its analytics.
- `GET /api/analytics` — dashboard totals for clicks, purchases, commission, and a seven-day click series.
- `GET /r/{code}` — record a click and redirect to provider URL.
- `POST /api/webhooks/conversions` — receive one provider purchase event with commission details.
- `GET /health` — health check.

## Production notes

This starter has no user authentication. Add authentication and per-user ownership before using it for multiple people or publishing sensitive analytics. Provider adapters are intentionally generic because the provider name and API documentation were not included in the project brief.
