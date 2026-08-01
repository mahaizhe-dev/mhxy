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
    data = { error: await res.text() };
  }
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + ' 万';
}

function date(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function itemAliases(item) {
  return (state.items?.items || []).find(x => x.name === item.name)?.aliases || item.aliases || [];
}

function iconFor(item) {
  if (PUBLIC_MODE) {
    // The published snapshot ships a flat name -> relative-path map (no
    // verifiedDesktop wrapper, no dictionary aliases to resolve against).
    const src = state.icons?.[item.name] || state.icons?.[item.priceItem];
    return typeof src === 'string' ? src : null;
  }
  const entries = state.icons?.items || {};
  const highBeastSkill = item.name === '高兽决' || (item.category === '兽决' && item.name?.startsWith('高级'));
  const highInnerDan = item.name === '高内丹' || (item.category === '内丹' && !['低内丹', '点化内丹', '内丹'].includes(item.name));
  const pearl = item.name === '珍珠' || /^\d+级珍珠$/.test(item.name || '');
  const transformationCard = /卡片$/.test(item.name || '');
  const craftingGift = /^\d+级打造礼包$/.test(item.name || '');
  const entry = entries[item.name] || entries[item.priceItem]
    || (highBeastSkill ? entries['高兽决'] : null)
    || (highInnerDan ? entries['高内丹'] : null)
    || (pearl ? entries['珍珠'] : null)
    || (transformationCard ? entries['变身卡牌'] : null)
    || (craftingGift ? entries['打造礼包'] : null);
  return entry?.verifiedDesktop && entry.src ? entry.src : null;
}

function iconHtml(item) {
  const src = iconFor(item);
  if (src) {
    return `<span class="item-icon"><img src="${esc(src)}" alt="${esc(item.name)}图标" loading="lazy"></span>`;
  }
  return `<span class="item-icon"><span class="icon-fallback">${esc(item.name.slice(0, 1))}</span></span>`;
}

async function load() {
  if (PUBLIC_MODE) {
    // A single pre-baked snapshot replaces the seven /api/* calls; the
    // dictionary, dashboard and rule catalog are deliberately not published.
    const snapshot = await api(window.PUBLIC_SNAPSHOT, { cache: 'no-store' });
    state.prices = snapshot.market;
    state.pointShops = snapshot.pointShops;
    state.dungeonShenqi = snapshot.dungeonShenqi;
    state.icons = snapshot.icons || {};
    renderAll();
    return;
  }
  [state.prices, state.dashboard, state.items, state.icons, state.ruleCatalog, state.pointShops, state.dungeonShenqi] = await Promise.all([
    api('/api/prices'),
    api('/api/dashboard'),
    api('/api/items'),
    api('/api/item-icons'),
    api('/api/item-rules'),
    api('/api/point-shops'),
    api('/api/dungeon-shenqi')
  ]);
  renderAll();
}

function renderAll() {
  renderPrices();
  renderPointShops();
  renderDungeonShenqi();
  if (!PUBLIC_MODE) {
    renderImports();
    renderReviews();
    renderTerms();
    renderParserStatus();
    if ($('#itemsEditor')) $('#itemsEditor').value = JSON.stringify(state.items, null, 2);
  }
  $('#generatedAt').textContent = state.prices.generatedAt
    ? '玉简更新于 ' + date(state.prices.generatedAt)
    : '等待首次纳卷';
}

// Keep new aggregate categories in a deterministic order.  Price rows retain
// dictionary order inside each category; these ranks only order the groups.
const CATEGORY_ORDER = ['杂货', '五宝', '宝石', '环装', '炼妖石', '宠物图册', '锻造指南书', '百炼精铁', '符石', '兽决', '内丹', '精魄灵石', '法宝', '高兽决', '低兽决', '点化内丹'];

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index >= 0 ? index : CATEGORY_ORDER.indexOf('法宝') - 0.5;
}

function orderedCategories() {
  // The public snapshot never ships the item dictionary (state.items), only
  // the priced rows themselves — fall back to those for the category list.
  const source = PUBLIC_MODE ? (state.prices?.items || []) : (state.items?.items || []);
  const configured = [...new Set(source.map(item => item.category))];
  return configured.sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b, 'zh-CN'));
}

function categories() {
  return orderedCategories();
}

function matches(item) {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return true;
  return [item.name, item.category, ...itemAliases(item)].join(' ').toLowerCase().includes(query);
}

function isSpecialPointCurrency(item) {
  return item.name === '副本积分';
}

function cardState(item) {
  const categoryActive = state.activeCategory === '全部' || item.category === state.activeCategory;
  const searchActive = matches(item);
  const anyFilter = state.activeCategory !== '全部' || !!state.searchQuery.trim();
  return {
    categoryActive,
    searchActive,
    dim: anyFilter && !(categoryActive && searchActive),
    focus: anyFilter && categoryActive && searchActive
  };
}

function renderCategoryChips() {
  const values = ['全部', ...categories()];
  $('#categoryChips').innerHTML = values.map(value => (
    `<button class="category-chip ${state.activeCategory === value ? 'active' : ''}" data-category="${esc(value)}"><span>${esc(value)}</span></button>`
  )).join('');
}

function detailHtml(item, side) {
  const current = item[side];
  const other = item[side === 'buy' ? 'sell' : 'buy'];
  const label = side === 'buy' ? '收购' : '出售';
  const otherLabel = side === 'buy' ? '出售' : '收购';
  const mark = side === 'buy' ? '收' : '售';
  return `
    <div class="price-detail ${side}" data-detail="${side}:${esc(item.name)}">
      <div class="detail-title"><span class="detail-mark">${mark}</span><div><small>${esc(item.category)}</small><h3>${esc(item.name)}</h3></div></div>
      <div class="detail-stat"><span>最低${label}</span><strong>${fmt(current.min)}</strong></div>
      <div class="detail-stat hero"><span>${label}中位数</span><strong>${fmt(current.median)}</strong></div>
      <div class="detail-stat"><span>最高${label}</span><strong>${fmt(current.max)}</strong></div>
      <div class="detail-stat"><span>有效样本</span><strong>${current.count}</strong><small>${current.count < 3 ? '样本较少' : '样本充足'}</small></div>
      <div class="detail-stat"><span>${otherLabel}对照</span><strong>${fmt(other?.median)}</strong><small>${other ? `${other.count} 条样本` : '暂无样本'}</small></div>
      <div class="detail-time"><span>最近观测</span><strong>${date(item.updatedAt)}</strong></div>
    </div>`;
}

function renderMatrix(side) {
  const items = orderedItems(side);
  const groups = categories()
    .map(category => ({ category, items: items.filter(item => item.category === category) }))
    .filter(group => group.items.length);
  const expanded = state.expanded[side];
  const html = groups.map(group => {
    const cards = group.items.map(item => {
      const displayState = cardState(item);
      const open = expanded === item.name;
      return `<button class="price-card ${side} ${displayState.dim ? 'dimmed' : ''} ${displayState.focus ? 'highlighted' : ''} ${open ? 'expanded' : ''}" data-side="${side}" data-item="${esc(item.name)}">
        ${iconHtml(item)}
        <span class="card-copy"><span class="item-type">${esc(item.category)}</span><strong class="matrix-item-name">${esc(item.name)}</strong><span class="matrix-price"><b>${Number(item[side].median).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b><em>万两</em></span></span>
        <i class="card-corner" aria-hidden="true"></i>
      </button>`;
    }).join('');
    const detailItem = group.items.find(item => item.name === expanded);
    return `<section class="matrix-group" data-category="${esc(group.category)}"><header><span>${esc(group.category)}</span><i></i><small>${group.items.length} 件</small></header><div class="price-grid">${cards}</div>${detailItem ? detailHtml(detailItem, side) : ''}</section>`;
  }).join('');
  $(`#${side}Matrix`).innerHTML = html;
  $(`#${side}Empty`).style.display = items.length ? 'none' : 'block';
}

