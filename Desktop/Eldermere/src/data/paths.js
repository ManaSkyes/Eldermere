// src/data/paths.js — drawn paths: roads (and later canals and rivers) laid as smooth curves over the map,
// free of the 10 m grid. Drawn in the creator's Paths mode; built by src/game/pathBuild.js.
//
//   d.paths = [{ id, kind: 'road', layer, points: [{ x, z, y? }, ...] (map metres), road, pave, lamps }]
//
// Height: each point can have its own `y`, metres above its layer's floor (0 if not set). The road climbs
// evenly from point to point. A stretch steeper than MAX_GRADE becomes stone steps (risers of about STEP_RISE).
//
// A road is a carriageway `road` metres wide (cobbles, with a gutter along each side), a kerb, and a pavement
// `pave` metres wide either side. The curve runs smoothly through the points (Catmull-Rom). Where roads meet or
// cross, the carriageways simply join: everything is worked out from the distance to the nearest road, so
// junctions take care of themselves. Grid pieces win: a path never builds inside a cell that has a piece on its
// layer, so a road can run up to (or into) a grid street and stop cleanly at the cell's edge.
import { terrainOf, terrainAt, terrainHash, mapHash } from './terrain.js';
import { carvedFn } from './water.js';
import { groundOf } from './ground.js';
export const PATH_KINDS = {
  road: { name: 'Street', text: 'A cobbled street with kerbs and pavements, following a smooth curve through the points. 4 m, like the grid streets.', road: 4, pave: 2.5, color: '#9a8c7a' },
  avenue: { name: 'Avenue', text: 'A broad main road for carts and crowds: an 8 m carriageway, wide pavements, lamps on both sides.', road: 8, pave: 3.5, color: '#8f8270', pairs: true },
  grand: { name: 'Grand avenue', text: 'The boulevard\'s 12 m carriageway and wide pavements with nothing down the middle: one open sweep of paving.', road: 12, pave: 4, color: '#7d7262', pairs: true },
  boulevard: { name: 'Boulevard', text: 'A grand road: 12 m of carriageway with a planted strip down the middle (trees in stone planters, lamps between), wide pavements.', road: 12, pave: 4, color: '#857864', pairs: true, median: true },
};
export const ROAD = { kerb: 0.3, kerbH: 0.3, gutter: 0.45, gutterD: 0.06, crown: 0.05 };
export const MAX_GRADE = 0.25, STEP_RISE = 0.18, MAX_Y = 39.75;   // a road can climb several layers; normalizeRoad keeps its lowest point within its own layer   // 1 in 4 is the steepest a road slopes; steeper stretches are steps
// The height profile along a road: per stretch between two points { s0, s1, y0, y1, steps (0: a slope) }, and
// heightAt(s) for any distance along it
// flat: { a, b } metres at the start / end that stay level (a road ending on another road keeps that road's
// height until it's clear of its paving, then starts climbing; see joinFlats)
// A road that follows the ground (the map has terrain, and the road isn't set free of it: p.free) takes its height
// from the terrain along its length (sampled every 4 m, averaged across the road's width and smoothed), instead
// of from its points. Its ends keep their point's height where they sit on another road. Too steep → steps, as
// always. ground(x, z): the terrain's height there, above the road's layer floor.
export function groundFor(d, p) {
  const t = terrainOf(d); if (!t || p.free) return null;
  const r = Math.max(1, (p.road || 4) / 2), base = (p.layer || 0) * 10, G = carvedFn(d);           // the ground as carved by rivers (src/data/water.js)
  return (x, z) => (G(x, z) * 2 + G(x - r, z) + G(x + r, z) + G(x, z - r) + G(x, z + r)) / 6 - base;
}
// Every road's height profile, worked out together (once per set of roads and terrain): a road following the
// ground whose end sits on another road takes that road's height there, so branches and junctions meet level.
const profCache = { key: null, map: null };
// ---- road paint: stretches of a road with their own surface or bridge style ----
// p.paint = { mat: [[s0, s1, key], ...], br: [[s0, s1, style], ...] } (s: metres along the road). Unpainted
// stretches use the road's own settings (p.mat, default cobbles; p.bridgeStyle, default auto).
export const ROAD_MATS = { cobble: 'Cobbles', flag: 'Flagstones', dirt: 'Dirt track', gravel: 'Gravel', planks: 'Wooden planks' };
export const ROAD_MAT_INDEX = { cobble: 0, flag: 1, dirt: 2, gravel: 3, planks: 4 };
export const BRIDGE_STYLES = { auto: 'Auto', stone: 'Stone arches', timber: 'Timber trestle', none: 'None (follow the ground)' };
export function paintAt(p, key, s) { const L = p.paint?.[key]; if (L) for (let i = L.length - 1; i >= 0; i--) if (s >= L[i][0] && s <= L[i][1]) return L[i][2]; return key === 'mat' ? (p.mat || 'cobble') : (p.bridgeStyle || 'auto'); }
// paint [s0, s1] of a road with value (null: back to the road's own); merges neighbours. Returns true if changed
export function paintRoad(p, key, s0, s1, value) {
  const L = (p.paint ||= {})[key] ||= [], out = [];
  for (const [a, b, v] of L) { if (b <= s0 || a >= s1) { out.push([a, b, v]); continue; } if (a < s0) out.push([a, s0, v]); if (b > s1) out.push([s1, b, v]); }
  if (value != null) out.push([s0, s1, value]);
  out.sort((a, b) => a[0] - b[0]); const m = []; for (const r of out) { const l = m[m.length - 1]; if (l && l[2] === r[2] && r[0] <= l[1] + 0.01) l[1] = Math.max(l[1], r[1]); else m.push([...r]); }
  const before = JSON.stringify(L); p.paint[key] = m.map(r => [Math.round(r[0] * 10) / 10, Math.round(r[1] * 10) / 10, r[2]]); if (!p.paint[key].length) delete p.paint[key]; if (!Object.keys(p.paint).length) delete p.paint;
  return JSON.stringify(p.paint?.[key] || []) !== before;
}

