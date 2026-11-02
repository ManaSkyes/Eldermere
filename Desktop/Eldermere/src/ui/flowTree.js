// src/ui/flowTree.js — the "flow" skill-tree layout.
//
// ANY tree in SKILL_TREES can use it: add `flow: {}` to the tree (or to a TEMPLATES entry for every generic tree
// of that group). Everything else is automatic. Optional settings:
//   flow.columns  column order left → right. Ids are branch keys plus 'core' (nodes with no `branch`).
//                 Default: first half of the branches, then core, then the rest, so core sits in the middle.
//   flow.colors   { columnId: '#hex' } overrides for the default palette.
//   flow.compat   [[nodeA, nodeB, 'why they work together'], ...] synergy links (drawn as coloured dashes).
//   flow.coreName label over the core column (default 'Core').
//
// Layout rules (no coordinates are ever written by hand):
// - The root is the innate gate-0 node with no branch. A tree without one gets a virtual root named after the tree.
// - Rank tiers (Unskilled → Guru) are horizontal bands that bow downward around the root; empty tiers are skipped.
// - Inside a column, `needs` (or the first `needsAny`) in the same column makes a node hang under its parent; a
//   parent with several children opens a lane per child. Nodes with no parent there are packed side by side so
//   nothing overlaps. Several nodes of one chain inside a single tier stack as sub-rows.
// - `oneOf` / opposite pairs (from skillTrees.js) get a ⊘ badge; selecting one draws the red lock link to its partner.
//
// checkFlowTree(tree) returns a list of problems (bad ids, overlaps, unknown columns). tree-lab.html shows every tree
// and runs the check, so a new or migrated tree can be verified without starting the game.
import { escapeHtml } from './util.js';

const TIERS = [
  { name: 'Unskilled', range: '0–199', min: 0 }, { name: 'Apprentice', range: '200–499', min: 200 },
  { name: 'Journeyman', range: '500–999', min: 500 }, { name: 'Expert', range: '1,000–4,999', min: 1000 },
  { name: 'Master', range: '5,000–9,999', min: 5000 }, { name: 'Guru', range: '10,000+', min: 10000 },
];
const tierOf = gate => { let t = 0; TIERS.forEach((x, i) => { if ((gate || 0) >= x.min) t = i; }); return t; };
const PALETTE = ['#b5562a', '#3f7f45', '#2f7590', '#8b3d78', '#6d5a9c', '#a0762a', '#4f7f86', '#9a4a4a'];
const CORE_COLOR = '#8a6a2e', ROOT_ID = '__root';

const LANE = 132, COL_GAP = 26, ROW = 104, BAND_PAD = 34, TOP = 56, SIDE = 24, BOW = 46;
const NODE_W = 116, NODE_UP = 24, NODE_DOWN = 50;   // collision box around the orb centre

// Resolved settings for a tree (defaults filled in).
function flowConfig(tree) {
  const f = tree.flow || {}, nodes = tree.nodes;
  const real = nodes.find(n => n.innate && !n.gate && !n.branch);
  const root = real || { id: ROOT_ID, name: tree.name, kind: 'root', gate: 0, ranks: 1, innate: true, virtual: true,
    text: tree.intro || `Every ${tree.name} technique grows from here.` };
  const col = n => n.branch || 'core';
  const present = new Set(nodes.filter(n => n !== root).map(col));
  const branches = Object.keys(tree.branches || {}).filter(b => present.has(b));
  let columns = (f.columns || (() => { const h = Math.ceil(branches.length / 2); return [...branches.slice(0, h), 'core', ...branches.slice(h)]; })())
    .filter(id => present.has(id));
  for (const id of present) if (!columns.includes(id)) columns.push(id);   // never drop a column that has nodes
  const colors = { core: CORE_COLOR }; let i = 0;
  for (const id of columns) if (id !== 'core') colors[id] = PALETTE[i++ % PALETTE.length];
  Object.assign(colors, f.colors || {});
  return { root, col, columns, colors, compat: f.compat || [] };
}

