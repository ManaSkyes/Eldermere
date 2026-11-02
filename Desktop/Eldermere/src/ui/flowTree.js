// src/ui/flowTree.js — the "flow" skill-tree layout (first used by Chain Casting).
//
// A tree opts in with `flow: { columns, colors, compat }` on its SKILL_TREES entry:
//   columns  discipline order left → right; 'core' is the node set with no `branch`
//   colors   one colour per column id
//   compat   [[nodeA, nodeB, note]]: cross-discipline synergy links
// The innate root (gate 0) sits top-centre and every discipline flows down from it. Rank tiers are
// horizontal bands that bow downward (a radial feel) while staying easy to read as rows. Inside a
// column, a node that splits into several children opens a sub-lane per child, so each line of
// techniques reads as its own vertical chain.
//
// Hover shows a short tooltip; click selects the node and fills the side panel (full text, Learn
// button, synergies). Synergy lines are coloured from one discipline to the other and curve around
// unrelated nodes where possible.
import { escapeHtml } from './util.js';

const TIERS = [
  { name: 'Unskilled', range: '0–199', min: 0 }, { name: 'Apprentice', range: '200–499', min: 200 },
  { name: 'Journeyman', range: '500–999', min: 500 }, { name: 'Expert', range: '1,000–4,999', min: 1000 },
  { name: 'Master', range: '5,000–9,999', min: 5000 }, { name: 'Guru', range: '10,000+', min: 10000 },
];
const tierOf = gate => { let t = 0; TIERS.forEach((x, i) => { if (gate >= x.min) t = i; }); return t; };

const LANE = 132, COL_GAP = 26, ROW = 104, BAND_PAD = 34, TOP = 56, SIDE = 24, BOW = 46;
const NODE_W = 116, NODE_UP = 24, NODE_DOWN = 50;   // collision box around the orb centre

// Pure layout: node positions (px), stage size and band outlines. Cached per tree object.
const layoutCache = new WeakMap();
export function flowLayout(tree) {
  if (layoutCache.has(tree)) return layoutCache.get(tree);
  const nodes = tree.nodes, byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const col = n => n.branch || 'core';
  const root = nodes.find(n => n.innate && n.gate === 0) || nodes[0];
  const parentIn = n => (n.needs || []).map(id => byId[id]).find(p => p && col(p) === col(n));
  const kids = {}; for (const n of nodes) { const p = parentIn(n); if (p) (kids[p.id] ||= []).push(n); }
  for (const k in kids) kids[k].sort((a, b) => a.gate - b.gate || a.name.localeCompare(b.name));

  // sub-lanes: tidy tree inside each column (leaves get one lane each)
  const leaves = n => (kids[n.id] || []).reduce((s, k) => s + leaves(k), 0) || 1;
  const lane = {}, place = (n, left) => {
    const ch = kids[n.id] || [];
    if (!ch.length) return (lane[n.id] = left + .5);
    let l = left; const xs = ch.map(k => { const x = place(k, l); l += leaves(k); return x; });
    return (lane[n.id] = ch.length === 1 ? xs[0] : (xs[0] + xs[xs.length - 1]) / 2);
  };
  const colIds = tree.flow.columns, colLanes = {};
  for (const id of colIds) {
    const roots = nodes.filter(n => n !== root && col(n) === id && !parentIn(n));
    const w = Math.max(1, ...roots.map(leaves)); colLanes[id] = w;
    for (const r of roots) place(r, (w - leaves(r)) / 2);
  }
  let width = SIDE * 2 + colIds.reduce((s, id) => s + colLanes[id] * LANE, 0) + COL_GAP * (colIds.length - 1);
  const colLeft = {}; let x0 = SIDE; for (const id of colIds) { colLeft[id] = x0; x0 += colLanes[id] * LANE + COL_GAP; }
  if (colLeft.core !== undefined) {   // centre the stage on the Universal spine: pad whichever side is narrower
    const left = colLeft.core + colLanes.core * LANE / 2, right = width - left;
    if (left > right) width += left - right;
    else { const d = right - left; for (const id of colIds) colLeft[id] += d; width += d; }
  }
  const mid = width / 2, span = mid, bow = x => BOW * (1 - ((x - mid) / span) ** 2);   // rings around the root: lowest under it, rising outward

  // sub-rows inside a tier: depth of the in-column chain that stays in the same tier
  const subRow = {}, sr = n => {
    if (n.id in subRow) return subRow[n.id];
    const p = parentIn(n); return (subRow[n.id] = p && tierOf(p.gate) === tierOf(n.gate) ? sr(p) + 1 : 0);
  };
  nodes.forEach(sr); subRow[root.id] = 0;
  const used = [...new Set(nodes.map(n => tierOf(n.gate)))].sort((a, b) => a - b);
  const bands = []; let y = TOP;
  for (const t of used) {
    const rows = 1 + Math.max(...nodes.filter(n => tierOf(n.gate) === t).map(n => subRow[n.id]));
    const h = rows * ROW + BAND_PAD; bands.push({ ...TIERS[t], tier: t, top: y, height: h }); y += h;
  }
  const height = y + BOW + 30, bandOf = t => bands.find(b => b.tier === t);

  const pos = {};
  for (const n of nodes) {
    const x = n === root ? mid : colLeft[col(n)] + lane[n.id] * LANE;
    const b = bandOf(tierOf(n.gate));
    pos[n.id] = { x, y: b.top + BAND_PAD / 2 + ROW * (subRow[n.id] + .35) + bow(x) };
  }
  const out = { pos, width, height, bands, bow, mid, root, byId, col, colLeft, colLanes };
  layoutCache.set(tree, out); return out;
}

