// src/rpg/springBones.js — spring-bone chains for loose garment parts (skirts, tunic hems).
// The same approach games use for skirts, coat tails, capes, ponytails and tails.
//
// A ring of chains hangs from the waistband. Each joint follows where the skeleton carries
// it (the skinned shape) with inertia and drag, keeps its distance to the joint above, and is
// pushed out of the legs. The fabric is the skinned shape plus each joint's offset, blended
// smoothly between joints, so it cannot tear, and when the body is still the springs settle
// to rest exactly. Physics runs at a fixed 60 steps per second.

const STEP = 1 / 60;

export function makeSpringSkirt(rings, seg, { chains = 28, joints = 7 } = {}) {
  const per = seg / chains;                                        // grid columns per chain
  const rows = Array.from({ length: joints }, (_, i) => Math.round((i * rings) / (joints - 1)));
  const count = chains * joints;
  const vid = (c, i) => rows[i] * seg + c * per;                   // the grid vertex each joint sits on
  const p = new Float32Array(count * 3), prev = new Float32Array(count * 3), tgt = new Float32Array(count * 3);
  const len = new Float32Array(count), off = new Float32Array(count * 3);
  let acc = 0, acc3 = null;

  // Restart at rest on shape T (positions of every grid vertex).
  function reset(T) {
    for (let c = 0; c < chains; c++) for (let i = 0; i < joints; i++) {
      const j = c * joints + i, v = vid(c, i) * 3;
      for (let a = 0; a < 3; a++) p[j * 3 + a] = prev[j * 3 + a] = T[v + a];
      if (i > 0) { const q = (j - 1) * 3; len[j] = Math.hypot(p[j * 3] - p[q], p[j * 3 + 1] - p[q + 1], p[j * 3 + 2] - p[q + 2]); }
    }
    off.fill(0); acc = 0;
  }

  // Advance by dt seconds. T: the skinned shape this frame. caps: limb capsules.
  // settings: stiffness (pull toward the skinned shape per step), drag (0..1).
  // accel: the body's own acceleration in the character's space (speeding up, stopping, landing): the cloth lags it
  function step(dt, T, caps, { stiffness = 0.12, drag = 0.35, accel = null } = {}) {
    acc3 = accel;
    for (let c = 0; c < chains; c++) for (let i = 0; i < joints; i++) {
      const j = (c * joints + i) * 3, v = vid(c, i) * 3;
      tgt[j] = T[v]; tgt[j + 1] = T[v + 1]; tgt[j + 2] = T[v + 2];
    }
    acc = Math.min(acc + dt, STEP * 4);
    while (acc >= STEP) { acc -= STEP; tick(caps, stiffness, drag); }
    for (let k = 0; k < count * 3; k++) off[k] = p[k] - tgt[k];
  }

  function tick(caps, stiffness, drag) {
    // the center of the waistband, for pushing cloth outward off the legs
    let cx = 0, cz = 0;
    for (let c = 0; c < chains; c++) { cx += tgt[c * joints * 3]; cz += tgt[c * joints * 3 + 2]; }
    cx /= chains; cz /= chains;
    for (let c = 0; c < chains; c++) for (let i = 0; i < joints; i++) {
      const j = c * joints + i, o = j * 3;
      if (i === 0) { for (let a = 0; a < 3; a++) p[o + a] = prev[o + a] = tgt[o + a]; continue; }   // waistband: on the body
      const lag = acc3 ? -STEP * STEP * 0.6 * (i / (joints - 1)) : 0;   // (lower down the hem, more lag)
      for (let a = 0; a < 3; a++) {
        const cur = p[o + a];
        p[o + a] = cur + (cur - prev[o + a]) * (1 - drag) + (tgt[o + a] - cur) * stiffness + (acc3 ? acc3[a] * lag : 0);
        prev[o + a] = cur;
      }
      // keep the distance to the joint above (a little give, so it never fights the skinned shape)
      const q = o - 3, dx = p[o] - p[q], dy = p[o + 1] - p[q + 1], dz = p[o + 2] - p[q + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6, L = Math.min(Math.max(d, len[j] * 0.92), len[j] * 1.08);
      p[o] = p[q] + dx / d * L; p[o + 1] = p[q + 1] + dy / d * L; p[o + 2] = p[q + 2] + dz / d * L;
      for (const cap of caps) pushOut(o, cap, cx, cz);
      // settle: tiny leftover motion stops completely, so a still character's clothes are still
      if (Math.abs(p[o] - prev[o]) + Math.abs(p[o + 1] - prev[o + 1]) + Math.abs(p[o + 2] - prev[o + 2]) < 1e-5 &&
          Math.abs(p[o] - tgt[o]) + Math.abs(p[o + 1] - tgt[o + 1]) + Math.abs(p[o + 2] - tgt[o + 2]) < 1e-3) {
        for (let a = 0; a < 3; a++) p[o + a] = prev[o + a] = tgt[o + a];
      }
    }
  }

  // One-sided capsule push: legs move cloth outward from the body's center, arms inward.
  function pushOut(o, cap, cx, cz) {
    const [ax, ay, az] = cap.a, bx = cap.b[0] - ax, by = cap.b[1] - ay, bz = cap.b[2] - az;
    const L = Math.hypot(bx, by, bz) || 1e-6, dx = bx / L, dy = by / L, dz = bz / L;
    const px = p[o] - ax, py = p[o + 1] - ay, pz = p[o + 2] - az;
    const t = Math.max(0, Math.min(L, px * dx + py * dy + pz * dz));
    const r = cap.r + ((cap.r2 ?? cap.r) - cap.r) * (t / L);
    const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t, d2 = qx * qx + qy * qy + qz * qz;
    if (d2 >= r * r) return;
    const sgn = cap.inward ? -1 : 1;
    let ux = (p[o] - cx) * sgn, uz = (p[o + 2] - cz) * sgn;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const ud = ux * dx + uz * dz, upx = ux - dx * ud, upy = -dy * ud, upz = uz - dz * ud;
    const a2 = upx * upx + upy * upy + upz * upz;
    if (a2 < 0.04) { const d = Math.sqrt(d2) || 1e-6, f = (r - d) / d; p[o] += qx * f; p[o + 1] += qy * f; p[o + 2] += qz * f; return; }
    const b = qx * upx + qy * upy + qz * upz, s = (-b + Math.sqrt(Math.max(0, b * b - a2 * (d2 - r * r)))) / a2;
    p[o] += ux * s; p[o + 2] += uz * s;
  }

  // Fabric = skinned shape + joint offsets, blended around the ring and down the length.
  // loose[r] (0..1 per ring) scales the swing: none where the fabric sits on the body.
  function apply(T, out, loose) {
    for (let r = 0; r <= rings; r++) {
      let i0 = 0; while (i0 < joints - 2 && rows[i0 + 1] < r) i0++;
      const wi = (r - rows[i0]) / (rows[i0 + 1] - rows[i0]), lr = loose ? loose[r] : 1;
      for (let k = 0; k < seg; k++) {
        const c0 = Math.floor(k / per), c1 = (c0 + 1) % chains, wc = (k - c0 * per) / per;
        const v = (r * seg + k) * 3;
        for (let a = 0; a < 3; a++) {
          const top = off[(c0 * joints + i0) * 3 + a] * (1 - wc) + off[(c1 * joints + i0) * 3 + a] * wc;
          const bot = off[(c0 * joints + i0 + 1) * 3 + a] * (1 - wc) + off[(c1 * joints + i0 + 1) * 3 + a] * wc;
          out[v + a] = T[v + a] + (top * (1 - wi) + bot * wi) * lr;
        }
      }
    }
  }

  return { reset, step, apply };
}

// ---------------------------------------------------------------------------------------
// Hair physics with guide strands (standard practice for card hair). One card in `stride`
// is a guide: its points have inertia, gravity and drag, keep their spacing, and collide
// with the head and upper body. Every card follows its two nearest guides. Roots are fixed
// and strands loosen toward the tips; motion settles completely when the head is still.
// Works in the character's local space; results are offsets added on top of head skinning.
// ---------------------------------------------------------------------------------------
export function makeHairSim(cards, { stride = 6 } = {}) {
  const free = cards.filter(c => c.loose > 0 && c.points.length > 2);
  const guides = free.filter((_, i) => i % stride === 0);
  const G = guides.length, n = guides[0] ? guides[0].points.length : 0;
  const rest = new Float32Array(G * n * 3), p = new Float32Array(G * n * 3), prev = new Float32Array(G * n * 3), tgt = new Float32Array(G * n * 3);
  const seg = new Float32Array(G * n), off = new Float32Array(G * n * 3);
  guides.forEach((g, k) => g.points.forEach((q, s) => {
    rest.set(q, (k * n + s) * 3);
    if (s) seg[k * n + s] = Math.hypot(q[0] - g.points[s - 1][0], q[1] - g.points[s - 1][1], q[2] - g.points[s - 1][2]);
  }));
  // how free each point is: fixed for the first few centimeters, fully free after ~13 cm
  const looseAt = new Float32Array(G * n);
  guides.forEach((g, k) => { let L = 0; for (let s = 0; s < n; s++) { if (s) L += seg[k * n + s]; const u = Math.max(0, Math.min(1, (L - 0.3) / 1.0)); looseAt[k * n + s] = u * u * (3 - 2 * u); } });
  // every card follows its two nearest guides (by root position)
  const follow = cards.map(c => {
    if (!(c.loose > 0) || !G) return null;
    const r = c.points[0], d = guides.map((g, k) => [k, Math.hypot(g.points[0][0] - r[0], g.points[0][1] - r[1], g.points[0][2] - r[2])]).sort((a, b) => a[1] - b[1]).slice(0, 2);
    const w0 = 1 / (d[0][1] + 0.05), w1 = d[1] ? 1 / (d[1][1] + 0.05) : 0;
    return { g0: d[0][0], g1: d[1] ? d[1][0] : d[0][0], w: w0 / (w0 + w1), n: c.points.length, first: c.first };
  });
  const lenOK = cards.every(c => c.points.length === n);
  let acc = 0; const STEP = 1 / 60;
  const tmp = [0, 0, 0];
  function reset() { p.set(rest); prev.set(rest); off.fill(0); acc = 0; }
  reset();

  // M: head skin matrix (rest -> now, 4x4 column-major). toHead/fromHead: for head collision.
  // caps: body capsules. head: { C, Rad } in rest space.
  function step(dt, M, Minv, caps, head) {
    if (!G) return;
    for (let i = 0; i < G * n; i++) { const o = i * 3; xf(M, rest, o, tgt, o); }
    acc = Math.min(acc + dt, STEP * 4);
    while (acc >= STEP) { acc -= STEP; tick(Minv, M, caps, head); }
    for (let i = 0; i < G * n * 3; i++) off[i] = p[i] - tgt[i];
  }
  const tt = [0, 0, 0];
  let headRef = null, MinvRef = null;
  function targetInSkull(o) {
    tt[0] = tgt[o]; tt[1] = tgt[o + 1]; tt[2] = tgt[o + 2]; xf(MinvRef, tt, 0, tt, 0);
    const h = headRef;
    return Math.hypot((tt[0] - h.C[0]) / (h.Rad[0] * 0.88), (tt[1] - h.C[1]) / (h.Rad[1] * 0.88), (tt[2] - h.C[2]) / (h.Rad[2] * 0.88)) < 1;
  }
  function tick(Minv, M, caps, head) {
    headRef = head; MinvRef = Minv;
    // no extra gravity: the styled shape already hangs under gravity, so the springs pull
    // toward it and the hair comes to rest exactly in its style
    const drag = 0.12;
    for (let k = 0; k < G; k++) for (let s = 0; s < n; s++) {
      const i = k * n + s, o = i * 3, l = looseAt[i];
      if (l <= 0) { for (let a = 0; a < 3; a++) p[o + a] = prev[o + a] = tgt[o + a]; continue; }
      const stiff = 0.05 + 0.5 * (1 - l);                      // stiffer near the roots
      for (let a = 0; a < 3; a++) {
        const cur = p[o + a];
        p[o + a] = cur + (cur - prev[o + a]) * (1 - drag) + (tgt[o + a] - cur) * stiff;
        prev[o + a] = cur;
      }
      // keep the spacing to the point above
      const q = o - 3, dx = p[o] - p[q], dy = p[o + 1] - p[q + 1], dz = p[o + 2] - p[q + 2], d = Math.hypot(dx, dy, dz) || 1e-6, L = seg[i];
      p[o] = p[q] + dx / d * L; p[o + 1] = p[q + 1] + dy / d * L; p[o + 2] = p[q + 2] + dz / d * L;
      // collide: the skull (an ellipsoid in the head's own space), then neck, shoulders and back
      tmp[0] = p[o]; tmp[1] = p[o + 1]; tmp[2] = p[o + 2]; xf(Minv, tmp, 0, tmp, 0);
      const ex = (tmp[0] - head.C[0]) / (head.Rad[0] * 0.88), ey = (tmp[1] - head.C[1]) / (head.Rad[1] * 0.88), ez = (tmp[2] - head.C[2]) / (head.Rad[2] * 0.88), ed = Math.hypot(ex, ey, ez);
      if (ed < 1 && !targetInSkull(o)) { tmp[0] = head.C[0] + (tmp[0] - head.C[0]) / ed; tmp[1] = head.C[1] + (tmp[1] - head.C[1]) / ed; tmp[2] = head.C[2] + (tmp[2] - head.C[2]) / ed; xf(M, tmp, 0, tmp, 0); p[o] = tmp[0]; p[o + 1] = tmp[1]; p[o + 2] = tmp[2]; }
      // only push out of a body part if the styled hair isn't resting there already
      for (const c of caps) if (!inside(tgt, o, c)) pushCapsule(p, o, c);
      // settle completely when nearly still
      if (Math.abs(p[o] - prev[o]) + Math.abs(p[o + 1] - prev[o + 1]) + Math.abs(p[o + 2] - prev[o + 2]) < 2e-5) { prev[o] = p[o]; prev[o + 1] = p[o + 1]; prev[o + 2] = p[o + 2]; }
    }
  }
  // Write per-vertex offsets (in rest space: Minv applied as a rotation) for every card.
  function write(Minv, out) {
    if (!G || !lenOK) return;
    const r = [0, 0, 0];
    cards.forEach((c, ci) => {
      const f = follow[ci];
      for (let s = 0; s < c.points.length; s++) {
        const v = (c.first + s * 2) * 3;
        if (!f) { out[v] = out[v + 1] = out[v + 2] = out[v + 3] = out[v + 4] = out[v + 5] = 0; continue; }
        const a = (f.g0 * n + s) * 3, b = (f.g1 * n + s) * 3, w = f.w;
        r[0] = off[a] * w + off[b] * (1 - w); r[1] = off[a + 1] * w + off[b + 1] * (1 - w); r[2] = off[a + 2] * w + off[b + 2] * (1 - w);
        rot(Minv, r);
        out[v] = out[v + 3] = r[0]; out[v + 1] = out[v + 4] = r[1]; out[v + 2] = out[v + 5] = r[2];
      }
    });
  }
  return { reset, step, write, guides: G };
}
function xf(m, src, so, dst, d) {
  const x = src[so], y = src[so + 1], z = src[so + 2];
  dst[d] = m[0] * x + m[4] * y + m[8] * z + m[12]; dst[d + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; dst[d + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}
function rot(m, v) {
  const x = v[0], y = v[1], z = v[2];
  v[0] = m[0] * x + m[4] * y + m[8] * z; v[1] = m[1] * x + m[5] * y + m[9] * z; v[2] = m[2] * x + m[6] * y + m[10] * z;
}
function inside(p, o, cap) {
  const [ax, ay, az] = cap.a, bx = cap.b[0] - ax, by = cap.b[1] - ay, bz = cap.b[2] - az;
  const L2 = bx * bx + by * by + bz * bz || 1e-6, px = p[o] - ax, py = p[o + 1] - ay, pz = p[o + 2] - az;
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2)), r = cap.r + ((cap.r2 ?? cap.r) - cap.r) * t + 0.04;
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) < r;
}
function pushCapsule(p, o, cap) {
  const [ax, ay, az] = cap.a, bx = cap.b[0] - ax, by = cap.b[1] - ay, bz = cap.b[2] - az;
  const L2 = bx * bx + by * by + bz * bz || 1e-6;
  const px = p[o] - ax, py = p[o + 1] - ay, pz = p[o + 2] - az;
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2));
  const r = cap.r + ((cap.r2 ?? cap.r) - cap.r) * t + 0.04;
  const qx = px - bx * t, qy = py - by * t, qz = pz - bz * t, d = Math.hypot(qx, qy, qz);
  if (d < r && d > 1e-6) { const f = (r - d) / d; p[o] += qx * f; p[o + 1] += qy * f; p[o + 2] += qz * f; }
}
