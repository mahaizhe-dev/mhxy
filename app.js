const state = {
  prices: null,
  dashboard: null,
  items: null,
  icons: { items: {} },
  pointShops: null,
  activePointShop: 'artifact',
  file: null,
  activeCategory: '全部',
  searchQuery: '',
  termStatus: {},
  termQuery: '',
  ruleCatalog: null,
  selectedRuleItem: '强化石',
  expanded: { buy: null, sell: null },
  quoteImageReady: false,
  dungeonShenqi: null,
  activeDsTab: 'dungeons',
  expandedDungeons: {}
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const PUBLIC_MODE = Boolean(window.PUBLIC_SNAPSHOT);
function on(selector, event, handler) {
  const el = $(selector);
  if (el) el.addEventListener(event, handler);
}
if (document.body) document.body.classList.toggle('public-mode', PUBLIC_MODE);
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.text();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch { data = { error: body || `请求失败 ${res.status}` }; }
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}
async function load() {
  if (PUBLIC_MODE) {
    const snapshot = await api(window.PUBLIC_SNAPSHOT, { cache: 'no-store' });
    state.prices = snapshot.market;
    state.pointShops = snapshot.pointShops;
    state.dungeonShenqi = snapshot.dungeonShenqi;
    state.icons = snapshot.icons || {};
    renderAll();
    return;
  }
  [state.prices, state.dashboard, state.items, state.icons, state.ruleCatalog, state.pointShops, state.dungeonShenqi] = await Promise.all([api('/api/prices'), api('/api/dashboard'), api('/api/items'), api('/api/item-icons'), api('/api/item-rules'), api('/api/point-shops'), api('/api/dungeon-shenqi')]);
  renderAll();
}
function renderAll() { renderPrices(); renderPointShops(); renderDungeonShenqi(); if (!PUBLIC_MODE) { renderImports(); renderReviews(); renderTerms(); renderParserStatus(); } $('#generatedAt').textContent = state.prices.generatedAt ? '玉简更新于 ' + date(state.prices.generatedAt) : '等待首次纳卷'; }
function date(value) { if (!value) return '—'; return new Date(value).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(value) { if (value == null || value === '') return '—'; return Number(value).toLocaleString('zh-CN', {maximumFractionDigits:2}) + ' 万'; }
function iconHtml(item) { const src = state.icons?.[item.name] || state.icons?.[item.priceItem]; return src ? `<span class="item-icon"><img src="${esc(src)}" alt="${esc(item.name)}图标" loading="lazy"></span>` : `<span class="item-icon"><span class="icon-fallback">${esc(String(item.name||'').slice(0,1))}</span></span>`; }
function orderedCategories() { return [...new Set((state.prices?.items || []).map(item => item.category))].sort((a,b)=>a.localeCompare(b,'zh-CN')); }
function orderedItems(side) { return (state.prices?.items || []).filter(item => item[side]).filter(item => side !== 'sell' || item.name !== '副本积分'); }
function renderPrices() { const items = orderedItems('buy'); $('#buyMatrix').innerHTML = items.map(item => `<div class="price-card buy">${iconHtml(item)}<strong>${esc(item.name)}</strong><b>${fmt(item.buy.median)}</b></div>`).join(''); const sells=orderedItems('sell'); $('#sellMatrix').innerHTML=sells.map(item=>`<div class="price-card sell">${iconHtml(item)}<strong>${esc(item.name)}</strong><b>${fmt(item.sell.median)}</b></div>`).join(''); $('#itemCount').textContent=items.length; }
function renderPointShops() { const shops=state.pointShops?.shops||[]; if(!shops.length)return; $('#pointShopTabs').innerHTML=shops.map(shop=>`<button class="point-shop-tab">${esc(shop.title)}</button>`).join(''); const shop=shops[0]; $('#pointShopRows').innerHTML=(shop.items||[]).map(item=>`<tr><td>${iconHtml(item)} ${esc(item.name)}</td><td>${item.pointCost??'—'}</td><td>${fmt(item.effectivePriceWan)}</td><td>${fmt(item.valuePerPointWan)}</td><td>${item.quantity??1}</td></tr>`).join(''); }
function renderDungeonShenqi() { const data=state.dungeonShenqi; if(!data)return; $('#dungeonTimestamp').textContent=data.generatedAt?'数据更新于 '+date(data.generatedAt):'数据更新时间未知'; $('#dungeonDescription').textContent=data.description||''; const rows=data.dungeons||[]; $('#dungeonCards').innerHTML=rows.map(row=>`<article class="dungeon-card"><header><h3>${esc(row.name)}</h3><span>${esc(row.difficulty||'')}</span></header><div>副本积分 ${row.points??'—'} · 经验 ${row.expWan??'—'} · 金钱 ${row.goldWan??'—'}</div><p>${esc(row.notes||'')}</p></article>`).join(''); $('#dungeonEmpty').style.display=rows.length?'none':'block'; }
function renderImports() {}
function renderReviews() {}
function renderTerms() {}
function renderParserStatus() {}
load().catch(error => toast('加载失败：' + error.message));