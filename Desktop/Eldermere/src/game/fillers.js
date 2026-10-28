// src/game/fillers.js — town filler blocks (part F): dead space between and behind the streets, any size (fw × fd
// cells, like buildings). Called by buildTownPiece (src/game/townBuild.js) with the same context as buildings
// (src/game/buildings.js): the local frame is u across the front (0..UW), w from the back (0) to the front (WD).
//
//   1 walled garden   stone walls round a lawn, trees, flower beds, a bench; a wooden gate in the front wall
//   2 storage yard    a timber fence round packed earth: stacked crates, barrels, a lean-to shed, a cart
//   3 overgrown lot   a broken low wall, long grass, bushes, rubble, a dead tree
//   4 back sheds      a jumble of small sheds and outbuildings, roofs at different heights (fills a block solid)
//   5 stone block     plain masonry up to the piece's height, buttresses and ivy (cliffs, level changes)
//   6 tree grove      grass and trees of different sizes, no wall
// Grass uses the terrain's painted grass (texture 10).

export function buildFiller(c) {
  const { p, Y, UW, WD, lbox, lpt, lgable, lwedge, lpyramid, box, trim, rnd, pick, flowerBox, barrel, crate, bench, TC, acrossAxis, plant } = c;
  const v = p.variant || 1, layers = p.height || 1, GRASS = '#ffffff', EARTH = '#8a7458', STONE = TC.parapet;
  const H = (u, w) => lpt(u, w);
  let seed = 0; const r = () => rnd(200 + seed++);
  // a tree: a trunk and stacked canopy blocks (size s about 1)
  const tree = (u, w, s = 1, dead = false) => {
    const [x, z] = H(u, w), th = 2.6 * s + 1;
    if (plant) { plant(dead ? 'dead' : 'tree', x, Y, z, s * (0.85 + r() * 0.3), r() * Math.PI * 2, Math.floor(r() * 3)); return; }   // (the shared tree models: src/gfx/foliage.js)
    box(x - 0.22 * s, Y, z - 0.22 * s, x + 0.22 * s, Y + th, z + 0.22 * s, TC.timber, { tex: 4 });
    if (dead) { for (const [dx, dz, y] of [[0.8, 0, 0.7], [-0.6, 0.5, 0.85], [0.2, -0.7, 0.95]]) trim(x + Math.min(0, dx * s) - 0.08, Y + th * y, z + Math.min(0, dz * s) - 0.08, x + Math.max(0, dx * s) + 0.08, Y + th * y + 0.16, z + Math.max(0, dz * s) + 0.08, TC.timber, { tex: 4 }); return; }
    const leaf = pick(['#2f5a22', '#3a6a28', '#28501e', '#36602a'], 300 + seed++);
    for (const [k, h, oy] of [[2.0, 1.3, 0.75], [1.5, 1.1, 1.05], [0.85, 0.8, 1.3]]) trim(x - k * s, Y + th * oy - 0.4, z - k * s, x + k * s, Y + th * oy - 0.4 + h * s, z + k * s, leaf, { tex: 6 });
  };
  const bush = (u, w, s = 1) => { const [x, z] = H(u, w); if (plant) { plant('bush', x, Y, z, s * (0.9 + r() * 0.3), r() * Math.PI * 2, Math.floor(r() * 3)); return; } trim(x - 0.6 * s, Y, z - 0.5 * s, x + 0.6 * s, Y + 0.8 * s, z + 0.5 * s, pick(['#2f5a22', '#3a6a28', '#28501e'], 400 + seed++), { tex: 6 }); trim(x - 0.4 * s, Y + 0.5 * s, z - 0.35 * s, x + 0.4 * s, Y + 1.1 * s, z + 0.35 * s, '#3a6a28', { tex: 6 }); };
  // a lawn: grass patches over the inside (margin m), keeping off a strip along the middle (a path) if asked
  const lawn = (m, path = 0, k = 'grass', sp = 1.3) => { if (!plant) return; for (const [u, w] of scatter(sp, m)) { if (path && Math.abs(u - UW / 2) < path) continue; const [x, z] = H(u, w); plant(k, x, Y, z, 0.8 + r() * 0.4, r() * 6.28, Math.floor(r() * 3), [0.95 + r() * 0.1, 1, 0.9 + r() * 0.15]); } };
  const rubble = (u, w) => { for (let i = 0; i < 5; i++) { const [x, z] = H(u + (r() - 0.5) * 2, w + (r() - 0.5) * 2), s = 0.15 + r() * 0.3; box(x - s, Y, z - s, x + s, Y + s * (0.6 + r()), z + s, pick([TC.parapet, TC.plinth, TC.found], 500 + seed++)); } };
  // a wall round the edge (inset t); gaps: list of [side, a0, a1] (side 'front'|'back'|'left'|'right')
  const wallRound = (h, t, col, tex = 0, cap = TC.cap, gaps = []) => {
    const runs = { front: [[t, UW - t]], back: [[t, UW - t]], left: [[0, WD]], right: [[0, WD]] };
    for (const [sd, a0, a1] of gaps) runs[sd] = runs[sd].flatMap(([b0, b1]) => [[b0, Math.max(b0, a0)], [Math.min(b1, a1), b1]].filter(([q0, q1]) => q1 - q0 > 0.05));
    for (const [a0, a1] of runs.front) { lbox(a0, a1, WD - t, WD, Y, Y + h, col, tex); if (cap) lbox(a0, a1, WD - t - 0.05, WD + 0.05, Y + h, Y + h + 0.12, cap, 0, false); }
    for (const [a0, a1] of runs.back) { lbox(a0, a1, 0, t, Y, Y + h, col, tex); if (cap) lbox(a0, a1, -0.05, t + 0.05, Y + h, Y + h + 0.12, cap, 0, false); }
    for (const [a0, a1] of runs.left) { lbox(0, t, a0, a1, Y, Y + h, col, tex); if (cap) lbox(-0.05, t + 0.05, a0, a1, Y + h, Y + h + 0.12, cap, 0, false); }
    for (const [a0, a1] of runs.right) { lbox(UW - t, UW, a0, a1, Y, Y + h, col, tex); if (cap) lbox(UW - t - 0.05, UW + 0.05, a0, a1, Y + h, Y + h + 0.12, cap, 0, false); }
  };
  // scatter points over the inside (a jittered grid), spacing sp, margin m
  const scatter = (sp, m) => { const out = []; for (let u = m; u <= UW - m + 0.01; u += sp) for (let w = m; w <= WD - m + 0.01; w += sp) out.push([u + (r() - 0.5) * sp * 0.6, w + (r() - 0.5) * sp * 0.6]); return out; };

  if (v === 1) {                                                                         // walled garden
    c.ground(GRASS, 10);
    const mid = UW / 2;
    wallRound(2.4, 0.45, STONE, 0, TC.cap, [['front', mid - 1.0, mid + 1.0]]);
    lbox(mid - 1.0, mid + 1.0, WD - 0.3, WD - 0.18, Y, Y + 2.0, TC.door, 4);                // the gate (closed)
    for (const s of [-1, 1]) { lbox(mid + s * 1.15 - 0.15, mid + s * 1.15 + 0.15, WD - 0.5, WD, Y, Y + 2.9, STONE); lbox(mid + s * 1.15 - 0.2, mid + s * 1.15 + 0.2, WD - 0.55, WD + 0.05, Y + 2.9, Y + 3.05, TC.cap, 0, false); }
    lbox(mid - 0.6, mid + 0.6, 1.5, WD - 0.5, Y + 0.005, Y + 0.03, TC.plaza, 8, false);   // a paved path to the back
    for (const [u, w] of scatter(5.5, 2.2)) if (Math.abs(u - mid) > 2) tree(u, w, 0.7 + r() * 0.5);
    for (const s of [-1, 1]) { const [fx, fz] = H(mid + s * 1.6, WD / 2); flowerBox(fx, Y, fz, Math.max(2, WD - 4), acrossAxis === 'x' ? 'z' : 'x', 600 + s); }
    { const [bx, bz] = H(mid, 2.2); bench(bx, bz, acrossAxis); }
    lawn(1.0, 2.4);
    return;
  }
  if (v === 2) {                                                                         // storage yard
    c.ground(EARTH, 6);
    const mid = UW / 2;
    // a fence: posts and three rails, a gap for the gate at the front
    const fence = (a0, a1, w0, w1, alongU) => {
      const len = alongU ? a1 - a0 : w1 - w0;
      for (let k = 0; k <= Math.ceil(len / 2); k++) { const t = Math.min(len, k * 2); if (alongU) lbox(a0 + t - 0.08, a0 + t + 0.08, w0, w1, Y, Y + 2.0, TC.timber, 4); else lbox(a0, a1, w0 + t - 0.08, w0 + t + 0.08, Y, Y + 2.0, TC.timber, 4); }
      for (const y of [0.4, 1.1, 1.8]) lbox(a0, a1, w0, w1, Y + y, Y + y + 0.12, TC.wood, 4);
    };
    fence(0.1, mid - 1.6, WD - 0.25, WD - 0.1, true); fence(mid + 1.6, UW - 0.1, WD - 0.25, WD - 0.1, true);
    fence(0.1, UW - 0.1, 0.1, 0.25, true); fence(0.1, 0.25, 0.1, WD - 0.1, false); fence(UW - 0.25, UW - 0.1, 0.1, WD - 0.1, false);
    // a lean-to shed along the back
    const sd = Math.min(4, WD * 0.35);
    lbox(0.4, UW - 0.4, 0.3, 0.6, Y, Y + 3.2, TC.wood, 4);
    for (let u = 0.6; u < UW - 0.4; u += 2.5) lbox(u - 0.1, u + 0.1, sd - 0.1, sd + 0.1, Y, Y + 2.4, TC.timber, 4);
    lwedge(0.2, UW - 0.2, 0.2, sd + 0.6, Y + 2.3, Y + 3.4, pick(TC.roofs, 610), '-w', 2);
    for (let u = 1.2; u < UW - 1; u += 1.6) crate(...H(u, 1.3), 0.4);
    let i = 0; for (const [u, w] of scatter(3.2, 2)) { if (w < sd + 1 || (Math.abs(u - mid) < 2 && w > WD - 3)) continue; const k = i++ % 3, [x, z] = H(u, w); if (k === 0) { crate(x, z, 0.45); crate(x + 0.05, z, 0.35, Y + 0.9); } else if (k === 1) { barrel(x - 0.35, z); barrel(x + 0.35, z + 0.1); } else crate(x, z, 0.5); }
    return;
  }
  if (v === 3) {                                                                         // overgrown lot
    c.ground(GRASS, 10);
    // a broken low wall: segments of different heights, some missing
    const seg = 2;
    for (const [sd, len] of [['front', UW], ['back', UW], ['left', WD], ['right', WD]]) for (let a = 0; a < len - 0.01; a += seg) {
      if (r() < 0.22) continue; const h = 0.4 + r() * 1.1, a1 = Math.min(len, a + seg);
      if (sd === 'front') lbox(a, a1, WD - 0.4, WD, Y, Y + h, STONE); else if (sd === 'back') lbox(a, a1, 0, 0.4, Y, Y + h, STONE);
      else if (sd === 'left') lbox(0, 0.4, a, a1, Y, Y + h, STONE); else lbox(UW - 0.4, UW, a, a1, Y, Y + h, STONE);
    }
    for (const [u, w] of scatter(2.6, 1.4)) { const k = r(); if (k < 0.45) bush(u, w, 0.6 + r() * 0.7); else if (k < 0.6) rubble(u, w); else if (k < 0.85) { const [x, z] = H(u, w); if (plant) plant('tallgrass', x, Y, z, 0.9 + r() * 0.4, r() * 6.28, Math.floor(r() * 2)); else trim(x - 0.5, Y, z - 0.5, x + 0.5, Y + 0.35 + r() * 0.3, z + 0.5, '#7a9a48', { tex: 6 }); } }
    lawn(0.9, 0, 'tallgrass', 1.6);
    tree(UW * 0.3 + r() * UW * 0.4, WD * 0.4 + r() * WD * 0.2, 1, true);
    return;
  }
  if (v === 4) {                                                                         // back sheds: a jumble of outbuildings
    c.ground(TC.road, 1);
    const cols = Math.max(1, Math.round(UW / 4)), rows = Math.max(1, Math.round(WD / 4)), cw = UW / cols, rh = WD / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (r() < 0.12) continue;                                                          // a gap: a little yard
      const u0 = i * cw + 0.15, u1 = (i + 1) * cw - 0.15, w0 = j * rh + 0.15, w1 = (j + 1) * rh - 0.15, h = 2.6 + r() * 2.4 + (layers - 1) * 4, k = r();
      const brick = k < 0.3, wall = brick ? TC.brick : pick([TC.plaster, TC.wood, '#dcc8a8', TC.plinth], 700 + i * 7 + j), tex = brick ? 5 : wall === TC.wood ? 4 : wall === TC.plinth ? 0 : 3;
      lbox(u0, u1, w0, w1, Y, Y + h, wall, tex);
      const roof = pick(TC.roofs, 720 + i * 3 + j), rt = r();
      if (rt < 0.4) lgable(u0 - 0.25, u1 + 0.25, w0 - 0.25, w1 + 0.25, Y + h, Y + h + 1.4, roof, wall, r() < 0.5 ? 'u' : 'w', 2, tex || 3);
      else if (rt < 0.75) lwedge(u0 - 0.25, u1 + 0.25, w0 - 0.25, w1 + 0.25, Y + h, Y + h + 1.0, roof, r() < 0.5 ? '+w' : '-w', 2);
      else { lbox(u0 - 0.1, u1 + 0.1, w0 - 0.1, w1 + 0.1, Y + h, Y + h + 0.25, TC.quoin); }
      if (j === rows - 1) { lbox((u0 + u1) / 2 - 0.5, (u0 + u1) / 2 + 0.5, w1, w1 + 0.06, Y, Y + 2.0, TC.door, 4, false); }   // a door to the street side
      if (r() < 0.4) { const [x, z] = H(u0 + 0.6, w0 + 0.6); box(x - 0.3, Y + h, z - 0.3, x + 0.3, Y + h + 2.0, z + 0.3, TC.brick, { tex: 5 }); }
    }
    return;
  }
  if (v === 5) {                                                                         // stone block: plain masonry, buttresses, ivy
    const top = Y + layers * 10 - 0.02;
    lbox(0, UW, 0, WD, Y - 0.5, top, TC.found, 0);
    for (const [a0, a1, b0, b1] of [[-0.08, UW + 0.08, -0.08, 0.5], [-0.08, UW + 0.08, WD - 0.5, WD + 0.08], [-0.08, 0.5, 0.5, WD - 0.5], [UW - 0.5, UW + 0.08, 0.5, WD - 0.5]]) lbox(a0, a1, b0, b1, top - 0.3, top + 0.25, TC.cap, 0, false);   // a coping round the top
    for (let u = 2.5; u < UW - 1; u += 5) lbox(u - 0.5, u + 0.5, WD, WD + 0.7, Y, top - 0.6, TC.found, 0);   // buttresses along the front
    for (let i = 0; i < Math.max(2, UW / 4); i++) { const u = r() * (UW - 2) + 1, h = 2 + r() * (top - Y - 3), wdt = 0.8 + r() * 1.6; lbox(u - wdt / 2, u + wdt / 2, WD, WD + 0.08, Y, Y + h, pick(['#4f8a3a', '#3f7a32', '#5a8a3a'], 800 + i), 6, false); }
    lbox(0.5, UW - 0.5, 0.5, WD - 0.5, top, top + 0.04, GRASS, 10, false);             // grass on top
    return;
  }
  // tree grove
  c.ground(GRASS, 10);
  for (const [u, w] of scatter(3.6, 1.6)) { const k = r(); if (k < 0.7) tree(u, w, 0.6 + r() * 0.8); else if (k < 0.9) bush(u, w, 0.8 + r() * 0.5); }
  lawn(0.8);
}