const boxHit = (p, x, y) => x > p.x - NODE_W / 2 && x < p.x + NODE_W / 2 && y > p.y - NODE_UP && y < p.y + NODE_DOWN;
// a gently curved synergy path that avoids unrelated nodes where it can
function synergyPath(L, a, b, others) {
  const p = L.pos[a], q = L.pos[b], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  let best = null;
  for (const k of [.1, -.1, .18, -.18, .26, -.26, .34, -.34]) {
    const cx = (p.x + q.x) / 2 + nx * len * k, cy = (p.y + q.y) / 2 + ny * len * k; let hits = 0;
    for (let i = 1; i < 24; i++) {
      const t = i / 24, x = (1 - t) ** 2 * p.x + 2 * (1 - t) * t * cx + t * t * q.x, y = (1 - t) ** 2 * p.y + 2 * (1 - t) * t * cy + t * t * q.y;
      for (const o of others) if (boxHit(o, x, y)) hits++;
    }
    if (!best || hits < best.hits) best = { hits, d: `M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}` };
    if (!hits) break;
  }
  return best.d;
}
const vPath = (p, q) => { const m = (p.y + q.y) / 2; return `M ${p.x} ${p.y} C ${p.x} ${m}, ${q.x} ${m}, ${q.x} ${q.y}`; };

