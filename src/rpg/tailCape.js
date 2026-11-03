// src/rpg/tailCape.js — tails (a spring chain with a tube around it) and capes (pinned cloth).
// Both simulate in the character's own space (the viewer's root), in decimeters, and follow bones
// through 4x4 matrices from the viewer. Game-standard approach: a light Verlet sim with distance
// constraints, pulled toward a rest shape, colliding with simple capsules and a back height map.

// ---------------------------------------------------------------------------------
// Tails. Each style is a rest shape plus how it moves. Styles blend by weight, so a mixed
// or transforming body gets an in-between tail.
//   length (dm), radius at the base, tip (radius fraction at the tip), pitch0/pitch1 (radians,
//   how it angles down at the base and at the tip), curl (turns, spiral), stiff (pull to rest),
//   sway (side swish) and hz, fluff (fur jitter)
export const TAIL_STYLES = {
  reptile: { length: 9.5, radius: 0.62, tip: 0.06, pitch0: -0.75, pitch1: -0.15, curl: 0, stiff: 0.12, sway: 0.18, hz: 0.35, fluff: 0 },
  cat: { length: 7.5, radius: 0.24, tip: 0.65, pitch0: -1.25, pitch1: 0.55, curl: 0, stiff: 0.07, sway: 0.55, hz: 0.5, fluff: 0.12 },
  pig: { length: 1.8, radius: 0.12, tip: 0.55, pitch0: -0.2, pitch1: -0.2, curl: 1.6, stiff: 0.35, sway: 0.25, hz: 1.4, fluff: 0 },
};
const TAIL_N = 16, TAIL_RING = 10, TAIL_SUB = 2;                                  // joints, tube sides, tube rings per segment