// ---- bridges: where a road crosses water or a drop, it bridges it ----
// A stretch of road over painted water, or over ground that falls 3 m or more below a level line from bank to bank
// (a ravine, a gully), is a bridge: its deck runs straight from one end to the other (a slight arch on longer
// spans) instead of following the ground down, and the water runs on underneath. Worked out from the plain terrain
// (before rivers carve it), so it never depends on itself. Returns [{ s0, s1, ya, yb, water, len }] (s along the
// road, heights above the road's layer). p.bridge === false turns a road's bridges off.
const brCache = { key: null, map: new Map() };
export function bridgesOf(d, p) {
  const t = terrainOf(d); if (!t || p.free || p.bridge === false || p.points.length < 2) return [];
  const g = groundOf(d), key = (t.h.length + '|' + t.h[0] + '|' + t.h[t.h.length >> 1]) + '|' + mapHash(g?.water);
  if (brCache.key !== key) { brCache.key = key; brCache.map = new Map(); }
  const pk = JSON.stringify([p.points, p.road, p.pave, p.layer, p.bridgeStyle, p.paint?.br]); if (brCache.map.has(pk)) return brCache.map.get(pk);
  if (LIVE) return [];                                                                       // (live editing: worked out when the edit ends)
  const S = samplePath(p, 1), half = (p.road || 4) / 2, base = (p.layer || 0) * 10, W = g?.water || {};
  const wetAt = (x, z) => W[`${Math.floor(x / 2)},${Math.floor(z / 2)}`] !== undefined;
  const gr = S.map(q => { let m = Infinity, sum = 0; for (const o of [-half, 0, half]) { const h = terrainAt(t, q.x - q.tz * o, q.z + q.tx * o); m = Math.min(m, h); sum += h; } return { m, avg: sum / 3, wet: [-half, 0, half].some(o => wetAt(q.x - q.tz * o, q.z + q.tx * o)) }; });
  // how deep the ground lies under a level line between the highest ground within 40 m either way
  const WIN = 40, n = S.length, hl = new Array(n), hr = new Array(n);
  for (let i = 0; i < n; i++) { let m = -Infinity; for (let k = Math.max(0, i - WIN); k <= i; k++) m = Math.max(m, gr[k].avg); hl[i] = m; }
  for (let i = n - 1; i >= 0; i--) { let m = -Infinity; for (let k = i; k <= Math.min(n - 1, i + WIN); k++) m = Math.max(m, gr[k].avg); hr[i] = m; }
  const want = gr.map((q, i) => q.wet || Math.min(hl[i], hr[i]) - q.m >= 2.5);   // (a dip of 2.5 m or more under the line between the crests)
  const spans = [];
  for (let i = 0; i < n; i++) { if (!want[i]) continue; let j = i; while (j + 1 < n && (want[j + 1] || (j + 4 < n && want.slice(j + 1, j + 5).some(Boolean)))) j++; spans.push([i, j]); i = j; }
  const out = [];
  for (const [i, j] of spans) {
    // from crest to crest: the deck sits at the lower of the two highest points either side (within the window), and
    // the bridge starts where the ground on each side first reaches that height, so it doesn't dip down to the
    // water's edge first
    // (outward from the gap while the bank climbs steeply, more than 1 in 5: its top is the crest. A gentle valley the
    // road can simply follow isn't bridged)
    let a = i, b = j;
    while (a > 0 && i - a < WIN && gr[a - 1].avg - gr[a].avg > 0.2) a--; while (b < n - 1 && b - j < WIN && gr[b + 1].avg - gr[b].avg > 0.2) b++;
    a = Math.max(0, a - 1); b = Math.min(n - 1, b + 1);
    let steep = 0; for (let k = Math.max(1, a); k <= b; k++) steep = Math.max(steep, Math.abs(gr[k].avg - gr[k - 1].avg));
    const wet = gr.slice(i, j + 1).some(q => q.wet);
    if (!wet && (steep < 0.5 || Math.min(gr[a].avg, gr[b].avg) - Math.min(...gr.slice(a, b + 1).map(q => q.m)) < 2.5)) continue;   // (a dry dip needs steep sides and real depth)
    if (a === 0 && b === n - 1 && !wet) continue;   // (a whole road in a hollow isn't a bridge)
    // the deck's ends take the road's height 3 m beyond each end (where it carries on along the ground), so it never
    // lands on a narrow crest and drops away just after
    const ea = Math.max(0, a - 3), eb = Math.min(n - 1, b + 3), ya = Math.round((gr[ea].avg - base) * 20) / 20, yb = Math.round((gr[eb].avg - base) * 20) / 20;
    out.push({ s0: S[a].s, s1: S[b].s, ya, yb, water: gr.slice(i, j + 1).some(q => q.wet), len: S[b].s - S[a].s });
  }
  for (let k = out.length - 1; k > 0; k--) { const A = out[k - 1], B = out[k]; if (B.s0 <= A.s1 + 1) { A.s1 = Math.max(A.s1, B.s1); A.yb = B.yb; A.water = A.water || B.water; A.len = A.s1 - A.s0; out.splice(k, 1); } }   // (spans that now meet: one bridge)
  for (const b of out) b.style = paintAt(p, 'br', (b.s0 + b.s1) / 2);                       // (the style painted at its middle, or the road's)
  for (let k = out.length - 1; k >= 0; k--) if (out[k].style === 'none') out.splice(k, 1);    // None: the road follows the ground there
  brCache.map.set(pk, out); return out;
}
export const bridgeAt = (d, p, s) => bridgesOf(d, p).find(b => s >= b.s0 && s <= b.s1) || null;

