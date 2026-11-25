import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, Copy, ExternalLink, Filter, Link2, LoaderCircle, MousePointer2, Package, Plus, RefreshCw, Search, Settings2, ShoppingBag, Sparkles, TrendingUp, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './style.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const compact = n => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const when = s => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

async function request(path, options) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Something went wrong');
  return data;
}

function App() {
  const [products, setProducts] = useState([]), [stats, setStats] = useState(null), [providerMode, setProviderMode] = useState('demo'), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [modal, setModal] = useState(false), [url, setUrl] = useState(''), [title, setTitle] = useState(''), [marketplace, setMarketplace] = useState('Amazon'), [providerLink, setProviderLink] = useState('');
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('All products');

  async function refresh() {
    try { const [p, s, c] = await Promise.all([request('/api/products'), request('/api/analytics'), request('/api/config')]); setProducts(p); setStats(s); setProviderMode(c.provider_mode || 'demo'); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const filtered = useMemo(() => products.filter(p => (filter === 'All products' || (filter === 'Active' ? p.active : !p.active)) && `${p.title} ${p.marketplace} ${p.source_url}`.toLowerCase().includes(query.toLowerCase())), [products, query, filter]);

  async function addProduct(e) {
    e.preventDefault(); setSubmitting(true); setError('');
    try { await request('/api/products', { method: 'POST', body: JSON.stringify({ url, title, marketplace, provider_tracking_url: providerLink || null }) }); setModal(false); setUrl(''); setTitle(''); setProviderLink(''); setMarketplace('Amazon'); setNotice('Product added and tracking link created'); await refresh(); }
    catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }
  async function toggle(p) { try { await request(`/api/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) }); await refresh(); } catch (e) { setError(e.message); } }
  async function remove(p) { if (!confirm(`Delete ${p.title}? Its click and purchase history will also be deleted.`)) return; try { await request(`/api/products/${p.id}`, { method: 'DELETE' }); await refresh(); } catch (e) { setError(e.message); } }
  async function copy(text, message = 'Tracking link copied') { try { await navigator.clipboard.writeText(text); setNotice(message); setTimeout(() => setNotice(''), 2400); } catch { setError('Could not copy link'); } }
  const totals = stats || { clicks: 0, purchases: 0, commission: 0, conversion_rate: 0, active_products: 0, daily_clicks: [] };
  const chartData = (totals.daily_clicks || []).map(d => ({ ...d, label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }) }));

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><Link2 size={19}/></span><span>linkwise<span className="brand-dot">.</span></span></a>
      <div className="workspace"><div className="workspace-avatar">S</div><div><b>Studio workspace</b><small>Free plan</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav><a className="nav-item selected"><BarChart3 size={17}/> Overview</a><a className="nav-item"><Package size={17}/> Products <span className="nav-count">{products.length}</span></a><a className="nav-item"><Activity size={17}/> Activity</a></nav>
      <div className="nav-label tools-label">MANAGE</div>
      <nav><a className="nav-item"><Settings2 size={17}/> Settings</a><a className="nav-item"><CircleHelp size={17}/> Help & support</a></nav>
      <div className="sidebar-bottom"><div className="upgrade"><Sparkles size={17}/><b>Get more from Linkwise</b><p>Unlock deeper insights and grow faster.</p><button>Explore plans <ArrowUpRight size={14}/></button></div><div className="profile"><div className="profile-avatar">SK</div><div><b>Saksham</b><small>Personal account</small></div><MoreIcon/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><button className="icon-btn" aria-label="Refresh analytics" title="Refresh analytics" onClick={refresh}><RefreshCw size={16}/></button><button className="icon-btn" aria-label="Search"><Search size={18}/></button><button className="icon-btn notification" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">SK</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow">TUESDAY, {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>Good morning, Saksham <span>✦</span></h1><p>Here’s what’s happening with your product links.</p></div><button className="primary-btn" onClick={() => { setModal(true); setError(''); }}><Plus size={17}/> Add product link</button></div>
        {error && <div className="alert"><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
        {notice && <div className="notice"><Check size={16}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
        <section className="metrics">
          <Metric label="Total clicks" value={compact(totals.clicks)} icon={<MousePointer2/>} hint="Across all product links" accent="blue"/>
          <Metric label="Purchases" value={compact(totals.purchases)} icon={<ShoppingBag/>} hint="Reported by your provider" accent="green"/>
          <Metric label="Commission revenue" value={money(totals.commission)} icon={<TrendingUp/>} hint="Commission reported by your provider" accent="purple"/>
          <Metric label="Conversion rate" value={`${totals.conversion_rate}%`} icon={<Activity/>} hint="Purchases / total clicks" accent="orange"/>
        </section>
        <section className="analytics-grid">
          <div className="panel chart-panel"><div className="panel-heading"><div><h2>Click performance</h2><p>Traffic across all tracked products</p></div><button className="period-select">Last 7 days <ChevronDown size={14}/></button></div><div className="chart-legend"><span><i/> Clicks</span><strong>{compact(totals.clicks)} <small>total</small></strong></div><div className="chart-wrap">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 4, bottom: 0, left: -18 }}><defs><linearGradient id="clickGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5856d6" stopOpacity={0.16}/><stop offset="100%" stopColor="#5856d6" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f4"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#9299a5', fontSize: 11 }}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#9299a5', fontSize: 11 }}/><Tooltip contentStyle={{ border: '1px solid #e8eaf0', borderRadius: 10, fontSize: 12 }}/><Area type="monotone" dataKey="clicks" stroke="#5856d6" strokeWidth={2.4} fill="url(#clickGradient)" activeDot={{ r: 5, fill: '#5856d6', stroke: '#fff', strokeWidth: 3 }}/></AreaChart></ResponsiveContainer> : <div className="chart-empty"><span><BarChart3 size={19}/></span><b>No click activity yet</b><small>Clicks from your tracking links will show up here.</small></div>}</div></div>
          <div className="panel snapshot"><div className="panel-heading"><div><h2>At a glance</h2><p>Your tracking overview</p></div><button className="more-btn">···</button></div><div className="snapshot-main"><div className="snapshot-icon"><Link2 size={18}/></div><div><strong>{products.length}</strong><small>product links</small></div><div className="active-pill"><i/>{totals.active_products} active</div></div><div className="snapshot-separator"/><div className="snapshot-row"><span>Active tracking</span><b>{totals.active_products} <span>links</span></b></div><div className="snapshot-row"><span>Purchases</span><b>{compact(totals.purchases)}</b></div><div className="snapshot-row"><span>Commission revenue</span><b>{money(totals.commission)}</b></div><div className="snapshot-note"><Sparkles size={15}/><span>Purchases and commission update when your provider reports conversions.</span></div></div>
        </section>
        <section className="panel products-panel"><div className="panel-heading products-heading"><div><h2>Your product links <span className="count-badge">{products.length}</span></h2><p>Manage and monitor all your tracked products.</p></div><button className="secondary-btn" onClick={() => { setModal(true); setError(''); }}><Plus size={16}/> Add product</button></div>
          <div className="table-controls"><div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products..."/></div><button className="filter-btn" onClick={() => setFilter(filter === 'All products' ? 'Active' : filter === 'Active' ? 'Paused' : 'All products')}><Filter size={15}/>{filter}<ChevronDown size={14}/></button></div>
          <div className="table-scroll"><table><thead><tr><th>PRODUCT / PLATFORM</th><th>STATUS</th><th>CLICKS</th><th>PURCHASES</th><th>CONV. RATE</th><th>COMMISSION</th><th>ADDED</th><th></th></tr></thead><tbody>
          {loading ? <tr><td colSpan="8" className="loading-row"><LoaderCircle className="spin" size={20}/> Loading your products…</td></tr> : filtered.length ? filtered.map(p => <ProductRow key={p.id} product={p} onToggle={() => toggle(p)} onCopy={() => copy(p.short_url)} onCopyUtm={() => copy(p.utm_url, 'UTM destination copied')} onDelete={() => remove(p)}/>) : <tr><td colSpan="8"><div className="empty-state"><div className="empty-icon"><Link2 size={22}/></div><b>{products.length ? 'No matching products' : 'Your dashboard starts here'}</b><p>{products.length ? 'Try adjusting your search or filter.' : 'Add your first Amazon or Flipkart link to start tracking performance.'}</p>{!products.length && <button className="primary-btn" onClick={() => { setModal(true); setError(''); }}><Plus size={16}/> Add product link</button>}</div></td></tr>}
          </tbody></table></div><div className="table-footer"><span>Showing <b>{filtered.length ? 1 : 0}–{filtered.length}</b> of <b>{filtered.length}</b> products</span><div><button disabled>Previous</button><button disabled>Next</button></div></div>
        </section>
        <footer>© 2026 Linkwise <span>·</span> Built for smarter product tracking <span className="footer-right">Data updates in real time <i/></span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(false)}><form className="modal" onSubmit={addProduct}><button type="button" className="modal-close" onClick={() => setModal(false)}><X size={18}/></button><div className="modal-icon"><Link2 size={21}/></div><div className="eyebrow">NEW TRACKED LINK</div><h2>Add a product link</h2><p>Paste a product page. Linkwise adds UTM tags and creates a short click-tracking link automatically.</p><label>Product page URL<input autoFocus type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.amazon.in/..."/></label><label>E-commerce platform<select value={marketplace} onChange={e => setMarketplace(e.target.value)}><option>Amazon</option><option>Flipkart</option><option>Others</option></select></label><label>Product name <span className="optional">OPTIONAL</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wireless headphones"/></label><label>Affiliate tracking URL <span className="optional">OPTIONAL</span><input type="url" value={providerLink} onChange={e => setProviderLink(e.target.value)} placeholder="Paste a provider affiliate link if you have one"/></label><div className="provider-hint"><Sparkles size={15}/><span>{providerLink ? 'UTM tags will be added to this affiliate URL where they are not already present.' : <> {providerMode === 'api' ? 'Your configured provider API will generate the affiliate destination.' : 'Demo mode uses the product page as the destination.'} Linkwise will add UTM tags either way.</>}</span></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="cancel-btn" onClick={() => setModal(false)}>Cancel</button><button className="primary-btn" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={16}/> Creating…</> : <><Plus size={16}/> Create tracking links</>}</button></div></form></div>}
  </div>;
}

function Metric({ label, value, icon, hint, accent }) { return <div className="metric-card"><div className={`metric-icon ${accent}`}>{React.cloneElement(icon, { size: 17 })}</div><div className="metric-label">{label}</div><strong>{value}</strong><div className="metric-hint">{hint}</div><span className="metric-corner"><ArrowDownRight size={18}/></span></div>; }
function ProductRow({ product: p, onToggle, onCopy, onCopyUtm, onDelete }) { return <tr><td><div className="product-cell"><div className={`market-icon ${p.marketplace.toLowerCase()}`}>{p.marketplace === 'Amazon' ? 'a' : p.marketplace === 'Flipkart' ? 'f' : '•'}</div><div className="product-info"><b>{p.title}</b><a href={p.source_url} target="_blank" rel="noreferrer">{p.marketplace} · {new URL(p.source_url).hostname.replace('www.', '')}<ExternalLink size={11}/></a><button className="tracking-url" onClick={onCopy} title="Copy and share this to count clicks">Share for click count: {p.short_url}<Copy size={10}/></button><button className="tracking-url utm-url" onClick={onCopyUtm} title="Copy tagged destination (direct clicks won't count here)">Tagged destination: {p.utm_url}<Copy size={10}/></button></div></div></td><td><button className={`status ${p.active ? 'on' : 'paused'}`} onClick={onToggle}><i/>{p.active ? 'Active' : 'Paused'}</button></td><td className="numeric">{p.clicks.toLocaleString('en-IN')}</td><td className="numeric">{p.purchases.toLocaleString('en-IN')}</td><td className="numeric">{p.conversion_rate}%</td><td className="numeric">{money(p.commission)}</td><td className="date-cell">{when(p.created_at)}</td><td><div className="row-actions"><button title="Copy short link" onClick={onCopy}><Copy size={15}/></button><button title="Delete product" onClick={onDelete}><X size={15}/></button></div></td></tr>; }
function MoreIcon() { return <span className="more-dots">···</span>; }

createRoot(document.getElementById('root')).render(<App/>);