export function makeTail(THREE) {
  const R = (TAIL_N - 1) * TAIL_SUB + 1;
  const pos = new Float32Array(R * TAIL_RING * 3), idx = [];
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < TAIL_RING; k++) {
    const a = r * TAIL_RING + k, b = r * TAIL_RING + (k + 1) % TAIL_RING;
    idx.push(a, b, a + TAIL_RING, b, b + TAIL_RING, a + TAIL_RING);
  }
  const tipC = R * TAIL_RING; idx.push(...Array.from({ length: TAIL_RING }, (_, k) => [(R - 1) * TAIL_RING + k, (R - 1) * TAIL_RING + (k + 1) % TAIL_RING, (R - 1) * TAIL_RING].flat()).flat());
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3); geo.setAttribute('position', attr); geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true;
  const P = new Float32Array(TAIL_N * 3), prev = new Float32Array(TAIL_N * 3), rest = new Float32Array(TAIL_N * 3);
  const st = { weights: {}, style: null, local: null, ready: false };
  const M = new THREE.Matrix4(), v = new THREE.Vector3();

  // blend the styles by weight (weights: { reptile: 0.7, cat: 0.3 })
  function blend(weights) {
    const tot = Object.values(weights).reduce((a, b) => a + b, 0);
    if (tot < 0.05) return null;
    const out = {};
    for (const k of Object.keys(TAIL_STYLES.reptile)) out[k] = Object.entries(weights).reduce((s, [id, w]) => s + TAIL_STYLES[id][k] * w / tot, 0);
    out.size = Math.min(1.3, tot);                                  // a partial transformation grows a shorter, thinner tail
    return out;
  }
  // rest shape in the anchor bone's space, at time t (the sway moves it)
  function restLocal(s, t) {
    const out = [], seg = s.length * (0.25 + 0.75 * s.size) / (TAIL_N - 1);
    let p = [0, 0, 0];
    out.push(p);
    for (let i = 1; i < TAIL_N; i++) {
      const u = i / (TAIL_N - 1), pitch = s.pitch0 + (s.pitch1 - s.pitch0) * u;
      const yaw = s.sway * Math.sin(t * Math.PI * 2 * s.hz - u * 2.2) * u;
      let d = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      if (s.curl) {                                                 // spiral: the direction turns around the backward axis
        const ph = s.curl * Math.PI * 2 * u, c = Math.cos(ph), sn = Math.sin(ph);
        d = [d[0] * c - d[1] * sn * 0.9 + sn * 0.6, d[1] * c + d[0] * sn + (1 - c) * 0.4, d[2] * 0.7];
      }
      const l = Math.hypot(...d); p = [p[0] + d[0] / l * seg, p[1] + d[1] / l * seg, p[2] + d[2] / l * seg]; out.push(p);
    }
    return out;
  }
  // set the style and the anchor (rootLocal: the tail base in the anchor bone's space)
  function configure(weights, anchorLocal) {
    st.style = blend(weights); st.local = anchorLocal; mesh.visible = !!st.style; st.ready = false;
  }
  // boneM: the anchor bone's matrix in the character's space
  function step(dt, t, boneM, caps) {
    if (!st.style) return;
    const s = st.style, shape = restLocal(s, t);
    for (let i = 0; i < TAIL_N; i++) {
      v.set(st.local[0] + shape[i][0], st.local[1] + shape[i][1], st.local[2] + shape[i][2]).applyMatrix4(boneM);
      rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z;
    }
    if (!st.ready) { P.set(rest); prev.set(rest); st.ready = true; }
    const seg = s.length * (0.25 + 0.75 * s.size) / (TAIL_N - 1), g = -25 * dt * dt;
    P[0] = rest[0]; P[1] = rest[1]; P[2] = rest[2];
    for (let i = 1; i < TAIL_N; i++) {
      // each joint is pulled toward where its parent says it should be (the rest shape, carried by the parent):
      // the tail holds its curve and only sags and swings a little
      const u = i / (TAIL_N - 1), k = Math.min(0.85, s.stiff * 3.2 * (1.3 - 0.6 * u));
      for (let c = 0; c < 3; c++) {
        const j = i * 3 + c, vel = (P[j] - prev[j]) * 0.9; prev[j] = P[j];
        P[j] += vel + (c === 1 ? g : 0);
        const target = P[j - 3] + (rest[j] - rest[j - 3]);
        P[j] += (target - P[j]) * k;
      }
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < TAIL_N; i++) {                                 // keep segment lengths (move the child only)
        const a = (i - 1) * 3, b = i * 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], l = Math.hypot(dx, dy, dz) || 1e-6;
        const f = seg / l; P[b] = P[a] + dx * f; P[b + 1] = P[a + 1] + dy * f; P[b + 2] = P[a + 2] + dz * f;
      }
      const rad = s.radius * Math.sqrt(s.size);
      for (let i = 5; i < TAIL_N; i++) pushOut(P, i, caps, rad * (1 - (1 - s.tip) * i / (TAIL_N - 1)));
    }
    buildTube(s);
  }
  // tube around a smoothed path, with a twist-free frame
  const path = [], tmpN = new THREE.Vector3(), tmpB = new THREE.Vector3(), tan = new THREE.Vector3();
  function buildTube(s) {
    path.length = 0;
    for (let i = 0; i < TAIL_N - 1; i++) for (let k = 0; k < TAIL_SUB; k++) path.push(catmull(P, i, k / TAIL_SUB));
    path.push([P[(TAIL_N - 1) * 3], P[(TAIL_N - 1) * 3 + 1], P[(TAIL_N - 1) * 3 + 2]]);
    const rad = s.radius * Math.sqrt(s.size);
    tmpN.set(0, 1, 0);
    for (let r = 0; r < path.length; r++) {
      const a = path[Math.max(0, r - 1)], b = path[Math.min(path.length - 1, r + 1)];
      tan.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      tmpN.addScaledVector(tan, -tmpN.dot(tan)).normalize();       // parallel transport: no sudden twists
      if (tmpN.lengthSq() < 1e-6) tmpN.set(1, 0, 0);
      tmpB.crossVectors(tan, tmpN);
      const u = r / (path.length - 1), rr = rad * (1 - (1 - s.tip) * Math.pow(u, 0.8)) * (u > 0.97 ? 0.4 : 1);
      for (let k = 0; k < TAIL_RING; k++) {
        const an = k / TAIL_RING * Math.PI * 2, j = (r * TAIL_RING + k) * 3;
        const fl = s.fluff ? 1 + s.fluff * (Math.sin(r * 12.9 + k * 7.3) * 0.5 + Math.sin(r * 4.1 - k * 3.7) * 0.5) : 1;
        const cx = Math.cos(an) * rr * fl, cy = Math.sin(an) * rr * fl;
        pos[j] = path[r][0] + tmpN.x * cx + tmpB.x * cy; pos[j + 1] = path[r][1] + tmpN.y * cx + tmpB.y * cy; pos[j + 2] = path[r][2] + tmpN.z * cx + tmpB.z * cy;
      }
    }
    attr.needsUpdate = true; geo.computeVertexNormals();
  }
  // the tail as capsules, so a cape can drape over it
  function capsules() {
    if (!st.style || !st.ready) return [];
    const s = st.style, rad = s.radius * Math.sqrt(s.size), out = [];
    for (let i = 0; i < TAIL_N - 2; i += 2) {
      const r0 = rad * (1 - (1 - s.tip) * i / (TAIL_N - 1)), r1 = rad * (1 - (1 - s.tip) * (i + 2) / (TAIL_N - 1));
      out.push({ a: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], b: [P[(i + 2) * 3], P[(i + 2) * 3 + 1], P[(i + 2) * 3 + 2]], r: r0, r2: r1 });
    }
    return out;
  }
  return { mesh, mat, configure, step, capsules, reset: () => { st.ready = false; }, get active() { return !!st.style; } };
}

