// src/gfx/trees.js — the tree system: broadleaf trees, pines, dead trees and bushes (the plants' "big" kinds; grass and
// the small plants stay in src/gfx/foliage.js, which hands these over).
//
// The trees themselves. Each species is grown by a little branching program: a curved trunk, primary limbs off it,
// secondaries off those, every limb a tapered tube with bark; leaves are cards (two triangles) carrying a painted
// cluster of dozens of leaves, alpha-cut, so one card reads as a whole spray. Cards are lit as one soft crown (their
// normals point out from its middle) and darker inside it. Species: oak, elm and birch (tree variants 0–2), pine and
// spruce (pine 0–1), two dead trees, and three bushes (plain, flowering, with berries). All their textures sit in one
// painted atlas (src: atlas() below), so a tree is one material.
//
// Three levels of detail, crossfaded by a screen-door dither (no popping):
//   near   the full tree (oak ~750 triangles), casting shadows, out to ~45 m (bushes ~30)
//   mid    trunk, main limbs and a quarter of the cards, each twice the size: ~150 triangles, out to ~130 m
//   far    an impostor: one quad showing a picture of the tree taken from the nearest of 16 angles round it, with its
//          own lighting directions baked alongside (so it's lit like the real thing as the sun moves): 2 triangles
// The pictures are taken once when the map loads (bake(renderer)).
//
// Drawing: one instanced mesh per species and level (about 30 draw calls for every tree on the map, plus the near
// ones again for shadows). Each frame (cull(camera)) the CPU sorts every tree into its level by distance, drops those
// out of view (but keeps any within 45 m, whose shadows may fall into view), and refills the instance buffers.
//
// Wind (the same wind as the grass: the gust noise rolling along createFoliage's wind): the trunk leans with the gusts,
// each main limb sways on its own rhythm (its children with it), and leaves flutter.

const VIEWS = 16, TILE_PX = 128, ATLAS_COLS = 16, ATLAS_ROWS = 16;          // impostor pictures: 16 angles × up to 16 species
const NEAR_SHADOW = 45;
const LODS = { tree: [45, 130, 300], pine: [45, 130, 300], dead: [45, 120, 260], bush: [30, 80, 180] };

