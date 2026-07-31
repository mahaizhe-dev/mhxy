const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = { snapshot: null, view: 'prices', activeShop: null, activeDungeonTab: 'dungeons', query: '' };

function esc(value) {
  return String(value ?? '').replace(/["<>"'']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'"': '&#39;'}[char]));
}

function fmt(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : 'â€”';
}

function iconHtml(item) {
  const src = state.snapshot?.icons?.[item.name];
  if (src) return `<span class="item-icon"><img src="${esc(src)}" alt="${esc(item.name)}å›¾æ ‡" loading="lazy"></span>`;
  return `<span class="item-icon fallback">${esc(item.name.slice(0, 1))}</span>`;
}

function isSpecialPointCurrency(item) {
  return item.name === 'å‰¯æœ¬ç§¯åˆ†';
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
  $(target).innerHTML = [...groups.entries()].map(([category, rows]) => `<section class="category-group"><h3>${esc(category)} <small>${rows.length} ä»¶</small></h3><div class="cards">${rows.map(item => {
    const stats = item[side];
    return `<article class="price-card">${iconHtml(item)}<div class="item-copy"><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></div><div class="price"><b>${fmt(stats.median)}</b><small>ä¸‡ä¸¤</small></div><p>æœ€ä½ ${fmt(stats.min)} Â· æœ€é«˜ ${fmt(stats.max)} Â· ${fmt(stats.count, 0)} æ¡</p></article>`;
  }).join('')}</div></section>`).join('');
  $(empty).hidden = items.length > 0;
}

function acctiveShop() {
  const shops = state.snapshot?.pointShops?.shops || [];
  return shops.find(shop => shop.id === state.activeShop) || shops[0] || null;
}