// Pure layout: node positions (px), stage size and band outlines. Cached per tree object.
const layoutCache = new WeakMap();
export function flowLayout(tree) {
  if (layoutCache.has(tree)) return layoutCache.get(tree);
  const cfg = flowConfig(tree), { root, col } = cfg;
  const nodes = tree.nodes.filter(n => n !== root), all = [root, ...nodes];
  const byId = Object.fromEntries(all.map(n => [n.id, n]));
  const parentIn = n => [...(n.needs || []), ...(n.needsAny || [])].map(id => byId[id]).find(p => p && p !== root && col(p) === col(n));
  const kids = {}; for (const n of nodes) { const p = parentIn(n); if (p) (kids[p.id] ||= []).push(n); }
  for (const k in kids) kids[k].sort((a, b) => a.gate - b.gate || a.name.localeCompare(b.name));

  const subRow = {}, sr = n => {
    if (n.id in subRow) return subRow[n.id];
    const p = parentIn(n); return (subRow[n.id] = p && tierOf(p.gate) === tierOf(n.gate) ? sr(p) + 1 : 0);
  };
  nodes.forEach(sr);
  const rowKey = n => tierOf(n.gate) * 100 + subRow[n.id];

  // lanes: a tidy tree per column root, then the roots are packed left → right without overlapping
  const leaves = n => (kids[n.id] || []).reduce((s, k) => s + leaves(k), 0) || 1;
  const lane = {}, place = (n, left) => {
    const ch = kids[n.id] || [];
    if (!ch.length) return (lane[n.id] = left + .5);
    let l = left; const xs = ch.map(k => { const x = place(k, l); l += leaves(k); return x; });
    return (lane[n.id] = ch.length === 1 ? xs[0] : (xs[0] + xs[xs.length - 1]) / 2);
  };
  const subtree = n => [n, ...(kids[n.id] || []).flatMap(subtree)];
  const colLanes = {};
  for (const id of cfg.columns) {
    const occupied = {};   // rowKey → [[from, to], ...]
    const roots = nodes.filter(n => col(n) === id && !parentIn(n)).sort((a, b) => a.gate - b.gate || a.name.localeCompare(b.name));
    let width = 1;
    for (const r of roots) {
      place(r, 0); const members = subtree(r);
      const fits = o => members.every(m => (occupied[rowKey(m)] || []).every(([a, b]) => lane[m.id] + o + .5 <= a + 1e-6 || lane[m.id] + o - .5 >= b - 1e-6));
      let o = 0; while (!fits(o)) o++;
      for (const m of members) { lane[m.id] += o; (occupied[rowKey(m)] ||= []).push([lane[m.id] - .5, lane[m.id] + .5]); }
      width = Math.max(width, o + leaves(r));
    }
    colLanes[id] = width;
  }

  let width = SIDE * 2 + cfg.columns.reduce((s, id) => s + colLanes[id] * LANE, 0) + COL_GAP * (cfg.columns.length - 1);
  const colLeft = {}; let x0 = SIDE; for (const id of cfg.columns) { colLeft[id] = x0; x0 += colLanes[id] * LANE + COL_GAP; }
  if (colLeft.core !== undefined) {   // centre the stage on the core spine: pad whichever side is narrower
    const left = colLeft.core + colLanes.core * LANE / 2, right = width - left;
    if (left > right) width += left - right;
    else { const d = right - left; for (const id of cfg.columns) colLeft[id] += d; width += d; }
  }
  const mid = width / 2, bow = x => BOW * (1 - ((x - mid) / mid) ** 2);   // rings around the root: lowest under it

  subRow[root.id] = 0;
  // the root has its own row above the rank bands, so it never collides with gate-0 techniques
  const used = [...new Set(nodes.map(n => tierOf(n.gate)))].sort((a, b) => a - b);
  const bands = []; let y = TOP + ROW * .85;
  for (const t of used) {
    const rows = 1 + Math.max(...nodes.filter(n => tierOf(n.gate) === t).map(n => subRow[n.id]));
    const h = rows * ROW + BAND_PAD; bands.push({ ...TIERS[t], tier: t, top: y, height: h }); y += h;
  }
  const height = y + BOW + 30, bandOf = t => bands.find(b => b.tier === t);
  const pos = {};
  pos[root.id] = { x: mid, y: TOP + 6 };
  for (const n of nodes) {
    const x = colLeft[col(n)] + lane[n.id] * LANE, b = bandOf(tierOf(n.gate));
    pos[n.id] = { x, y: b.top + BAND_PAD / 2 + ROW * (subRow[n.id] + .35) + bow(x) };
  }
  // dotted "flow" link for nodes with no prerequisite at all: from the nearest node above in the same lane, else the root
  const flowFrom = {};
  for (const n of nodes) {
    if ((n.needs || []).length || (n.needsAny || []).length) continue;
    const above = nodes.filter(m => m !== n && col(m) === col(n) && Math.abs(lane[m.id] - lane[n.id]) < .5 && rowKey(m) < rowKey(n))
      .sort((a, b) => rowKey(b) - rowKey(a))[0];
    flowFrom[n.id] = above ? above.id : root.id;
  }
  const out = { ...cfg, pos, width, height, bands, bow, mid, byId, all, colLeft, colLanes, flowFrom };
  layoutCache.set(tree, out); return out;
}