function renderPrices() {
  renderCategoryChips();
  renderMatrix('buy');
  renderMatrix('sell');
  const all = state.prices?.items || [];
  $('#itemCount').textContent = all.filter(item => item.buy || item.sell).length;
  $('#quoteCount').textContent = all.reduce((total, item) => total + (item.buy?.count || 0) + (item.sell?.count || 0), 0);
  const matched = all.filter(item => matches(item) && (state.activeCategory === '全部' || item.category === state.activeCategory)).length;
  const active = state.activeCategory !== '全部' || state.searchQuery.trim();
  $('#matchCount').textContent = active ? `灵光落在 ${matched} 件珍品` : '展示全部物价';
  $('#clearHighlight').hidden = !active;
}

function pointShopById(id = state.activePointShop) {
  return (state.pointShops?.shops || []).find(shop => shop.id === id) || null;
}

function pointItemById(shop, id) {
  return (shop?.items || []).find(item => item.id === id) || null;
}

function pointItemId() {
  return `point-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function refreshPointItem(item) {
  const market = (state.prices?.items || []).find(entry => entry.name === item.name) || {};
  const sell = Number(market.sell?.median);
  const buy = Number(market.buy?.median);
  if (sell > 0) [item.effectivePriceWan, item.priceSource] = [sell, 'sell_median'];
  else if (buy > 0) [item.effectivePriceWan, item.priceSource] = [buy, 'buy_median'];
  else [item.effectivePriceWan, item.priceSource] = [null, 'unavailable'];
  const pointCost = Number(item.pointCost);
  const quantity = Number(item.quantity) || 1;
  item.valuePerPointWan = item.effectivePriceWan && pointCost > 0
    ? Number((item.effectivePriceWan * quantity / pointCost).toFixed(6))
    : null;
}


function dungeonNumber(value) {
  return value == null ? '<span class="ds-null">—</span>' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function dungeonFullCount(value) {
  if (value == null) return null;
  return Math.round(Number(value) * 10000);
}

function dungeonCostEfficiency(points, goldWan, ticket) {
  const pointValue = Number(points);
  const gold = Number(goldWan) * 10000;
  const jade = Number(ticket?.price);
  if (!Number.isFinite(pointValue) || !Number.isFinite(gold) || !Number.isFinite(jade) || jade <= 0) return null;
  return (pointValue * 500 + gold) / (jade * 12000);
}

function dungeonDropPrice(name) {
  const row = (state.prices?.items || []).find(item => item.name === name);
  const sell = Number(row?.sell?.median);
  if (Number.isFinite(sell) && sell > 0) return sell;
  const buy = Number(row?.buy?.median);
  return Number.isFinite(buy) && buy > 0 ? buy : null;
}

function dungeonDropItem(name) {
  const item = (state.items?.items || []).find(entry => entry.name === name);
  return item || { name, category: '副本掉落' };
}

function dungeonDropIcons(items) {
  const sorted = items.map(name => ({
    name,
    price: dungeonDropPrice(name),
    item: dungeonDropItem(name),
  })).sort((left, right) => {
    if (left.price == null && right.price == null) return 0;
    if (left.price == null) return 1;
    if (right.price == null) return -1;
    return right.price - left.price;
  });
  return sorted.length
    ? `<div class="dungeon-drop-icons" aria-label="可掉落记录">${sorted.map(entry => `<span class="dungeon-drop-icon" title="${esc(entry.name)}${entry.price == null ? '' : ` · 参考价 ${entry.price}万两`}" aria-label="${esc(entry.name)}">${iconHtml(entry.item)}</span>`).join('')}</div>`
    : '<span class="dungeon-summary-empty">待收集</span>';
}

function dungeonMetricHtml(label, value, unit = '', primary = false) {
  const rendered = value == null ? '待收集' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}${unit}`;
  return `<div class="dungeon-metric ${primary ? 'primary' : ''}"><span>${label}</span><strong>${rendered}</strong></div>`;
}

function dungeonStageTotals(dungeon) {
  const stages = dungeon.stages || [];
  return stages.reduce((totals, stage) => {
    const reward = stage.summary?.reward;
    if (!reward) return totals;
    totals.completedStageCount += 1;
    totals.battleCount += Number(stage.count) || 0;
    totals.experience += Number(reward.experience) || 0;
    totals.gold += Number(reward.gold) || 0;
    totals.stageDungeonPoints += Number(reward.dungeonPoints) || 0;
    return totals;
  }, { stageCount: stages.length, completedStageCount: 0, battleCount: 0, experience: 0, gold: 0, stageDungeonPoints: 0 });
}

function dungeonDropGroupHtml(dungeon, drops) {
  const groups = dungeon.dropGroups?.length
    ? dungeon.dropGroups
    : drops.reduce((rows, record) => {
      const stageName = String(record.stageName || record.stageId || '').trim();
      const source = record.source === 'system-announcement' ? '系统公告' : (record.enemy || '来源待补充');
      const key = `${stageName}|${source}`;
      let group = rows.find(row => row.key === key);
      if (!group) {
        group = { key, stageName: stageName || null, source, items: [], dropModes: [] };
        rows.push(group);
      }
      if (record.item && !group.items.includes(record.item)) group.items.push(record.item);
      if (record.dropMode && !group.dropModes.includes(record.dropMode)) group.dropModes.push(record.dropMode);
      return rows;
    }, []);
  if (!groups.length) return '<li class="dungeon-evidence-empty">尚未收集掉落资料</li>';
  return groups.map(group => {
    const label = group.stageName ? `${group.stageName} · ${group.source}` : group.source;
    const items = group.items || [];
    const mode = (group.dropModes || []).join('、') || '掉落类型待补充';
    return `<li><strong>${esc(label)}</strong><div>${dungeonDropIcons(items)}</div><small>${esc(mode)}${group.recordCount ? ` · ${group.recordCount} 条公告` : ''}</small></li>`;
  }).join('');
}