export function roadProfiles(d) {
  const list = pathsOf(d).filter(p => p.points.length >= 2), t = terrainOf(d), th = terrainHash(t);
  const key = th + '|' + JSON.stringify(list) + '|' + mapHash(groundOf(d)?.water) + '|' + JSON.stringify(groundOf(d)?.flows || []); if (profCache.key === key) return profCache.map;
  const flats = joinFlats(list), map = new Map(), S = new Map(list.map(p => [p, samplePath(p, 0.5)]));
  const hostY = (p, h) => { const H = map.get(h.o); if (!H) return null; let best = null, bd = Infinity; for (const q of S.get(h.o)) { const dd = (q.x - h.x) ** 2 + (q.z - h.z) ** 2; if (dd < bd) { bd = dd; best = q; } } return best ? H.heightAt(best.s) + (h.o.layer - p.layer) * 10 : null; };
  for (const p of list) map.set(p, heightProfile(p, S.get(p), flats.get(p), groundFor(d, p), bridgesOf(d, p)));
  for (let pass = 0; pass < 2; pass++) for (const p of list) {                              // branches take their host's height (twice: branches of branches)
    const fl = flats.get(p); if (!groundFor(d, p) || (!fl.ha && !fl.hb)) continue;
    const f2 = { ...fl, ya: fl.ha ? hostY(p, fl.ha) : null, yb: fl.hb ? hostY(p, fl.hb) : null };
    map.set(p, heightProfile(p, S.get(p), f2, groundFor(d, p), bridgesOf(d, p)));
  }
  profCache.key = key; profCache.map = map; profCache.keys = new Map(list.map(p => [p, pkey(p)])); return map;
}
// Live editing (the creator, while a road is being drawn, dragged or painted): nothing is worked out in full until the
// edit ends. The last full set of profiles (and carved ground, road field) stands in; a road that's changed gets a
// quick profile of its own (the ground as last carved, no bridges), so the drawing keeps up with the mouse.
let LIVE = false; const liveMap = new WeakMap(), pkey = p => JSON.stringify([p.points, p.layer, p.road, p.free]);
export function setRoadsLive(on) { LIVE = !!on; }
export const roadsLive = () => LIVE;
export const profileOf = (d, p, S, flat) => {
  if (LIVE && profCache.map) {
    const k = pkey(p); if (profCache.keys?.get(p) === k && profCache.map.has(p)) return profCache.map.get(p);
    const e = liveMap.get(p); if (e && e.k === k) return e.H;
    const H = heightProfile(p, S || samplePath(p, 0.5), flat || { a: 0, b: 0 }, groundFor(d, p)); liveMap.set(p, { k, H }); return H;
  }
  return roadProfiles(d).get(p) || heightProfile(p, S, flat, groundFor(d, p));
};
export function heightProfile(p, S = samplePath(p, 0.5), flat = { a: 0, b: 0 }, ground = null, bridges = null) {
  const P = p.points, segs = [], total = S.length ? S[S.length - 1].s : 0;
  if (ground && S.length > 1) {
    const clampY = y => Math.max(-10, Math.min(MAX_Y, y)), at = s => { let k = S.findIndex(q => q.s >= s); if (k < 0) k = S.length - 1; return S[k]; };
    const knots = [], n = Math.max(1, Math.round(total / 4));
    for (let i = 0; i <= n; i++) { const sk = total * i / n, q = at(sk); knots.push({ s: sk, y: ground(q.x, q.z) }); }
    // over a bridge the deck runs straight from end to end (a slight arch on longer spans), not down into the gap
    // (laid before the smoothing too, so the road beside it isn't pulled down toward the gap)
    function deckOver() { for (const b of bridges || []) {
      const arch = Math.min(0.6, b.len * 0.015), deck = s => b.ya + (b.yb - b.ya) * (s - b.s0) / Math.max(0.01, b.len) + arch * Math.sin(Math.PI * Math.max(0, Math.min(1, (s - b.s0) / Math.max(0.01, b.len))));
      const A0 = Math.max(0, b.s0 - 3), B1 = Math.min(total, b.s1 + 3);                 // (a level landing 3 m past each end at the deck's end height)
      for (let i = knots.length - 1; i >= 0; i--) if (knots[i].s > A0 - 0.01 && knots[i].s < B1 + 0.01) knots.splice(i, 1);
      if (A0 < b.s0 - 0.5) knots.push({ s: A0, y: b.ya }); if (B1 > b.s1 + 0.5) knots.push({ s: B1, y: b.yb });
      for (let k = 0; k <= Math.max(2, Math.round(b.len / 3)); k++) { const sk = b.s0 + b.len * k / Math.max(2, Math.round(b.len / 3)); knots.push({ s: sk, y: deck(sk), bridge: true }); }
      knots.sort((a, c) => a.s - c.s);
    } }
    deckOver();
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < knots.length - 1; i++) knots[i].y = (knots[i - 1].y + 2 * knots[i].y + knots[i + 1].y) / 4;   // smoothed
    deckOver();

    for (const q of knots) q.y = clampY(Math.round(q.y * 20) / 20);
    if (flat.a > 0) { const y = flat.ya ?? P[0].y ?? 0; for (const q of knots) if (q.s <= flat.a + 0.01) q.y = y; knots.unshift({ s: 0, y }); knots.splice(1, 0, { s: Math.min(flat.a, total), y }); }
    if (flat.b > 0) { const y = flat.yb ?? P[P.length - 1].y ?? 0; for (const q of knots) if (q.s >= total - flat.b - 0.01) q.y = y; knots.push({ s: Math.max(0, total - flat.b), y }, { s: total, y }); }
    knots.sort((a, b) => a.s - b.s);
    for (let i = 0; i < knots.length - 1; i++) {
      const s0 = knots[i].s, s1 = knots[i + 1].s; if (s1 - s0 < 0.01) continue;
      const y0 = knots[i].y, y1 = knots[i + 1].y, grade = Math.abs(y1 - y0) / (s1 - s0);
      segs.push({ s0, s1, y0, y1, grade, steps: grade > MAX_GRADE ? Math.max(1, Math.round(Math.abs(y1 - y0) / STEP_RISE)) : 0 });
    }
  } else
  for (let i = 0; i < P.length - 1; i++) {
    const own = S.filter(q => q.seg === i);
    let s0 = own.length ? own[0].s : 0; const nxt = S.find(q => q.seg === i + 1); let s1 = nxt ? nxt.s : (own.length ? own[own.length - 1].s : s0);
    if (i === 0 && flat.a > s0) s0 = Math.min(flat.a, s1 - 0.01);                       // level until clear of the road it starts on
    if (i === P.length - 2 && total - flat.b < s1) s1 = Math.max(total - flat.b, s0 + 0.01);   // and from where it reaches the road it ends on
    const y0 = P[i].y || 0, y1 = P[i + 1].y || 0, len = Math.max(0.01, s1 - s0), grade = Math.abs(y1 - y0) / len;
    segs.push({ s0, s1, y0, y1, grade, steps: grade > MAX_GRADE ? Math.max(1, Math.round(Math.abs(y1 - y0) / STEP_RISE)) : 0 });
  }
  // the even slope at s, and for a stepped stretch its base and riser height (r; 0 on a slope): the steps are
  // then at y0 + r·round((lin − y0) / r) — the builder cuts the surface exactly along each riser
  const stepAt = s => {
    const g = segs.find(q => s <= q.s1) || segs[segs.length - 1]; if (!g) return { lin: 0, y0: 0, r: 0 };
    const f = Math.max(0, Math.min(1, (s - g.s0) / Math.max(0.01, g.s1 - g.s0)));
    return { lin: g.y0 + (g.y1 - g.y0) * f, y0: g.y0, r: g.steps ? (g.y1 - g.y0) / g.steps : 0 };
  };
  const heightAt = s => {
    const g = segs.find(q => s <= q.s1) || segs[segs.length - 1]; if (!g) return 0;
    const f = Math.max(0, Math.min(1, (s - g.s0) / Math.max(0.01, g.s1 - g.s0)));
    if (!g.steps) return g.y0 + (g.y1 - g.y0) * f;
    return g.y0 + (g.y1 - g.y0) * Math.min(g.steps, Math.floor(f * g.steps + 0.5)) / g.steps;   // flat treads: a riser halfway between
  };
  return { segs, heightAt, stepAt };
}
// For each road on a layer whose end sits on another road's carriageway (a branch, or a road joined into
// another): how far along from that end it's still over the other road's paving. The height is held level that
// far, so the climb starts at the other road's edge instead of its centre line (which tore the surface there).
export function joinFlats(list) {
  const S = new Map(list.map(p => [p, samplePath(p, 0.5)])), out = new Map();
  const grids = new Map(list.map(p => { const g = new Map(); for (const r of S.get(p)) { const k = `${Math.floor(r.x / 4)},${Math.floor(r.z / 4)}`; (g.get(k) || g.set(k, []).get(k)).push(r); } return [p, g]; }));
  const near = (q, o) => {                                                      // distance to road o's centre line (only looks nearby: anything past ~8 m is "far")
    const g = grids.get(o), ci = Math.floor(q.x / 4), cj = Math.floor(q.z / 4); let b = Infinity;
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) for (const r of g.get(`${ci + a},${cj + c}`) || []) { const dd = (r.x - q.x) ** 2 + (r.z - q.z) ** 2; if (dd < b) b = dd; }
    return Math.sqrt(b);
  };
  for (const p of list) {
    const Sp = S.get(p), fl = { a: 0, b: 0 }; if (Sp.length < 2) { out.set(p, fl); continue; }
    const total = Sp[Sp.length - 1].s;
    for (const end of ['a', 'b']) {
      const E = end === 'a' ? Sp[0] : Sp[Sp.length - 1];
      for (const o of list) {
        if (o === p || S.get(o).length < 2 || near(E, o) > o.road / 2 + 0.25) continue;   // this end isn't on that road
        const order = end === 'a' ? Sp : [...Sp].reverse(), edge = outerHalf(o) + 0.3;
        const out1 = order.find(q => near(q, o) > edge);                               // the first spot clear of its paving
        const len = out1 ? (end === 'a' ? out1.s : total - out1.s) : total / 2;
        if (Math.min(len, total / 2) > fl[end]) { fl[end] = Math.min(len, total / 2); fl['h' + end] = { o, x: E.x, z: E.z }; }   // (and the road it sits on: its height there holds this end)
      }
    }
    out.set(p, fl);
  }
  return out;
}
export const pathsOf = d => (d.paths ||= []);
export const outerHalfOf = p => outerHalf(p);
// Keep a road's layer honest: if all its points are 10 m or more up, it moves up a layer (heights down 10); if
// any point goes below its layer's floor, it moves down a layer (heights up 10). Returns how many layers it moved.
export function normalizeRoad(p) {
  let moved = 0; const ys = () => p.points.map(q => q.y || 0);
  while (p.points.length && Math.min(...ys()) >= 10) { p.layer++; moved++; for (const q of p.points) { q.y = (q.y || 0) - 10; if (!q.y) delete q.y; } }
  while (p.points.length && Math.min(...ys()) < 0) { p.layer--; moved--; for (const q of p.points) { q.y = (q.y || 0) + 10; if (!q.y) delete q.y; } }
  return moved;
}
export const newPath = (kind, layer) => { const k = PATH_KINDS[kind] || PATH_KINDS.road; return { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, layer, points: [], road: k.road, pave: k.pave, lamps: true, details: true, ...(k.median ? { median: true } : {}) }; };
export const outerHalf = p => p.road / 2 + ROAD.kerb + p.pave;   // centre line to the pavement's outer edge