// Problems a tree author should fix. Empty list = good to go.
export function checkFlowTree(tree) {
  const out = [], ids = new Set(tree.nodes.map(n => n.id));
  const seen = new Set(); for (const n of tree.nodes) { if (seen.has(n.id)) out.push(`duplicate node id "${n.id}"`); seen.add(n.id); }
  for (const n of tree.nodes) {
    if (typeof n.gate !== 'number') out.push(`${n.id}: missing gate`);
    if (!(n.ranks >= 1)) out.push(`${n.id}: ranks must be 1 or more`);
    if (n.branch && !tree.branches?.[n.branch]) out.push(`${n.id}: branch "${n.branch}" is not in tree.branches`);
    for (const r of [...(n.needs || []), ...(n.needsAny || [])]) {
      if (!ids.has(r)) out.push(`${n.id}: needs unknown node "${r}"`);
      else { const p = tree.nodes.find(x => x.id === r); if (p.gate > n.gate) out.push(`${n.id}: needs "${r}" which has a higher gate (${p.gate} > ${n.gate})`); }
    }
    if (n.oneOf && !ids.has(n.oneOf)) out.push(`${n.id}: oneOf unknown node "${n.oneOf}"`);
  }
  for (const [a, b] of tree.flow?.compat || []) for (const x of [a, b]) if (!ids.has(x)) out.push(`compat: unknown node "${x}"`);
  for (const c of tree.flow?.columns || []) if (c !== 'core' && !tree.branches?.[c]) out.push(`columns: "${c}" is not a branch`);
  if (!out.length) {
    const L = flowLayout(tree), ps = Object.entries(L.pos);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      if (Math.abs(ps[i][1].x - ps[j][1].x) < NODE_W - 4 && Math.abs(ps[i][1].y - ps[j][1].y) < 60) out.push(`overlap: "${ps[i][0]}" and "${ps[j][0]}"`);
  }
  return out;
}

const boxHit = (p, x, y) => x > p.x - NODE_W / 2 && x < p.x + NODE_W / 2 && y > p.y - NODE_UP && y < p.y + NODE_DOWN;
// a gently curved link that avoids unrelated nodes where it can
function curvedPath(L, a, b, others) {
  const p = L.pos[a], q = L.pos[b], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  let best = null;
  for (const k of [.1, -.1, .18, -.18, .26, -.26, .34, -.34]) {
    const cx = (p.x + q.x) / 2 + nx * len * k, cy = (p.y + q.y) / 2 + ny * len * k; let hits = 0;
    for (let i = 1; i < 24; i++) {
      const t = i / 24, x = (1 - t) ** 2 * p.x + 2 * (1 - t) * t * cx + t * t * q.x, y = (1 - t) ** 2 * p.y + 2 * (1 - t) * t * cy + t * t * q.y;
      for (const o of others) if (boxHit(o, x, y)) hits++;
    }
    if (!best || hits < best.hits) best = { hits, d: `M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}`, mx: .25 * p.x + .5 * cx + .25 * q.x, my: .25 * p.y + .5 * cy + .25 * q.y };
    if (!hits) break;
  }
  return best;
}
const vPath = (p, q) => { const m = (p.y + q.y) / 2; return `M ${p.x} ${p.y} C ${p.x} ${m}, ${q.x} ${m}, ${q.x} ${q.y}`; };