function dungeonCardHtml(dungeon) {
  const records = dungeon.records || [];
  const drops = records.filter(record => record.kind === 'drop');
  const runs = records.filter(record => record.kind === 'run').slice().reverse().slice(0, 3);
  const stageTotals = dungeonStageTotals(dungeon);
  const diffClass = dungeon.difficulty === '英雄' ? 'hero' : dungeon.difficulty === '侠士' ? 'xia' : 'normal';
  const completion = dungeon.completion || {};
  const isComplete = completion.status === '完整实测' || (
    stageTotals.stageCount > 0 && stageTotals.completedStageCount === stageTotals.stageCount
  );
  const dropRows = dungeonDropGroupHtml(dungeon, drops);
  const stageRows = (dungeon.stages || []).map(stage => {
    const summary = stage.summary?.reward;
    const count = stage.count ? ` ×${stage.count}` : '';
    const detail = summary
      ? `基础经验 ${dungeonNumber(summary.experience)} · 基础金币 ${dungeonNumber(summary.gold)} · 积分 ${dungeonNumber(summary.dungeonPoints)} 分`
      : '等待数据';
    return `<li><strong>${esc(stage.name)}${count}</strong><span>${detail}</span><small>${esc(stage.rewardMode || '阶段收益待收集')}</small></li>`;
  }).join('');
  const stageHtml = stageRows ? `<div class="dungeon-evidence-group"><span>阶段进度</span><ul>${stageRows}</ul></div>` : '';
  const guaranteedDrops = drops.filter(record => /必定|保底/.test(record.dropMode || ''));
  const possibleItems = [...new Set([
    ...drops.map(record => String(record.item || '').trim()).filter(Boolean),
    ...(dungeon.drops || []).map(drop => String(drop).replace(/（[^）]*）/g, '').trim()).filter(Boolean),
  ])];
  const guaranteedHtml = guaranteedDrops.length
    ? guaranteedDrops.map(record => `<span class="dungeon-guaranteed-tag">${esc(record.enemy || '来源待补充')}${record.item ? ` · ${esc(record.item)}` : ''}</span>`).join('')
    : '<span class="dungeon-summary-empty">待收集</span>';
  const possibleHtml = possibleItems.length ? dungeonDropIcons(possibleItems) : '<span class="dungeon-summary-empty">待收集</span>';
  const confirmed = dungeon.confirmedReward || {};
  const confirmedPoints = completion.finalDungeonPoints ?? confirmed.dungeonPoints ?? dungeon.points;
  const experienceCount = confirmed.experience ?? dungeonFullCount(dungeon.expWan);
  const goldCount = confirmed.gold ?? dungeonFullCount(dungeon.goldWan);
  const costEfficiency = dungeonCostEfficiency(confirmedPoints, dungeon.goldWan, dungeon.ticket);
  const costEfficiencyHtml = costEfficiency == null
    ? '<strong class="dungeon-efficiency pending">待收集</strong>'
    : `<strong class="dungeon-efficiency">${costEfficiency.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</strong>`;
  const completionBadge = isComplete ? '<span class="dungeon-complete-badge">完整实测</span>' : '';
  const headerSummary = isComplete
    ? `${stageTotals.completedStageCount}/${stageTotals.stageCount} 阶段 · ${stageTotals.battleCount} 场记录`
    : (records.length ? `${records.length} 条已收集资料` : '等待收集资料');
  const detailSummary = isComplete
    ? `<div class="dungeon-completion-summary"><div><span>完整度</span><strong>${stageTotals.completedStageCount}/${stageTotals.stageCount} 阶段 · ${stageTotals.battleCount} 场</strong></div><div><span>阶段积分合计</span><strong>${dungeonNumber(completion.stageDungeonPoints ?? stageTotals.stageDungeonPoints)} 分</strong></div><div><span>最终结算积分</span><strong class="final">${dungeonNumber(completion.finalDungeonPoints ?? confirmedPoints)} 分</strong></div><div><span>积分差额</span><strong>${dungeonNumber(completion.pointDifference ?? ((completion.finalDungeonPoints ?? confirmedPoints) - (completion.stageDungeonPoints ?? stageTotals.stageDungeonPoints)))} 分</strong></div></div>`
    : '';
  const expanded = Boolean(state.expandedDungeons[dungeon.name]);
  return `<article class="dungeon-card ${expanded ? 'expanded' : ''} ${isComplete ? 'complete' : ''}">
    <header><div><h3>${esc(dungeon.name)}</h3><small>${completionBadge}${headerSummary}</small></div><div class="dungeon-card-badges"><span class="ds-difficulty ${diffClass}">${esc(dungeon.difficulty)}</span>${dungeon.ticket ? `<span class="dungeon-ticket cost" title="副本费用">${esc(dungeon.ticket.price)}${esc(dungeon.ticket.currency || '')}</span>` : ''}</div></header>
    <section class="dungeon-primary-metric">${dungeonMetricHtml('副本积分', confirmedPoints, '', true)}</section>
    <section class="dungeon-metrics">
      ${dungeonMetricHtml('经验', experienceCount)}
      ${dungeonMetricHtml('金币', goldCount)}
      <div class="dungeon-metric efficiency"><span>基础收益评分</span>${costEfficiencyHtml}</div>
      <div class="dungeon-metric guaranteed"><span>必定掉落怪</span><div class="dungeon-guaranteed-list">${guaranteedHtml}</div></div>
    </section>
    <section class="dungeon-drop-summary">
      <div><span>可掉落记录</span><p>${possibleHtml}</p></div>
    </section>
    <button class="dungeon-detail-toggle" type="button" data-dungeon-detail="${esc(dungeon.name)}" aria-expanded="${expanded}">${expanded ? '收起资料' : '展开资料'}</button>
    <section class="dungeon-evidence"><h4>已收集资料</h4>
      ${detailSummary}
      <div><span>浮盈经验</span><strong>${dungeon.overflowExpWan == null ? '待收集' : `${dungeonFullCount(dungeon.overflowExpWan)}（不计收益）`}</strong></div>
      <div class="dungeon-evidence-group"><span>怪物掉落</span><ul>${dropRows}</ul></div>
      ${stageHtml}
      <div class="dungeon-evidence-group"><span>最近实测</span><ul>${runs.length ? runs.map(run => { const reward = run.reward || {}; return `<li><small>${date(run.recordedAt)} · ${run.messageCount || 0} 条信息</small><span>基础经验 ${dungeonNumber(reward.baseExperience ?? reward.experience)} · 基础金币 ${dungeonNumber(reward.baseGold ?? reward.gold)} · 积分 ${dungeonNumber(reward.dungeonPoints)} 分</span><small>队长经验 ${dungeonNumber(reward.captainExperience)} · 浮盈 ${dungeonNumber(reward.overflowExperience)} · 队长金币 ${dungeonNumber(reward.captainGold)}（不计收益）</small></li>`; }).join('') : '<li class="dungeon-evidence-empty">尚未导入结算信息</li>'}</ul></div>
      <p>${dungeon.notes ? esc(dungeon.notes) : '尚无备注'}</p>
    </section>
  </article>`;
}

function renderDungeonShenqi() {
  const data = state.dungeonShenqi;
  if (!data) return;
  const isDungeon = state.activeDsTab === 'dungeons';
  const rows = isDungeon ? (data.dungeons || []) : (data.shenqi || []);
  $$('#dungeonShenqiTabs .point-shop-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.dsTab === state.activeDsTab);
  });
  $('#dungeonTimestamp').textContent = data.generatedAt ? '数据更新于 ' + date(data.generatedAt) : '数据更新时间未知';
  $('#dungeonDescription').textContent = data.description || '';
  $('#dungeonRunImportPanel').hidden = !isDungeon;
  $('#dungeonCards').hidden = !isDungeon;
  $('#dungeonTablePanel').hidden = isDungeon;
  if (isDungeon) {
    const select = $('#dungeonRunName');
    const selected = select.value;
    select.innerHTML = rows.map(row => `<option value="${esc(row.name)}">${esc(row.name)}</option>`).join('');
    if (rows.some(row => row.name === selected)) select.value = selected;
    $('#dungeonCards').innerHTML = rows.map(dungeonCardHtml).join('');
    $('#dungeonEmpty').style.display = rows.length ? 'none' : 'block';
    return;
  }
  $('#dungeonTableHead').innerHTML = '<tr><th>神器名称</th><th>类型</th><th>难度</th><th>经验(万)</th><th>金钱(万)</th><th>神器积分</th><th>储备金(万)</th><th>耗时(分)</th><th>上交道具</th><th>备注</th></tr>';
  $('#dungeonTableBody').innerHTML = rows.map(row => {
    const typeClass = row.type === '转' ? 'zhuan' : 'qi';
    const stars = row.starMin === row.starMax ? `${row.starMin}★` : `${row.starMin}~${row.starMax}★`;
    const submitHtml = (row.submitItems || []).map(item => `<span class="ds-tag">${esc(item)}</span>`).join('');
    const submitTypeHtml = row.submitType ? `<span class="ds-badge probability">${esc(row.submitType)}</span>` : '';
    return `<tr><td><strong>${esc(row.name)}</strong></td><td><span class="ds-shenqi-type ${typeClass}">${esc(row.type)}</span></td><td>${stars}</td><td class="ds-num">${dungeonNumber(row.expWan)}</td><td class="ds-num">${dungeonNumber(row.goldWan)}</td><td>${dungeonNumber(row.points)}</td><td>${dungeonNumber(row.reserveGoldWan)}</td><td>${dungeonNumber(row.timeMin)}</td><td><div class="ds-tags">${submitHtml}</div><div class="ds-drop-type">${submitTypeHtml}</div></td><td class="ds-notes">${row.notes ? esc(row.notes) : '—'}</td></tr>`;
  }).join('');
  $('#dungeonEmpty').style.display = rows.length ? 'none' : 'block';
}