const rng = seed => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mulv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- the atlas: 1024 × 512, eight 256 px tiles ----
// 0 broadleaf leaves · 1 birch leaves · 2 pine spray · 3 bark · 4 bush leaves with berries · 5 bush in flower ·
// 6 spruce spray · 7 small dense leaves
const T = { leaf: 0, birch: 1, pine: 2, bark: 3, berry: 4, bloom: 5, spruce: 6, small: 7 };
function atlas(THREE) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
  const S = 256, at = t => [(t % 4) * S, Math.floor(t / 4) * S];
  const leaves = (t, seed, cols, n, L, { twig = '#4a3a2a', dots = null, round = 0.45 } = {}) => {
    const [ox, oy] = at(t), r = rng(seed); g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip();
    const cx = ox + S / 2, cy = oy + S / 2, subs = Array.from({ length: 5 }, () => [cx + (r() - 0.5) * S * 0.4, cy + (r() - 0.5) * S * 0.4]);
    g.strokeStyle = twig; g.lineCap = 'round';
    for (const [sx, sy] of subs) { g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, cy + S * 0.3); g.quadraticCurveTo(cx, cy, sx, sy); g.stroke(); }
    for (let k = 0; k < n; k++) {
      const l = L * S * (0.7 + r() * 0.6), a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * (S * 0.5 - l * 0.55 - 4), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;   // (whole leaves inside the round: no straight cut edges)
      const w = l * round, rot = a + (r() - 0.5) * 1.2, top = 1 - (y - oy) / S;
      const c = cols[Math.floor(r() * cols.length)], k2 = 0.78 + top * 0.3 + (r() - 0.5) * 0.15;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = `rgb(${c.map(v => Math.min(255, Math.round(v * k2))).join(',')})`; g.beginPath(); g.ellipse(0, 0, l / 2, w / 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,40,10,0.35)'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = 'rgba(230,255,190,0.25)'; g.beginPath(); g.moveTo(-l / 2, 0); g.lineTo(l / 2, 0); g.stroke(); g.restore();
    }
    if (dots) for (let k = 0; k < dots.n; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.38, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      g.fillStyle = dots.col; g.beginPath(); g.arc(x, y, dots.r * (0.7 + r() * 0.6), 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - dots.r * 0.3, y - dots.r * 0.3, dots.r * 0.3, 0, Math.PI * 2); g.fill(); }
    g.restore();
  };
  const spray = (t, seed, col, dense) => {
    const [ox, oy] = at(t), r = rng(seed); g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip(); g.lineCap = 'round';
    const twigs = [[ox + 8, oy + S / 2, ox + S - 14, oy + S / 2 + (r() - 0.5) * 20]];
    for (let k = 0; k < 7; k++) { const f = 0.15 + k * 0.11, x = ox + 8 + f * (S - 22), y = oy + S / 2, sd = k % 2 ? 1 : -1; twigs.push([x, y, x + S * (0.18 - f * 0.08), y + sd * S * (0.28 - f * 0.12)]); }
    for (const [x0, y0, x1, y1] of twigs) {
      g.strokeStyle = '#5a4630'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const n = Math.hypot(x1 - x0, y1 - y0) / (dense ? 1.6 : 2.2), ang = Math.atan2(y1 - y0, x1 - x0);
      for (let q = 0; q < n; q++) { const f = q / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, nl = S * (dense ? 0.07 : 0.085) * (1 - f * 0.4) * (0.8 + r() * 0.4);
        for (const sd of [-1, 1]) { const a = ang + sd * (0.9 + r() * 0.4), k2 = 0.8 + r() * 0.4; g.strokeStyle = `rgb(${col.map(v => Math.min(255, Math.round(v * k2))).join(',')})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * nl, y + Math.sin(a) * nl); g.stroke(); } }
    }
    g.restore();
  };
  // bark: grey (tinted per species), vertical fissures and flecks; wraps left to right
  { const [ox, oy] = at(T.bark), r = rng(7); g.fillStyle = '#b8b2aa'; g.fillRect(ox, oy, S, S);
    for (let k = 0; k < 70; k++) { const x = r() * S, w = 1 + r() * 3, dark = r() < 0.6; g.strokeStyle = dark ? `rgba(40,32,26,${0.25 + r() * 0.35})` : `rgba(255,250,240,${0.15 + r() * 0.2})`; g.lineWidth = w; g.beginPath();
      let px = x; g.moveTo(ox + px, oy); for (let y = 0; y <= S; y += 16) { px += (r() - 0.5) * 6; g.lineTo(ox + ((px % S) + S) % S, oy + y); } g.stroke(); }
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,25,20' : '240,235,225'},${0.1 + r() * 0.2})`; g.fillRect(ox + r() * S, oy + r() * S, 1 + r() * 3, 1 + r() * 2); } }
  leaves(T.leaf, 11, [[76, 128, 52], [92, 146, 60], [64, 112, 44], [104, 150, 64]], 330, 0.12);
  leaves(T.birch, 12, [[132, 170, 70], [150, 182, 80], [118, 158, 60]], 380, 0.085, { round: 0.6 });
  spray(T.pine, 13, [56, 94, 62], false);
  leaves(T.berry, 14, [[60, 110, 50], [72, 124, 56]], 300, 0.1, { dots: { n: 34, col: '#b82a40', r: 5 } });
  leaves(T.bloom, 15, [[70, 120, 54], [84, 134, 60]], 300, 0.1, { dots: { n: 40, col: '#f4ecf4', r: 6 } });
  spray(T.spruce, 16, [44, 80, 58], true);
  leaves(T.small, 17, [[70, 124, 52], [86, 138, 58], [60, 108, 46]], 420, 0.075, { round: 0.55 });
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
  const uv = (t, x, y) => { const c = t % 4, rw = Math.floor(t / 4), i = 3 / S; return [(c + i + x * (1 - 2 * i)) / 4, 1 - (rw + 1) / 2 + (i + y * (1 - 2 * i)) / 2]; };
  return { tex, uv };
}

// ---- growing a tree: limbs (polylines with radii) and leaf cards ----
const SPECIES = {
  tree: [
    { name: 'oak', H: 4.6, base: 1.7, prim: 6, el: [0.45, 0.8], pl: 2.7, sec: 4, sl: 0.5, leaf: T.leaf, cs: 1.5, cards: 8, bark: [0.5, 0.42, 0.36], r0: 0.34, tint: [1, 1, 1] },
    { name: 'elm', H: 6.2, base: 2.6, prim: 5, el: [0.95, 1.25], pl: 3.0, sec: 4, sl: 0.45, leaf: T.small, cs: 1.4, cards: 8, bark: [0.46, 0.4, 0.36], r0: 0.28, tint: [0.95, 1, 0.92] },
    { name: 'birch', H: 7.0, base: 2.4, prim: 8, el: [0.7, 1.0], pl: 1.9, sec: 3, sl: 0.5, leaf: T.birch, cs: 1.15, cards: 7, bark: [0.95, 0.93, 0.9], r0: 0.17, droop: 0.5, tint: [1, 1, 1] },
  ],
  pine: [{ name: 'pine', H: 9.5, R: 2.5, step: 0.55, leaf: T.pine, bark: [0.3, 0.23, 0.19], r0: 0.27, droop: 0.15 }, { name: 'spruce', H: 8.5, R: 2.2, step: 0.42, leaf: T.spruce, bark: [0.27, 0.21, 0.18], r0: 0.24, droop: 0.35 }],
  dead: [{ name: 'deadoak', H: 4.2, base: 1.6, prim: 5, el: [0.5, 0.9], pl: 2.4, sec: 3, sl: 0.55, leaf: -1, bark: [0.5, 0.47, 0.43], r0: 0.3, twigs: true }, { name: 'snag', H: 5.5, base: 2.4, prim: 3, el: [0.9, 1.2], pl: 1.5, sec: 2, sl: 0.5, leaf: -1, bark: [0.45, 0.42, 0.38], r0: 0.26, twigs: true, broken: true }],
  bush: [{ name: 'bush', R: 0.85, H: 1.15, leaf: T.small, n: 46, bark: [0.4, 0.33, 0.27] }, { name: 'blossom', R: 0.8, H: 1.2, leaf: T.bloom, n: 42, bark: [0.4, 0.33, 0.27] }, { name: 'berry', R: 0.85, H: 1.05, leaf: T.berry, n: 44, bark: [0.4, 0.33, 0.27] }],
};

function grow(kind, sp, seed) {
  const r = rng(seed), limbs = [], cards = [];
  // a limb: a polyline from p0 heading dir, bending by bend (per segment), length L, radius r0 → r1, flex/phase for wind
  const limb = (p0, dir, L, r0, r1, segs, level, flex0, phase, bend = [0, 0, 0]) => {
    if (!Array.isArray(bend)) bend = [0, 0, 0];
    const pts = [p0], rad = [r0], fx = [flex0]; let d = norm(dir), p = p0;
    for (let k = 1; k <= segs; k++) { d = norm(add(d, bend)); p = add(p, mulv(d, L / segs)); pts.push(p); rad.push(r0 + (r1 - r0) * k / segs); fx.push(Math.min(1, flex0 + (k / segs) * L * (level === 0 ? 0 : 0.18))); }
    const o = { pts, rad, fx, level, phase }; limbs.push(o); return o;
  };
  const at = (o, t) => { const n = o.pts.length - 1, f = t * n, i = Math.min(n - 1, Math.floor(f)); return { p: lerp(o.pts[i], o.pts[i + 1], f - i), d: norm(sub(o.pts[i + 1], o.pts[i])), r: o.rad[i] + (o.rad[i + 1] - o.rad[i]) * (f - i), fx: o.fx[i] + (o.fx[i + 1] - o.fx[i]) * (f - i) }; };
  const card = (p, face, size, tile, fx, phase) => cards.push({ p, face: norm(face), size, tile, fx, phase, spin: r() * Math.PI * 2, flip: r() < 0.5 });
  if (kind === 'tree' || kind === 'dead') {
    const lean = [(r() - 0.5) * 0.14, 1, (r() - 0.5) * 0.14];
    const trunk = limb([0, -0.35, 0], lean, sp.H + 0.35, sp.r0, sp.r0 * 0.35, 6, 0, 0, 0, [(r() - 0.5) * 0.025, 0, (r() - 0.5) * 0.025]);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + r(); limb([Math.cos(a) * sp.r0 * 0.45, 0.28, Math.sin(a) * sp.r0 * 0.45], [Math.cos(a), -1.1, Math.sin(a)], 0.55, sp.r0 * 0.4, 0.05, 2, 2, 0, 0).root = true; }   // root flare (level 2: near model only)
    const az0 = r() * Math.PI * 2;
    for (let b = 0; b < sp.prim; b++) {
      const f = sp.base / sp.H + (b / Math.max(1, sp.prim - 1)) * (0.92 - sp.base / sp.H) * (0.85 + r() * 0.15), j = at(trunk, f), az = az0 + b * 2.39996 + (r() - 0.5) * 0.4;
      const el = sp.el[0] + r() * (sp.el[1] - sp.el[0]) - (sp.broken && b === 0 ? 0.5 : 0), dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const L = sp.pl * (1 - (f - sp.base / sp.H) * 0.45) * (0.8 + r() * 0.4), ph = r() * Math.PI * 2;
      const bend = sp.droop ? [0, -0.12 * sp.droop, 0] : [0, 0.05, 0];
      const P = limb(add(j.p, mulv(dir, -j.r * 0.5)), dir, L, j.r * 0.6, 0.035, 4, 1, 0.08, ph, bend);
      for (let s = 0; s < sp.sec; s++) {
        const t = 0.35 + (s / Math.max(1, sp.sec - 1)) * 0.55, q = at(P, t), side = (s % 2 ? 1 : -1), up = [0, 1, 0], perp = norm(cross(q.d, up));
        const sd = norm(add(add(q.d, mulv(perp, side * (0.7 + r() * 0.5))), [0, 0.25 + r() * 0.3 - (sp.droop || 0) * 0.5, 0])), SL = L * sp.sl * (0.7 + r() * 0.5);
        const Sx = limb(q.p, sd, SL, q.r * 0.7, 0.018, 3, 2, q.fx, ph + r() * 0.6, sp.droop ? [0, -0.15 * sp.droop, 0] : [0, 0.04, 0]);
        if (sp.twigs) for (let w = 0; w < 3; w++) { const tq = at(Sx, 0.4 + w * 0.25), td = norm(add(tq.d, [(r() - 0.5) * 1.4, 0.3 + r() * 0.4, (r() - 0.5) * 1.4])); limb(tq.p, td, SL * 0.4, tq.r * 0.6, 0.008, 2, 3, tq.fx, ph, 0); }
        if (sp.leaf >= 0) for (let c = 0; c < sp.cards; c++) { const cq = at(Sx, 0.3 + c / sp.cards * 0.75), off = [(r() - 0.5) * 0.6, (r() - 0.3) * 0.5, (r() - 0.5) * 0.6]; card(add(cq.p, off), add(sd, [(r() - 0.5) * 1.6, 0.6 + r() * 0.8, (r() - 0.5) * 1.6]), sp.cs * (0.8 + r() * 0.45), sp.leaf, cq.fx + 0.15, ph); }
      }
      if (sp.leaf >= 0) for (let c = 0; c < 3; c++) { const e = at(P, 0.75 + c * 0.12); card(add(e.p, [(r() - 0.5) * 0.5, r() * 0.4, (r() - 0.5) * 0.5]), add(dir, [(r() - 0.5), 0.8, (r() - 0.5)]), sp.cs * (0.9 + r() * 0.4), sp.leaf, e.fx + 0.15, ph); }
    }
    if (sp.leaf >= 0 && cards.length) { let c0 = [0, 0, 0]; for (const c of cards) c0 = add(c0, c.p); c0 = mulv(c0, 1 / cards.length); let rr = 0; for (const c of cards) rr = Math.max(rr, Math.hypot(c.p[0] - c0[0], c.p[2] - c0[2]));
      for (let c = 0; c < 14; c++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rr * 0.6, p = [c0[0] + Math.cos(a) * d, c0[1] + (r() - 0.4) * rr * 0.5, c0[2] + Math.sin(a) * d]; card(p, [Math.cos(a), 0.5 + r(), Math.sin(a)], sp.cs * 1.3, sp.leaf, 0.3, r() * 6); } }   // the crown's middle, filled
    if (sp.leaf >= 0) { const top = trunk.pts[trunk.pts.length - 1]; for (let c = 0; c < 6; c++) card(add(top, [(r() - 0.5) * 1.4, r() * 0.9, (r() - 0.5) * 1.4]), [(r() - 0.5), 1, (r() - 0.5)], sp.cs * 1.1, sp.leaf, 0.3, r() * 6); }
  } else if (kind === 'pine') {
    const trunk = limb([0, -0.35, 0], [0, 1, 0], sp.H + 0.35, sp.r0, 0.03, 6, 0, 0, 0);
    let y = 1.3, wi = 0;
    while (y < sp.H - 0.4) {
      const f = (y - 1.3) / (sp.H - 1.3), R = sp.R * Math.pow(1 - f, 0.95) + 0.25, n = f > 0.8 ? 4 : 6, az0 = r() * Math.PI * 2, j = at(trunk, (y + 0.35) / (sp.H + 0.35));
      for (let b = 0; b < n; b++) {
        const az = az0 + b / n * Math.PI * 2 + (r() - 0.5) * 0.4, el = -0.08 - sp.droop * 0.4 * (1 - f) + (r() - 0.5) * 0.12, dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], ph = r() * 6.28;
        const P = limb(j.p, dir, R, Math.max(0.02, j.r * 0.35), 0.012, 2, 1, 0.05, ph, [0, -0.05 * sp.droop, 0]); P.len = R;
        const cn = R > 1.4 ? 4 : R > 0.7 ? 3 : 2;
        for (let c = 0; c < cn; c++) { const q = at(P, (c + 0.6) / (cn + 0.2)), perp = norm(cross(q.d, [0, 1, 0])), face = norm(add([0, 1, 0], mulv(perp, (r() - 0.5) * 0.5)));
          cards.push({ p: q.p, face, along: q.d, size: Math.max(0.7, R * 0.85), tile: sp.leaf, fx: q.fx + 0.1, phase: ph, spin: 0, flip: r() < 0.5 });
          if (c < 2 || r() < 0.6) cards.push({ p: add(q.p, [0, -0.08, 0]), face: perp, along: q.d, size: Math.max(0.5, R * 0.55), tile: sp.leaf, fx: q.fx + 0.1, phase: ph, spin: 0, flip: r() < 0.5 }); }   // a cross card for volume
      }
      y += sp.step * (0.85 + r() * 0.3) * (1 - f * 0.3); wi++;
    }
    const top = trunk.pts[trunk.pts.length - 1]; for (let c = 0; c < 3; c++) { const a = c / 3 * Math.PI * 2; cards.push({ p: add(top, [0, -0.2, 0]), face: [Math.cos(a), 0, Math.sin(a)], along: [0, 1, 0], size: 0.9, tile: sp.leaf, fx: 0.3, phase: 0, spin: 0, flip: false }); }
  } else {                                                                                   // bush: a few stems and a dome of cards
    for (let k = 0; k < 5; k++) { const a = r() * Math.PI * 2; limb([0, -0.1, 0], [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5], sp.H * 0.7, 0.045, 0.012, 2, 1, 0.05, r() * 6, 0); }
    for (let c = 0; c < sp.n; c++) { const u = Math.pow(r(), 0.7), a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), p = [Math.cos(a) * s * sp.R * 0.8, 0.15 + u * sp.H * 0.8, Math.sin(a) * s * sp.R * 0.8];
      card(p, add(norm(sub(p, [0, 0.2, 0])), [0, 0.5, 0]), 0.62 + r() * 0.3, sp.leaf, 0.4 + u * 0.4, r() * 6); }
  }
  return { limbs, cards };
}

