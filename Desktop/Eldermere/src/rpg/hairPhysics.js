// src/rpg/hairPhysics.js — player groom guide simulation and collision helpers.
// Kept separate from the retired card renderer so the groom can evolve independently.
const SEG = 14;

function makeSurfaceIndex(surface, cell = 0.075, center = [0, 0, 0]) {
  if (!surface?.positions || !surface?.triangles?.length) return null;
  const P = surface.positions, T = surface.triangles, grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const tri = [];
  for (let t = 0; t < T.length; t += 3) {
    const ia = T[t], ib = T[t + 1], ic = T[t + 2];
    const a = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]];
    const b = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]];
    const c = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const mx = (a[0] + b[0] + c[0]) / 3 - center[0];
    const my = (a[1] + b[1] + c[1]) / 3 - center[1];
    const mz = (a[2] + b[2] + c[2]) / 3 - center[2];
    if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const id = tri.length, item = { a, b, c, n: [nx, ny, nz] }; tri.push(item);
    const minX = Math.floor(Math.min(a[0], b[0], c[0]) / cell), maxX = Math.floor(Math.max(a[0], b[0], c[0]) / cell);
    const minY = Math.floor(Math.min(a[1], b[1], c[1]) / cell), maxY = Math.floor(Math.max(a[1], b[1], c[1]) / cell);
    const minZ = Math.floor(Math.min(a[2], b[2], c[2]) / cell), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / cell);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      const k = key(x, y, z); (grid.get(k) || grid.set(k, []).get(k)).push(id);
    }
  }
  return { grid, tri, cell, key };
}
function closestOnTriangle(p, a, b, c, out) {
  const abx=b[0]-a[0], aby=b[1]-a[1], abz=b[2]-a[2], acx=c[0]-a[0], acy=c[1]-a[1], acz=c[2]-a[2];
  const apx=p[0]-a[0], apy=p[1]-a[1], apz=p[2]-a[2];
  const d1=abx*apx+aby*apy+abz*apz, d2=acx*apx+acy*apy+acz*apz;
  let u, v, w;
  if (d1 <= 0 && d2 <= 0) { u=1; v=w=0; }
  else {
    const bpx=p[0]-b[0], bpy=p[1]-b[1], bpz=p[2]-b[2], d3=abx*bpx+aby*bpy+abz*bpz, d4=acx*bpx+acy*bpy+acz*bpz;
    if (d3 >= 0 && d4 <= d3) { u=0; v=1; w=0; }
    else {
      const vc=d1*d4-d3*d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t=d1/(d1-d3); u=1-t; v=t; w=0; }
      else {
        const cpx=p[0]-c[0], cpy=p[1]-c[1], cpz=p[2]-c[2], d5=abx*cpx+aby*cpy+abz*cpz, d6=acx*cpx+acy*cpy+acz*cpz;
        if (d6 >= 0 && d5 <= d6) { u=0; v=0; w=1; }
        else {
          const vb=d5*d2-d1*d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t=d2/(d2-d6); u=1-t; v=0; w=t; }
          else {
            const va=d3*d6-d5*d4;
            if (va <= 0 && d4-d3 >= 0 && d5-d6 >= 0) { const t=(d4-d3)/((d4-d3)+(d5-d6)); u=0; v=1-t; w=t; }
            else { const inv=1/(va+vb+vc); v=vb*inv; w=vc*inv; u=1-v-w; }
          }
        }
      }
    }
  }
  out[0]=a[0]*u+b[0]*v+c[0]*w; out[1]=a[1]*u+b[1]*v+c[1]*w; out[2]=a[2]*u+b[2]*v+c[2]*w;
}
function collideSurface(point, surface, radius) {
  if (!surface) return false;
  const { grid, tri, cell, key } = surface, gx=Math.floor(point[0]/cell), gy=Math.floor(point[1]/cell), gz=Math.floor(point[2]/cell);
  let best=null, bestD=Infinity; const seen=new Set(), closest=[0,0,0], candidate=[0,0,0];
  for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++) {
    const list=grid.get(key(gx+x,gy+y,gz+z)); if(!list) continue;
    for(const id of list) {
      if(seen.has(id)) continue; seen.add(id);
      const f=tri[id]; closestOnTriangle(point,f.a,f.b,f.c,candidate);
      const dx=point[0]-candidate[0],dy=point[1]-candidate[1],dz=point[2]-candidate[2],d=dx*dx+dy*dy+dz*dz;
      if(d<bestD){bestD=d;best=f;closest[0]=candidate[0];closest[1]=candidate[1];closest[2]=candidate[2];}
    }
  }
  if(!best) return false;
  const n=best.n, signed=(point[0]-closest[0])*n[0]+(point[1]-closest[1])*n[1]+(point[2]-closest[2])*n[2];
  if(signed>=radius) return false;
  const push=radius-signed;
  point[0]+=n[0]*push; point[1]+=n[1]*push; point[2]+=n[2]*push;
  return true;
}