function renderPoints() {
  const shops = state.snapshot?.pointShops?.shops || [];
  if (!state.activeShop && shops[0]) state.activeShop = shops[0].id;
  const shop = activeShop();
  $('#pointTabs').innerHTML = shops.map(entry => `<button class="point-tab ${entry.id === shop?.id ? 'active' : ''}" data-shop="${esc(entry.id)}">$2Data${esc(entry.title)}</button>`).join('');
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
  $('#dungeonTimestamp').textContent = data.generatedAt ? `æ•°æ®æ›´æ–°äº ${new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false })}` : 'å…¬å¼€çš„ 129 çº§ç•Œç©æœæ”¶ç›Šå¿«ç…§ã€‚';
  $('#dungeonTableHead').innerHTML = isDungeon
    ? '<tr><th>å‰¯æœ¬åç§°</th><th>éš¾åº¦</th><th>ç»éªŒ(ä¸‡ï¼™</th><th>é‡‘å¤†(ä¸‡ï¼™</th><th>å‰¯æœ¬ç¬¦åˆ†</th><th>å‚¨å¤‡é‡‘èï¼ˆåŠ¡ï¼‰</th><th>è€—æ—¶ï¼ˆåˆ†ï¼‰</th><th>æŒæ‰</th><th>å¤‡æ³¨</th></tr>'
    : '<tr><th>å™¨åç§°</th><th>ç±»å‹</th><th>éš¾åº¦</th><th>ç»éªŒ(ä¸‡ï¼™</th><th>é‡‘å¤†(ä¸‡ï¼™</th><th>ç˜æœ¬ç¬¦å!İ¹`ª9i!úaäz;ï"9b¨{ï"Oİº %ù¥í»ï"9b!»ï"Oİ¹."¹.©:`dùamÏİ¹i!ù¬êİİ‰ÎÂˆ	
	ÈÙ[™Ù[Û•X›T›İÜÉÊKš[›™\’SH›İÜË›X\
›İÈOˆ\Ñ[™Ù[Û‚ˆÈİ›Û™Ï‰Ù\ØÊ›İË›˜[YJ_OÜİ›Û™Ïİ‰Ù\ØÊ›İË™Y™šXİ[H	ø %	Ê_Oİ‰Ù›]
›İË™^Ø[‹
_Oİ‰Ù›]
›İË™ÛÛØ[‹
_Oİ‰Ù›]
›İËœÚ[Ë
_Oİ‰Ù›]
›İËœ™\Ù\™QÛÛØ[‹
_Oİ‰Ù›]
›İË[YSZ[‹
_Oİ‰Ù\ØÊ
›İË™›ÜÈ×JKš›Ú[Š	øà IÊH	ø %	Ê_Oİ‰Ù\ØÊ›İË››İ\È	ø %	Ê_Oİİ˜ˆˆİ›Û™Ï‰Ù\ØÊ›İË›˜[YJ_OÜİ›Û™Ïİ‰Ù\ØÊ›İË\H	ø %	Ê_Oİ‰Ù\ØÊ›İË™Y™šXİ[H	ø %	Ê_Oİ‰Ù›]
›İË™^Ø[‹
_Oİ‰Ù›]
›İË™ÛÛØ[‹
_Oİ‰Ù›]
›İËœÚ[Ë
_Oİ‰Ù›]
›İËœ™\Ù\™QÛÛØ[‹
_Oİ‰Ù›]
›İË[YSZ[‹
_Oİ‰Ù\ØÊ›İËœ™\]Z\™Y][H	ø %	Ê_Oİ‰Ù\ØÊ›İË››İ\È	ø %	Ê_Oİİ˜
Kš›Ú[Š	ÉÊNÂˆ	
	ÈÙ[™Ù[Û‘[\IÊKšY[ˆH›İÜË›[™İˆÂŸB‚™[˜İ[Ûˆ™[™\[

HÂˆ™[™\“X\šÙ]
	Ø^IË	ÈØ^SX]š^	Ë	ÈØ^Q[\IÊNÂˆ™[™\“X\šÙ]
	ÜÙ[	Ë	ÈÜÙ[X]š^	Ë	ÈÜÙ[[\IÊNÂˆ™[™\”Ú[Ê
NÂˆ™[™\‘[™Ù[Û”Ú[œZJ
NÂˆÛÛœİX›\ÚYHİ]KœÛ˜\ÚİËœX›\ÚY]Âˆ	
	ÈÜX›\ÚY]	ÊK^ÛÛ[HX›\ÚYÈ9cäyn ù.£ˆ	Û™]È]JX›\ÚY
KÓØØ[Tİš[™Ê	ŞšPÓ‰ËÈİ\ŒLˆ˜[ÙHJ_Xˆ	ú(c9 áyoêùáiÉÎÂŸB‚˜\Ş[˜È[˜İ[ÛˆØY

HÂˆÛÛœİ™\ÜÛœÙHH]ØZ]™]Ú
Ú[™İË”P“P×ÔÓTÒÕÈØXÚNˆ	Û›Ë\İÜ™IÈJNÂˆYˆ
\™\ÜÛœÙK›ÚÊH›İÈ™]È\œ›ÜŠ:(c9 áyk¯yâ­¹b¨9b$9i,z-){ï&‰Ü™\ÜÛœÙKœİ]\ßX
NÂˆİ]KœÛ˜\ÚİH]ØZ]™\ÜÛœÙKšœÛÛŠ
NÈ™[™\[

NÂŸB‚‰	
	ËX‰ÊK™›Ü‘XXÚ
]ÛˆOˆ]Û‹˜Y]™[\İ[™\Š	ØÛXÚÉË

HOˆÈİ]KšY]ÈH]Û‹™]\Ù]šY]ÎÈ		
	ËX‰ÊK™›Ü‘XXÚ
XˆOˆX‹˜Û\ÜÓ\İÙÙÛJ	ØXİ]™IËXˆOOH]ÛŠJNÈ		
	ËšY]ÉÊK™›Ü‘XXÚ
šY]ÈOˆšY]Ë˜Û\ÜÓ\İÙÙÛJ	ØXİ]™IËšY]ËšYOOHšY]ËIÜİ]KšY]ßX
JNÈJJNÂ‰
	ÈÜšXÙTÙX\˜Ú	ÊK˜Y]™[\İ[™\Š	Ú[œ]	Ë]™[OˆÈİ]Kœ]Y\HH]™[\™Ù]˜[YNÈ™[™\“X\šÙ]
	Ø^IË	ÈØ^SX]š^	Ë	ÈØ^Q[\IÊNÈ™[™\“X\šÙ]
	ÜÙ[	Ë	ÈÜÙ[X]š^	Ë	ÈÜÙ[[\IÊNÈJNÂ‰
	ÈÜÚ[XœÉÊK˜Y]™[\İ[™\Š	ØÛXÚÉË]™[OˆÈÛÛœİ]ÛˆH]™[\™Ù]˜ÛÜÙ\İ
	ÖÙ]K\ÚÜIÊNÈYˆ
X]ÛŠH™]\›Èİ]K˜Xİ]™TÚÜH]Û‹™]\Ù]œÚÜÈ™[™\”Ú[Ê
NÈJNÂ‰
	ÈÙ[™Ù[Û•XœÉÊK˜Y]™[\İ[™\Š	ØÛXÚÉË]™[OˆÈÛÛœİ]ÛˆH]™[\™Ù]˜ÛÜÙ\İ
	ÖÙ]KYË]X—IÊNÈYˆ
X]ÛŠH™]\›Èİ]K˜XØİ]™Q[™Ù[Û•XˆH]Û‹™]\Ù]™ÕXÈ™[™\‘[™Ù[Û”Ú[œZJ
NÈJNÂ›ØY

K˜Ø]Ú
\œ›ÜˆOˆÈ	
	ÈÜX›\ÚY]	ÊK^ÛÛ[H\œ›Ü‹›Y\ÜØYÙNÈJNÂ