// ---- geometry from a grown tree, at a level of detail (0 near, 1 mid) ----
function build(THREE, A, kind, sp, G, lod, st = {}) {
  const on = k => st[k] !== false;                                                          // (stages: roots, trunk, branches, leaves; the tree viewer turns them off)
  const P = [], N = [], U = [], C = [], W = [];
  const vtx = (p, n, uv, c, w) => { P.push(...p); N.push(...n); U.push(...uv); C.push(...c); W.push(...w); };
  // limbs: tubes (near: 8 sides on the trunk, 5 on limbs, 3 on twigs; mid: trunk and main limbs only, fewer sides)
  for (const L of G.limbs) {
    if (!on(L.level === 0 ? 'trunk' : L.root ? 'roots' : 'branches')) continue;
    if (lod === 1 && L.level > 1) continue;
    if (kind === 'pine' && L.level === 1 && (lod === 1 || L.len < 0.9)) continue;           // (a pine's small branches: the needle cards are enough)
    const sides = lod === 0 ? [8, 5, 3, 3][L.level] : [5, 3][L.level], n = L.pts.length;
    if (lod === 1 && L.level === 1 && L.rad[0] < 0.05) continue;
    let ref = Math.abs(norm(sub(L.pts[1], L.pts[0]))[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const rings = [];
    let total = 0; const acc = [0]; for (let i = 1; i < n; i++) { total += len(sub(L.pts[i], L.pts[i - 1])); acc.push(total); }
    for (let i = 0; i < n; i++) {
      const d = norm(sub(L.pts[Math.min(n - 1, i + 1)], L.pts[Math.max(0, i - 1)])), s = norm(cross(d, ref)), w = cross(s, d); ref = w;
      const ring = []; for (let k = 0; k <= sides; k++) { const a = k / sides * Math.PI * 2, nn = add(mulv(s, Math.cos(a)), mulv(w, Math.sin(a))); ring.push({ p: add(L.pts[i], mulv(nn, L.rad[i])), n: nn, u: k / sides, v: acc[i] / (total || 1) }); }
      rings.push(ring);
    }
    const dark = (y) => Math.min(1, 0.7 + Math.max(0, y) * 0.08);
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
      const q = [rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]], fxs = [L.fx[i], L.fx[i + 1], L.fx[i + 1], L.fx[i]];
      for (const m of [0, 1, 2, 0, 2, 3]) { const R = q[m], sh = dark(R.p[1]); vtx(R.p, R.n, A.uv(T.bark, R.u, Math.min(1, R.v * 0.999)), mulv(sp.bark, sh), [fxs[m], L.phase, 0]); }
    }
  }
  // leaf cards (mid: every fourth, about twice the size)
  if (G.cards.length && on('leaves')) {
    let ctr = [0, 0, 0]; for (const c of G.cards) ctr = add(ctr, c.p); ctr = mulv(ctr, 1 / G.cards.length);
    let maxd = 0.1; for (const c of G.cards) maxd = Math.max(maxd, len(sub(c.p, ctr)));
    const tint = sp.tint || [1, 1, 1];
    G.cards.forEach((c, idx) => {
      if (lod === 1 && idx % 4) return;
      const size = c.size * (lod === 1 ? 1.9 : 1), f = c.face;
      let right, up;
      if (c.along) { right = norm(c.along); up = norm(cross(f, right)); }                         // (a pine spray lies along its branch)
      else { const ref = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]; right = norm(cross(ref, f)); up = cross(f, right); const ca = Math.cos(c.spin), sa = Math.sin(c.spin); const r2 = add(mulv(right, ca), mulv(up, sa)); up = add(mulv(up, ca), mulv(right, -sa)); right = r2; }
      const hs = size / 2, ox = c.along ? mulv(right, hs * 0.85) : [0, 0, 0];                   // (a spray starts at its branch, not centred on it)
      const corner = (sx, sy) => add(add(add(c.p, ox), mulv(right, sx * hs)), mulv(up, sy * hs));
      const out = norm(add(norm(sub(c.p, ctr)), [0, 0.6, 0])), sn = norm(add(mulv(out, 0.75), mulv(f, 0.25)));
      const ao = 0.72 + 0.35 * Math.min(1, len(sub(c.p, ctr)) / maxd) + Math.max(0, (c.p[1] - ctr[1]) / (maxd * 4)), col = mulv(tint, Math.min(1.1, ao));
      const cs = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([sx, sy, u, v]) => ({ p: corner(sx, sy), uv: A.uv(c.tile, c.flip ? 1 - u : u, v) }));
      for (const m of [0, 1, 2, 0, 2, 3]) vtx(cs[m].p, sn, cs[m].uv, col, [c.fx, c.phase + idx * 0.37, 1]);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aTW', new THREE.Float32BufferAttribute(W, 3));
  g.computeBoundingBox(); return g;
}

// ---- shaders: wind and the dither fade, put into the standard materials ----
const WIND_HEAD = `uniform float uTime; uniform sampler2D uNoise; uniform vec4 uWind; uniform vec2 uScroll; attribute vec2 aF; attribute float aR; varying vec2 vF2;`;
const windCore = TILE => `
  vec3 c0 = instanceMatrix[0].xyz; float isc = 1.0 / max(0.04, dot(c0, c0)); vec2 ip = instanceMatrix[3].xz;
  vec2 dir = uWind.xy; vec4 nz = texture2D(uNoise, (ip - uScroll) / ${TILE.toFixed(1)});
  float gst = uWind.z * (0.3 + 0.7 * pow(nz.r, 1.5) * (0.5 + uWind.w));
  vec2 bend = dir * gst + vec2(-dir.y, dir.x) * (nz.g - 0.5) * uWind.z * 0.35;
  vF2 = aF;`;
const TREE_WIND = TILE => `${windCore(TILE)}
  float hgt = max(0.0, position.y), ph = aTW.y + aR * 6.283;
  vec3 off = vec3(bend.x, 0.0, bend.y) * 0.0025 * hgt * hgt;                                                    // the trunk leans
  float bs = sin(uTime * (0.7 + aR * 0.3) + ph) * 0.65 + sin(uTime * 1.3 + ph * 1.7) * 0.25;                       // each limb sways slowly on its own
  off.xz += (bend * (0.7 + 0.3 * bs) + vec2(-dir.y, dir.x) * bs * 0.2 * uWind.z) * aTW.x * 0.14;
  off.y += aTW.x * bs * 0.02 * (0.2 + uWind.z);
  vec3 tg = normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));                                           // leaves flutter sideways (not in and out: the crown mustn't breathe)
  transformed += tg * sin(uTime * (3.5 + aR * 1.5) + aTW.y * 13.0) * aTW.z * 0.018 * (0.3 + uWind.z + gst);
  transformed += transpose(mat3(instanceMatrix)) * off * isc;`;
const DITHER = `{ float hd = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (hd < vF2.x || hd >= vF2.y) discard; }`;

export function createTrees(THREE, scene, plants, wind, stages = {}) {
  let workerMode = 'main', workerPool = null, workerPending = false, workerFailed = false;
  const workerState = { status: 'main thread', lastMs: 0, queueMs: 0, jobs: 0, error: '' };
  const ensureWorker = async () => {
    if (!workerPool) {
      const { createWorkerPool } = await import('../game/workers/workerPool.js');
      workerPool = createWorkerPool(2);
      workerState.status = 'starting';
      await workerPool.ready();
    }
    return workerPool;
  };
  const sets = [];
  if (!plants.some(p => SPECIES[p.k])) return { hidden: false, sets, bake() {}, cull() {} };
  const A = atlas(THREE);
  // the materials: one for the trees (and its shadow twin), one for the impostors
  const treeMat = new THREE.MeshStandardMaterial({ map: A.tex, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const patch = (sh, body, frag = true, keepNormal = true) => {
    Object.assign(sh.uniforms, wind.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WIND_HEAD}\nattribute vec3 aTW;`).replace('#include <begin_vertex>', `#include <begin_vertex>\n{${body}}`);
    if (frag) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vF2;').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER}`);
    if (keepNormal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''));   // (a leaf card lit the same from both sides: as part of the crown)
  };
  treeMat.onBeforeCompile = sh => patch(sh, TREE_WIND(wind.TILE));
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: A.tex, alphaTest: 0.45, side: THREE.DoubleSide });
  depthMat.onBeforeCompile = sh => patch(sh, TREE_WIND(wind.TILE), true, false);
  const impAlbedo = new THREE.WebGLRenderTarget(TILE_PX * ATLAS_COLS, TILE_PX * ATLAS_ROWS, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  const impNormal = new THREE.WebGLRenderTarget(TILE_PX * ATLAS_COLS, TILE_PX * ATLAS_ROWS, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  impAlbedo.texture.encoding = THREE.sRGBEncoding;
  const impMat = new THREE.MeshStandardMaterial({ map: impAlbedo.texture, alphaTest: 0.4, roughness: 0.9, metalness: 0, vertexColors: true });
  impMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, wind.uniforms, { uNorm: { value: impNormal.texture } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${WIND_HEAD}\nattribute float aRow; varying vec3 vRw, vFw; varying vec2 vUvI;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { ${windCore(wind.TILE)}
          float s = sqrt(1.0 / isc); mat3 R = mat3(instanceMatrix) / s;
          vec3 lc = transpose(R) * (cameraPosition - instanceMatrix[3].xyz); float th = atan(lc.x, lc.z);
          float k = floor(th / 6.2831853 * ${VIEWS.toFixed(1)} + 0.5), thk = k / ${VIEWS.toFixed(1)} * 6.2831853; k = mod(k + ${VIEWS.toFixed(1)}, ${VIEWS.toFixed(1)});
          vec3 rl = vec3(cos(thk), 0.0, -sin(thk)), fl = vec3(sin(thk), 0.0, cos(thk));
          transformed = rl * position.x + vec3(0.0, position.y, 0.0);
          transformed += transpose(R) * vec3(bend.x, 0.0, bend.y) * 0.006 * max(0.0, position.y) * max(0.0, position.y) / s;
          vRw = R * rl; vFw = R * fl; vUvI = (vec2(k, aRow) + uv) / vec2(${ATLAS_COLS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)}); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vF2; varying vec3 vRw, vFw; varying vec2 vUvI; uniform sampler2D uNorm;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER}`)
      .replace('#include <map_fragment>', 'vec4 texelColor = mapTexelToLinear(texture2D(map, vUvI)); diffuseColor *= texelColor;')
      .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0; vec3 nI = texture2D(uNorm, vUvI).xyz * 2.0 - 1.0;
        vec3 normal = normalize((viewMatrix * vec4(normalize(vRw * nI.x + vec3(0.0, 1.0, 0.0) * nI.y + vFw * nI.z), 0.0)).xyz); vec3 geometryNormal = normal;`);
  };
  // ---- the species in use, their models, and their trees ----
  const byKey = new Map();
  for (const p of plants) { const list = SPECIES[p.k]; if (!list) continue; const v = Math.abs(p.v || 0) % list.length, key = p.k + v; (byKey.get(key) || byKey.set(key, { k: p.k, v, list: [] }).get(key)).list.push(p); }
  let row = 0;
  for (const { k, v, list } of byKey.values()) {
    const sp = SPECIES[k][v], G = grow(k, sp, 1000 + v * 77 + k.length * 13), g0 = build(THREE, A, k, sp, G, 0, stages), g1 = build(THREE, A, k, sp, G, 1, stages);
    const bb = g0.boundingBox, hw = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.04, y0 = bb.min.y - 0.05, y1 = bb.max.y + 0.05;
    const gi = new THREE.BufferGeometry();                                                    // the impostor quad, as big as the tree from any side
    gi.setAttribute('position', new THREE.Float32BufferAttribute([-hw, y0, 0, hw, y0, 0, hw, y1, 0, -hw, y0, 0, hw, y1, 0, -hw, y1, 0], 3));
    gi.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    gi.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    gi.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(1), 3)); gi.setAttribute('aRow', new THREE.Float32BufferAttribute(new Array(6).fill(row), 1));
    const n = list.length, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), Sc = new Float32Array(n), Ro = new Float32Array(n), Co = new Float32Array(n * 3), Rn = new Float32Array(n);
    list.forEach((p, i) => { X[i] = p.x; Y[i] = p.y; Z[i] = p.z; Sc[i] = p.s || 1; Ro[i] = p.r || 0; const c = p.c || [1, 1, 1]; Co.set(c, i * 3); const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453; Rn[i] = h - Math.floor(h); });
    const mesh = (geo, mat, cast) => {
      geo.setAttribute('aF', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aR', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true; if (cast) im.customDepthMaterial = depthMat; im.userData.canopy = true; scene.add(im); return im;   // (canopy: src/gfx/weathering.js lets a tenth of the snow through crowns)
    };
    sets.push({ k, v, sp, n, X, Y, Z, Sc, Ro, Co, Rn, g0, row, mid: (y0 + y1) / 2, rad: Math.hypot(hw, (y1 - y0) / 2), edges: LODS[k], meshes: [mesh(g0, treeMat, true), mesh(g1, treeMat, false), mesh(gi, impMat, false)] });
    row++;
  }
  let baked = false;
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), cv = new THREE.Vector3(), wide = new THREE.PerspectiveCamera(), last = { x: 1e9, y: 0, z: 0, q: new THREE.Quaternion(), fov: 0, hid: null };
  const diagnostics = { enabled: false, calls: 0, skipped: 0, totalMs: 0, maxMs: 0, scanMs: 0, bufferMs: 0, instances: 0, workerMs: 0, workerQueueMs: 0, workerJobs: 0, workerError: '' };
  return {
    hidden: false,
    sets,
    // the impostor pictures: every species from 16 angles, its colours and its lighting directions
    bake(renderer) {
      if (baked || !sets.length) return; baked = true;
      const bakeMat = new THREE.ShaderMaterial({ uniforms: { map: { value: A.tex }, mode: { value: 0 } }, vertexColors: true, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; varying vec3 vN, vC; void main() { vUv = uv; vC = color; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D map; uniform float mode; varying vec2 vUv; varying vec3 vN, vC; void main() { vec4 t = texture2D(map, vUv); if (t.a < 0.45) discard;
          if (mode < 0.5) gl_FragColor = vec4(pow(pow(t.rgb, vec3(2.2)) * vC, vec3(1.0 / 2.2)), 1.0); else gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }` });
      const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100), prevRT = renderer.getRenderTarget(), cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha(), as = renderer.autoClear;
      renderer.autoClear = false;
      for (const S of sets) {
        const m = new THREE.Mesh(S.g0, bakeMat); sc.add(m);
        const pos = S.meshes[2].geometry.attributes.position.array, hw = pos[3], y0 = pos[1], y1 = pos[7];
        cam.left = -hw; cam.right = hw; cam.bottom = y0; cam.top = y1; cam.updateProjectionMatrix();
        for (let k = 0; k < VIEWS; k++) {
          const th = k / VIEWS * Math.PI * 2; cam.position.set(Math.sin(th) * 40, 0, Math.cos(th) * 40); cam.lookAt(0, 0, 0); cam.position.y = 0; cam.updateMatrixWorld();
          for (const [rt, mode, clear] of [[impAlbedo, 0, [0.22, 0.3, 0.16]], [impNormal, 1, [0.5, 0.5, 1]]]) {
            rt.viewport.set(k * TILE_PX, S.row * TILE_PX, TILE_PX, TILE_PX); rt.scissor.copy(rt.viewport); rt.scissorTest = true;
            renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color(...clear), 0); renderer.clear(true, true, false);
            bakeMat.uniforms.mode.value = mode; renderer.render(sc, cam);
          }
        }
        sc.remove(m);
      }
      renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca); renderer.autoClear = as; bakeMat.dispose();
    },
    // each frame, just before drawing: every tree to its level of detail, those out of view dropped
    // (only redone when the camera has moved half a metre or turned ~8°: the view is culled a third wider than the screen
    // so turning doesn't show gaps between refills, and nothing is re-uploaded while you just look a little around)
    diagnostics,
    workerState,
    get workerMode() { return workerMode; },
    setWorkerMode(mode) {
      workerMode = ['main', 'worker', 'auto'].includes(mode) ? mode : 'main';
      if (workerMode !== 'main' && !workerFailed) workerState.status = workerPool ? 'ready' : 'starting';
      else if (workerMode === 'main') workerState.status = 'main thread';
    },
    resetDiagnostics() { Object.assign(diagnostics, { calls: 0, skipped: 0, totalMs: 0, maxMs: 0, scanMs: 0, bufferMs: 0, instances: 0, workerMs: 0, workerQueueMs: 0, workerJobs: 0, workerError: '' }); },
    cull(camera) {
      const diag = diagnostics, timed = diag.enabled, started = timed ? performance.now() : 0;
      const hid = !!this.hidden, c0 = camera.position;
      if (hid === last.hid && Math.hypot(c0.x - last.x, c0.y - last.y, c0.z - last.z) < 0.5 && Math.abs(camera.quaternion.dot(last.q)) > 0.9976 && camera.fov === last.fov) { if (timed) diag.skipped++; return; }
      last.hid = hid; last.x = c0.x; last.y = c0.y; last.z = c0.z; last.q.copy(camera.quaternion); last.fov = camera.fov;
      camera.updateMatrixWorld(); wide.copy(camera); wide.fov = Math.min(170, camera.fov * 1.35); wide.updateProjectionMatrix(); pm.multiplyMatrices(wide.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const useWorker = !workerFailed && (workerMode === 'worker' || (workerMode === 'auto' && sets.reduce((n, S) => n + S.n, 0) >= 200));
      if (useWorker) {
        if (workerPending) { if (timed) diag.skipped++; return; }
        workerPending = true;
        const queuedAt = performance.now();
        workerState.status = 'queued';
        const planes = fr.planes.map(p => [p.normal.x, p.normal.y, p.normal.z, p.constant]);
        const tasks = sets.map(S => ({ type: 'tree-cull', payload: { X: S.X, Y: S.Y, Z: S.Z, Sc: S.Sc, cx, cy, cz, planes, radius: S.rad, mid: S.mid, edges: S.edges, hidden: !!this.hidden, baked, nearShadow: NEAR_SHADOW } }));
        ensureWorker().then(pool => {
          workerState.status = 'running';
          const startedWorker = performance.now();
          return pool.runBatch(tasks).then(results => {
            const workerElapsed = performance.now() - startedWorker;
            workerState.lastMs = workerElapsed; workerState.queueMs = Math.max(0, startedWorker - queuedAt);
            workerState.jobs++; workerState.status = 'ready';
            if (timed) { diag.workerMs += workerElapsed; diag.workerQueueMs += workerState.queueMs; diag.workerJobs++; }
            for (let si = 0; si < sets.length; si++) {
              const S = sets[si], counts = [0, 0, 0], M = S.meshes;
              for (const [i, L, lo, hi] of results[si].records) {
                const mesh = M[L], j = counts[L]++, a = mesh.instanceMatrix.array, o = j * 16;
                const c = Math.cos(S.Ro[i]) * S.Sc[i], sn = Math.sin(S.Ro[i]) * S.Sc[i];
                a[o] = c; a[o+1] = 0; a[o+2] = -sn; a[o+3] = 0; a[o+4] = 0; a[o+5] = S.Sc[i]; a[o+6] = 0; a[o+7] = 0; a[o+8] = sn; a[o+9] = 0; a[o+10] = c; a[o+11] = 0; a[o+12] = S.X[i]; a[o+13] = S.Y[i]; a[o+14] = S.Z[i]; a[o+15] = 1;
                mesh.instanceColor.array[j*3] = S.Co[i*3]; mesh.instanceColor.array[j*3+1] = S.Co[i*3+1]; mesh.instanceColor.array[j*3+2] = S.Co[i*3+2];
                const F = mesh.geometry.attributes.aF.array; F[j*2] = lo; F[j*2+1] = hi; mesh.geometry.attributes.aR.array[j] = S.Rn[i];
              }
              for (let L=0; L<3; L++) { const mesh=M[L]; mesh.count=counts[L]; if(counts[L]) { mesh.instanceMatrix.needsUpdate=true; mesh.instanceColor.needsUpdate=true; mesh.geometry.attributes.aF.needsUpdate=true; mesh.geometry.attributes.aR.needsUpdate=true; } }
            }
            last.x = 1e9;
          });
        }).catch(error => {
          workerFailed = true; workerState.status = 'failed · main-thread fallback';
          workerState.error = error?.message || String(error); diagnostics.workerError = workerState.error; workerMode = 'main';
        }).finally(() => { workerPending = false; });
        return;
      }
      const scanStarted = timed ? performance.now() : 0, bufferBefore = timed ? diag.bufferMs : 0;
      let visibleInstances = 0;
      for (const S of sets) {
        const E = S.edges, wv = E.map(e => Math.max(3, e * 0.1)), far = E[E.length - 1], cnt = [0, 0, 0], M = S.meshes, lodOn = baked ? 3 : 2;
        if (!this.hidden) for (let i = 0; i < S.n; i++) {
          const dx = S.X[i] - cx, dz = S.Z[i] - cz, d = Math.hypot(dx, S.Y[i] + S.mid * S.Sc[i] - cy, dz); if (d > far) continue;
          if (d > NEAR_SHADOW) { cv.set(S.X[i], S.Y[i] + S.mid * S.Sc[i], S.Z[i]); sph.set(cv, S.rad * S.Sc[i] + 1.5); if (!fr.intersectsSphere(sph)) continue; }
          // how far across each boundary this tree is (0 before it, 1 past it); the last is the fade out at the far edge
          const t = [0, 0, 0]; for (let b = 0; b < 2; b++) t[b] = Math.min(1, Math.max(0, (d - (E[b] - wv[b])) / (2 * wv[b]))); t[2] = Math.min(1, Math.max(0, (d - (far - wv[2])) / wv[2]));
          if (!baked) { t[1] = t[2]; }                                                          // (before the pictures exist, the mid model goes all the way)
          for (let L = 0; L < lodOn; L++) {
            const lo = L === 0 ? 0 : 1 - t[L - 1], hi = 1 - t[L]; if (lo >= hi) continue;
            const m = M[L], j = cnt[L]++, c = Math.cos(S.Ro[i]) * S.Sc[i], s = Math.sin(S.Ro[i]) * S.Sc[i], a = m.instanceMatrix.array, o = j * 16;
            a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = S.Sc[i]; a[o + 6] = 0; a[o + 7] = 0; a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0; a[o + 12] = S.X[i]; a[o + 13] = S.Y[i]; a[o + 14] = S.Z[i]; a[o + 15] = 1;
            m.instanceColor.array[j * 3] = S.Co[i * 3]; m.instanceColor.array[j * 3 + 1] = S.Co[i * 3 + 1]; m.instanceColor.array[j * 3 + 2] = S.Co[i * 3 + 2];
            const F = m.geometry.attributes.aF.array; F[j * 2] = lo; F[j * 2 + 1] = hi; m.geometry.attributes.aR.array[j] = S.Rn[i];
          }
        }
        visibleInstances += cnt[0] + cnt[1] + cnt[2];
        const bufferStarted = timed ? performance.now() : 0;
        for (let L = 0; L < 3; L++) { const m = M[L]; m.count = cnt[L]; if (cnt[L]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.geometry.attributes.aF.needsUpdate = true; m.geometry.attributes.aR.needsUpdate = true; } }
        if (timed) diag.bufferMs += performance.now() - bufferStarted;
      }
      if (timed) {
        const elapsed = performance.now() - started;
        diag.calls++; diag.totalMs += elapsed; diag.maxMs = Math.max(diag.maxMs, elapsed); diag.instances += visibleInstances;
        diag.scanMs += Math.max(0, performance.now() - scanStarted - (diag.bufferMs - bufferBefore));
      }
    },
  };
}