// info: { rank(n), check(n) → {ok, reason}, selected, points, branchName(n) }
export function renderFlowTree(tree, info) {
  const L = flowLayout(tree), { pos, byId, col, colors, compat, root } = L;
  const sel = byId[info.selected] ? info.selected : root.id;
  const rankOf = n => n.virtual ? 1 : info.rank(n);
  const touches = (e, id) => e[0] === id || e[1] === id;
  const others = (a, b) => Object.entries(pos).filter(([id]) => id !== a && id !== b).map(([, v]) => v);

  const arc = y => { const y0 = y + L.bow(0), y2 = y + L.bow(L.width), cx = 2 * L.mid - L.width / 2, cy = 2 * (y + L.bow(L.mid)) - (y0 + y2) / 2; return { y0, y2, cx, cy }; };
  const bandSvg = L.bands.map((b, i) => {
    const t = arc(b.top), u = arc(b.top + b.height), sep = `M 0 ${t.y0} Q ${t.cx} ${t.cy} ${L.width} ${t.y2}`;
    return `<path class="ft-band-sep" d="${sep}"/>` + (i % 2 ? `<path class="ft-band-fill" d="${sep} L ${L.width} ${u.y2} Q ${u.cx} ${u.cy} 0 ${u.y0} Z"/>` : '');
  }).join('');
  const bandLabels = L.bands.map(b => `<div class="ft-band-label" style="top:${b.top + L.bow(40) + 6}px"><b>${b.name}</b><small>${b.range}</small></div>`).join('');
  const colLabels = L.columns.map(id => {
    const x = L.colLeft[id] + L.colLanes[id] * LANE / 2, name = id === 'core' ? (tree.flow?.coreName || 'Core') : tree.branches[id].name;
    return `<span class="ft-col-label" style="left:${x}px;color:${colors[id]}">${escapeHtml(name)}</span>`;
  }).join('');

  const defs = [], paths = [];
  for (const [id, from] of Object.entries(L.flowFrom)) paths.push(`<path class="ft-root" style="stroke:${colors[col(byId[id])]}" d="${vPath(pos[from], pos[id])}"/>`);
  for (const n of L.all) {
    if (n === root) continue;
    for (const p of (n.needs || []).filter(id => pos[id])) paths.push(`<path class="ft-req ${rankOf(byId[p]) > 0 ? 'on' : ''}" style="stroke:${colors[col(n)]}" d="${vPath(pos[p], pos[n.id])}"/>`);
    for (const p of (n.needsAny || []).filter(id => pos[id])) paths.push(`<path class="ft-req any ${rankOf(byId[p]) > 0 ? 'on' : ''}" style="stroke:${colors[col(n)]}" d="${vPath(pos[p], pos[n.id])}"><title>Any one of these</title></path>`);
  }
  compat.forEach(([a, b], i) => {
    if (!pos[a] || !pos[b]) return;
    const p = pos[a], q = pos[b];
    defs.push(`<linearGradient id="ftg${i}" gradientUnits="userSpaceOnUse" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"><stop offset="0" stop-color="${colors[col(byId[a])]}"/><stop offset="1" stop-color="${colors[col(byId[b])]}"/></linearGradient>`);
    paths.push(`<path class="ft-syn ${touches([a, b], sel) ? 'hot' : ''}" stroke="url(#ftg${i})" d="${curvedPath(L, a, b, others(a, b)).d}"/>`);
  });
  const selNode = byId[sel], lockId = selNode.opposite;
  if (lockId && pos[lockId]) {
    const c = curvedPath(L, sel, lockId, others(sel, lockId));
    paths.push(`<path class="ft-lock" d="${c.d}"/><g class="ft-lock-mark" transform="translate(${c.mx} ${c.my})"><circle r="9"/><path d="M -5 5 L 5 -5"/></g>`);
  }

  const orbs = L.all.map(n => {
    const p = pos[n.id], have = rankOf(n), chk = n.virtual ? { ok: false } : info.check(n), c = colors[n === root ? 'core' : col(n)] || CORE_COLOR;
    const barred = n.opposite && byId[n.opposite] && rankOf(byId[n.opposite]) > 0;
    const state = n.innate || have >= n.ranks ? 'full' : have ? 'got' : chk.ok ? 'buy' : barred ? 'barred' : 'locked';
    return `<button class="ft-node ${state} ${n === root ? 'root' : ''} ${n.id === sel ? 'sel' : ''} ${n.id === lockId ? 'lock-target' : ''}" data-ft-node="${n.id}" style="left:${p.x}px;top:${p.y}px;--c:${c}">
      <span class="ft-orb">${n === root ? '✶' : n.kind === 'active' ? '✦' : '◆'}${n.opposite ? '<i class="ft-lock-badge" title="One-or-the-other choice">⊘</i>' : ''}</span>
      <span class="ft-name">${escapeHtml(n.name)}</span>
      <span class="ft-rank">${n.virtual ? '' : n.innate ? 'innate' : `${have}/${n.ranks}`}</span></button>`;
  }).join('');

  const n = selNode, have = rankOf(n), c = colors[n === root ? 'core' : col(n)] || CORE_COLOR;
  let panel;
  if (n.virtual) panel = `<aside class="ft-panel" style="--c:${c}"><small class="ft-disc">${escapeHtml(tree.name)}</small><h4>${escapeHtml(tree.name)}</h4><p>${escapeHtml(n.text)}</p><p class="ft-known">Every path starts here. Select a technique to see its details.</p><p class="ft-pts">${info.points} point${info.points === 1 ? '' : 's'} to spend</p></aside>`;
  else {
    const chk = info.check(n);
    const syn = compat.filter(e => touches(e, sel)).map(([a, b, note]) => { const o = byId[a === sel ? b : a]; return `<li><button data-ft-node="${o.id}" style="color:${colors[col(o)]}">${escapeHtml(o.name)}</button> ${escapeHtml(note || '')}</li>`; }).join('');
    const needs = (n.needs || []).map(id => byId[id]?.name).filter(Boolean), any = (n.needsAny || []).map(id => byId[id]?.name).filter(Boolean);
    const also = Object.entries(n.also || {}).map(([k, v]) => `${k} ${v}`);
    const req = [`${tree.name} ${n.gate}`, ...needs, ...(any.length ? ['one of: ' + any.join(' / ')] : []), ...also];
    const lock = n.opposite && byId[n.opposite] ? `<p class="ft-lock-note">⊘ One or the other: taking this locks <button data-ft-node="${n.opposite}">${escapeHtml(byId[n.opposite].name)}</button> (reset the tree to choose again).</p>` : '';
    const buy = n.innate ? '<p class="ft-known">Known from the start.</p>' : have >= n.ranks ? '<p class="ft-known">Fully learned.</p>'
      : `<button class="ft-learn" data-ft-buy="${n.id}" ${chk.ok ? '' : 'disabled'}>${chk.ok ? `Learn rank ${have + 1} · 1 point` : escapeHtml(chk.reason)}</button>`;
    panel = `<aside class="ft-panel" style="--c:${c}">
      <small class="ft-disc">${escapeHtml(info.branchName(n))} · ${TIERS[tierOf(n.gate)].name} · ${n.kind}</small>
      <h4>${escapeHtml(n.name)}</h4>
      <div class="ft-pips">${Array.from({ length: n.ranks }, (_, i) => `<i class="${i < (n.innate ? n.ranks : have) ? 'on' : ''}"></i>`).join('')}<span>${n.innate ? 'Innate' : `Rank ${have} / ${n.ranks}`}</span></div>
      <p>${escapeHtml(n.text)}</p>
      <dl><dt>Requires</dt><dd>${req.map(escapeHtml).join(' · ')}</dd></dl>
      ${lock}${buy}
      ${syn ? `<h5>Works with</h5><ul class="ft-syn-list">${syn}</ul>` : ''}
      <p class="ft-pts">${info.points} point${info.points === 1 ? '' : 's'} to spend</p></aside>`;
  }

  return `<div class="ft-wrap"><div class="ft-scroll"><div class="ft-zoom"><button data-ft-zoom="in" title="Zoom in">+</button><button data-ft-zoom="out" title="Zoom out">−</button><button data-ft-zoom="fit" title="Fit whole tree">⤢</button></div><div class="ft-stage" style="width:${L.width}px;height:${L.height}px">
    <svg class="ft-svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><defs>${defs.join('')}</defs>${bandSvg}${paths.join('')}</svg>
    <div class="ft-cols">${colLabels}</div><div class="ft-bands">${bandLabels}</div>${orbs}</div></div>${panel}</div>
    <div class="ft-legend"><span><i class="l-req"></i>Prerequisite</span>${compat.length ? '<span><i class="l-syn"></i>Synergy</span>' : ''}${tree.nodes.some(x => x.opposite) ? '<span><b class="l-lock">⊘</b>One or the other</span>' : ''}<span><i class="o buy"></i>Can learn</span><span><i class="o got"></i>Learning</span><span><i class="o full"></i>Mastered</span><span><i class="o locked"></i>Locked</span></div>`;
}