// The curve through the points, sampled about every `step` metres: [{ x, z, tx, tz (unit tangent), s (distance),
// seg (which pair of points it lies between) }]
// Each stretch between two points is a cubic (Hermite) curve. A point's tangent is worked out from its
// neighbours (Catmull-Rom) unless it carries its own: `tin` (arriving) / `tout` (leaving), set when a point is
// added onto an existing road so the road keeps exactly its shape (see splitAt).
const autoTan = (P, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; return { x: (b.x - a.x) / 2, z: (b.z - a.z) / 2 }; };
export const tangentsOf = (P, i) => ({ m0: P[i].tout || autoTan(P, i), m1: P[i + 1].tin || autoTan(P, i + 1) });
function hermite(p1, p2, m0, m1, t) {
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1, d01 = -6 * t2 + 6 * t, d11 = 3 * t2 - 2 * t;
  return { x: h00 * p1.x + h10 * m0.x + h01 * p2.x + h11 * m1.x, z: h00 * p1.z + h10 * m0.z + h01 * p2.z + h11 * m1.z,
    dx: d00 * p1.x + d10 * m0.x + d01 * p2.x + d11 * m1.x, dz: d00 * p1.z + d10 * m0.z + d01 * p2.z + d11 * m1.z };
}
export function samplePath(p, step = 0.5) {
  const P = p.points; if (P.length < 2) return P.map(q => ({ x: q.x, z: q.z, tx: 1, tz: 0, s: 0, seg: 0, t: 0 }));
  const out = []; let s = 0, prev = null;
  for (let i = 0; i < P.length - 1; i++) {
    const p1 = P[i], p2 = P[i + 1], { m0, m1 } = tangentsOf(P, i);
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z), n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n + (i === P.length - 2 ? 1 : 0); k++) {
      const t = k / n, h = hermite(p1, p2, m0, m1, t), q = { x: h.x, z: h.z };
      if (prev) s += Math.hypot(q.x - prev.x, q.z - prev.z);
      q.s = s; q.seg = i; q.t = t; out.push(q); prev = q;
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l; out[i].tz = (b.z - a.z) / l;
  }
  return out;
}
// Add a point on the road between points seg and seg+1, at curve parameter t, without changing its shape at all:
// the curve there is split exactly in two, and the neighbours keep the tangents they had. Returns its index.
export function splitAt(p, seg, t) {
  const P = p.points, n = P.length;
  if (seg > 0 && !P[seg].tin) P[seg].tin = autoTan(P, seg);                         // freeze what the neighbours had
  if (seg + 1 < n - 1 && !P[seg + 1].tout) P[seg + 1].tout = autoTan(P, seg + 1);
  const { m0, m1 } = tangentsOf(P, seg), h = hermite(P[seg], P[seg + 1], m0, m1, t);
  const r = v => Math.round(v * 1000) / 1000;
  const Q = { x: r(h.x), z: r(h.z), tin: { x: h.dx * t, z: h.dz * t }, tout: { x: h.dx * (1 - t), z: h.dz * (1 - t) } };
  P[seg].tout = { x: m0.x * t, z: m0.z * t }; P[seg + 1].tin = { x: m1.x * (1 - t), z: m1.z * (1 - t) };
  P.splice(seg + 1, 0, Q); return seg + 1;
}
// a point moved or removed: it and the sides of its neighbours facing it go back to automatic tangents
export function freeTangents(P, i) {
  if (P[i]) { delete P[i].tin; delete P[i].tout; }
  if (P[i - 1]) delete P[i - 1].tout; if (P[i + 1]) delete P[i + 1].tin;
}
// the road the other way round (tangents swap ends and flip)
export function reversePoints(P) {
  P.reverse();
  for (const q of P) { const a = q.tin, b = q.tout; delete q.tin; delete q.tout; if (b) q.tin = { x: -b.x, z: -b.z }; if (a) q.tout = { x: -a.x, z: -a.z }; }
  return P;
}

