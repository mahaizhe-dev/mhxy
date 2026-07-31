const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = { snapshot: null, view: 'prices', activeShop: null, activeDungeonTab: 'dungeons', query: '' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function fmt(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
}

function iconHtml(item) {
  const src = state.snapshot?.icons?.[item.name];
  if (src) return `<span class="item-icon"><img src="${esc(src)}" alt="${esc(item.name)}图标" loading="lazy"></span>`;
  return `<span class="item-icon fallback">${esc(item.name.slice(0, 1))}</span>`;
}

function isSpecialPointCurrency(item) {
  return item.name === '副本积分';
}

function filteredItems(side) {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.market?.items || []).filter(item => item[side])
    .filter(item => side !== 'sell' || !isSpecialPointCurrency(item)).filter(item => {
    if (!query) return true;
    return `${item.name} ${item.category}`.toLowerCase().includes(query);
  });
}

function renderMarket(side, target, empty) {
  const items = filteredItems(side);
  const groups = new Map();
  items.forEach(item => groups.set(item.category, [...(groups.get(item.category) || []), item]));
  $(target).innerHTML = [...groups.entries()].map(([category, rows]) => `<section class="category-group"><h3>${esc(category)} <small>${rows.length} 件</small></h3><div class="cards">${rows.map(item => {
    const stats = item[side];
    return `<article class="price-card">${iconHtml(item)}<div class="item-copy"><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></div><div class="price"><b>${fmt(stats.median)}</b><small>万两</small></div><p>最低 ${fmt(stats.min)} · 最高 ${fmt(stats.max)} · ${fmt(stats.count, 0)} 条</p></article>`;
  }).join('')}</div></section>`).join('');
  $(empty).hidden = items.length > 0;
}

function activeShop() {
  const shops = state.snapshot?.pointShops?.shops || [];
  return shops.find(shop => shop.id === state.activeShop) || shops[0] || null;
}

function renderPoints() {
  const shops = state.snapshot?.pointShops?.shops || [];
  if (!state.activeShop && shops[0]) state.activeShop = shops[0].id;
  const shop = activeShop();
  $('#pointTabs').innerHTML = shops.map(entry => `<button class="point-tab ${entry.id === shop?.id ? 'active' : ''}" data-shop="${esc(entry.id)}">${esc(entry.title)}</button>`).join('');
  $('#pointDescription').textContent = shop?.description || '';
  const rows = [...(shop?.items || [])].sort((left, right) => {
    const a = Number(left.valuePerPointWan); const b = Number(right.valuePerPointWan);
    const readyA = Number.isFinite(a) && a > 0; const readyB = Number.isFinite(b) && b > 0;
    if (readyA && readyB) return b - a;
    return readyA ? -1 : readyB ? 1 : 0;
  });
  $('#pointRows').innerHTML = rows.map(item => `<tr><td><span class="point-name">${iconHtml(item)}<strong>${esc(item.name)}</strong></span></td><td>${fmt(item.pointCost, 0)}</td><td>${fmt(item.effectivePriceWan)}</td><td class="value">${fmt(item.valuePerPointWan, 6)}</td><td>${fmt(item.quantity)}</td></tr>`).join('');
  $('#pointEmpty').hidden = rows.length > 0;
}

function publicDungeonRows() {
  const data = state.snapshot?.dungeonShenqi || {};
  return state.activeDungeonTab === 'dungeons' ? (data.dungeons || []) : (data.shenqi || []);
}

function renderDungeonShenqi() {
  const data = state.snapshot?.dungeonShenqi || {};
  const isDungeon = state.activeDungeonTab === 'dungeons';
  const rows = publicDungeonRows();
  $$('#dungeonTabs [data-ds-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.dsTab === state.activeDungeonTab));
  $('#dungeonDescription').textContent = data.description || '';
  $('#dungeonTimestamp').textContent = data.generatedAt ? `数据更新于 ${new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })}` : '公开的 129 级界玩服收益快照。';
  $('#dungeonTableHead').innerHTML = isDungeon
    ? '<tr><th>副本名称</th><th>难度</th><th>经验（万）</th><th>金币（万）</th><th>副本积分</th><th>储备金（万）</th><th>耗时（分）</th><th>掉落</th><th>备注</th></tr>'
    : '<tr><th>神器名称</th><th>类型</th><th>难度</th><th>经验（万）</th><th>金钱（万）</th><th>神器积分</th><th>储备金（万）</th><th>耗时（分）</th><th>上交道具</th><th>备注</th></tr>';
  $('#dungeonTableRows').innerHTML = rows.map(row => isDungeon
    ? `<tr><td><strong>${esc(row.name)}</strong></td><td>${esc(row.difficulty || '—')}</td><td>${fmt(row.expWan, 4)}</td><td>${fmt(row.goldWan, 4)}</td><td>${fmt(row.points, 0)}</td><td>${fmt(row.reserveGoldWan, 4)}</td><td>${fmt(row.timeMin, 0)}</td><td>${esc((row.drops || []).join('、') || '—')}</td><td>${esc(row.notes || '—')}</td></tr>`
    : `<tr><td><strong>${esc(row.name)}</strong></td><td>${esc(row.type || '—')}</td><td>${esc(row.difficulty || '—')}</td><td>${fmt(row.expWan, 4)}</td><td>${fmt(row.goldWan, 4)}</td><td>${fmt(row.points, 0)}</td><td>${fmt(row.reserveGoldWan, 4)}</td><td>${fmt(row.timeMin, 0)}</td><td>${esc(row.requiredItem || '—')}</td><td>${esc(row.notes || '—')}</td></tr>`).join('');
  $('#dungeonEmpty').hidden = rows.length > 0;
}

function renderAll() {
  renderMarket('buy', '#buyMatrix', '#buyEmpty');
  renderMarket('sell', '#sellMatrix', '#sellEmpty');
  renderPoints();
  renderDungeonShenqi();
  const published = state.snapshot?.publishedAt;
  $('#publishedAt').textContent = published ? `发布于 ${new Date(published).toLocaleString('zh-CN', { hour12: false })}` : '行情快照';
}

async function load() {
  const response = await fetch(window.PUBLIC_SNAPSHOT, { cache: 'no-store' });
  if (!response.ok) throw new Error(`行情快照读取失败：${response.status}`);
  state.snapshot = await response.json(); renderAll();
}

$$('.tab').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; $$('.tab').forEach(tab => tab.classList.toggle('active', tab === button)); $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${state.view}`)); }));
$('#priceSearch').addEventListener('input', event => { state.query = event.target.value; renderMarket('buy', '#buyMatrix', '#buyEmpty'); renderMarket('sell', '#sellMatrix', '#sellEmpty'); });
$('#pointTabs').addEventListener('click', event => { const button = event.target.closest('[data-shop]'); if (!button) return; state.activeShop = button.dataset.shop; renderPoints(); });
$('#dungeonTabs').addEventListener('click', event => { const button = event.target.closest('[data-ds-tab]'); if (!button) return; state.activeDungeonTab = button.dataset.dsTab; renderDungeonShenqi(); });
load().catch(error => { $('#publishedAt').textContent = error.message; });