// st: tree state; info: { rank(n), check(n) → {ok, reason}, selected, points, branchName(n) }
export function renderFlowTree(tree, info) {
  const L = flowLayout(tree), { pos, byId, col } = L, colors = tree.flow.colors, compat = tree.flow.compat || [];
  const sel = byId[info.selected] ? info.selected : L.root.id;
  const touches = (e, id) => e[0] === id || e[1] === id;

  // bands: bowed separators + labels
  // a band edge follows the same parabola as the nodes (a quadratic Bézier is exactly a parabola)
  const arc = y => { const y0 = y + L.bow(0), y2 = y + L.bow(L.width), cx = 2 * L.mid - L.width / 2, cy = 2 * (y + L.bow(L.mid)) - (y0 + y2) / 2; return { y0, y2, cx, cy }; };
  const bandSvg = L.bands.map((b, i) => {
    const t = arc(b.top), u = arc(b.top + b.height);
    const sep = `M 0 ${t.y0} Q ${t.cx} ${t.cy} ${L.width} ${t.y2}`;
    return `<path class="ft-band-sep" d="${sep}"/>` + (i % 2 ? `<path class="ft-band-fill" d="${sep} L ${L.width} ${u.y2} Q ${u.cx} ${u.cy} 0 ${u.y0} Z"/>` : '');
  }).join('');
  const bandLabels = L.bands.map(b => `<div class="ft-band-label" style="top:${b.top + L.bow(40) + 6}px"><b>${b.name}</b><small>${b.range}</small></div>`).join('');
  const colLabels = tree.flow.columns.map(id => {
    const x = L.colLeft[id] + L.colLanes[id] * LANE / 2, name = id === 'core' ? 'Universal' : tree.branches[id].name;
    return `<span class="ft-col-label" style="left:${x}px;color:${colors[id]}">${escapeHtml(name)}</span>`;
  }).join('');

  // links: root flow, prerequisites, synergies
  const defs = [], paths = [];
  for (const n of tree.nodes) {
    if (n === L.root) continue;
    const parents = (n.needs || []).filter(id => pos[id]);
    if (!parents.length && !(n.gate === 0)) {
      const fromRoot = (n.needs || []).length === 0 && !tree.nodes.some(m => m !== n && col(m) === col(n) && (m.needs || []).length === 0 && m.gate < n.gate);
      if (fromRoot) paths.push(`<path class="ft-root" style="stroke:${colors[col(n)]}" d="${vPath(pos[L.root.id], pos[n.id])}"/>`);
      else {  // a second entry point in the same column hangs from the column's previous technique
        const prev = tree.nodes.filter(m => m !== L.root && col(m) === col(n) && m.gate < n.gate).sort((a, b) => b.gate - a.gate)[0];
        if (prev) paths.push(`<path class="ft-root" style="stroke:${colors[col(n)]}" d="${vPath(pos[prev.id], pos[n.id])}"/>`);
      }
    }
    for (const p of parents) {
      const on = info.rank(byId[p]) > 0;
      paths.push(`<path class="ft-req ${on ? 'on' : ''}" style="stroke:${colors[col(n)]}" d="${vPath(pos[p], pos[n.id])}"/>`);
    }
  }
  compat.forEach(([a, b], i) => {
    if (!pos[a] || !pos[b]) return;
    const ca = colors[col(byId[a])], cb = colors[col(byId[b])], p = pos[a], q = pos[b];
    defs.push(`<linearGradient id="ftg${i}" gradientUnits="userSpaceOnUse" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"><stop offset="0" stop-color="${ca}"/><stop offset="1" stop-color="${cb}"/></linearGradient>`);
    const others = Object.entries(pos).filter(([id]) => id !== a && id !== b).map(([, v]) => v);
    paths.push(`<path class="ft-syn ${touches([a, b], sel) ? 'hot' : ''}" stroke="url(#ftg${i})" d="${synergyPath(L, a, b, others)}"/>`);
  });

  const orbs = tree.nodes.map(n => {
    const p = pos[n.id], have = info.rank(n), chk = info.check(n), c = colors[col(n)];
    const state = n.innate || have >= n.ranks ? 'full' : have ? 'got' : chk.ok ? 'buy' : 'locked';
    return `<button class="ft-node ${state} ${n.id === sel ? 'sel' : ''}" data-ft-node="${n.id}" style="left:${p.x}px;top:${p.y}px;--c:${c}">
      <span class="ft-orb">${n.kind === 'active' ? '✦' : n.innate ? '✶' : '◆'}</span>
      <span class="ft-name">${escapeHtml(n.name)}</span>
      <span class="ft-rank">${n.innate ? 'innate' : `${have}/${n.ranks}`}</span></button>`;
  }).join('');

  // side panel for the selected node
  const n = byId[sel], have = info.rank(n), chk = info.check(n), c = colors[col(n)];
  const syn = compat.filter(e => touches(e, sel)).map(([a, b, note]) => {
    const o = byId[a === sel ? b : a];
    return `<li><button data-ft-node="${o.id}" style="color:${colors[col(o)]}">${escapeHtml(o.name)}</button> ${escapeHtml(note)}</li>`;
  }).join('');
  const needs = (n.needs || []).map(id => byId[id]?.name).filter(Boolean);
  const buy = n.innate ? '<p class="ft-known">Known from the start.</p>'
    : have >= n.ranks ? '<p class="ft-known">Fully learned.</p>'
    : `<button class="ft-learn" data-ft-buy="${n.id}" ${chk.ok ? '' : 'disabled'}>${chk.ok ? `Learn rank ${have + 1} · 1 point` : escapeHtml(chk.reason)}</button>`;
  const panel = `<aside class="ft-panel" style="--c:${c}">
    <small class="ft-disc">${escapeHtml(info.branchName(n))} · ${TIERS[tierOf(n.gate)].name}</small>
    <h4>${escapeHtml(n.name)}</h4>
    <div class="ft-pips">${Array.from({ length: n.ranks }, (_, i) => `<i class="${i < (n.innate ? n.ranks : have) ? 'on' : ''}"></i>`).join('')}<span>${n.innate ? 'Innate' : `Rank ${have} / ${n.ranks}`}</span></div>
    <p>${escapeHtml(n.text)}</p>
    <dl><dt>Requires</dt><dd>${escapeHtml(tree.name)} ${n.gate}${needs.length ? ' · ' + needs.map(escapeHtml).join(', ') : ''}</dd></dl>
    ${buy}
    ${syn ? `<h5>Works with</h5><ul class="ft-syn-list">${syn}</ul>` : ''}
    <p class="ft-pts">${info.points} point${info.points === 1 ? '' : 's'} to spend</p></aside>`;

  return `<div class="ft-wrap"><div class="ft-scroll"><div class="ft-zoom"><button data-ft-zoom="in" title="Zoom in">+</button><button data-ft-zoom="out" title="Zoom out">−</button><button data-ft-zoom="fit" title="Fit whole tree">⤢</button></div><div class="ft-stage" style="width:${L.width}px;height:${L.height}px">
    <svg class="ft-svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><defs>${defs.join('')}</defs>${bandSvg}${paths.join('')}</svg>
    <div class="ft-cols">${colLabels}</div><div class="ft-bands">${bandLabels}</div>${orbs}</div></div>${panel}</div>
    <div class="ft-legend"><span><i class="l-req"></i>Prerequisite</span><span><i class="l-syn"></i>Synergy between disciplines</span><span><i class="o buy"></i>Can learn</span><span><i class="o got"></i>Learning</span><span><i class="o full"></i>Mastered</span><span><i class="o locked"></i>Locked</span></div>`;
}

