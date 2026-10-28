// src/game/buildings.js — town buildings of any size: houses (H), landmarks (L) and skyline blocks (Y).
// Called by buildTownPiece (src/game/townBuild.js) with a context of its helpers. A building covers fw × fd
// cells (p.fw along its front, p.fd deep; footOf in src/data/dungeon.js) and is laid out in its own frame:
// u across the front (0..UW, left to right looking at it from the street), w from the back (0) to the front (WD).
//
//   Houses H     1 timber-and-plaster · 2 shop · 3 brick townhouse · 4 artificer's workshop · 5 tavern (long,
//                gallery, big sign) · 6 manor (columned porch, dormers, cross gable) · 7 tower house (turret)
//                · 8 row houses (one narrow house per 5 m of width, each its own colours and height)
//   Landmarks L  1 guild hall (portico, banners, crystal on the roof) · 2 temple (stepped base, colonnade all
//                round, pyramid roof, a crystal inside) · 3 market hall (open arcade below, timber hall above)
//                · 4 clock tower (tall: one clock face per side, a crystal on the spire)
//   Skyline Y    1 tall row block · 2 tower block · 3 tenement — plainer (bands of windows, few details): they
//                fill the view behind the streets, where nobody walks up to them
// More floors with more layers (height); the width sets how many bays of windows and doors there are.