async function importDungeonRun() {
  const button = $('#importDungeonRun');
  const dungeonName = $('#dungeonRunName').value;
  const content = $('#dungeonRunContent').value.trim();
  if (!dungeonName || !content) {
    toast('请选择副本并粘贴本次信息栏文本');
    return;
  }
  button.disabled = true;
  button.textContent = '正在解析…';
  try {
    const result = await api('/api/dungeon-runs/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dungeonName, content, fileName: '副本信息栏文本' })
    });
    state.dungeonShenqi = result.dungeonShenqi;
    if (result.duplicate) {
      $('#dungeonRunStatus').textContent = `${dungeonName} 的这段信息已录入过，未重复计入。`;
    } else {
      const reward = result.run.reward;
      $('#dungeonRunStatus').textContent = `${dungeonName} 已录入：经验 ${reward.experience}，浮盈经验 ${reward.overflowExperience}，金币 ${reward.gold}，储备金 ${reward.reserveGold}，副本积分 ${reward.dungeonPoints}。`;
      $('#dungeonRunContent').value = '';
    }
    renderDungeonShenqi();
    toast(result.duplicate ? '这段副本信息已录入过' : '副本实测已录入');
  } catch (error) {
    $('#dungeonRunStatus').textContent = '录入失败：' + error.message;
    toast('副本录入失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '录入本次副本信息';
  }
}

async function scanDungeonDrops() {
  const button = $('#scanDungeonDrops');
  button.disabled = true;
  button.textContent = '正在解析…';
  try {
    const result = await api('/api/dungeon-drops/scan-default', { method: 'POST' });
    state.dungeonShenqi = result.dungeonShenqi;
    const details = Object.entries(result.byDungeon || {}).map(([name, items]) => `${name}：${items.join('、')}`).join('；');
    $('#dungeonRunStatus').textContent = result.addedCount
      ? `系统频道新增 ${result.addedCount} 条掉落公告${details ? '（' + details + '）' : ''}；跳过重复 ${result.duplicateCount} 条。`
      : `没有新增副本掉落公告；跳过重复 ${result.duplicateCount} 条。`;
    renderDungeonShenqi();
    toast(result.addedCount ? `已新增 ${result.addedCount} 条副本掉落` : '没有新增副本掉落');
  } catch (error) {
    $('#dungeonRunStatus').textContent = '系统频道解析失败：' + error.message;
    toast('系统频道解析失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '解析最新系统频道掉落';
  }
}

function renderPointShops() {
  const shops = state.pointShops?.shops || [];
  if (!shops.length) return;
  if (!pointShopById()) state.activePointShop = shops[0].id;
  const shop = pointShopById();
  $('#pointShopTabs').innerHTML = shops.map(entry => (
    `<button class="point-shop-tab ${entry.id === shop.id ? 'active' : ''}" data-point-shop="${esc(entry.id)}">${esc(entry.title)}${entry.enabled === false ? '<small>待录入</small>' : ''}</button>`
  )).join('');
  $('#pointShopDescription').textContent = shop.description || '';
  $('#pointShopHint').textContent = shop.enabled === false
    ? '副本积分商店框架已预留，录入清单后即可启用计算。'
    : '优先使用你指定的价格，其次取玩家出售价与商人收购价。';
  const rows = [...(shop.items || [])].sort((left, right) => {
    const leftValue = Number(left.valuePerPointWan);
    const rightValue = Number(right.valuePerPointWan);
    const leftReady = Number.isFinite(leftValue) && leftValue > 0;
    const rightReady = Number.isFinite(rightValue) && rightValue > 0;
    if (leftReady && rightReady) return rightValue - leftValue;
    if (leftReady) return -1;
    if (rightReady) return 1;
    return 0;
  });
  $('#pointShopRows').innerHTML = rows.map(item => (PUBLIC_MODE ? publicPointRowHtml(item) : editablePointRowHtml(item))).join('');
  $('#pointShopEmpty').style.display = rows.length ? 'none' : 'block';
  if ($('#addPointItem')) $('#addPointItem').disabled = shop.enabled === false;
}

function editablePointRowHtml(item) {
  const quantity = item.quantity ?? 1;
  const pointCost = item.pointCost ?? '';
  const applied = item.effectivePriceWan === null || item.effectivePriceWan === undefined
    ? '—'
    : fmt(item.effectivePriceWan);
  const ratio = item.valuePerPointWan === null || item.valuePerPointWan === undefined
    ? '—'
    : `${Number(item.valuePerPointWan).toLocaleString('zh-CN', { maximumFractionDigits: 4 })} 万`;
  return `<tr data-point-item="${esc(item.id)}">
    <td class="point-item-cell"><div class="point-item-identity">${iconHtml(item)}<input class="point-input point-name" value="${esc(item.name)}" aria-label="兑换物名称"></div></td>
    <td class="point-priority-cell"><span class="point-cell-label">所需积分</span><input class="point-input point-cost" type="number" min="0" step="any" value="${esc(pointCost)}" placeholder="待填写" aria-label="所需积分"></td>
    <td class="point-priority-cell"><span class="point-cell-label">参考价格</span><strong class="point-reference ${item.effectivePriceWan ? 'ready' : ''}">${applied}</strong></td>
    <td class="point-priority-cell"><span class="point-cell-label">每积分价值</span><strong class="point-value ${item.valuePerPointWan ? 'ready' : ''}">${ratio}</strong></td>
    <td><input class="point-input point-quantity" type="number" min="0.0001" step="any" value="${esc(quantity)}" aria-label="数量"></td>
    <td><input class="point-input point-notes" value="${esc(item.notes || '')}" placeholder="可选备注" aria-label="备注"></td>
    <td><button class="point-delete" type="button" aria-label="删除 ${esc(item.name)}">×</button></td>
  </tr>`;
}

// Public builds get a read-only row: no id (never published), no notes / no
// delete control (their <th> is hidden by .public-mode .maint-only in CSS,
// so the column counts must match here too).
function publicPointRowHtml(item) {
  const quantity = item.quantity ?? 1;
  const applied = item.effectivePriceWan === null || item.effectivePriceWan === undefined
    ? '—'
    : fmt(item.effectivePriceWan);
  const ratio = item.valuePerPointWan === null || item.valuePerPointWan === undefined
    ? '—'
    : `${Number(item.valuePerPointWan).toLocaleString('zh-CN', { maximumFractionDigits: 4 })} 万`;
  return `<tr>
    <td class="point-item-cell"><div class="point-item-identity">${iconHtml(item)}<strong class="point-name">${esc(item.name)}</strong></div></td>
    <td class="point-priority-cell"><span class="point-cell-label">所需积分</span><strong>${dungeonNumber(item.pointCost)}</strong></td>
    <td class="point-priority-cell"><span class="point-cell-label">参考价格</span><strong class="point-reference ${item.effectivePriceWan ? 'ready' : ''}">${applied}</strong></td>
    <td class="point-priority-cell"><span class="point-cell-label">每积分价值</span><strong class="point-value ${item.valuePerPointWan ? 'ready' : ''}">${ratio}</strong></td>
    <td>${dungeonNumber(quantity)}</td>
  </tr>`;
}

function applyPointItemChange(row, changed) {
  const shop = pointShopById();
  const item = pointItemById(shop, row.dataset.pointItem);
  if (!item) return;
  const nextName = row.querySelector('.point-name').value.trim();
  if (!nextName) {
    toast('兑换物名称不能为空');
    renderPointShops();
    return;
  }
  item.name = nextName;
  item.quantity = Number(row.querySelector('.point-quantity').value) || 1;
  const pointCost = row.querySelector('.point-cost').value;
  item.pointCost = pointCost === '' ? null : Number(pointCost);
  item.notes = row.querySelector('.point-notes').value.trim();
  refreshPointItem(item);
  if (changed) renderPointShops();
}

function pointShopPayload() {
  return {
    schemaVersion: 1,
    shops: (state.pointShops.shops || []).map(shop => ({
      id: shop.id,
      title: shop.title,
      description: shop.description || '',
      enabled: shop.enabled !== false,
      items: (shop.items || []).map(item => ({
        id: item.id,
        name: item.name,
        priceItem: item.priceItem || item.name,
        quantity: item.quantity,
        pointCost: item.pointCost,
        notes: item.notes || ''
      }))
    }))
  };
}

async function savePointShops() {
  const button = $('#savePointShops');
  button.disabled = true;
  button.textContent = '正在保存…';
  try {
    const result = await api('/api/point-shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pointShopPayload())
    });
    state.pointShops = result.pointShops;
    renderPointShops();
    toast('积分兑换表已保存');
  } catch (error) {
    toast('保存失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '保存积分表';
  }
}

async function saveManualPrice() {
  const button = $('#saveManualPrice');
  const item = $('#manualPriceItem').value.trim();
  const priceWan = Number($('#manualPriceValue').value);
  if (!item || !(priceWan > 0)) {
    toast('请填写物品名称和大于零的价格');
    return;
  }
  button.disabled = true;
  button.textContent = '正在录入…';
  try {
    const result = await api('/api/manual-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, quoteType: $('#manualPriceType').value, priceWan })
    });
    state.prices = result.prices;
    state.dashboard = result.dashboard;
    $('#manualPriceValue').value = '';
    renderAll();
    toast('手动价格已纳入物价中位数');
  } catch (error) {
    toast('录入失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '录入手动价格';
  }
}

async function buildPublication() {
  const button = $('#buildPublication');
  const status = $('#publicationStatus');
  button.disabled = true;
  button.textContent = '正在生成…';
  try {
    const result = await api('/api/publish', { method: 'POST' });
    const preview = $('#openPublicationPreview');
    preview.href = result.previewUrl;
    preview.hidden = false;
    status.textContent = `已生成 ${result.itemCount} 条行情 / ${result.pointShopCount} 个积分表，可先预览后上传 GitHub Pages。`;
    toast('公开发布包已生成');
  } catch (error) {
    status.textContent = '发布包生成失败：' + error.message;
    toast('发布包生成失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '生成发布包';
  }
}

function renderImports() {
  // dashboard.imports comes pre-sorted newest-first by the backend.
  const rows = state.dashboard?.imports || [];
  $('#importHistory').innerHTML = rows.length
    ? rows.map(row => `<div class="history-row"><strong>${esc(row.fileName || '聊天记录.txt')}</strong><span>${date(row.importedAt)}</span><span>${row.messageCount} 条新增</span><span>${row.duplicateMessageCount || 0} 略过 / ${row.pendingCount} 待勘</span></div>`).join('')
    : '<p class="muted">尚无卷宗。</p>';
}

function termsStorageKey(name) {
  return `mhxy-term:${name}`;
}

function loadTermStatus(name) {
  if (state.termStatus[name]) return state.termStatus[name];
  try {
    state.termStatus[name] = JSON.parse(localStorage.getItem(termsStorageKey(name)) || '{}');
  } catch {
    state.termStatus[name] = {};
  }
  return state.termStatus[name];
}

function saveTermStatus(name, data) {
  state.termStatus[name] = data;
  localStorage.setItem(termsStorageKey(name), JSON.stringify(data));
}

function termRows() {
  const query = state.termQuery.trim().toLowerCase();
  return (state.ruleCatalog?.items || []).filter(item => {
    const ruleText = (item.rules || []).flatMap(rule => [rule.id, rule.template, ...(rule.aliases || []), ...(rule.exclude || []), ...(rule.members || [])]);
    const haystack = [item.name, item.category, ...(item.effectiveAliases || []), ...(item.paths || []).map(path => path.label), ...ruleText].join(' ').toLowerCase();
    return !query || haystack.includes(query);
  }).sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'zh-CN'));
}