// Wire pan/zoom, hover tooltip, selection and buying. The view (pan + zoom) survives re-renders.
// Drag anywhere to pan, wheel to zoom at the cursor, buttons for +/−/fit. A drag never counts as a click.
let view = null;
export function bindFlowTree(el, tree, { onSelect, onBuy }) {
  const box = el.querySelector('.ft-scroll'), stage = el.querySelector('.ft-stage'); if (!box || !stage) return;
  const L = flowLayout(tree), pad = 16;
  const fit = () => { const s = Math.max(.2, Math.min(1.25, (box.clientWidth - pad * 2) / L.width, (box.clientHeight - pad * 2) / L.height));
    return { s, x: (box.clientWidth - L.width * s) / 2, y: pad }; };
  if (!view) view = fit();
  const apply = () => { stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; };
  const clampS = s => Math.max(.2, Math.min(2, s));
  const zoomAt = (f, cx, cy) => { const s = clampS(view.s * f), k = s / view.s; view = { s, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }; apply(); };
  apply();
  box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null, moved = false;
  box.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('.ft-zoom')) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; });
  const move = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) > 4) { moved = true; box.classList.add('dragging'); hide(); }
    if (moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); } };
  const up = () => { drag = null; box.classList.remove('dragging'); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  new MutationObserver((_, o) => { if (!box.isConnected) { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); o.disconnect(); } }).observe(el, { childList: true, subtree: true });
  box.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);   // swallow the click that ends a drag
  el.querySelectorAll('[data-ft-zoom]').forEach(b => b.addEventListener('click', () => {
    const z = b.dataset.ftZoom, cx = box.clientWidth / 2, cy = box.clientHeight / 2;
    if (z === 'fit') { view = fit(); apply(); } else zoomAt(z === 'in' ? 1.25 : .8, cx, cy);
  }));

  let tip = null; function hide() { tip?.remove(); tip = null; }
  el.querySelectorAll('.ft-node').forEach(b => {
    b.addEventListener('mouseenter', () => {
      if (drag) return; hide(); const n = L.byId[b.dataset.ftNode]; if (!n) return;
      tip = document.createElement('div'); tip.className = 'ft-tip';
      tip.innerHTML = `<b>${escapeHtml(n.name)}</b><span>${escapeHtml(n.text || '')}</span><em>Click for details</em>`;
      document.body.appendChild(tip);
      const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
      tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; tip.style.top = y + 'px';
    });
    b.addEventListener('mouseleave', hide);
  });
  el.querySelectorAll('[data-ft-node]').forEach(b => b.addEventListener('click', () => { hide(); onSelect(b.dataset.ftNode); }));
  el.querySelectorAll('[data-ft-buy]').forEach(b => b.addEventListener('click', () => { hide(); onBuy(b.dataset.ftBuy); }));
}
export function resetFlowScroll() { view = null; }