// Wire pan/zoom, hover tooltip, selection and buying. The view (pan + zoom) survives re-renders.
// Drag anywhere to pan, wheel to zoom at the cursor, buttons for +/−/fit. A drag never counts as a click.
let view = null;
export function bindFlowTree(el, tree, { onSelect, onBuy }) {
  const box = el.querySelector('.ft-scroll'), stage = el.querySelector('.ft-stage'); if (!box || !stage) return;
  const L = flowLayout(tree), pad = 16;
  const fit = () => { const s = Math.min(1.25, (box.clientWidth - pad * 2) / L.width, (box.clientHeight - pad * 2) / L.height);
    return { s, x: (box.clientWidth - L.width * s) / 2, y: pad }; };
  if (!view) view = fit();
  const apply = () => { stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; };
  const clampS = s => Math.max(.25, Math.min(2, s));
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

  const byId = Object.fromEntries(tree.nodes.map(n => [n.id, n]));
  let tip = null; function hide() { tip?.remove(); tip = null; }
  el.querySelectorAll('.ft-node').forEach(b => {
    b.addEventListener('mouseenter', () => {
      if (drag) return; hide(); const n = byId[b.dataset.ftNode]; if (!n) return;
      tip = document.createElement('div'); tip.className = 'ft-tip';
      tip.innerHTML = `<b>${escapeHtml(n.name)}</b><span>${escapeHtml(n.text)}</span><em>Click for details</em>`;
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