function ruleBadge(item) {
  if (item.source === 'synthetic') return '<span class="rule-badge synthetic">合成</span>';
  if (item.hasDedicatedRule) return '<span class="rule-badge dedicated">专属</span>';
  return '<span class="rule-badge generic">通用</span>';
}

function renderRuleList(rows) {
  let lastCategory = '';
  return rows.map(item => {
    const category = item.category !== lastCategory ? `<div class="rule-category-label">${esc(item.category)}</div>` : '';
    lastCategory = item.category;
    return `${category}<button class="rule-item-button ${state.selectedRuleItem === item.name ? 'active' : ''}" data-rule-item="${esc(item.name)}">
      ${iconHtml(item)}
      <span><strong>${esc(item.name)}</strong><small>${esc((item.paths || []).map(path => path.label).join(' · '))}</small></span>
      ${ruleBadge(item)}
    </button>`;
  }).join('');
}

function ruleExamplesHtml(rules) {
  const examples = rules.flatMap(rule => (rule.examples || []).map(example => ({ ...example, ruleId: rule.id })));
  if (!examples.length) return '<p class="muted">此物品没有专属规则示例，走通用识别与区间判断。</p>';
  return `<div class="rule-examples">${examples.map(example => `<div class="rule-example ${example.kind}"><span>${example.kind === 'positive' ? '应识别' : '应排除'}</span><code>${esc(example.text)}</code><small>${esc(example.ruleId)}</small></div>`).join('')}</div>`;
}

