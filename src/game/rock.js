// src/game/rock.js — terrain too steep to be a slope becomes a cliff: rock.
// Past about 45° (fully by 56°) the ground stops being a grassy heightfield. Its squares are cut finer (a quarter
// metre) and pushed out and in along the slope by a rock shape: broad bulges and hollows, knobs, and strata that
// step out as small ledges. The ground shader paints anything that steep as stratified rock. Each stretch of cliff
// that faces one way is a climbing face (the same kind as src/game/cliff.js: u along it, v up it), so the player can
// climb any cliff the terrain makes; the rock under a waterfall is wet.
//
//   makeCliffs({ W, H, FH, blocked, wetAt }) → { weight(x, z), any, pos(x, z) → [x, y, z], fieldAt(i, j), fields }
//     FH(x, z): the ground's height on the 1 m grid; blocked(i, j): a square under a road or piece (never rock)

const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), s = t => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const L = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}
// how far the rock stands out from the plain slope (m, + is outward): bulges, knobs, and strata ledges
export function rockOut(x, y, z) {
  const big = vnoise3(x * 0.3, y * 0.38, z * 0.3) * 0.5, mid = vnoise3(x * 0.9 + 5, y * 1.1, z * 0.9) * 0.17, fine = vnoise3(x * 2.6, y * 2.9 + 3, z * 2.6) * 0.05;
  const band = (y + 0.6 * big + 0.3 * vnoise3(x * 0.15, 7, z * 0.15)) / 1.6, f = band - Math.floor(band), ledge = (f * f) * 0.32;   // each band juts out a little more toward its top
  return big + mid + fine + ledge;
}
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function makeCliffs({ W, H, FH, blocked, wetAt = () => false, origin = { x: 0, y: 0, z: 0 } }) {
  const OX = origin.x, OY = origin.y, OZ = origin.z;   // (the faces work in world space, like the player)
  const VW = W + 1, cw = new Float32Array(VW * (H + 1)), gx = new Float32Array(VW * (H + 1)), gz = new Float32Array(VW * (H + 1));
  let any = false;
  for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) {
    const k = z * VW + x, ax = (FH(Math.min(W, x + 1), z) - FH(Math.max(0, x - 1), z)) / (Math.min(W, x + 1) - Math.max(0, x - 1)), az = (FH(x, Math.min(H, z + 1)) - FH(x, Math.max(0, z - 1))) / (Math.min(H, z + 1) - Math.max(0, z - 1));
    gx[k] = ax; gz[k] = az;
    let c = smooth((Math.hypot(ax, az) - 0.85) / 0.55);
    if (c > 0) for (const [a, b] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) if (a >= 0 && b >= 0 && a < W && b < H && blocked(a, b)) { c = 0; break; }
    cw[k] = c; if (c > 0) any = true;
  }
  const bil = (arr, x, z) => { const i = Math.min(W - 1, Math.max(0, Math.floor(x))), j = Math.min(H - 1, Math.max(0, Math.floor(z))), a = x - i, b = z - j;
    return (arr[j * VW + i] * (1 - a) + arr[j * VW + i + 1] * a) * (1 - b) + (arr[(j + 1) * VW + i] * (1 - a) + arr[(j + 1) * VW + i + 1] * a) * b; };
  const weight = (x, z) => bil(cw, x, z);
  // a point of the surface: height bilinear across its square (so a rock square meets a plain one exactly), pushed
  // out along the slope's downhill direction by the rock shape, scaled by how cliff-like it is there
  const hq = (x, z) => { const i = Math.min(W - 1, Math.max(0, Math.floor(x))), j = Math.min(H - 1, Math.max(0, Math.floor(z))), a = x - i, b = z - j;
    return (FH(i, j) * (1 - a) + FH(i + 1, j) * a) * (1 - b) + (FH(i, j + 1) * (1 - a) + FH(i + 1, j + 1) * a) * b; };
  const pos = (x, z) => {
    const y = hq(x, z), c = weight(x, z); if (c <= 0) return [x, y, z];
    const dx = -bil(gx, x, z), dz = -bil(gz, x, z), l = Math.hypot(dx, dz) || 1, o = c * rockOut(x, y, z);
    return [x + dx / l * o, y + c * 0.12 * vnoise3(x * 1.7, y * 0.6, z * 1.7), z + dz / l * o];
  };
  // ---- climbing faces: cliff squares grouped by which way they face (8 ways) and touching ----
  const sq = new Int8Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = (cw[j * VW + i] + cw[j * VW + i + 1] + cw[(j + 1) * VW + i] + cw[(j + 1) * VW + i + 1]) / 4; if (c < 0.3) continue;
    const ux = (gx[j * VW + i] + gx[(j + 1) * VW + i + 1]) / 2, uz = (gz[j * VW + i] + gz[(j + 1) * VW + i + 1]) / 2;     // uphill = into the rock
    sq[j * W + i] = ((Math.round(Math.atan2(uz, ux) / (Math.PI / 4)) % 8) + 8) % 8;
  }
  const owner = new Int32Array(W * H).fill(-1), fields = [];
  for (let j0 = 0; j0 < H; j0++) for (let i0 = 0; i0 < W; i0++) {
    if (sq[j0 * W + i0] < 0 || owner[j0 * W + i0] >= 0) continue;
    const dir = sq[j0 * W + i0], list = [], stack = [[i0, j0]]; owner[j0 * W + i0] = fields.length;
    while (stack.length) { const [i, j] = stack.pop(); list.push([i, j]); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H || owner[jj * W + ii] >= 0) continue; const d2 = sq[jj * W + ii]; if (d2 < 0 || Math.min((d2 - dir + 8) % 8, (dir - d2 + 8) % 8) > 0) continue; owner[jj * W + ii] = fields.length; stack.push([ii, jj]); } }
    fields.push(makeField(dir, list));
  }
  function makeField(dir, list) {
    const ang = dir * Math.PI / 4, into = { x: Math.cos(ang), z: Math.sin(ang) }, ua = { x: into.z, z: -into.x };   // u runs along the face (as cliff.js: into +z, u along +x)
    let cx = 0, cz = 0; for (const [i, j] of list) { cx += i + 0.5; cz += j + 0.5; } cx /= list.length; cz /= list.length;
    const has = new Set(list.map(([i, j]) => i * 65536 + j));
    let u0 = Infinity, u1 = -Infinity; for (const [i, j] of list) { const u = (i + 0.5 - cx) * ua.x + (j + 0.5 - cz) * ua.z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
    // along each line into the rock (every 0.5 m of u): where the face starts and ends, and its foot and top
    const prof = new Map(), key = u => Math.round(u * 2);
    const line = u => { const k = key(u); let p = prof.get(k); if (p) return p;
      const bx = cx + ua.x * k / 2, bz = cz + ua.z * k / 2; let sIn = null, sOut = null;
      for (let s = -12; s <= 12; s += 0.25) { const x = bx + into.x * s, z = bz + into.z * s, i = Math.floor(x), j = Math.floor(z); if (has.has(i * 65536 + j)) { if (sIn === null) sIn = s; sOut = s; } }
      if (sIn === null) p = { ok: false };
      else { const h = s => FH(Math.max(0, Math.min(W, bx + into.x * s)), Math.max(0, Math.min(H, bz + into.z * s))); p = { ok: true, bx, bz, s0: sIn - 0.5, s1: sOut + 0.75, bot: hq(bx + into.x * (sIn - 0.5), bz + into.z * (sIn - 0.5)), top: hq(bx + into.x * (sOut + 0.75), bz + into.z * (sOut + 0.75)) }; }
      prof.set(k, p); return p; };
    // the face at (u, v): along u's line into the rock, the point where the plain slope reaches height v; then pushed
    // out like the drawn rock
    const point = (u, vw) => {
      const v = vw - OY, p = line(u); if (!p.ok) return { x: OX + cx + ua.x * u, y: vw, z: OZ + cz + ua.z * u };
      const bx = cx + ua.x * u, bz = cz + ua.z * u; let lo = p.s0, hi = p.s1;
      for (let n = 0; n < 18; n++) { const m = (lo + hi) / 2; if (hq(bx + into.x * m, bz + into.z * m) < v) lo = m; else hi = m; }
      const s = (lo + hi) / 2, q = pos(bx + into.x * s, bz + into.z * s); return { x: OX + q[0], y: vw, z: OZ + q[2] };
    };
    const F = {
      u0: u0 - 0.1, u1: u1 + 0.1, v0: OY + Math.min(...list.map(([i, j]) => FH(i, j))), v1: OY + Math.max(...list.map(([i, j]) => FH(i + 1, j + 1))), into,
      top: u => { const p = line(u); return p.ok ? OY + p.top : -Infinity; }, bot: u => { const p = line(u); return p.ok ? OY + p.bot : Infinity; },
      uOf: (x, z) => (x - OX - cx) * ua.x + (z - OZ - cz) * ua.z, point,
      normal(u, v) {
        const e = 0.2, a = point(u - e, v), b = point(u + e, v), c = point(u, v - e), d = point(u, v + e);
        const tu = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, tv = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z };
        let nx = tu.y * tv.z - tu.z * tv.y, ny = tu.z * tv.x - tu.x * tv.z, nz = tu.x * tv.y - tu.y * tv.x;
        if (nx * into.x + nz * into.z > 0) { nx = -nx; ny = -ny; nz = -nz; }                 // pointing out of the rock
        const l = Math.hypot(nx, ny, nz) || 1, dep = q => q.x * into.x + q.z * into.z;      // du, dv: how fast the rock recedes along u and v (as cliff.js)
        return { x: nx / l, y: ny / l, z: nz / l, du: (dep(b) - dep(a)) / (2 * e), dv: (dep(d) - dep(c)) / (2 * e) };
      },
      material: (u, v) => { const p = point(u, v); return wetAt(p.x - OX, v - OY, p.z - OZ) ? 'wetStone' : 'climbStone'; },
    };
    return F;
  }
  return { any, weight, pos, fields, fieldAt: (i, j) => (i >= 0 && j >= 0 && i < W && j < H && owner[j * W + i] >= 0 ? fields[owner[j * W + i]] : null) };
}
