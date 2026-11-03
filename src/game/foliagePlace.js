// src/game/foliagePlace.js — where plants grow (drawn by src/gfx/foliage.js). Two sources:
//   painted (Ground mode, Foliage tab): a kind and a density per 2 m square — tall grass, wildflowers, bushes, reeds,
//     trees, pines — always grows where it's painted
//   passive (on by default; d.ground.passive === false turns it off), where nothing's painted:
//     1. still water: reeds and cattails thick in the shallows, lily pads further out, stones and old logs along the edge
//     2. slow water's shores: reeds and tall grass along the bank
//     3. open country, at least a block (10 m) from any building: grass everywhere (lusher where it's moist), wild
//        flowers, bushes, and woods in patches (pines where it's cold)
//     4. under still or slow water: meadows of eelgrass and pondweed on the bed (painted grass in water grows as eelgrass)
// Never on roads, pieces, filler, cliffs, cobbles, or fast water, and kept back from them: grass and flowers a metre
// from a road or a building, bushes two, trees three. Heights are the ground's as drawn (hAt), sunk a touch on a
// slope so a patch's downhill side doesn't float. Every spot is a hash of its square, so the same map
// always grows the same plants.
import { rock, log } from './clutter.js';

const hash = (i, j, n) => { const s = Math.sin(i * 127.1 + j * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, z, n) => { const i = Math.floor(x), j = Math.floor(z), a = x - i, b = z - j, s = t => t * t * (3 - 2 * t), A = s(a), B = s(b); return (hash(i, j, n) * (1 - A) + hash(i + 1, j, n) * A) * (1 - B) + (hash(i, j + 1, n) * (1 - A) + hash(i + 1, j + 1, n) * A) * B; };

export function placeFoliage(c) {
  const { kit, gp, W, H, hAt, pieceTop, roadTop, isFill, kindAt, cliffAt, wDepth, wSpeed, wSD, wLv, groundAt } = c;
  if (!kit.plant) return;
  const N = W * H, plant = kit.plant;
  // distances (m, up to a limit) from buildings, and from water for the land: two chamfer passes each
  const field = (src, lim) => { const D = new Float32Array(N); for (let k = 0; k < N; k++) D[k] = src(k) ? 0 : lim;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!D[k]) continue; let v = D[k]; if (i) v = Math.min(v, D[k - 1] + 1); if (j) { v = Math.min(v, D[k - W] + 1); if (i) v = Math.min(v, D[k - W - 1] + 1.41); if (i < W - 1) v = Math.min(v, D[k - W + 1] + 1.41); } D[k] = v; }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!D[k]) continue; let v = D[k]; if (i < W - 1) v = Math.min(v, D[k + 1] + 1); if (j < H - 1) { v = Math.min(v, D[k + W] + 1); if (i < W - 1) v = Math.min(v, D[k + W + 1] + 1.41); if (i) v = Math.min(v, D[k + W - 1] + 1.41); } D[k] = v; }
    return D; };
  const bDist = field(k => pieceTop[k] > -Infinity, 12), wDist = field(k => wDepth[k] > 0, 6), rDist = field(k => roadTop[k] > -Infinity, 6);
  const CLEAR = { grass: 2, tallgrass: 2, flower: 2, reed: 2, cattail: 2, bush: 3, tree: 4, pine: 4, dead: 4 };   // (in whole squares: the spot is somewhere in its square)
  // the speed of the nearest water, for the banks: spread outward from the water a few metres
  const shoreSpeed = new Float32Array(N).fill(9); for (let k = 0; k < N; k++) if (wDepth[k] > 0) shoreSpeed[k] = wSpeed[k];
  for (let pass = 0; pass < 4; pass++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (wDepth[k] > 0) continue; shoreSpeed[k] = Math.min(shoreSpeed[k], shoreSpeed[k - 1], shoreSpeed[k + 1], shoreSpeed[k - W], shoreSpeed[k + W]); }
  const passive = gp?.passive !== false;
  const put = (k, i, j, n, x, z, y, s = 1, tint = null) => { const c = CLEAR[k], q = j * W + i; if (c && (rDist[q] < c || bDist[q] < c)) return; plant(k, x, y, z, s * (0.8 + hash(i, j, n + 1) * 0.45), hash(i, j, n + 2) * 6.283, Math.floor(hash(i, j, n + 3) * 6), tint); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (roadTop[k] > -Infinity || pieceTop[k] > -Infinity || isFill(i, j)) continue;
    const kind = kindAt(i, j), cl = cliffAt(i + 0.5, j + 0.5); if (cl > 0.3 || kind === 8) continue;   // (cliffs, cobbles)
    const D = +groundAt(gp, 'fol', i + 0.5, j + 0.5) || 0, T = groundAt(gp, 'folT', i + 0.5, j + 0.5), moist = (+groundAt(gp, 'moist', i + 0.5, j + 0.5)) / 9, temp = (+groundAt(gp, 'temp', i + 0.5, j + 0.5)) / 9;
    const wet = wDepth[k] > 0, dep = wDepth[k], h0 = hAt(i + 0.5, j + 0.5), slope = Math.hypot(hAt(i + 1, j + 0.5) - hAt(i, j + 0.5), hAt(i + 0.5, j + 1) - hAt(i + 0.5, j)), sink = 0.04 + Math.min(0.35, slope * 0.5);
    const gy = (x = i + 0.5, z = j + 0.5) => hAt(x, z) - sink;
    const grassTint = [1.05 - moist * 0.25 + (1 - moist) * 0.1, 1, 0.75 + moist * 0.3 - (1 - moist) * 0.2].map(v => v * (0.9 + hash(i, j, 99) * 0.2)), coldTint = temp < 0.3 ? [0.9, 0.95, 0.9] : null;
    // a few tries per square metre: each a chance at its own spot
    const tries = (p, fn) => { let n = Math.floor(p), f = p - n; if (hash(i, j, 7) < f) n++; for (let q = 0; q < n; q++) fn(i + hash(i, j, 10 + q), j + hash(i, j, 20 + q), q); };
    if (D > 0) {                                                                            // ---- painted ----
      const d9 = D / 9;
      if (wet && T === 'g') { tries(d9 * 1.2, (x, z, q) => put(hash(i, j, 30 + q) < 0.25 ? 'pondweed' : 'seagrass', i, j, 40 + q * 5, x, z, gy(x, z))); continue; }
      if (wet && T !== 'r') continue;
      if (T === 'g') tries(d9 * 2.2, (x, z, q) => put(hash(i, j, 30 + q) < 0.45 ? 'tallgrass' : 'grass', i, j, 40 + q * 5, x, z, gy(x, z), 1, grassTint));
      else if (T === 'f') { tries(d9 * 1.0, (x, z, q) => put('flower', i, j, 40 + q * 5, x, z, gy(x, z))); tries(d9 * 1.2, (x, z, q) => put('grass', i, j, 80 + q * 5, x, z, gy(x, z), 1, grassTint)); }
      else if (T === 'b') { tries(d9 * 0.25, (x, z, q) => put('bush', i, j, 40 + q * 5, x, z, gy(x, z))); tries(d9, (x, z, q) => put('grass', i, j, 80 + q * 5, x, z, gy(x, z), 1, grassTint)); }
      else if (T === 'r') { tries(d9 * 1.4, (x, z, q) => put(hash(i, j, 30 + q) < 0.18 ? 'cattail' : 'reed', i, j, 40 + q * 5, x, z, gy(x, z))); }
      else if (T === 't' || T === 'n') { tries(d9 * 0.11, (x, z, q) => put(T === 'n' ? 'pine' : 'tree', i, j, 40 + q * 5, x, z, gy(x, z), 1, coldTint)); tries(d9 * 0.06, (x, z, q) => put('bush', i, j, 60 + q * 5, x, z, gy(x, z))); tries(d9 * 0.8, (x, z, q) => put('grass', i, j, 80 + q * 5, x, z, gy(x, z), 1, grassTint)); }
      continue;
    }
    if (!passive) continue;
    if (wet) {                                                                              // ---- passive: in the water ----
      if (dep > 0.6 && dep < 9 && wSD[k] > 1.5 && wSpeed[k] < 0.6) {                          // the bed: eelgrass meadows and pondweed
        const mead = vn(i / 9, j / 9, 5) * 0.75 + vn(i / 3, j / 3, 6) * 0.25, deepFade = Math.min(1, (9 - dep) / 4);
        if (mead > 0.42) tries((mead - 0.42) * 2.4 * deepFade, (x, z, q) => put(hash(i, j, 30 + q) < 0.22 ? 'pondweed' : 'seagrass', i, j, 140 + q * 5, x, z, gy(x, z) + 0.02));
      }
      if (wSpeed[k] > 0.15) continue;                                                       // (the rest only in still water)
      if (dep < 0.9 && wSD[k] < 4) tries(0.55, (x, z, q) => put(hash(i, j, 30 + q) < 0.2 ? 'cattail' : 'reed', i, j, 40 + q * 5, x, z, gy(x, z)));
      else if (dep > 0.3 && dep < 3.5 && hash(i, j, 3) < 0.09) put('lily', i, j, 40, i + hash(i, j, 11), j + hash(i, j, 12), wLv[k] - 0.01);
      if (wSD[k] < 1.5 && hash(i, j, 4) < 0.03) { if (hash(i, j, 5) < 0.3) log(kit, i + 0.5, gy() + 0.02, j + 0.5, 1 + hash(i, j, 6) * 1.5, 0.08 + hash(i, j, 8) * 0.06, hash(i, j, 9) * 3.14, '#6b5a46'); else rock(kit, i + 0.5, gy(), j + 0.5, 0.15 + hash(i, j, 6) * 0.3, i * 31 + j, '#a59e92', { sy: 0.5 }); }   // stones and old logs along the edge
      continue;
    }
    if (kind === 7 || kind === 3) continue;                                                 // (snow, bare rock)
    if (wDist[k] <= 3 && shoreSpeed[k] < 0.8) {                                             // ---- passive: a slow bank ----
      tries(wDist[k] <= 1.5 ? 0.45 : 0.25, (x, z, q) => put(hash(i, j, 30 + q) < 0.4 ? 'reed' : 'tallgrass', i, j, 40 + q * 5, x, z, gy(x, z), 1, grassTint));
      continue;
    }
    if (bDist[k] < 10) continue;                                                            // ---- passive: open country, a block from any building ----
    const woods = vn((i) / 38, (j) / 38, 1) * 0.7 + vn(i / 11, j / 11, 2) * 0.3, lush = 0.35 + moist * 0.5;
    if (kind !== 4 && kind !== 5) tries(lush * 0.8 * (kind === 2 ? 0.4 : 1), (x, z, q) => put(hash(i, j, 30 + q) < 0.18 ? 'tallgrass' : 'grass', i, j, 40 + q * 5, x, z, gy(x, z), 1, grassTint));
    if (hash(i, j, 61) < 0.012 * (0.5 + moist) && kind !== 4) put('flower', i, j, 62, i + hash(i, j, 63), j + hash(i, j, 64), gy(i + hash(i, j, 63), j + hash(i, j, 64)));
    if (woods > 0.6) { if (hash(i, j, 71) < (woods - 0.6) * 0.2) put(temp < 0.35 ? 'pine' : (hash(i, j, 75) < 0.15 ? 'pine' : 'tree'), i, j, 72, i + hash(i, j, 73), j + hash(i, j, 74), gy(i + hash(i, j, 73), j + hash(i, j, 74)), 1, coldTint); else if (hash(i, j, 76) < 0.02) put('bush', i, j, 77, i + hash(i, j, 78), j + hash(i, j, 79), gy(i + hash(i, j, 78), j + hash(i, j, 79))); }
    else if (hash(i, j, 81) < 0.0015) put(temp < 0.35 ? 'pine' : 'tree', i, j, 82, i + hash(i, j, 83), j + hash(i, j, 84), gy(i + hash(i, j, 83), j + hash(i, j, 84)), 1, coldTint);
    else if (hash(i, j, 86) < 0.006) put('bush', i, j, 87, i + hash(i, j, 88), j + hash(i, j, 89), gy(i + hash(i, j, 88), j + hash(i, j, 89)));
  }
}
