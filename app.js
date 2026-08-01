const state = {
  prices: null,
  dashboard: null,
  items: null,
  icons: { items: {} },
  pointShops: null,
  activePointShop: 'artifact',
  file: null,
  activeTab: 'prices',
  priceQuery: '',
  priceCategory: '全部',
  priceView: 'table',
  dungeonShenqi: null,
  dungeonModule: 'overview',
  selectedDungeon: '',
  selectedShenqi: '',
  ruleCatalog: null,
  activeRuleTemplate: 'standard',
  ruleQuery: '',
  ruleCategory: '全部',
  selectedRuleKey: '',
  selectedTermKey: '',
  recalculationPreview: null,
  recalculationSelection: new Set(),
  recalculationFilters: { category: '全部', delta: '全部', confidence: '全部', query: '' }
};

// PUBLIC_MODE is not inferred from location. A public build is assembled into
// published-site/ by core/publication.py. The publication step patches the
// `window.PUBLIC_SNAPSHOT = null;` marker below into a real snapshot file
// name; locally it stays null, so PUBLIC_MODE is false and every editing /
// maintenance affordance keeps its original behavior.
const PUBLIC_MODE = Boolean(window.PUBLIC_SNAPSHOT);

// Null-safe event binding: public builds keep the full admin markup (hidden
// via the .public-mode / .maint-only CSS rules) so every element referenced
// below still exists. This helper is retained as a guard for future markup
// pruning and for small fixture DOMs used by tests.
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const on = (selector, event, handler) => $(selector)?.addEventListener(event, handler);

if (document.body) document.body.classList.toggle('public-mode', PUBLIC_MODE);

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `请求失败：${res.status}`);
  return body;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatWan(value) {
  if (value == null || value === '') return '暂无';
  return `${(Number(value) / 10000).toFixed(2)} 万`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function itemName(item) {
  return item?.display_name || item?.name || item?.item_key || '未命名物品';
}

function itemPrice(item) {
  const raw = item?.market_price ?? item?.median_price ?? item?.price;
  return raw == null || raw === '' ? null : Number(raw);
}

function renderAll() {
  renderTabs();
  renderStats();
  renderPrices();
  renderPointShops();
  renderDungeonShenqi();
  renderRuleCatalog();
  renderTerms();
  renderPublicationStatus();
}

async function load() {
  if (PUBLIC_MODE) {
    let snapshot;
    if (window.PUBLIC_SNAPSHOT_DATA) snapshot = window.PUBLIC_SNAPSHOT_DATA;
    else if (window.PUBLIC_SNAPSHOT === 'staged-parts') {
      await new Promise(resolve => window.addEventListener('public-snapshot-ready', resolve, { once: true }));
      if (window.PUBLIC_SNAPSHOT_ERROR) throw window.PUBLIC_SNAPSHOT_ERROR;
      snapshot = window.PUBLIC_SNAPSHOT_DATA;
    } else {
      snapshot = await api(window.PUBLIC_SNAPSHOT, { cache: 'no-store' });
    }
    state.prices = snapshot.market;
    state.pointShops = snapshot.pointShops;
    state.dungeonShenqi = snapshot.dungeonShenqi;
    state.icons = snapshot.icons || {};
    renderAll();
    return;
  }
  [state.prices, state.dashboard, state.items, state.icons, state.ruleCatalog, state.pointShops, state.dungeonShenqi] = await Promise.all([
    api('/api/prices'), api('/api/dashboard'), api('/api/items'), api('/api/icons'), api('/api/rules'), api('/api/point-shops'), api('/api/dungeon-shenqi')
  ]);
  renderAll();
}

// Preserve the deployed full application below; this file is intentionally
// aborted by validation if used without the complete source.
throw new Error('INCOMPLETE_APP_GUARD');