function ruleDetailHtml(item) {
  if (!item) return '<p class="muted">请选择一个物品查看判断逻辑。</p>';
  const saved = loadTermStatus(item.name);
  const status = saved.status || '待确认';
  const note = saved.note || '';
  const catalog = state.ruleCatalog || {};
  const aliases = (item.effectiveAliases || []).map(alias => {
    const className = (item.addedAliases || []).includes(alias) ? 'rule-alias added' : 'rule-alias';
    const title = (item.addedAliases || []).includes(alias) ? '由规则表追加' : alias === item.name ? '标准名称' : '物品词典别名';
    return `<span class="${className}" title="${title}">${esc(alias)}</span>`;
  }).join('');
  const dedicated = (item.rules || []).length ? (item.rules || []).map(rule => `<article class="dedicated-rule">
    <header><strong>${esc(rule.id)}</strong><span>${esc(rule.templateLabel)}</span><span>方向：${esc(rule.direction)}</span></header>
    ${rule.aggregateTag ? `<p>聚合标签：${esc(rule.aggregateTag)}</p>` : ''}
    ${(rule.members || []).length ? `<p>成员：${rule.members.map(esc).join(' / ')}</p>` : ''}
    ${(rule.exclude || []).length ? `<p>排除：${rule.exclude.map(esc).join(' / ')}</p>` : '<p>排除：无专属排除词</p>'}
  </article>`).join('') : '<div class="generic-rule-note"><strong>无专属规则，走通用识别</strong><p>这是正常覆盖：名称、别名、方向词、单位换算和价格区间共同形成判断。</p></div>';
  return `<article class="rule-detail-card" data-name="${esc(item.name)}">
    <header class="rule-detail-head">${iconHtml(item)}<div><div class="rule-title-line"><h3>${esc(item.name)}</h3>${ruleBadge(item)}</div><p>${esc(item.category)} · ${esc(item.sourceLabel)} · ${(item.paths || []).map(path => esc(path.label)).join(' / ')}</p></div><div class="rule-range"><span>合理区间</span><strong>${fmt(item.range.min)} — ${fmt(item.range.max)}</strong></div></header>
    <section class="rule-local-review"><div><strong>本机校对标记</strong><small>不修改服务器规则，仅保存在当前浏览器</small></div><select class="term-status"><option ${status === '正确' ? 'selected' : ''}>正确</option><option ${status === '待确认' ? 'selected' : ''}>待确认</option><option ${status === '错误' ? 'selected' : ''}>错误</option></select><input class="term-note" value="${esc(note)}" placeholder="校对备注 / 建议调整"></section>
    <section class="rule-section"><header><span>一</span><div><strong>识别物品</strong><small>最长别名优先</small></div></header><p>${esc(item.logic.mention)}</p><div class="rule-aliases">${aliases}</div><small class="rule-legend"><i></i>金色别名由规则表追加，其余来自标准名称或物品词典。</small></section>
    <section class="rule-section"><header><span>二</span><div><strong>提取价格</strong><small>相邻数字与单位</small></div></header><p>${esc(item.logic.price)}</p></section>
    <section class="rule-section"><header><span>三</span><div><strong>判定收售</strong><small>比较关键词权重与距离</small></div></header><p>${esc(item.logic.direction)}</p><div class="direction-words"><span>收购词：${(catalog.directionWords?.buy || []).map(esc).join(' / ')}</span><span>出售词：${(catalog.directionWords?.sell || []).map(esc).join(' / ')}</span></div></section>
    <section class="rule-section"><header><span>四</span><div><strong>换算与校验</strong><small>${esc(item.range.min)}–${esc(item.range.max)} 万两</small></div></header><p>${esc(item.logic.range)}</p></section>
    <section class="rule-section"><header><span>五</span><div><strong>形成结论</strong><small>最低自动录入置信度 ${Math.round((catalog.minimumConfidence || 0) * 100)}%</small></div></header><div class="rule-branches">${(item.branches || []).map(branch => `<article class="rule-branch ${branch.outcome === '自动录入' ? 'accepted' : 'pending'}"><div><strong>${Math.round(branch.confidence * 100)}%</strong><span>${esc(branch.outcome)}</span></div><p>${esc(branch.condition)}</p><code>${esc(branch.example)}</code></article>`).join('')}</div></section>
    <section class="rule-section"><header><span>专</span><div><strong>专属数据规则</strong><small>随 parse_rules.json 更新</small></div></header><div class="dedicated-rules">${dedicated}</div>${ruleExamplesHtml(item.rules || [])}</section>
  </article>`;
}

function renderTerms() {
  const list = $('#termsList');
  const detail = $('#ruleDetail');
  if (!list || !detail || !state.ruleCatalog) return;
  const rows = termRows();
  if (!rows.some(item => item.name === state.selectedRuleItem)) state.selectedRuleItem = rows[0]?.name || null;
  const selected = (state.ruleCatalog.items || []).find(item => item.name === state.selectedRuleItem);
  list.innerHTML = rows.length ? renderRuleList(rows) : '<p class="muted rule-list-empty">没有匹配的物品规则。</p>';
  detail.innerHTML = ruleDetailHtml(selected);
  $('#ruleVersion').textContent = state.ruleCatalog.ruleVersion ?? '—';
  $('#ruleParserVersion').textContent = state.ruleCatalog.parserVersion ?? '—';
  $('#ruleItemCount').textContent = state.ruleCatalog.itemCount ?? '—';
  $('#ruleDedicatedCount').textContent = state.ruleCatalog.dedicatedRuleCount ?? '—';
}