export function buildBuilding(c) {
  const { p, Y, UW, WD, lbox, lpt, lgable, lwedge, lpyramid, box, trim, lamp, rnd, pick, flowerBox, barrel, crate, bench, TC, DUST, LAMP, acrossAxis, sideOpen } = c;
  const part = p.part, v = p.variant || 1, layers = p.height || 1;
  const H = (u, w) => lpt(u, w);                                                       // world x, z of a local point
  const otherAxis = acrossAxis === 'x' ? 'z' : 'x';
  c.ground(TC.road, 1);

  // ---- one window: glowing panes in a frame, shutters, a sill, a flower box ----
  // face: 'front' | 'back' | 'left' | 'right', on the wall plane `at` (w for front/back, u for left/right); t along it
  const P = (face, at, a0, a1, o0, o1, y0, y1, col, tex, solid = false) => {
    if (face === 'front') return lbox(a0, a1, at + o0, at + o1, y0, y1, col, tex, solid);
    if (face === 'back') return lbox(a0, a1, at - o1, at - o0, y0, y1, col, tex, solid);
    if (face === 'left') return lbox(at - o1, at - o0, a0, a1, y0, y1, col, tex, solid);
    return lbox(at + o0, at + o1, a0, a1, y0, y1, col, tex, solid);
  };
  const outPt = (face, at, t, o) => face === 'front' ? H(t, at + o) : face === 'back' ? H(t, at - o) : face === 'left' ? H(at - o, t) : H(at + o, t);
  const win = (face, at, t, yb, o = {}) => {
    const wide = o.wide ?? 1.1, tall = o.tall ?? 1.4, lit = rnd(Math.round(t * 7 + yb * 3)) < 0.65, fr = o.frame ?? TC.timber, sh = o.shutter;
    P(face, at, t - wide / 2, t + wide / 2, 0, 0.04, yb, yb + tall, lit ? TC.glass : TC.glassDim, 6);
    P(face, at, t - wide / 2 - 0.1, t + wide / 2 + 0.1, 0, 0.1, yb + tall, yb + tall + 0.12, fr, 4);
    P(face, at, t - 0.04, t + 0.04, 0.02, 0.07, yb, yb + tall, fr, 4);
    P(face, at, t - wide / 2 - 0.1, t + wide / 2 + 0.1, 0.02, 0.07, yb + tall * 0.48, yb + tall * 0.52, fr, 4);
    if (sh) for (const s of [-1, 1]) { const e0 = t + s * (wide / 2 + 0.05), e1 = e0 + s * wide * 0.5; P(face, at, Math.min(e0, e1), Math.max(e0, e1), 0.02, 0.09, yb - 0.02, yb + tall + 0.02, sh, 4); }
    P(face, at, t - wide / 2 - 0.15, t + wide / 2 + 0.15, 0, 0.2, yb - 0.1, yb, TC.quoin, 0);
    if (o.flowers) { const [fx, fz] = outPt(face, at, t, 0.25); flowerBox(fx, yb - 0.4, fz, wide + 0.2, face === 'front' || face === 'back' ? acrossAxis : otherAxis, Math.floor(t * 7 + yb)); }
  };
  // a door on the front wall plane at u, with steps, a frame, a knob, a lantern
  const door = (wF, u, o = {}) => {
    const dw = o.wide ?? 1.3, dh = o.tall ?? 2.2, y0 = Y + (o.raised ?? 0.8);
    lbox(u - dw / 2, u + dw / 2, wF, wF + 0.06, y0, y0 + dh, o.col ?? TC.door, 4, false);
    lbox(u - dw / 2 - 0.2, u + dw / 2 + 0.2, wF, wF + 0.14, y0 + dh, y0 + dh + 0.25, o.frame ?? TC.timber, 4, false);
    for (const s of [-1, 1]) lbox(u + s * (dw / 2 + 0.1) - 0.1, u + s * (dw / 2 + 0.1) + 0.1, wF, wF + 0.14, y0, y0 + dh, o.frame ?? TC.timber, 4, false);
    if (y0 > Y + 0.1) { lbox(u - dw / 2 - 0.25, u + dw / 2 + 0.25, wF, wF + 0.9, Y, Y + (y0 - Y) / 2, TC.plinth); lbox(u - dw / 2 - 0.15, u + dw / 2 + 0.15, wF, wF + 0.45, Y + (y0 - Y) / 2, y0, TC.plinth); }
    const [kx, kz] = H(u + dw * 0.35, wF + 0.08); trim(kx - 0.04, y0 + 1.1, kz - 0.04, kx + 0.04, y0 + 1.18, kz + 0.04, '#d8b048', { tex: 6 });
    if (o.lantern !== false) { const [lx, lz] = H(u + dw / 2 + 0.5, wF + 0.35); trim(lx - 0.05, y0 + 1.7, lz - 0.05, lx + 0.05, y0 + 2.5, lz + 0.05, TC.iron, { tex: 6 }); lamp(lx, y0 + 2.05, lz, o.light ?? LAMP); }
  };
  // a chimney through the roof at (u, w)
  const chimney = (u, w, top) => { const [x, z] = H(u, w); box(x - 0.4, Y + 2, z - 0.4, x + 0.4, top + 0.9, z + 0.4, TC.brick, { tex: 5 }); trim(x - 0.48, top + 0.9, z - 0.48, x + 0.48, top + 1.05, z + 0.48, TC.quoin); };
  // a column (square, with a base and a capital) from y0 to y1 at (u, w)
  const column = (u, w, y0, y1, r = 0.28, col = TC.quoin) => { lbox(u - r - 0.08, u + r + 0.08, w - r - 0.08, w + r + 0.08, y0, y0 + 0.3, col); lbox(u - r, u + r, w - r, w + r, y0 + 0.3, y1 - 0.3, col); lbox(u - r - 0.1, u + r + 0.1, w - r - 0.1, w + r + 0.1, y1 - 0.3, y1, col); };
  // a banner hanging from the wall at u (front wall plane wF), y from top down `len`
  const banner = (wF, u, top, len, col) => { lbox(u - 0.45, u + 0.45, wF + 0.05, wF + 0.1, top - len, top, col, 6, false); lbox(u - 0.55, u + 0.55, wF + 0.02, wF + 0.16, top, top + 0.08, TC.iron, 6, false); lbox(u - 0.12, u + 0.12, wF + 0.1, wF + 0.13, top - len * 0.6, top - len * 0.4, '#d8b048', 6, false); };

  // ---- one block: plinth, floors (timber-framed, brick or stone), roof, windows all round, chimneys ----
  // st: { wall, tex, frame (timber framing), jetty, floors, FH, roof, roofType ('gable' | 'gableFront' | 'pyramid' | 'flat'),
  //       shutter, flowers, windowEvery, winWide, winTall, quoins, chimneys, plain (skyline: bands of windows) }
  const block = (u0, u1, w0, w1, st) => {
    // st.arcade: no ground floor (open below); its floors start at st.base and are all upper floors
    const FH = st.FH ?? 3.2, floors = st.floors, arc = !!st.arcade, B0 = arc ? st.base : Y + FH, eave = (arc ? st.base + floors * FH : Y + floors * FH) + 0.4, jet = st.jetty ?? 0;
    if (!arc) { lbox(u0, u1, w0, w1, Y, Y + 0.8, TC.plinth, 0); lbox(u0, u1, w0, w1, Y + 0.8, Y + FH, st.groundWall ?? st.wall, st.groundTex ?? st.tex); }
    lbox(u0, u1, w0 - jet, w1 + jet, B0, eave, st.wall, st.tex);
    const wF = w1 + jet, wB = w0 - jet;
    if (st.frame) {                                                                     // timber framing: a beam at each floor, corner posts
      for (let f = arc ? 0 : 1; f <= floors; f++) { const yb = arc ? st.base + f * FH : Y + f * FH; lbox(u0 - 0.05, u1 + 0.05, wF - 0.02, wF + 0.1, yb - 0.15, yb + 0.12, TC.timber, 4, false); lbox(u0 - 0.05, u1 + 0.05, wB - 0.1, wB + 0.02, yb - 0.15, yb + 0.12, TC.timber, 4, false); }
      for (const u of [u0, u1]) { lbox(u - 0.12, u + 0.12, wF - 0.02, wF + 0.1, B0, eave, TC.timber, 4, false); lbox(u - 0.12, u + 0.12, wB - 0.1, wB + 0.02, B0, eave, TC.timber, 4, false); }
    }
    if (st.quoins) for (const u of [u0, u1]) for (let yq = Y + 0.8; yq < eave - 0.3; yq += 0.6) lbox(u - 0.06, u + 0.06, w1 - 0.3 + ((yq * 10 | 0) % 2) * 0.15, w1 + 0.06, yq, yq + 0.3, TC.quoin, 0, false);
    // the roof
    const spanU = u1 - u0, spanW = w1 - w0 + 2 * jet, rt = st.roofType ?? 'gable', rh = st.rh ?? Math.min(6, Math.max(2.6, Math.min(spanU, spanW) * 0.36));
    let top = eave;
    if (rt === 'gable') { lgable(u0 - 0.5, u1 + 0.5, wB - 0.6, wF + 0.6, eave, eave + rh, st.roof, st.wall, 'u', 2, st.tex || 3); lbox(u0 - 0.55, u1 + 0.55, wF + 0.5, wF + 0.65, eave - 0.2, eave + 0.02, TC.timber, 4, false); top = eave + rh; }
    else if (rt === 'gableFront') { lgable(u0 - 0.6, u1 + 0.6, wB - 0.5, wF + 0.5, eave, eave + rh, st.roof, st.wall, 'w', 2, st.tex || 3); top = eave + rh; }
    else if (rt === 'pyramid') { lpyramid(u0 - 0.5, u1 + 0.5, wB - 0.5, wF + 0.5, eave, eave + rh * 1.2, st.roof); top = eave + rh * 1.2; }
    else { lbox(u0 - 0.2, u1 + 0.2, wB - 0.2, wF + 0.2, eave - 0.05, eave + 0.35, TC.quoin, 0); lbox(u0, u1, wB, wF, eave + 0.35, eave + 1.0, st.wall, st.tex); top = eave + 1; }   // flat: a parapet round the top
    if (rt !== 'flat') lbox(u0 + 0.6, u1 - 0.6, wB, wF, eave - 0.01, eave + 0.02, st.wall, st.tex, false);
    for (let i = 0; i < (st.chimneys ?? 1); i++) chimney(u0 + (i + 0.5) * spanU / (st.chimneys ?? 1) + (rnd(40 + i) - 0.5) * 1.5, w0 + spanW * 0.3, top - 0.6);
    // windows: front and back on every floor above the ground, sides where they face the open
    const every = st.windowEvery ?? 2.6, wo = { wide: st.winWide ?? 1.1, tall: st.winTall ?? 1.4, shutter: st.shutter, frame: st.winFrame ?? TC.timber };
    const bays = (a0, a1) => { const n = Math.max(1, Math.floor((a1 - a0) / every)); return Array.from({ length: n }, (_, i) => a0 + (i + 0.5) * (a1 - a0) / n); };
    if (st.plain) {                                                                      // skyline: a band of windows per floor, pilasters between
      for (let f = 1; f < floors; f++) { const yb = Y + f * FH + 0.8;
        for (const [face, at, a0, a1] of [['front', wF, u0, u1], ['back', wB, u0, u1], ['left', u0, wB, wF], ['right', u1, wB, wF]]) {
          P(face, at, a0 + 0.4, a1 - 0.4, 0, 0.08, yb, yb + 1.5, rnd(f * 7 + at) < 0.3 ? TC.glass : TC.glassDim, 6);
          for (const t of bays(a0, a1)) P(face, at, t - 0.25, t + 0.25, 0, 0.14, yb, yb + 1.5, st.wall, st.tex);
          P(face, at, a0, a1, 0, 0.2, yb - 0.2, yb, TC.quoin, 0); P(face, at, a0, a1, 0, 0.16, yb + 1.5, yb + 1.65, TC.quoin, 0);
        } }
      return { eave, top, wF, wB };
    }
    for (let f = arc ? 0 : 1; f < floors; f++) { const yb = (arc ? st.base : Y) + f * FH + 0.8;
      for (const t of bays(u0, u1)) { if (st.skipFront?.(t)) { win('back', wB, t, yb, wo); continue; } win('front', wF, t, yb, { ...wo, flowers: st.flowers && !(st.balconyFloor === f) }); win('back', wB, t, yb, wo); }
      if (sideOpen('left')) for (const t of bays(w0, w1)) win('left', u0, t, yb, wo);
      if (sideOpen('right')) for (const t of bays(w0, w1)) win('right', u1, t, yb, wo);
    }
    if (!arc) win('back', w0, (u0 + u1) / 2, Y + 1.3, wo);
    return { eave, top, wF, wB, every, bays, wo };
  };

  const shutter = pick(TC.shutters, 5), roofC = pick(TC.roofs, 3);
  const extraFloors = (layers - 1) * 3;
  const sb = WD >= 20 ? 2 : 1.4;                                                          // set back from the street: room for steps, a doorstep

  // ================= houses =================
  if (part === 'H') {
    const u0 = 0.5, u1 = UW - 0.5, w0 = 0.6, w1 = WD - sb;
    if (v === 8) {                                                                        // row houses: one narrow house per ~5 m
      const n = Math.max(1, Math.round((u1 - u0) / 5)), bw = (u1 - u0) / n;
      for (let i = 0; i < n; i++) {
        const a0 = u0 + i * bw, a1 = a0 + bw, brick = rnd(60 + i) < 0.35, fl = 2 + Math.floor(rnd(70 + i) * 2) + extraFloors;
        const st = { wall: brick ? TC.brick : pick([TC.plaster, '#e8d4b8', '#f0e4d0', '#dcc8a8', '#e6d8c0'], 80 + i), tex: brick ? 5 : 3, frame: !brick, jetty: brick ? 0 : 0.3, floors: fl, roof: pick(TC.roofs, 90 + i), roofType: rnd(100 + i) < 0.6 ? 'gableFront' : 'gable', shutter: pick(TC.shutters, 110 + i), flowers: true, windowEvery: 2.2, chimneys: 1, quoins: brick };
        const r = block(a0 + 0.02, a1 - 0.02, w0, w1, st);
        door(w1, a0 + bw * (rnd(120 + i) < 0.5 ? 0.3 : 0.7));
        win('front', w1, a0 + bw * (rnd(120 + i) < 0.5 ? 0.72 : 0.28), Y + 1.3, { shutter: st.shutter, flowers: true });
        void r;
      }
      return;
    }
    const brick = v === 3 || v === 6, shop = v === 2, work = v === 4, tavern = v === 5, manor = v === 6, towerH = v === 7;
    const st = {
      wall: brick ? (manor ? '#c08060' : TC.brick) : work ? TC.plaster : TC.plaster, tex: brick ? 5 : 3, frame: !brick, jetty: brick ? 0 : 0.35,
      groundWall: work ? TC.plinth : undefined, groundTex: work ? 0 : undefined,
      floors: (v === 3 ? 3 : towerH ? 3 : manor ? 2 : 2) + extraFloors, roof: brick ? TC.roofs[2] : roofC,
      roofType: towerH ? 'gableFront' : manor ? 'gable' : (UW < WD ? 'gableFront' : (rnd(5) < 0.25 && UW === WD ? 'gableFront' : 'gable')),
      shutter, flowers: true, quoins: brick, chimneys: Math.max(1, Math.round(UW / 8)), winWide: brick ? 0.9 : 1.1, winTall: brick ? 1.7 : 1.4,
      balconyFloor: v === 3 || tavern ? 1 : -1,
      skipFront: towerH ? t => t > u1 - 3.4 : null,                                       // (the turret stands in front of those bays)
    };
    const r = block(u0, u1, w0, w1, st), mid = UW / 2;
    // ground floor front: doors and windows across the width
    if (shop) {
      const n = Math.max(1, Math.round(UW / 10));
      for (let i = 0; i < n; i++) {
        const a0 = u0 + i * (u1 - u0) / n, a1 = a0 + (u1 - u0) / n, cl = pick(TC.awning, 9 + i);
        door(w1, a1 - 2.2); win('front', w1, a0 + (a1 - a0 - 2.2) / 2, Y + 1.2, { wide: Math.max(1.6, a1 - a0 - 4.6), tall: 1.7 });
        const nn = Math.max(4, Math.round((a1 - a0) / 1.1)); for (let j = 0; j < nn; j++) { const s0 = a0 + 0.1 + j * (a1 - a0 - 0.2) / nn; lwedge(s0, s0 + (a1 - a0 - 0.2) / nn, w1, w1 + 1.6, Y + 2.7, Y + 3.4, cl[j % 2], '-w'); }
        lbox(a1 - 0.4, a1 - 0.2, w1, w1 + 1.3, Y + 4.3, Y + 4.4, TC.iron, 6, false); lbox(a1 - 0.33, a1 - 0.27, w1 + 0.55, w1 + 1.25, Y + 3.5, Y + 4.25, pick(['#d8b048', '#a03a32', '#3a6aa8', '#3f8a5a'], 13 + i), 4, false);
      }
      { const [bx, bz] = H(1.2, w1 + 0.7); barrel(bx, bz); const [cx2, cz2] = H(UW - 0.9, w1 + 0.7); crate(cx2, cz2, 0.3); }
    } else if (manor) {
      door(w1, mid, { wide: 1.8, tall: 2.6 });
      for (const t of r.bays(u0, u1)) if (Math.abs(t - mid) > 1.6) win('front', w1, t, Y + 1.3, { shutter, wide: 0.9, tall: 1.7, flowers: true });
      for (const s of [-1, 1]) column(mid + s * 1.5, w1 + 1.1, Y, Y + 3.6, 0.22);                 // the porch: two columns and a little pediment
      lbox(mid - 2.0, mid + 2.0, w1, w1 + 1.5, Y + 3.6, Y + 3.85, TC.quoin);
      lgable(mid - 2.1, mid + 2.1, w1, w1 + 1.6, Y + 3.85, Y + 4.9, TC.roofs[2], TC.quoin, 'w');
      lgable(mid - 2.5, mid + 2.5, w1 - 3, r.wF + 0.6, r.eave, r.eave + 3.2, st.roof, st.wall, 'w', 2, st.tex);   // a cross gable over the middle bay
      for (const t of r.bays(u0, u1)) if (Math.abs(t - mid) > 3) {                        // dormers on the roof's front slope
        const [dx, dz] = H(t, w1 - 1.2); void dx; void dz;
        lbox(t - 0.7, t + 0.7, w1 - 2.2, w1 - 0.6, r.eave, r.eave + 1.6, st.wall, st.tex); lgable(t - 0.85, t + 0.85, w1 - 2.3, w1 - 0.4, r.eave + 1.6, r.eave + 2.4, st.roof, st.wall, 'w');
        win('front', w1 - 0.6, t, r.eave + 0.15, { wide: 0.7, tall: 1.0 });
      }
    } else {
      const n = Math.max(1, Math.round(UW / 9));
      for (let i = 0; i < n; i++) {
        const a0 = u0 + i * (u1 - u0) / n, a1 = a0 + (u1 - u0) / n, dm = (a0 + a1) / 2;
        door(w1, dm, { light: work ? '#7fe0ff' : LAMP });
        for (const t of [a0 + (dm - a0) * 0.45, dm + (a1 - dm) * 0.55]) if (a1 - a0 > 5 && !st.skipFront?.(t)) win('front', w1, t, Y + 1.3, { shutter, flowers: true });
      }
    }
    if (v === 3 || tavern) {                                                            // a balcony (townhouse) / a gallery across the front (tavern)
      const yb = Y + (st.FH ?? 3.2), a0 = tavern ? u0 + 0.3 : mid - 1.8, a1 = tavern ? u1 - 0.3 : mid + 1.8;
      lbox(a0, a1, w1, w1 + 1.0, yb - 0.2, yb, tavern ? TC.timber : TC.quoin, tavern ? 4 : 0);
      for (let u = a0 + 0.05; u <= a1 - 0.04; u += 0.35) lbox(u - 0.03, u + 0.03, w1 + 0.9, w1 + 0.96, yb, yb + 0.9, tavern ? TC.timber : TC.iron, tavern ? 4 : 6, false);
      lbox(a0, a1, w1 + 0.88, w1 + 1.0, yb + 0.9, yb + 0.98, tavern ? TC.timber : TC.iron, tavern ? 4 : 6, false);
      if (tavern) for (const u of [a0 + 0.1, mid, a1 - 0.1]) lbox(u - 0.1, u + 0.1, w1 + 0.8, w1 + 1.0, Y, yb - 0.2, TC.timber, 4);
    }
    if (tavern) {                                                                         // the big sign, benches and barrels outside
      lbox(mid - 0.1, mid + 0.1, w1, w1 + 1.6, Y + 5.6, Y + 5.75, TC.iron, 6, false);
      lbox(mid - 0.9, mid + 0.9, w1 + 1.0, w1 + 1.1, Y + 4.3, Y + 5.5, '#7a3a22', 4, false); lbox(mid - 0.6, mid + 0.6, w1 + 1.08, w1 + 1.12, Y + 4.6, Y + 5.2, '#d8b048', 6, false);
      { const [b1x, b1z] = H(u0 + 1.5, w1 + 0.7); bench(b1x, b1z, acrossAxis); const [b2x, b2z] = H(u1 - 1.5, w1 + 0.7); bench(b2x, b2z, acrossAxis); const [kx, kz] = H(u1 - 0.6, w1 + 0.5); barrel(kx, kz); }
    }
    if (work) {                                                                           // copper pipes, a crystal tank, a crystal on the roof
      for (const u of [u0 + 0.35, u1 - 0.35]) { lbox(u - 0.1, u + 0.1, w1 + 0.02, w1 + 0.24, Y + 0.3, r.eave + 0.6, TC.copper, 6, false); for (let yy = Y + 1; yy < r.eave; yy += 1.6) lbox(u - 0.16, u + 0.16, w1, w1 + 0.3, yy, yy + 0.12, TC.iron, 6, false); }
      const [tx, tz] = H(u0 + 1.7, w1 + 0.6);
      box(tx - 0.6, Y, tz - 0.45, tx + 0.6, Y + 0.4, tz + 0.45, TC.iron, { tex: 6 });
      trim(tx - 0.42, Y + 0.45, tz - 0.28, tx + 0.42, Y + 1.75, tz + 0.28, '#7fd8ff', { tex: 6 }); trim(tx - 0.55, Y + 1.8, tz - 0.4, tx + 0.55, Y + 1.95, tz + 0.4, TC.copper, { tex: 6 }); lamp(tx, Y + 1.1, tz, '#7fe0ff');
      const [rx, rz] = H(mid, (w0 + w1) / 2); trim(rx - 0.12, r.top, rz - 0.12, rx + 0.12, r.top + 0.9, rz + 0.12, TC.iron, { tex: 6 }); lamp(rx, r.top + 1.2, rz, pick(DUST, 21));
    }
    if (towerH) {                                                                         // a turret on the front corner: a tall square tower with a pointed roof
      // it stands proud of everything on the house's front and side (jetty, sills, flower boxes), so no faces meet
      const tu = u1 - 1.2, tw = r.wF + 0.5 - 1.6, top = r.eave + 3.5;
      lbox(tu - 1.6, tu + 1.6, tw - 1.6, tw + 1.6, Y, top, st.wall, st.tex);
      lbox(tu - 1.75, tu + 1.75, tw - 1.75, tw + 1.75, top - 0.25, top, TC.quoin);
      lpyramid(tu - 1.9, tu + 1.9, tw - 1.9, tw + 1.9, top, top + 4.2, st.roof);
      for (let f = 1; f < st.floors + 1; f++) win('front', tw + 1.6, tu, Y + f * 3.2 + 0.8, { wide: 0.7, tall: 1.4 });
      const [fx, fz] = H(tu, tw); trim(fx - 0.08, top + 4.2, fz - 0.08, fx + 0.08, top + 5.0, fz + 0.08, TC.iron, { tex: 6 });
    }
    return;
  }

  // ================= landmarks =================
  if (part === 'L') {
    const stone = '#d6c8a8', u0 = 0.8, u1 = UW - 0.8, w0 = 0.8, w1 = WD - (v === 4 ? 1.2 : 4), mid = UW / 2;
    if (v === 2) {                                                                        // temple: a stepped base, columns all round, a pyramid roof
      const s = [[0.4, 0], [0.4, 0.8], [0.4, 1.6]];
      for (const [h, inset] of s) lbox(inset, UW - inset, inset, WD - inset, Y + s.indexOf(s.find(q => q[1] === inset)) * 0.4, Y + (s.indexOf(s.find(q => q[1] === inset)) + 1) * 0.4, stone, 8);
      const Yb = Y + 1.2, a0 = 2.4, a1 = UW - 2.4, b0 = 2.4, b1 = WD - 2.4, ch = 6 + extraFloors * 1.5;
      lbox(a0 + 1.6, a1 - 1.6, b0 + 1.6, b1 - 1.6, Yb, Yb + ch, stone, 0);                  // the cella
      for (let u = a0; u <= a1 + 0.01; u += (a1 - a0) / Math.max(2, Math.round((a1 - a0) / 2.6))) { column(u, b0, Yb, Yb + ch, 0.32, stone); column(u, b1, Yb, Yb + ch, 0.32, stone); }
      for (let w = b0; w <= b1 + 0.01; w += (b1 - b0) / Math.max(2, Math.round((b1 - b0) / 2.6))) { column(a0, w, Yb, Yb + ch, 0.32, stone); column(a1, w, Yb, Yb + ch, 0.32, stone); }
      lbox(a0 - 0.5, a1 + 0.5, b0 - 0.5, b1 + 0.5, Yb + ch, Yb + ch + 0.7, TC.quoin);
      lpyramid(a0 - 0.8, a1 + 0.8, b0 - 0.8, b1 + 0.8, Yb + ch + 0.7, Yb + ch + 0.7 + Math.min(a1 - a0, b1 - b0) * 0.35, '#7a8aa0');
      door(b1 - 1.6, mid, { wide: 2.4, tall: 3.6, raised: 1.2, lantern: false, col: '#5a3a28', frame: stone });
      const [lx, lz] = H(mid, b1 - 0.6); lamp(lx, Yb + 2.2, lz, pick(DUST, 31)); lamp(...H(mid, (b0 + b1) / 2).flatMap((q, i) => i ? [q] : [q, Yb + ch + 0.7 + Math.min(a1 - a0, b1 - b0) * 0.35 + 0.6]), pick(DUST, 33));
      return;
    }
    if (v === 4) {                                                                        // clock tower
      const tu0 = Math.max(0.8, mid - 3), tu1 = Math.min(UW - 0.8, mid + 3), tw0 = Math.max(0.8, WD / 2 - 3), tw1 = Math.min(WD - 0.8, WD / 2 + 3);
      const top = Y + 10 * layers + 6;
      lbox(tu0 - 0.3, tu1 + 0.3, tw0 - 0.3, tw1 + 0.3, Y, Y + 1.2, TC.plinth);
      lbox(tu0, tu1, tw0, tw1, Y + 1.2, top, stone, 0);
      for (let yq = Y + 1.2; yq < top - 0.3; yq += 0.7) for (const [u, w] of [[tu0, tw0], [tu1, tw0], [tu0, tw1], [tu1, tw1]]) lbox(u - 0.12, u + 0.12, w - 0.12, w + 0.12, yq, yq + 0.35, TC.quoin, 0, false);
      for (let f = 0; f < layers * 3; f++) win('front', tw1, mid, Y + 2 + f * 3.2, { wide: 0.6, tall: 1.6, frame: stone });
      const cy = top - 2.6;                                                               // a clock face on each side
      for (const [face, at, t] of [['front', tw1, mid], ['back', tw0, mid], ['left', tu0, WD / 2], ['right', tu1, WD / 2]]) {
        P(face, at, t - 1.4, t + 1.4, 0, 0.08, cy - 1.4, cy + 1.4, TC.quoin, 0); P(face, at, t - 1.15, t + 1.15, 0.05, 0.12, cy - 1.15, cy + 1.15, '#f2ead8', 6);
        P(face, at, t - 0.06, t + 0.06, 0.1, 0.16, cy - 0.1, cy + 0.85, '#1a1612', 6); P(face, at, t - 0.06, t + 0.6, 0.1, 0.16, cy - 0.06, cy + 0.06, '#1a1612', 6);
        const [lx, lz] = outPt(face, at, t, 0.5); void lx; void lz;
      }
      lbox(tu0 - 0.5, tu1 + 0.5, tw0 - 0.5, tw1 + 0.5, top, top + 0.4, TC.quoin);
      lpyramid(tu0 - 0.6, tu1 + 0.6, tw0 - 0.6, tw1 + 0.6, top + 0.4, top + 7, '#5f6f8f');
      const [sx, sz] = H(mid, WD / 2); trim(sx - 0.1, top + 7, sz - 0.1, sx + 0.1, top + 8.2, sz + 0.1, TC.iron, { tex: 6 }); lamp(sx, top + 8.6, sz, pick(DUST, 41));
      door(tw1, mid, { wide: 1.6, tall: 2.6, raised: 1.2, frame: stone });
      return;
    }
    if (v === 3) {                                                                        // market hall: an open arcade with a timber hall above
      const FH = 4.2, top1 = Y + FH;
      lbox(u0, u1, w0, w1 + 2.6, Y, Y + 0.2, TC.plaza, 8);
      const nu = Math.max(2, Math.round((u1 - u0) / 3.2)), nw = Math.max(2, Math.round((w1 + 2.6 - w0) / 3.2));
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nw; j++) if (i === 0 || j === 0 || i === nu || j === nw || (i % 2 === 0 && j % 2 === 0)) column(u0 + i * (u1 - u0) / nu, w0 + j * (w1 + 2.6 - w0) / nw, Y + 0.2, top1, 0.3, '#a89070');
      lbox(u0 - 0.2, u1 + 0.2, w0 - 0.2, w1 + 2.8, top1, top1 + 0.4, TC.timber, 4);
      block(u0, u1, w0, w1 + 2.6, { wall: TC.plaster, tex: 3, frame: true, floors: 1 + extraFloors, FH: 3.6, roof: roofC, roofType: 'gable', shutter, flowers: true, chimneys: 0, arcade: true, base: top1 + 0.4 });
      for (const [u, w] of [[u0 + 2, w1 + 3.4], [u1 - 2, w1 + 3.4]]) { const [x2, z2] = H(u, w); crate(x2, z2, 0.35); }
      return;
    }
    // guild hall: a tall stone hall, a columned portico with a pediment, banners, a crystal on the roof
    const st = { wall: stone, tex: 0, frame: false, floors: 3 + extraFloors, FH: 3.6, roof: '#5f6f8f', roofType: 'gable', shutter: undefined, flowers: false, quoins: true, chimneys: 2, winWide: 1.0, winTall: 2.2, winFrame: TC.quoin, windowEvery: 3.2 };
    const r = block(u0, u1, w0, w1, st);
    const pw = Math.min(10, (u1 - u0) * 0.5), pd = 3.2;                                   // the portico
    for (let i = 0; i < 4; i++) lbox(mid - pw / 2 - 0.6 - i * 0.0, mid + pw / 2 + 0.6, w1 + pd + 0.4 - i * 0.4 + 0.0, w1 + pd + 0.8 - i * 0.4, Y, Y + (4 - i) * 0.2, stone, 8);
    lbox(mid - pw / 2, mid + pw / 2, w1, w1 + pd, Y, Y + 0.8, stone, 8);
    for (let i = 0; i < 4; i++) column(mid - pw / 2 + 0.5 + i * (pw - 1) / 3, w1 + pd - 0.5, Y + 0.8, Y + 7.6, 0.34, stone);
    lbox(mid - pw / 2 - 0.2, mid + pw / 2 + 0.2, w1 - 0.1, w1 + pd + 0.2, Y + 7.6, Y + 8.4, TC.quoin);
    lgable(mid - pw / 2 - 0.3, mid + pw / 2 + 0.3, w1 - 0.2, w1 + pd + 0.3, Y + 8.4, Y + 10.2, st.roof, stone, 'w');
    door(w1, mid, { wide: 2.2, tall: 3.4, lantern: false, col: '#5a3a28', frame: stone });
    for (const s of [-1, 1]) { const [lx, lz] = H(mid + s * 1.6, w1 + 0.4); trim(lx - 0.06, Y + 2.6, lz - 0.06, lx + 0.06, Y + 3.6, lz + 0.06, TC.iron, { tex: 6 }); lamp(lx, Y + 3.1, lz, LAMP); }
    for (const t of r.bays(u0, u1)) if (Math.abs(t - mid) > pw / 2 + 0.8) { win('front', w1, t, Y + 1.4, { wide: 1.0, tall: 2.0, frame: TC.quoin }); banner(w1, t, r.eave - 0.4, 3.2, pick(['#2a4a8a', '#8a2a2a', '#2a6a4a', '#6a2a7a'], 51)); }
    const [cxr, czr] = H(mid, (w0 + w1) / 2); trim(cxr - 0.15, r.top - 0.3, czr - 0.15, cxr + 0.15, r.top + 1.6, czr + 0.15, TC.iron, { tex: 6 }); lamp(cxr, r.top + 2.0, czr, pick(DUST, 53));
    return;
  }

  // ================= skyline =================
  if (part === 'Y') {
    const floors = (v === 2 ? 7 : v === 3 ? 5 : 4) + extraFloors, u0 = 0.4, u1 = UW - 0.4, w0 = 0.4, w1 = WD - 0.6;
    const wall = pick(['#d8c8a8', '#c8b090', '#b89878', '#e0d0b0', TC.brick], 61), brick = wall === TC.brick;
    if (v === 1 && UW >= 8) {                                                             // a row of tall narrow fronts, each its own height and colour
      const n = Math.max(1, Math.round((u1 - u0) / 5)), bw = (u1 - u0) / n;
      for (let i = 0; i < n; i++) block(u0 + i * bw + 0.02, u0 + (i + 1) * bw - 0.02, w0, w1, { wall: pick(['#d8c8a8', '#c8b090', '#e0d0b0', '#cbb898'], 70 + i), tex: 3, floors: floors + Math.floor(rnd(72 + i) * 3) - 1, roof: pick(TC.roofs, 74 + i), roofType: rnd(76 + i) < 0.5 ? 'gableFront' : 'gable', plain: true, chimneys: 1 });
      return;
    }
    block(u0, u1, w0, w1, { wall, tex: brick ? 5 : 3, floors, roof: pick(TC.roofs, 63), roofType: v === 2 ? 'pyramid' : v === 3 ? 'flat' : 'gable', plain: true, chimneys: v === 3 ? 3 : 1, quoins: true });
    door(w1, UW / 2, { lantern: false });
    return;
  }
}
