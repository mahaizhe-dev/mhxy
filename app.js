const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = { snapshot: null, view: 'prices', activeShop: null, query: '', imageReady: false };

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

function renderAll() {
  renderMarket('buy', '#buyMatrix', '#buyEmpty');
  renderMarket('sell', '#sellMatrix', '#sellEmpty');
  renderPoints();
  const published = state.snapshot?.publishedAt;
  $('#publishedAt').textContent = published ? `发布于 ${new Date(published).toLocaleString('zh-CN', { hour12: false })}` : '行情快照';
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

function fitText(ctx, text, x, y, maxWidth) {
  let value = String(text ?? '');
  while (value.length > 1 && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
  ctx.fillText(value.length < String(text ?? '').length ? value + '…' : value, x, y);
}

async function generateImage() {
  const rows = filteredItems('buy');
  if (!rows.length) return;
  const canvas = $('#quoteCanvas');
  const width = 1200; const margin = 28; const columns = 5; const gap = 10; const cardWidth = Math.floor((width - margin * 2 - gap * (columns - 1)) / columns); const cardHeight = 88;
  const groups = new Map(); rows.forEach(item => groups.set(item.category, [...(groups.get(item.category) || []), item]));
  let height = 112; [...groups.values()].forEach(items => { height += 34 + Math.ceil(items.length / columns) * (cardHeight + gap) + 16; });
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1)); canvas.width = width * scale; canvas.height = height * scale; canvas.style.width = '100%'; canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#dff8fa'); gradient.addColorStop(1, '#b8e7ee'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; roundRect(ctx, 16, 16, width - 32, height - 32, 16); ctx.fill(); ctx.strokeStyle = 'rgba(181,138,42,.38)'; ctx.stroke();
  ctx.fillStyle = '#168f83'; ctx.font = '700 11px "Microsoft YaHei UI", sans-serif'; ctx.fillText('PUBLIC MARKET SNAPSHOT', margin, 42); ctx.fillStyle = '#176f81'; ctx.font = '600 29px "Microsoft YaHei UI", sans-serif'; ctx.fillText('商人收购价', margin, 76); ctx.fillStyle = '#5e7b84'; ctx.font = '12px "Microsoft YaHei UI", sans-serif'; ctx.fillText(`发布于 ${new Date(state.snapshot.publishedAt).toLocaleString('zh-CN', { hour12: false })}`, margin + 162, 75);
  const icons = new Map(); await Promise.all(rows.map(async item => { const src = state.snapshot.icons?.[item.name]; if (src && !icons.has(src)) { try { icons.set(src, await loadImage(src)); } catch { icons.set(src, null); } } }));
  let y = 112;
  for (const [category, items] of groups) {
    ctx.fillStyle = '#a77616'; ctx.font = '13px "Microsoft YaHei UI", sans-serif'; ctx.fillText(category, margin, y); y += 26;
    items.forEach((item, index) => {
      const x = margin + (index % columns) * (cardWidth + gap); const cy = y + Math.floor(index / columns) * (cardHeight + gap);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; roundRect(ctx, x, cy, cardWidth, cardHeight, 10); ctx.fill(); ctx.strokeStyle = 'rgba(22,143,131,.25)'; ctx.stroke();
      const iconX = x + 10; const iconY = cy + 19; ctx.fillStyle = 'rgba(232,252,248,.9)'; roundRect(ctx, iconX, iconY, 42, 42, 8); ctx.fill();
      const image = icons.get(state.snapshot.icons?.[item.name]); if (image) ctx.drawImage(image, iconX + 3, iconY + 3, 36, 36); else { ctx.fillStyle = '#168fc0'; ctx.beginPath(); ctx.arc(iconX + 21, iconY + 21, 17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 15px "Microsoft YaHei UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(item.name.slice(0, 1), iconX + 21, iconY + 26); ctx.textAlign = 'left'; }
      const textX = iconX + 50; ctx.fillStyle = '#215164'; ctx.font = '14px "Microsoft YaHei UI", sans-serif'; fitText(ctx, item.name, textX, cy + 39, cardWidth - 70); ctx.fillStyle = '#168f83'; ctx.font = '700 19px Georgia, serif'; const price = fmt(item.buy.median); ctx.fillText(price, textX, cy + 67); ctx.fillStyle = '#5e7b84'; ctx.font = '9px "Microsoft YaHei UI", sans-serif'; ctx.fillText('万两', textX + ctx.measureText(price).width + 4, cy + 66);
    });
    y += Math.ceil(items.length / columns) * (cardHeight + gap) + 20;
  }
  state.imageReady = true; $('#quoteEmpty').hidden = true; $('#saveImage').disabled = false;
}

function saveImage() {
  if (!state.imageReady) return;
  $('#quoteCanvas').toBlob(blob => { const link = document.createElement('a'); link.download = '商人收购价.png'; link.href = URL.createObjectURL(blob); link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); }, 'image/png');
}

async function load() {
  const response = await fetch(window.PUBLIC_SNAPSHOT, { cache: 'no-store' });
  if (!response.ok) throw new Error(`行情快照读取失败：${response.status}`);
  state.snapshot = await response.json(); renderAll();
}

$$('.tab').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; $$('.tab').forEach(tab => tab.classList.toggle('active', tab === button)); $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${state.view}`)); }));
$('#priceSearch').addEventListener('input', event => { state.query = event.target.value; renderMarket('buy', '#buyMatrix', '#buyEmpty'); renderMarket('sell', '#sellMatrix', '#sellEmpty'); });
$('#pointTabs').addEventListener('click', event => { const button = event.target.closest('[data-shop]'); if (!button) return; state.activeShop = button.dataset.shop; renderPoints(); });
$('#generateImage').addEventListener('click', generateImage); $('#saveImage').addEventListener('click', saveImage);
load().catch(error => { $('#publishedAt').textContent = error.message; });