function catmull(P, i, t) {
  const n = P.length / 3, g = k => Math.max(0, Math.min(n - 1, k)) * 3;
  const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2), t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map(o => 0.5 * ((2 * P[b + o]) + (-P[a + o] + P[c + o]) * t + (2 * P[a + o] - 5 * P[b + o] + 4 * P[c + o] - P[d + o]) * t2 + (-P[a + o] + 3 * P[b + o] - 3 * P[c + o] + P[d + o]) * t3));
}
// push point i of P out of the capsules (a, b, r, r2), by a margin
function pushOut(P, i, caps, margin) {
  const j = i * 3;
  for (const c of caps) {
    const ax = c.a[0], ay = c.a[1], az = c.a[2], bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
    const px = P[j] - ax, py = P[j + 1] - ay, pz = P[j + 2] - az, L2 = bx * bx + by * by + bz * bz || 1e-6;
    const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2));
    const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, d = Math.hypot(dx, dy, dz) || 1e-6;
    const r = c.r + (c.r2 - c.r) * t + margin;
    if (d < r) { const f = r / d; P[j] = ax + bx * t + dx * f; P[j + 1] = ay + by * t + dy * f; P[j + 2] = az + bz * t + dz * f; }
  }
}

// ---------------------------------------------------------------------------------
// Capes: a cloth grid pinned along the shoulders and upper back, hanging free below.
// Collides with the back of the body (a height map in the hip bone's space) and the leg capsules.
export const CAPE_STYLES = {
  cape: { length: 8.5, flare: 0.35, color: '#5a2a2a' },
  longcape: { length: 13.5, flare: 0.55, color: '#2c3550' },
};
export function makeCape(THREE, COLS = 13, ROWS = 22) {
  const n = COLS * ROWS, P = new Float32Array(n * 3), prev = new Float32Array(n * 3), rest = new Float32Array(n * 3);
  const idx = [], uv = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    uv.push(c / (COLS - 1), 1 - r / (ROWS - 1));
    if (r < ROWS - 1 && c < COLS - 1) { const a = r * COLS + c; idx.push(a, a + COLS, a + 1, a + 1, a + COLS, a + COLS + 1); }
  }
  const geo = new THREE.BufferGeometry(), attr = new THREE.BufferAttribute(P, 3);
  geo.setAttribute('position', attr); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false;
  // constraints: [a, b, rest length]; structural, shear and bend
  let cons = [];
  const pinLocal = [];                                              // top row, in the chest bone's space
  const hm = { x0: -2.6, y0: -9.0, step: 0.2, nx: 27, ny: 85, z: null, rootInv: null };   // back height map
  const v = new THREE.Vector3(), Minv = new THREE.Matrix4();
  let style = null, ready = false;

  // P0: body positions (rest pose, character space); chestM, hipM: rest bone matrices; outer: how far
  // worn layers sit off the skin on the torso; shoulders: [xL, xR] and the top-of-shoulder height
  // extra: worn garments' point arrays (fitted shells and skirts), so the cape hangs over them too
  function fit(P0, nb, chestM, hipM, outer, shoulderX, shoulderY, which, extra = []) {
    style = which ? CAPE_STYLES[which] : null; mesh.visible = !!style; ready = false;
    if (!style) return;
    mat.color.set(style.color).convertSRGBToLinear();
    // the back height map: the most rearward skin at each (x, y), in the hip bone's space
    Minv.copy(hipM).invert();
    hm.z = new Float32Array(hm.nx * hm.ny).fill(1e9);
    for (let i = 0; i < nb; i++) {
      if (Math.abs(P0[i * 3]) > 1.35 || P0[i * 3 + 1] < -0.9) continue;          // the torso only: arms and legs move, capsules cover them
      v.set(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]).applyMatrix4(Minv);
      const cx = Math.round((v.x - hm.x0) / hm.step), cy = Math.round((v.y - hm.y0) / hm.step);
      if (cx < 0 || cy < 0 || cx >= hm.nx || cy >= hm.ny) continue;
      const k = cy * hm.nx + cx; if (v.z < hm.z[k]) hm.z[k] = v.z;
    }
    for (const E of extra) for (let i = 0; i < E.length; i += 3) {
      if (Math.abs(E[i]) > 1.6) continue;
      v.set(E[i], E[i + 1], E[i + 2]).applyMatrix4(Minv);
      const cx = Math.round((v.x - hm.x0) / hm.step), cy = Math.round((v.y - hm.y0) / hm.step);
      if (cx < 0 || cy < 0 || cx >= hm.nx || cy >= hm.ny) continue;
      const k = cy * hm.nx + cx; if (v.z + outer < hm.z[k]) hm.z[k] = v.z + outer;   // garments already include their thickness: cancel the layer margin below
    }
    hm.margin = outer + 0.18;
    // rest layout: pins across the upper back and over the shoulders, the rest hanging and flaring
    const half = Math.abs(shoulderX) * 0.95, top = shoulderY;
    const backZ = x => { let z = 1e9; for (let i = 0; i < nb; i++) { const y = P0[i * 3 + 1]; if (Math.abs(P0[i * 3] - x) < 0.25 && y > top - 1.2 && y < top + 0.2) z = Math.min(z, P0[i * 3 + 2]); } return z; };
    const Cinv = new THREE.Matrix4().copy(chestM).invert();
    pinLocal.length = 0;
    const rowLen = style.length / (ROWS - 1);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = c / (COLS - 1) * 2 - 1, i = (r * COLS + c) * 3;
      if (r === 0) {
        const x = u * half, z = backZ(x) - outer - 0.1, y = top - 0.25 * (1 - u * u);
        rest[i] = x; rest[i + 1] = y; rest[i + 2] = z;
        v.set(x, y, z).applyMatrix4(Cinv); pinLocal.push(v.clone());
      } else {
        const f = 1 + style.flare * r / (ROWS - 1);
        rest[i] = u * half * f; rest[i + 1] = rest[c * 3 + 1] - r * rowLen * 0.98; rest[i + 2] = rest[c * 3 + 2] - 0.15 * r / ROWS;
      }
    }
    cons = [];
    const link = (a, b) => cons.push([a, b, Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2])]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      if (c < COLS - 1) link(a, a + 1);
      if (r < ROWS - 1) link(a, a + COLS);
      if (r < ROWS - 1 && c < COLS - 1) { link(a, a + COLS + 1); link(a + 1, a + COLS); }
      if (r < ROWS - 2) link(a, a + 2 * COLS);                     // bend: keeps it from crumpling
      if (c < COLS - 2) link(a, a + 2);
    }
    hm.restHip = hipM.clone();
  }
  // chestM, hipM: current bone matrices in character space; caps: leg capsules
  function step(dt, t, chestM, hipM, caps, accel = null) {
    if (!style) return;
    // move from the rest pose into the current one through the hip bone (so the sim starts in place)
    if (!ready) {
      const D = new THREE.Matrix4().copy(hipM).multiply(new THREE.Matrix4().copy(hm.restHip).invert());
      for (let i = 0; i < n; i++) { v.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]).applyMatrix4(D); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
      prev.set(P); ready = true;
    }
    Minv.copy(hipM).invert(); hipCur.copy(hipM);
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    for (let s = 0; s < sub; s++) {
      const g = -90 * h * h;
      for (let i = COLS; i < n; i++) {
        const j = i * 3, c = i % COLS;
        // a light breeze from the front, varying over time and across the cape
        const wind = (2.5 + 1.8 * Math.sin(t * 0.9 + c * 0.35) + 1.2 * Math.sin(t * 2.3 - c * 0.6)) * h * h;
        for (let k = 0; k < 3; k++) { const vel = (P[j + k] - prev[j + k]) * 0.985; prev[j + k] = P[j + k]; P[j + k] += vel; }
        P[j + 1] += g; P[j + 2] -= wind;
        if (accel) { P[j] -= accel[0] * h * h; P[j + 1] -= accel[1] * h * h; P[j + 2] -= accel[2] * h * h; }   // (the body speeding up, stopping, landing: the cape lags it)
      }
      for (let c = 0; c < COLS; c++) { v.copy(pinLocal[c]).applyMatrix4(chestM); P[c * 3] = v.x; P[c * 3 + 1] = v.y; P[c * 3 + 2] = v.z; }
      for (let it = 0; it < 6; it++) {
        for (const [a, b, L] of cons) {
          const ia = a * 3, ib = b * 3, dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], dz = P[ib + 2] - P[ia + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - L) / d;
          const wa = a < COLS ? 0 : 0.5, wb = b < COLS ? 0 : 0.5, ws = wa + wb || 1;
          P[ia] += dx * f * wa / ws; P[ia + 1] += dy * f * wa / ws; P[ia + 2] += dz * f * wa / ws;
          P[ib] -= dx * f * wb / ws; P[ib + 1] -= dy * f * wb / ws; P[ib + 2] -= dz * f * wb / ws;
        }
        for (let i = COLS; i < n; i++) { collideBack(i); pushOut(P, i, caps, 0.12); }
      }
    }
    attr.needsUpdate = true; geo.computeVertexNormals();
  }
  // keep a point behind the body's back surface (looked up in the hip bone's space)
  const q = new THREE.Vector3(), hipCur = new THREE.Matrix4();
  function collideBack(i) {
    const j = i * 3; q.set(P[j], P[j + 1], P[j + 2]).applyMatrix4(Minv);
    const cx = Math.round((q.x - hm.x0) / hm.step), cy = Math.round((q.y - hm.y0) / hm.step);
    if (cx < 0 || cy < 0 || cx >= hm.nx || cy >= hm.ny) return;
    let z = hm.z[cy * hm.nx + cx];
    if (z > 1e8) return;
    z -= hm.margin;
    if (q.z > z && q.z < z + 2.5) { q.z = z; q.applyMatrix4(hipCur); P[j] = q.x; P[j + 1] = q.y; P[j + 2] = q.z; }
  }
  return { mesh, mat, fit, step, reset: () => { ready = false; }, get active() { return !!style; } };
}
