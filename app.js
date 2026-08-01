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

// Runtime mode: the same static/index.html + app.js are copied verbatim into
// published-site/ by core/publication.py. The publication step patches the
// `window.PUBLIC_SNAPSHOT = null;` marker below into a real snapshot file
// name; locally it stays null, so PUBLIC_MODE is false and every editing /
// maintenance control keeps working exactly as before.
const PUBLIC_MODE = Boolean(window.PUBLIC_SNAPSHOT);

// Null-safe event binding: public builds keep the full admin markup (hidden
// via the .public-mode / .maint-only CSS rules) so every element referenced
// here still exists today, but this guard keeps future markup trimming from
// throwing on a missing element.
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
  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: await res.text() }
  }
  if (!res.ok) throw new Error(data.error || `%LWt�q�败 ${res.status}`);
  return data;
}