// For fast lookups: every path on a layer as a list of short segments with its widths
// The field is worked out once per set of roads: asking again with the same roads on that layer (the creator
// asks often) returns the same one.
const fieldCache = new Map();
export function pathField(d, layer) {
  const t = terrainOf(d), th = terrainHash(t);   // (roads follow the terrain: a sculpt changes them)
  const key = layer + '|' + th + '|' + JSON.stringify(pathsOf(d));                       // (all the roads: a branch's height comes from its host, on any layer)
  if (LIVE && fieldCache.has('last' + layer)) return fieldCache.get('last' + layer);   // (live editing: the last field stands in)
  const hit = fieldCache.get(key); if (hit) { fieldCache.set('last' + layer, hit); return hit; }
  const f = makeField(d, layer); fieldCache.set(key, f); fieldCache.set('last' + layer, f);
  if (fieldCache.size > 24) for (const k of fieldCache.keys()) if (!String(k).startsWith('last')) { fieldCache.delete(k); break; }
  return f;
}
function makeField(d, layer) {
  const segs = [], onLayer = pathsOf(d).filter(p => p.layer === layer && p.points.length >= 2), profs = roadProfiles(d);
  for (const p of onLayer) {
    const S = samplePath(p, 1), H = profs.get(p);   // 1 m chords: on the tightest bends they stray from the curve by a centimetre or so
    for (let i = 0; i < S.length - 1; i++) segs.push({ ax: S[i].x, az: S[i].z, bx: S[i + 1].x, bz: S[i + 1].z, as: S[i].s, bs: S[i + 1].s, total: S[S.length - 1].s, hAt: H.heightAt, stAt: H.stepAt, first: i === 0, last: i === S.length - 2, p, half: p.road / 2, outer: outerHalf(p) });
  }
  // a coarse bucket grid (5 m) so each lookup only checks nearby segments
  const B = 5, EXTRA = 4, buckets = new Map();
  for (const sg of segs) {
    const reach = sg.outer + EXTRA + 0.5;                                         // each segment only where it can reach
    const x0 = Math.floor((Math.min(sg.ax, sg.bx) - reach) / B), x1 = Math.floor((Math.max(sg.ax, sg.bx) + reach) / B);
    const z0 = Math.floor((Math.min(sg.az, sg.bz) - reach) / B), z1 = Math.floor((Math.max(sg.az, sg.bz) + reach) / B);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(sg); }
  }
  // at (x, z): pd = distance from the nearest carriageway's edge (negative inside it), the road it belongs to,
  // h = the road's even slope there (above the layer floor); on steps also y0 and r (riser) and hq, the tread's height;
  // ep = how far past the road's flat end (positive: beyond it, where the end wall goes),
  // how far into that road (0 at the edge, 1 at the centre line); null if no road is near. `extra`: also find
  // roads whose pavement ends up to that many metres short of (x, z) (up to 4)
  const brOf = new Map();
  // how bare a road is at s (0..1): 1 on a dirt or gravel stretch (no pavement), falling to 0 over TAPER metres into a
  // paved stretch, so a pavement starting after a dirt track narrows in from nothing (a step up at its start, no
  // scraps), and a junction of the two is cut cleanly
  const TAPER = 4, bareOf = new Map();
  const bareAt = (sg, s) => {
    let A = bareOf.get(sg.p);
    // (null is a real answer: no dirt anywhere on this road — it was being worked out again on every lookup)
    if (A === undefined) { const n = Math.ceil(sg.total / 0.5) + 1, f = new Float32Array(n); let any = false;
      for (let i = 0; i < n; i++) { const m = paintAt(sg.p, 'mat', i * 0.5); if (m === 'dirt' || m === 'gravel') { f[i] = 1; any = true; } }
      if (any) { let d = Infinity; const D = new Float32Array(n); for (let i = 0; i < n; i++) { d = f[i] ? 0 : d + 0.5; D[i] = d; } d = Infinity; for (let i = n - 1; i >= 0; i--) { d = f[i] ? 0 : d + 0.5; D[i] = Math.min(D[i], d); } for (let i = 0; i < n; i++) f[i] = Math.max(0, 1 - D[i] / TAPER); }
      A = any ? f : null; bareOf.set(sg.p, A); }
    return A ? A[Math.max(0, Math.min(A.length - 1, Math.round(s / 0.5)))] : 0;
  };
  function at(x, z, extra = 0) {
    const list = buckets.get(`${Math.floor(x / B)},${Math.floor(z / B)}`); if (!list) return null;
    let best = null, endC = null; const others = [], BLEND = 2;
    for (const sg of list) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - sg.ax) * dx + (z - sg.az) * dz) / L2;
      // how far along the whole road this point lies (from the unclamped projection): before its start or past its
      // end is outside, at a flat end. ep > 0 past an end (the end wall goes where it's 0); negative inside.
      const sAlong = sg.as + (sg.bs - sg.as) * t, ep = Math.max(-sAlong, sAlong - sg.total);
      if (ep > 0) {
        const lx = sg.ax + dx * t - x, lz = sg.az + dz * t - z, lat = Math.sqrt(lx * lx + lz * lz);
        if (lat <= sg.outer + extra && (!endC || lat - sg.half < endC.pd)) endC = { pd: lat - sg.half, p: sg.p, outer: sg.outer - sg.half, centre: 1 - lat / sg.half, sg, t: Math.max(0, Math.min(1, t)), ep };
        continue;
      }
      t = Math.max(0, Math.min(1, t));
      const ex = sg.ax + dx * t - x, ez = sg.az + dz * t - z, dist = Math.sqrt(ex * ex + ez * ez);
      const pd = dist - sg.half;
      if (dist > sg.outer + extra) continue;
      const cand = { pd, p: sg.p, outer: sg.outer - sg.half, centre: 1 - dist / sg.half, sg, t, ep };
      const o = others.find(q => q.p === sg.p); if (!o) others.push(cand); else if (pd < o.pd) Object.assign(o, cand);
      if (!best || pd < best.pd) best = { ...cand };
    }
    if (!best && endC) best = { ...endC };                                     // only past an end, with no road here: the end wall's outside
    if (best) {
      const sg = best.sg, st = sg.stAt(sg.as + (sg.bs - sg.as) * best.t); best.h = st.lin; best.y0 = st.y0; best.r = st.r; best.hq = st.r ? st.y0 + st.r * Math.round((st.lin - st.y0) / st.r) : st.lin;
      // where two roads meet, blend their heights over a couple of metres so the junction doesn't kink or tear
      // (each other road weighs in by how close its carriageway is compared with the nearest one)
      let wsum = 1, hsum = best.h, blended = false;
      if (!best.r && !(best.ep > 0)) for (const o of others) if (o.p !== best.p && o.pd - best.pd < BLEND) {   // steps are never blended into a slope
        const so = o.sg.stAt(o.sg.as + (o.sg.bs - o.sg.as) * o.t), w = 1 - (o.pd - best.pd) / BLEND;
        const dh = Math.abs(so.lin - best.h); if (!so.r && dh > 0.01 && dh < 0.75) { wsum += w; hsum += w * so.lin; blended = true; }   // roads far apart in height (one over the other) aren't blended
      }
      if (blended) { best.h = hsum / wsum; best.r = 0; best.hq = best.h; }   // a blended stretch is a smooth slope, not steps
      best.mat = ROAD_MAT_INDEX[paintAt(best.p, 'mat', best.sg.as + (best.sg.bs - best.sg.as) * best.t)] || 0;   // the surface painted here
      { let bs = brOf.get(best.p); if (!bs) brOf.set(best.p, bs = bridgesOf(d, best.p)); const sa = best.sg.as + (best.sg.bs - best.sg.as) * best.t; const b = bs.find(q => sa >= q.s0 && sa <= q.s1); if (b) best.br = b; }   // on a bridge
      // f1: the kerb line, over every road meeting here at about the same height: each road's carriageway widens over
      // its pavement where it's bare (dirt, gravel), and the nearest carriageway wins, so a dirt track crossing a
      // paved street cuts its pavement cleanly instead of leaving bits of kerb
      { const sb = best.sg.as + (best.sg.bs - best.sg.as) * best.t, b0 = bareAt(best.sg, sb); best.bare = b0; best.f1 = best.pd - b0 * (best.outer + 1);
        for (const o of others) if (o.p !== best.p) { const so = o.sg.stAt(o.sg.as + (o.sg.bs - o.sg.as) * o.t); if (Math.abs(so.lin - best.h) > 1.5) continue;
          const bo = bareAt(o.sg, o.sg.as + (o.sg.bs - o.sg.as) * o.t); if (bo > 0) best.f1 = Math.min(best.f1, o.pd - bo * (o.outer + 1)); } }
      // past2: how far past the paving's outer edge of the nearest OTHER road at about the same height (two
      // pavements close together merge across the gap between them)
      for (const o of others) if (o.p !== best.p) { const so = o.sg.stAt(o.sg.as + (o.sg.bs - o.sg.as) * o.t); const p2 = o.pd - o.outer; if (Math.abs(so.lin - best.h) < 1.5 && p2 < (best.past2 ?? Infinity)) { best.past2 = p2; best.h2 = so.lin; } }
    }
    return best;
  }
  return { at, segs, empty: !segs.length };
}