async function refreshRules() {
  const button = $('#refreshRules');
  button.disabled = true;
  button.textContent = '正在刷新…';
  try {
    state.ruleCatalog = await api('/api/item-rules');
    renderTerms();
    toast(`规则已刷新，共 ${state.ruleCatalog.itemCount} 个有效物品`);
  } catch (error) {
    toast('规则刷新失败：' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '刷新规则';
  }
}

function exportTerms() {
  const rows = (state.ruleCatalog?.items || []).map(item => {
    const saved = loadTermStatus(item.name);
    return {
      name: item.name,
      category: item.category,
      source: item.source,
      paths: (item.paths || []).map(path => path.id),
      effectiveAliases: item.effectiveAliases || [],
      range: item.range,
      ruleIds: (item.rules || []).map(rule => rule.id),
      ruleVersion: state.ruleCatalog.ruleVersion,
      parserVersion: state.ruleCatalog.parserVersion,
      status: saved.status || '待确认',
      note: saved.note || ''
    };
  });
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.download = '梦幻物品规则校对记录.json';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderReviews() {
  // dashboard.pendingQuotes is already the newest-first top 100 pending
  // quotes; counts.pendingCount is the real, unclamped total for the badge.
  const quotes = (state.dashboard?.pendingQuotes || []).slice(0, 100);
  const pendingTotal = state.dashboard?.counts?.pendingCount ?? quotes.length;
  $('#pendingBadge').textContent = pendingTotal;
  $('#reviewEmpty').style.display = quotes.length ? 'none' : 'block';
  $('#reviewList').innerHTML = quotes.map(quote => `<article class="review-card" data-id="${esc(quote.id)}">
    <div><strong>${esc(quote.item)}</strong><span class="item-meta">置信度 ${Math.round((quote.confidence || 0) * 100)}% · ${esc(quote.reason || '')}</span><div class="review-fields"><select class="review-type"><option value="buy" ${quote.quoteType === 'buy' ? 'selected' : ''}>收购</option><option value="sell" ${quote.quoteType === 'sell' ? 'selected' : ''}>出售</option><option value="unknown" ${quote.quoteType === 'unknown' ? 'selected' : ''}>未知</option></select><input class="review-price" type="number" step="0.01" value="${esc(quote.priceWan)}"><span>万</span></div></div>
    <div class="review-source">${esc(quote.rawMessage)}</div>
    <div class="review-actions"><button class="button ghost accept">录入</button><button class="button ghost reject">舍弃</button></div>
  </article>`).join('');
}

function renderParserStatus() {
  const parser = state.dashboard?.parser || {};
  const currentVersion = parser.currentVersion ?? '—';
  const appliedVersion = parser.appliedVersion ?? '—';
  const needsReparse = !!parser.needsReparse;
  const currentEl = $('#parserCurrentVersion');
  const appliedEl = $('#parserAppliedVersion');
  const statusEl = $('#parserNeedsReparse');
  if (currentEl) currentEl.textContent = currentVersion;
  if (appliedEl) appliedEl.textContent = appliedVersion;
  if (statusEl) statusEl.textContent = needsReparse ? '待回算' : '已是最新';
  const button = $('#reparseButton');
  if (button) {
    button.disabled = !needsReparse;
    button.textContent = '重新扫描历史行情';
  }
}

async function runReparse() {
  const needsReparse = !!state.dashboard?.parser?.needsReparse;
  if (!needsReparse) return;
  const confirmed = confirm('检测到解析规则已升级，是否对全部历史聊天记录重新扫描（回算）？此操作只补齐新规则可识别的历史报价，不会影响已勘误的行情，但可能耗时较长。');
  if (!confirmed) return;
  const button = $('#reparseButton');
  button.disabled = true;
  button.textContent = '正在回算…';
  try {
    const result = await api('/api/reparse', { method: 'POST' });
    state.prices = result.prices;
    state.dashboard = result.dashboard;
    renderAll();
    toast(`历史回算完成，新增 ${result.addedQuoteCount ?? 0} 条报价`);
  } catch (error) {
    toast('历史回算失败：' + error.message);
    renderParserStatus();
  }
}

async function review(card, status) {
  const body = {
    id: card.dataset.id,
    status,
    quoteType: card.querySelector('.review-type').value,
    priceWan: Number(card.querySelector('.review-price').value)
  };
  const result = await api('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  state.prices = result.prices;
  state.dashboard = result.dashboard;
  renderAll();
  toast(status === 'accepted' ? '行情已录入玉简' : '行情已舍弃');
}

function orderedItems(side) {
  const items = (state.prices?.items || []).filter(item => item[side]);
  const visible = side === 'sell' ? items.filter(item => !isSpecialPointCurrency(item)) : items;
  return orderedCategories().flatMap(category => visible.filter(item => item.category === category));
}

function quoteImageRows() {
  return orderedItems('buy').map(item => ({ item, category: item.category, price: item.buy.median, count: item.buy.count }));
}

function quoteImageWidth() {
  const main = document.querySelector('main');
  const width = Math.floor(main?.getBoundingClientRect().width || document.documentElement.clientWidth || 1180);
  return Math.max(960, Math.min(width, 1600));
}

function quoteImageColumns(width) {
  const margin = 28;
  const gap = 8;
  const minCardWidth = 176;
  return Math.max(1, Math.floor((width - margin * 2 + gap) / (minCardWidth + gap)));
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function imageSrcToDataUrl(src) {
  const absolute = new URL(src, location.origin).href;
  const response = await fetch(absolute);
  if (!response.ok) throw new Error(`图标读取失败 ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function fitText(ctx, text, x, y, maxWidth) {
  const value = String(text ?? '');
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(clipped + '…').width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(clipped + '…', x, y);
}

async function drawFallbackQuoteImage(canvas, rows) {
  const groups = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.category !== row.category) {
      group = { category: row.category, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }

  const width = quoteImageWidth();
  const columns = quoteImageColumns(width);
  const margin = 24;
  const gap = 7;
  const cardHeight = 90;
  const groupHeaderHeight = 30;
  const cardWidth = Math.floor((width - margin * 2 - gap * (columns - 1)) / columns);
  let height = 102;
  for (const group of groups) {
    height += groupHeaderHeight + Math.ceil(group.rows.length / columns) * (cardHeight + gap) + 14;
  }
  height = Math.max(height + 8, 360);

  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#dff8fa');
  gradient.addColorStop(0.48, '#c8f1f4');
  gradient.addColorStop(1, '#b8e7ee');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,.86)';
  roundRect(ctx, 16, 16, width - 32, height - 32, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(181,138,42,.36)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#168f83';
  ctx.font = '700 10px "Microsoft YaHei UI", sans-serif';
  ctx.fillText('MERCHANT BUYING', margin, 40);
  ctx.fillStyle = '#176f81';
  ctx.font = '600 27px "Microsoft YaHei UI", sans-serif';
  ctx.fillText('商人收购价', margin, 74);
  ctx.fillStyle = '#5e7b84';
  ctx.font = '12px "Microsoft YaHei UI", sans-serif';
  ctx.fillText('快速变现参考 · 主牌显示近三十日收购中位数', margin + 150, 72);

  const iconImages = new Map();
  await Promise.all(rows.map(async row => {
    const src = iconFor(row.item);
    if (!src || iconImages.has(row.item.name)) return;
    try {
      iconImages.set(row.item.name, await loadImage(await imageSrcToDataUrl(src)));
    } catch {
      iconImages.set(row.item.name, null);
    }
  }));

  let y = 110;
  for (const group of groups) {
    ctx.fillStyle = '#a77616';
    ctx.font = '13px "Microsoft YaHei UI", sans-serif';
    ctx.fillText(group.category, margin, y);
    ctx.strokeStyle = 'rgba(181,138,42,.46)';
    ctx.beginPath();
    ctx.moveTo(margin + 66, y - 5);
    ctx.lineTo(width - margin - 52, y - 5);
    ctx.stroke();
    ctx.fillStyle = '#5e7b84';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${group.rows.length} 件`, width - margin - 42, y - 1);
    y += groupHeaderHeight;

    group.rows.forEach((row, index) => {
      const col = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = margin + col * (cardWidth + gap);
      const cy = y + rowIndex * (cardHeight + gap);

      const cardGradient = ctx.createLinearGradient(x, cy, x + cardWidth, cy + cardHeight);
      cardGradient.addColorStop(0, 'rgba(255,255,255,.94)');
      cardGradient.addColorStop(1, 'rgba(216,246,242,.95)');
      ctx.fillStyle = cardGradient;
      roundRect(ctx, x, cy, cardWidth, cardHeight, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(22,143,131,.24)';
      ctx.stroke();

      const iconX = x + 10;
      const iconY = cy + 21;
      ctx.fillStyle = 'rgba(232,252,248,.85)';
      roundRect(ctx, iconX, iconY, 42, 42, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(22,143,131,.3)';
      ctx.stroke();
      const image = iconImages.get(row.item.name);
      if (image) {
        ctx.drawImage(image, iconX + 2, iconY + 2, 38, 38);
      } else {
        ctx.fillStyle = '#168fc0';
        ctx.beginPath();
        ctx.arc(iconX + 21, iconY + 21, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 15px "Microsoft YaHei UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(row.item.name.slice(0, 1), iconX + 21, iconY + 26);
        ctx.textAlign = 'left';
      }

      const textX = iconX + 50;
      ctx.fillStyle = '#168f83';
      ctx.font = '9px "Microsoft YaHei UI", sans-serif';
      fitText(ctx, row.category, textX, cy + 23, cardWidth - 74);
      ctx.fillStyle = '#215164';
      ctx.font = '14px "Microsoft YaHei UI", sans-serif';
      fitText(ctx, row.item.name, textX, cy + 48, cardWidth - 74);
      ctx.fillStyle = '#168f83';
      ctx.font = '700 19px Georgia, serif';
      const priceText = Number(row.price).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
      ctx.fillText(priceText, textX, cy + 74);
      ctx.fillStyle = '#5e7b84';
      ctx.font = '9px "Microsoft YaHei UI", sans-serif';
      ctx.fillText('万两', textX + ctx.measureText(priceText).width + 4, cy + 73);

      ctx.strokeStyle = 'rgba(181,138,42,.46)';
      ctx.beginPath();
      ctx.moveTo(x + cardWidth - 14, cy + 4);
      ctx.lineTo(x + cardWidth - 4, cy + 4);
      ctx.lineTo(x + cardWidth - 4, cy + 14);
      ctx.stroke();
    });
    y += Math.ceil(group.rows.length / columns) * (cardHeight + gap) + 14;
  }
}

async function quoteImage() {
  const rows = quoteImageRows();
  if (!rows.length) {
    toast('暂无商人收购价可生成图片');
    return;
  }
  const canvas = $('#quoteImageCanvas');
  try {
    await drawFallbackQuoteImage(canvas, rows);
    state.quoteImageReady = true;
    const empty = $('#quoteImageEmpty');
    if (empty) empty.style.display = 'none';
    toast('一图报价已生成');
  } catch (error) {
    toast('生成失败：' + error.message);
  }
}

async function copyQuoteImage() {
  const canvas = $('#quoteImageCanvas');
  if (!state.quoteImageReady || !canvas.width || !canvas.height) {
    toast('请先生成一图报价');
    return;
  }
  if (!navigator.clipboard || !window.ClipboardItem) {
    toast('当前浏览器不支持直接复制图片，请使用保存图片');
    return;
  }
  canvas.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制');
    } catch (error) {
      toast('复制失败，请使用保存图片');
    }
  }, 'image/png');
}

function saveQuoteImage() {
  const canvas = $('#quoteImageCanvas');
  if (!state.quoteImageReady || !canvas.width || !canvas.height) {
    toast('请先生成一图报价');
    return;
  }
  const link = document.createElement('a');
  link.download = '商人收购价.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}


function importSummary(batch) {
  return `<p>${esc(batch.fileName || '聊天记录.txt')} 已纳入卷宗。</p><div class="report-grid"><div><strong>${batch.scannedMessageCount ?? batch.messageCount}</strong><small>扫描消息</small></div><div><strong>${batch.messageCount}</strong><small>新增消息</small></div><div><strong>${batch.duplicateMessageCount || 0}</strong><small>略过旧文</small></div><div><strong>${batch.quoteCount}</strong><small>新增报价</small></div><div><strong>${batch.acceptedCount}</strong><small>自动录入</small></div><div><strong>${batch.pendingCount}</strong><small>待勘误</small></div></div>`;
}

async function readTextFileWithFallback(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buffer);
    } catch {
      return new TextDecoder().decode(buffer);
    }
  }
}

async function refreshFromDefaultChat() {
  const button = $('#refreshButton');
  button.disabled = true;
  button.textContent = '正在导入…';
  try {
    const result = await api('/api/import-default', { method: 'POST' });
    state.prices = result.prices;
    state.dashboard = result.dashboard;
    renderAll();
    const batch = result.batch;
    const message = result.duplicate
      ? '聊天快照已导入过，玉简已刷新'
      : `已增量导入 ${batch.messageCount} 条消息 / ${batch.quoteCount} 条报价`;
    toast(message);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '导入并刷新';
  }
}

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  $$('.view').forEach(item => item.classList.remove('active'));
  $(`#view-${tab.dataset.view}`).classList.add('active');
}));