export function makeGuideSim(guides, head, headSurface = null) {
  const n = SEG + 1, G = guides.length;
  const rest = new Float32Array(G * n * 3), p = new Float32Array(G * n * 3), prev = new Float32Array(G * n * 3), seg = new Float32Array(G * n);
  const bend = new Float32Array(G * n), pull = new Float32Array(G * n), dampK = new Float32Array(G * n), tied = new Uint8Array(G), activeFrom = new Uint8Array(G);
  // Whether each rest-pose point starts inside the skull is invariant for this hairstyle.
  // Cache it once so every 60 Hz physics tick can skip the inverse transform and ellipsoid test
  // for points that are intentionally embedded in the scalp/face.
  // the feel, live-tunable (the creator's Hair lab): follow — how much of the head's turning the hair turns with at once
  // (the rest becomes swing); inertia — how much speeding up and slowing down throws it; stiffness, damping, gravity
  const params = { follow: 0.6, inertia: 0.3, stiffness: 1, damping: 1, gravity: 1, collision: 1 };
  const surface = makeSurfaceIndex(headSurface, 0.075, head.C);
  const guideRadius = Float32Array.from(guides, gd => Math.max(0.018, (gd.width || 0.055) * 0.42));
  guides.forEach((gd, k) => {
    tied[k] = gd.loose === 0 ? 1 : 0; let L = 0; activeFrom[k] = n;
    gd.points.forEach((q, s) => { const i = k * n + s; rest.set(q, i * 3); if (s) { const a = gd.points[s - 1]; seg[i] = Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]); L += seg[i]; }
      // Only the root itself is locked. The first few centimetres must be free to
      // resolve against the skull/face or authored curves can remain embedded.
      if (L >= 0.045 && activeFrom[k] === n) activeFrom[k] = s;
      const u = Math.max(0, Math.min(1, (L - 0.045) / 1.6)), f = u * u * (3 - 2 * u);   // free from ~2.5 cm, fully free by ~18 cm (decimetres)
      bend[i] = 0.75 - 0.55 * f; pull[i] = 0.12 * (1 - f) + 0.006; dampK[i] = 0.14 + 0.18 * f; });   // (the ends of long hair damped hardest: they settle instead of flailing)
  });
  const D = new Float32Array(16), Dr = new Float32Array(16), Wpi = new Float32Array(16), WMp = new Float32Array(16), T1 = new Float32Array(16), T1i = new Float32Array(16); let havePrev = false;
  const M = new Float32Array(16), Mi = new Float32Array(16), W = new Float32Array(16), Wi = new Float32Array(16), WM = new Float32Array(16), WMi = new Float32Array(16);
  let acc = 0, lastT = -1e9, ready = false, scale = 1, lastRoot = [0, 0, 0], lastHC = [0, 0, 0], lastVel = [0, 0, 0], accW = [0, 0, 0]; const STEP = 1 / 60, tmp = [0, 0, 0], tg = [0, 0, 0], cw = [];
  function reset() { ready = false; havePrev = false; }
  function place() { for (let i = 0; i < G * n; i++) { xf(WM, rest, i * 3, p, i * 3); prev[i * 3] = p[i * 3]; prev[i * 3 + 1] = p[i * 3 + 1]; prev[i * 3 + 2] = p[i * 3 + 2]; } ready = true; }
  function step(dt, meshWorld, headM, caps, opts) {
    W.set(meshWorld.elements); M.set(headM.elements); mul(W, M, WM); inv(WM, WMi); inv(W, Wi); inv(M, Mi);
    scale = Math.hypot(W[0], W[1], W[2]);
    // a jump in place (a respawn, the creator's turntable reset): start again from the style
    const rx = WM[12], ry = WM[13], rz = WM[14];
    // start again from the style after a jump in place (a respawn) or a pause (the hair hidden — bald, a hood, first
    // person — or the page in the background): stale points would be flung across the body
    const now = opts.time ?? 0, gap = now - lastT; lastT = now;
    if (!ready || gap > 0.25 || gap < 0 || Math.hypot(rx - lastRoot[0], ry - lastRoot[1], rz - lastRoot[2]) > 30 * scale) { place(); havePrev = false; }
    // The head's motion: its movement is carried completely (walking or running at a steady pace doesn't stream the hair
    // back — only speeding up, slowing down, jumping and landing throw it, through 'inertia'); its turning is carried in
    // part ('follow'), the rest becomes swing. A big jump in one frame (a low frame rate, a teleport) is carried completely.
    const hc = [0, 0, 0]; xf(WM, head.C, 0, hc, 0);
    if (ready && havePrev) {
      // 1) the body's own movement and turning (the character's root: walking, the mouse turning you): carried almost
      //    entirely, so turning on the spot doesn't whip the hair round the head (10% of a turn becomes swing)
      mul(W, Wpi, Dr);
      for (let i = 0; i < G * n; i++) { const o = i * 3;
        xf(Dr, p, o, tmp, 0); p[o] += (tmp[0] - p[o]) * 0.9; p[o + 1] += (tmp[1] - p[o + 1]) * 0.9; p[o + 2] += (tmp[2] - p[o + 2]) * 0.9;
        xf(Dr, prev, o, tmp, 0); prev[o] += (tmp[0] - prev[o]) * 0.9; prev[o + 1] += (tmp[1] - prev[o + 1]) * 0.9; prev[o + 2] += (tmp[2] - prev[o + 2]) * 0.9; }
      // (the 10% left of the body's movement — not its turning — is carried too: steady running mustn't stream the hair)
      const cx = [0, 0, 0]; xf(Dr, lastHC, 0, cx, 0); { const mx = (cx[0] - lastHC[0]) * 0.1, my = (cx[1] - lastHC[1]) * 0.1, mz = (cx[2] - lastHC[2]) * 0.1;
        for (let i = 0; i < G * n; i++) { const o = i * 3; p[o] += mx; p[o + 1] += my; p[o + 2] += mz; prev[o] += mx; prev[o + 1] += my; prev[o + 2] += mz; } }
      // 2) the head moving on the body (the animation: nods, turns, the bob of a stride): its movement carried, its turning
      //    in part ('follow'), the rest swings
      mul(Dr, WMp, T1); inv(T1, T1i); mul(WM, T1i, D);
      const tx = hc[0] - cx[0], ty = hc[1] - cx[1], tz = hc[2] - cx[2], ang = Math.acos(Math.max(-1, Math.min(1, (D[0] + D[5] + D[10] - 1) / 2)));
      const big = Math.hypot(tx, ty, tz) > 6 * scale || ang > 0.3, ff = big ? 1 : Math.min(1, Math.max(0, params.follow));
      for (let i = 0; i < G * n; i++) { const o = i * 3;
        xf(D, p, o, tmp, 0); p[o] += tx + (tmp[0] - p[o] - tx) * ff; p[o + 1] += ty + (tmp[1] - p[o + 1] - ty) * ff; p[o + 2] += tz + (tmp[2] - p[o + 2] - tz) * ff;
        xf(D, prev, o, tmp, 0); prev[o] += tx + (tmp[0] - prev[o] - tx) * ff; prev[o + 1] += ty + (tmp[1] - prev[o + 1] - ty) * ff; prev[o + 2] += tz + (tmp[2] - prev[o + 2] - tz) * ff; }
      // speeding up, slowing down, jumping, landing: the head's acceleration in the world throws the hair ('inertia')
      const idt = 1 / Math.max(1 / 240, dt), v = [(hc[0] - lastHC[0]) * idt, (hc[1] - lastHC[1]) * idt, (hc[2] - lastHC[2]) * idt], lim = 40 * scale * 10;
      for (let a = 0; a < 3; a++) accW[a] = big ? 0 : Math.max(-lim, Math.min(lim, (v[a] - lastVel[a]) * idt)) * 0.5 + accW[a] * 0.5;
      lastVel = v;
    }
    inv(W, Wpi); WMp.set(WM);
    lastHC = hc;
    havePrev = true;
    lastRoot = [rx, ry, rz];
    // the body's capsules, in world space
    cw.length = 0; for (const c of caps || []) { const a = [0, 0, 0], b = [0, 0, 0]; xf(W, c.a, 0, a, 0); xf(W, c.b, 0, b, 0); cw.push({ a, b, r: (c.r + 0.05) * scale, r2: ((c.r2 ?? c.r) + 0.05) * scale }); }
    acc = Math.min(acc + dt, STEP * 2);
    while (acc >= STEP) { acc -= STEP; tick(opts); }
  }
  function tick(opts) {
    const g = -9.8 * 10 * scale * 0.18 * params.gravity * STEP * STEP, wind = opts.wind || [0, 0, 0], t = (opts.time || 0), dm = params.damping, sk = params.stiffness;
    const ia = -params.inertia * STEP * STEP, ix = accW[0] * ia, iy = accW[1] * ia, iz = accW[2] * ia;
    const wk = STEP * STEP * 10 * scale;
    for (let k = 0; k < G; k++) {
      const o0 = k * n * 3; xf(WM, rest, o0, p, o0); prev[o0] = p[o0]; prev[o0 + 1] = p[o0 + 1]; prev[o0 + 2] = p[o0 + 2];   // the root rides the head
      for (let s = 1; s < n; s++) {
        const i = k * n + s, o = i * 3, q = o - 3;
        if (tied[k] || s < activeFrom[k]) { xf(WM, rest, o, p, o); prev[o] = p[o]; prev[o + 1] = p[o + 1]; prev[o + 2] = p[o + 2]; continue; }
        const gust = 0.6 + 0.4 * Math.sin(t * 1.7 + k * 0.37 + s * 0.2);
        const damp = Math.min(0.9, dampK[i] * dm), fr = s / n;
        for (let a = 0; a < 3; a++) { const cur = p[o + a]; p[o + a] = cur + (cur - prev[o + a]) * (1 - damp) + (a === 1 ? g : 0) + wind[a] * wk * gust * fr + (a === 0 ? ix : a === 1 ? iy : iz) * fr; prev[o + a] = cur; }
        // bend: where the style puts this point, seen from the point above (the rest segment turned with the head)
        tmp[0] = rest[o] - rest[q]; tmp[1] = rest[o + 1] - rest[q + 1]; tmp[2] = rest[o + 2] - rest[q + 2]; rot(WM, tmp);
        const b = Math.min(0.95, bend[i] * sk); p[o] += (p[q] + tmp[0] - p[o]) * b; p[o + 1] += (p[q + 1] + tmp[1] - p[o + 1]) * b; p[o + 2] += (p[q + 2] + tmp[2] - p[o + 2]) * b;
        // a weak pull back to the style as a whole
        xf(WM, rest, o, tg, 0); const pl = pull[i]; p[o] += (tg[0] - p[o]) * pl; p[o + 1] += (tg[1] - p[o + 1]) * pl; p[o + 2] += (tg[2] - p[o + 2]) * pl;
        // Enforce segment length first. Collision must run after this constraint;
        // otherwise the length correction immediately pulls the hair back through the body.
        const L = seg[i] * scale, dx = p[o] - p[q], dy = p[o + 1] - p[q + 1], dz = p[o + 2] - p[q + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        p[o] = p[q] + dx / d * L; p[o + 1] = p[q + 1] + dy / d * L; p[o + 2] = p[q + 2] + dz / d * L;
        // Resolve against the head on every simulated point, including points whose
        // authored rest pose began inside the approximate skull. Use a small clearance
        // so ribbons do not sit exactly on the collision surface.
        tmp[0] = p[o]; tmp[1] = p[o + 1]; tmp[2] = p[o + 2]; xf(WMi, tmp, 0, tmp, 0);
        const radius = guideRadius[k] * params.collision;
        let hit = collideSurface(tmp, surface, radius);
        // Keep the ellipsoid as a conservative fallback for missing surface samples.
        if (!hit) {
          const ex = (tmp[0] - head.C[0]) / (head.Rad[0] * 0.94), ey = (tmp[1] - head.C[1]) / (head.Rad[1] * 0.94), ez = (tmp[2] - head.C[2]) / (head.Rad[2] * 0.94), ed = Math.hypot(ex, ey, ez);
          if (ed < 1.015 && ed > 1e-4) {
            const push = 1.015 / ed;
            tmp[0] = head.C[0] + (tmp[0] - head.C[0]) * push;
            tmp[1] = head.C[1] + (tmp[1] - head.C[1]) * push;
            tmp[2] = head.C[2] + (tmp[2] - head.C[2]) * push;
            hit = true;
          }
        }
        if (hit) { xf(WM, tmp, 0, tmp, 0); p[o] = tmp[0]; p[o + 1] = tmp[1]; p[o + 2] = tmp[2]; }
        // Neck, shoulders and torso capsules are also resolved after segment length.
        if (cw.length) for (const c of cw) pushCap(p, o, c, radius);
      }
    }
  }
  // offsets in the head's rest space, for the texture
  function write(out) {
    for (let i = 0; i < G * n; i++) { const o = i * 3; tmp[0] = p[o]; tmp[1] = p[o + 1]; tmp[2] = p[o + 2]; xf(WMi, tmp, 0, tmp, 0);
      out[i * 4] = tmp[0] - rest[o]; out[i * 4 + 1] = tmp[1] - rest[o + 1]; out[i * 4 + 2] = tmp[2] - rest[o + 2]; out[i * 4 + 3] = 1;
      if (!(Math.abs(out[i * 4]) + Math.abs(out[i * 4 + 1]) + Math.abs(out[i * 4 + 2]) < 1e3)) { out.fill(0); for (let k = 0; k < out.length; k += 4) out[k + 3] = 1; ready = false; return; } }   // (a broken step: back to the style, never vanish)
  }
  return { step, write, reset, params, guides: G, dbg: () => ({ p: Array.from(p.slice(0, 45)), rest: Array.from(rest.slice(0, 45)), WM: Array.from(WM), scale }) };
}
function xf(m, src, so, dst, d) { const x = src[so], y = src[so + 1], z = src[so + 2];
  dst[d] = m[0] * x + m[4] * y + m[8] * z + m[12]; dst[d + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; dst[d + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
function rot(m, v) { const x = v[0], y = v[1], z = v[2]; v[0] = m[0] * x + m[4] * y + m[8] * z; v[1] = m[1] * x + m[5] * y + m[9] * z; v[2] = m[2] * x + m[6] * y + m[10] * z; }
function mul(a, b, o) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } }
function inv(m, o) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return; det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
function insideCap(p, c) { const r = nearCap(p, 0, c); return r.d < r.r; }
function nearCap(p, o, c) {
  const bx = c.b[0] - c.a[0], by = c.b[1] - c.a[1], bz = c.b[2] - c.a[2], L2 = bx * bx + by * by + bz * bz || 1e-6;
  const px = p[o] - c.a[0], py = p[o + 1] - c.a[1], pz = p[o + 2] - c.a[2], t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2));
  const qx = px - bx * t, qy = py - by * t, qz = pz - bz * t; return { d: Math.hypot(qx, qy, qz), r: c.r + (c.r2 - c.r) * t, qx, qy, qz };
}
function pushCap(p, o, c, clearance = 0) { const r = nearCap(p, o, c), target = r.r + clearance; if (r.d < target && r.d > 1e-6) { const f = (target - r.d) / r.d; p[o] += r.qx * f; p[o + 1] += r.qy * f; p[o + 2] += r.qz * f; } }