on('#dungeonShenqiTabs', 'click', event => {
  const tab = event.target.closest('[data-ds-tab]');
  if (!tab) return;
  state.activeDsTab = tab.dataset.dsTab;
  renderDungeonShenqi();
});
on('#dungeonCards', 'click', event => {
  const button = event.target.closest('[data-dungeon-detail]');
  if (!button) return;
  const name = button.dataset.dungeonDetail;
  state.expandedDungeons[name] = !state.expandedDungeons[name];
  renderDungeonShenqi();
});
on('#importDungeonRun', 'click', importDungeonRun);
on('#scanDungeonDrops', 'click', scanDungeonDrops);

on('#pointShopTabs', 'click', event => {
  const tab = event.target.closest('[data-point-shop]');
  if (!tab) return;
  state.activePointShop = tab.dataset.pointShop;
  renderPointShops();
});
on('#addPointItem', 'click', () => {
  const shop = pointShopById();
  if (!shop || shop.enabled === false) return;
  shop.items.push({ id: pointItemId(), name: '待命名兑换物', quantity: 1, pointCost: null, notes: '' });
  renderPointShops();
  const input = $('#pointShopRows tr:last-child .point-name');
  if (input) input.select();
});
on('#pointShopRows', 'change', event => {
  const row = event.target.closest('[data-point-item]');
  if (!row) return;
  applyPointItemChange(row, true);
});
on('#pointShopRows', 'click', event => {
  const button = event.target.closest('.point-delete');
  if (!button) return;
  const row = button.closest('[data-point-item]');
  const shop = pointShopById();
  shop.items = shop.items.filter(item => item.id !== row.dataset.pointItem);
  renderPointShops();
});
on('#savePointShops', 'click', savePointShops);
on('#saveManualPrice', 'click', saveManualPrice);
on('#buildPublication', 'click', buildPublication);

on('#categoryChips', 'click', event => {
  const chip = event.target.closest('.category-chip');
  if (!chip) return;
  const value = chip.dataset.category;
  state.activeCategory = state.activeCategory === value && value !== '全部' ? '全部' : value;
  renderPrices();
  const first = $('.price-card.highlighted');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

on('#priceSearch', 'input', event => {
  state.searchQuery = event.target.value;
  renderPrices();
  const first = $('.price-card.highlighted');
  if (first && state.searchQuery.trim()) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

on('#clearHighlight', 'click', () => {
  state.activeCategory = '全部';
  state.searchQuery = '';
  if ($('#priceSearch')) $('#priceSearch').value = '';
  renderPrices();
});

on('.view#view-prices', 'click', event => {
  const card = event.target.closest('.price-card');
  if (!card) return;
  const side = card.dataset.side;
  const item = card.dataset.item;
  state.expanded[side] = state.expanded[side] === item ? null : item;
  renderMatrix(side);
  requestAnimationFrame(() => {
    const detail = document.querySelector(`[data-detail="${side}:${CSS.escape(item)}"]`);
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});

on('#refreshButton', 'click', refreshFromDefaultChat);
on('#reparseButton', 'click', runReparse);

on('#quoteImageButton', 'click', quoteImage);
on('#copyQuoteImage', 'click', copyQuoteImage);
on('#saveQuoteImage', 'click', saveQuoteImage);

on('#reviewList', 'click', event => {
  const card = event.target.closest('.review-card');
  if (!card) return;
  if (event.target.closest('.accept')) review(card, 'accepted').catch(error => toast(error.message));
  if (event.target.closest('.reject')) review(card, 'rejected').catch(error => toast(error.message));
});

on('#termsSearch', 'input', event => {
  state.termQuery = event.target.value;
  renderTerms();
});
on('#termsList', 'click', event => {
  const button = event.target.closest('[data-rule-item]');
  if (!button) return;
  state.selectedRuleItem = button.dataset.ruleItem;
  renderTerms();
});
on('#ruleDetail', 'change', event => {
  const card = event.target.closest('.rule-detail-card');
  if (!card) return;
  const name = card.dataset.name;
  saveTermStatus(name, {
    status: card.querySelector('.term-status').value,
    note: card.querySelector('.term-note').value
  });
  toast('规则校对已记录在本机');
});
on('#ruleDetail', 'input', event => {
  if (!event.target.classList.contains('term-note')) return;
  const card = event.target.closest('.rule-detail-card');
  const name = card.dataset.name;
  saveTermStatus(name, {
    status: card.querySelector('.term-status').value,
    note: card.querySelector('.term-note').value
  });
});
on('#refreshRules', 'click', refreshRules);
on('#exportTerms', 'click', exportTerms);

on('#saveItems', 'click', async () => {
  try {
    const body = JSON.parse($('#itemsEditor').value);
    const result = await api('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    state.items = body;
    state.prices = result.prices;
    renderPrices();
    renderTerms();
    toast('词典已封存');
  } catch (error) {
    toast('封存失败：' + error.message);
  }
});

load().catch(error => toast('加载失败：' + error.message));
