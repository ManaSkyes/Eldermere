// src/game/fillBuild.js — dynamic filler (src/data/fill.js) built into the map: the painted square metres that
// aren't under a piece or a road become ground and scenery, by kind:
//   greenery  grass; bushes, flowers, trees where there's room (a tree needs greenery all round it)
//   yard      packed earth; crates and barrels; a timber fence along its edge where it meets open space
//   rubble    long grass; rubble piles, weeds, the odd bush; bits of broken low wall along its edge
//   sheds     cobbles; small outbuildings on a 4 m grid wherever a whole 4 × 4 m square is sheds
// Auto squares take after the nearest tiles, weighted by distance and picked with smooth noise, so between a
// street and a grove the kinds blend in patches. The ground sits on the terrain where there is terrain on that
// layer (the terrain is the ground then); otherwise at the nearest town tile's floor (or the layer's floor).
import { fillOf } from '../data/fill.js';
import { terrainOf, terrainAt } from '../data/terrain.js';
import { pieceFoot } from '../data/dungeon.js';

const C = 10, SINK = 0.06;
const K = { grass: '#ffffff', rough: '#c8c4a0', earth: '#54422e', cobble: '#9a8c7a', leaf: ['#2f5a22', '#3a6a28', '#28501e', '#36602a'], timber: '#5a3b24', wood: '#7a5232', iron: '#2f2b28',
  stone: ['#bfae8e', '#a49278', '#9a8a72'], flowers: ['#e04a6a', '#f0c040', '#e86a3a', '#c060d0', '#f2f2f2'], roofs: ['#b4553a', '#a4483a', '#5f6f8f', '#7a5a8a', '#b86a3a'], walls: ['#ece0c4', '#7a5232', '#dcc8a8', '#a49278', '#b0634a'] };
// what each kind of tile next door suggests (weights over g y r s)
function suggest(p) {
  const pt = p.part, v = p.variant || 1;
  if (pt === 'F') return [{ g: 1 }, { g: 1 }, { y: 1 }, { r: 1 }, { s: 1 }, { r: 0.5, g: 0.5 }, { g: 1 }][v] || { g: 1 };
  if (pt === 'R' || pt === 'B') return v === 4 ? { g: 1 } : { g: 0.6, y: 0.4 };
  if (pt === 'W') return { g: 0.5, r: 0.5 };
  return { s: 0.5, y: 0.4, g: 0.1 };                                                          // streets, buildings, stairs: town
}

export function buildFill(d, kit, shapes, origin, coverAt, lo = 0) {
  const f = fillOf(d); if (!f) return;
  const { box, trim, prism } = kit, t = terrainOf(d), W = f.w, H = f.h;
  const hash = (x, z, k) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, z, k) => { const i = Math.floor(x), j = Math.floor(z), a = x - i, b = z - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
    return (hash(i, j, k) * (1 - sa) + hash(i + 1, j, k) * sa) * (1 - sb) + (hash(i, j + 1, k) * (1 - sa) + hash(i + 1, j + 1, k) * sa) * sb; };
  for (const [ls, mask] of Object.entries(f.layers)) {
    const l = +ls, floor = l * C;
    // ---- what's taken: pieces on this layer (their real squares) and drawn roads ----
    const occ = new Uint8Array(W * H), mark = (x0, z0, x1, z1) => { for (let j = Math.max(0, Math.round(z0)); j < Math.min(H, Math.round(z1)); j++) for (let i = Math.max(0, Math.round(x0)); i < Math.min(W, Math.round(x1)); i++) occ[j * W + i] = 1; };
    const near = [];                                                                          // town pieces on this layer: their square, floor and suggestion
    for (const [key, p] of Object.entries(d.cells)) {
      const [x, y, b] = key.split(',').map(Number), [fx, fy] = pieceFoot(p), x0 = x * C + (p.ox || 0), z0 = y * C + (p.oz || 0);
      if (l >= b && l < b + p.height) mark(x0, z0, x0 + fx * C, z0 + fy * C);
      // town tiles whose floor is on this layer, or just over the line on the layer above / below (a tile on the
      // terrain or a road can land there): they set the filler's kind (Auto) and its ground height
      const fy0 = b * C + (p.elev || 0);
      if ((p.theme === 'T' || p.theme === 'O') && Math.abs(b - l) <= 1 && fy0 >= floor - 3 && fy0 < floor + C + 3) near.push({ x0, z0, x1: x0 + fx * C, z1: z0 + fy * C, y: fy0, w: suggest(p) });
    }
    for (const s of shapes) if (s.path) { const top = s.max[1] - origin.y; if (top >= floor - 1 && top < floor + C) mark(s.min[0] - origin.x, s.min[2] - origin.z, s.max[0] - origin.x, s.max[2] - origin.z); }
    // ---- each painted square: its kind and its ground height ----
    const kind = new Array(W * H).fill('.'), gy = new Float32Array(W * H), onTerr = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, m = mask[k]; if (m === '.' || occ[k]) continue;
      const px = i + 0.5, pz = j + 0.5;
      let best = null, bd = Infinity; const wsum = { g: 0, y: 0, r: 0, s: 0 };
      for (const n of near) {
        const dx = Math.max(n.x0 - px, 0, px - n.x1), dz = Math.max(n.z0 - pz, 0, pz - n.z1), dd = Math.hypot(dx, dz); if (dd > 24) continue;
        if (dd < bd) { bd = dd; best = n; }
        const wt = 1 / ((1 + dd / 4) ** 2); for (const [q, v] of Object.entries(n.w)) wsum[q] += v * wt;
      }
      let kk = m;
      if (m === 'a') {
        const tot = wsum.g + wsum.y + wsum.r + wsum.s; if (tot < 1e-4) kk = 'g';
        else { let pick = Math.min(0.999, Math.max(0, (vnoise(px / 8, pz / 8, l * 3 + 1) * 0.7 + vnoise(px / 3, pz / 3, l * 3 + 2) * 0.25 + hash(i, j, 9) * 0.05 - 0.5) * 1.6 + 0.5)) * tot; kk = 's'; for (const q of ['g', 'y', 'r', 's']) { pick -= wsum[q]; if (pick <= 0) { kk = q; break; } } }
      }
      kind[k] = kk;
      const th = t ? terrainAt(t, px, pz) : null;
      if (th != null && th >= floor - 1 && th < floor + C) { gy[k] = th - SINK; onTerr[k] = 1; }
      else gy[k] = best && bd < 12 ? best.y : floor;
    }
    const K_ = (i, j) => i < 0 || j < 0 || i >= W || j >= H ? '#' : kind[j * W + i];
    const same = (i, j, r, q) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (K_(i + a, j + b) !== q) return false; return true; };
    const openAt = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !occ[j * W + i] && kind[j * W + i] === '.';   // open space (not painted, not built)
    // ---- the ground (where there's no terrain): slabs merged along each row ----
    const GROUND = { g: [K.grass, 10], y: [K.earth, 6], r: [K.rough, 10], s: [K.cobble, 1] };
    const used = new Uint8Array(W * H);                                                     // greedy rectangles of the same kind and height
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, q = kind[k]; if (q === '.' || onTerr[k] || used[k]) continue;
      const okAt = kk => kind[kk] === q && !onTerr[kk] && !used[kk] && gy[kk] === gy[k];
      let e = i + 1; while (e < W && okAt(j * W + e)) e++;
      let jj = j + 1; while (jj < H) { let all = true; for (let a = i; a < e; a++) if (!okAt(jj * W + a)) { all = false; break; } if (!all) break; jj++; }
      for (let b = j; b < jj; b++) for (let a = i; a < e; a++) used[b * W + a] = 1;
      // down to the ground: the terrain under it (lowest corner), or this layer's floor (the lowest layer, above it)
      let bot = Math.min(floor - 0.5, gy[k] - 0.5); if (l > lo) bot = Math.min(bot, lo * C);
      if (t) bot = Math.min(gy[k] - 0.5, ...[[i, j], [e, j], [i, jj], [e, jj]].map(([a, c]) => terrainAt(t, a, c) - 0.4));
      box(i, bot, j, e, gy[k], jj, GROUND[q][0], { tex: GROUND[q][1] });
    }
    // ---- features ----
    const sheds = new Set();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, q = kind[k]; if (q === '.') continue;
      const Y = gy[k], x = i + 0.5, z = j + 0.5, h1 = hash(i, j, l * 7 + 1), h2 = hash(i, j, l * 7 + 2);
      if (q === 'g') {
        if (h1 < 0.03 && same(i, j, 2, 'g')) {                                                 // a tree
          const s = 0.6 + h2 * 0.7, th = 2.6 * s + 1, leaf = K.leaf[Math.floor(hash(i, j, 5) * 4)];
          box(x - 0.22 * s, Y, z - 0.22 * s, x + 0.22 * s, Y + th, z + 0.22 * s, K.timber, { tex: 4 });
          for (const [r, hh, oy] of [[2.0, 1.3, 0.75], [1.5, 1.1, 1.05], [0.85, 0.8, 1.3]]) trim(x - r * s, Y + th * oy - 0.4, z - r * s, x + r * s, Y + th * oy - 0.4 + hh * s, z + r * s, leaf, { tex: 6 });
        } else if (h1 < 0.08 && same(i, j, 1, 'g')) { const s = 0.5 + h2 * 0.6; trim(x - 0.6 * s, Y, z - 0.5 * s, x + 0.6 * s, Y + 0.8 * s, z + 0.5 * s, K.leaf[Math.floor(h2 * 4)], { tex: 6 }); }
        else if (h1 < 0.1) for (let n = 0; n < 4; n++) { const fx = x + (hash(i, j, 20 + n) - 0.5) * 0.8, fz = z + (hash(i, j, 30 + n) - 0.5) * 0.8; trim(fx - 0.07, Y, fz - 0.07, fx + 0.07, Y + 0.18, fz + 0.07, K.flowers[Math.floor(hash(i, j, 40 + n) * 5)], { tex: 6 }); }
      } else if (q === 'y') {
        if (h1 < 0.035 && same(i, j, 1, 'y')) {                                                // crates and barrels
          if (h2 < 0.5) { box(x - 0.42, Y, z - 0.42, x + 0.42, Y + 0.84, z + 0.42, K.wood, { tex: 4 }); trim(x - 0.44, Y + 0.38, z - 0.44, x + 0.44, Y + 0.46, z + 0.44, K.timber, { tex: 4 }); if (h2 < 0.25) box(x - 0.3, Y + 0.84, z - 0.3, x + 0.3, Y + 1.44, z + 0.3, K.wood, { tex: 4 }); }
          else for (const [ox, oz] of [[-0.35, 0], [0.35, 0.1]]) { box(x + ox - 0.3, Y, z + oz - 0.3, x + ox + 0.3, Y + 0.9, z + oz + 0.3, K.wood, { tex: 4 }); trim(x + ox - 0.32, Y + 0.7, z + oz - 0.32, x + ox + 0.32, Y + 0.76, z + oz + 0.32, K.iron, { tex: 6 }); }
        }
        // a fence where the yard meets open space
        for (const [di, dj, a0, b0, a1, b1] of [[0, -1, i, j, i + 1, j + 0.12], [0, 1, i, j + 0.88, i + 1, j + 1], [-1, 0, i, j, i + 0.12, j + 1], [1, 0, i + 0.88, j, i + 1, j + 1]]) {
          if (!openAt(i + di, j + dj)) continue;
          for (const y of [0.4, 1.1]) trim(a0, Y + y, b0, a1, Y + y + 0.1, b1, K.wood, { tex: 4 });
          box(a0, Y, b0, Math.min(a1, a0 + 0.12), Y + 1.5, Math.min(b1, b0 + 0.12), K.timber, { tex: 4 });
          box(a0, Y, b0, a1, Y + 1.25, b1, K.timber, { hidden: true });                          // (the fence's collision)
        }
      } else if (q === 'r') {
        if (h1 < 0.05) for (let n = 0; n < 4; n++) { const s = 0.15 + hash(i, j, 50 + n) * 0.25, rx = x + (hash(i, j, 60 + n) - 0.5) * 0.9, rz = z + (hash(i, j, 70 + n) - 0.5) * 0.9; box(rx - s, Y, rz - s, rx + s, Y + s * (0.6 + hash(i, j, 80 + n)), rz + s, K.stone[n % 3]); }
        else if (h1 < 0.17) trim(x - 0.45, Y, z - 0.45, x + 0.45, Y + 0.3 + h2 * 0.35, z + 0.45, '#4f6a2e', { tex: 6 });
        else if (h1 < 0.2) trim(x - 0.4, Y, z - 0.35, x + 0.4, Y + 0.7, z + 0.35, K.leaf[1], { tex: 6 });
        for (const [di, dj, a0, b0, a1, b1] of [[0, -1, i, j, i + 1, j + 0.4], [0, 1, i, j + 0.6, i + 1, j + 1], [-1, 0, i, j, i + 0.4, j + 1], [1, 0, i + 0.6, j, i + 1, j + 1]])
          if (openAt(i + di, j + dj) && vnoise(i / 3, j / 3, 11) > 0.55) box(a0, Y, b0, a1, Y + 0.3 + vnoise(i / 1.5, j / 1.5, 12) * 1.0, b1, K.stone[0]);   // bits of a broken low wall
      } else if (q === 's') {
        const bi = Math.floor(i / 4) * 4, bj = Math.floor(j / 4) * 4, bk = `${bi},${bj}`; if (sheds.has(bk)) continue; sheds.add(bk);
        let full = true; for (let b = 0; b < 4 && full; b++) for (let a = 0; a < 4; a++) { const kk = (bj + b) * W + bi + a; if (bi + a >= W || bj + b >= H || kind[kk] !== 's' || gy[kk] !== gy[bj * W + bi]) { full = false; break; } }
        if (!full || hash(bi, bj, 90) < 0.12) continue;                                        // a gap now and then: a little yard
        const Y0 = gy[bj * W + bi], x0 = bi + 0.15, x1 = bi + 3.85, z0 = bj + 0.15, z1 = bj + 3.85, hh = 2.6 + hash(bi, bj, 91) * 2.4, wc = K.walls[Math.floor(hash(bi, bj, 92) * 5)];
        const tex = wc === K.walls[4] ? 5 : wc === K.walls[1] ? 4 : wc === K.walls[3] ? 0 : 3, roof = K.roofs[Math.floor(hash(bi, bj, 93) * 5)], rt = hash(bi, bj, 94);
        box(x0, Y0, z0, x1, Y0 + hh, z1, wc, { tex });
        if (rt < 0.45) prism({ type: 'gable', min: [x0 - 0.25, Y0 + hh, z0 - 0.25], max: [x1 + 0.25, Y0 + hh + 1.4, z1 + 0.25], axis: rt < 0.22 ? 'x' : 'z', color: roof, endColor: wc, tex: 2, endTex: tex || 3 });
        else if (rt < 0.8) prism({ type: 'wedge', min: [x0 - 0.25, Y0 + hh, z0 - 0.25], max: [x1 + 0.25, Y0 + hh + 1.0, z1 + 0.25], high: ['+x', '-x', '+z', '-z'][Math.floor(hash(bi, bj, 95) * 4)], thick: 0.08, color: roof, tex: 2 });
        else trim(x0 - 0.1, Y0 + hh, z0 - 0.1, x1 + 0.1, Y0 + hh + 0.25, z1 + 0.1, '#d4c4a4');
        if (hash(bi, bj, 96) < 0.4) box(x0 + 0.3, Y0 + hh, z0 + 0.3, x0 + 0.9, Y0 + hh + 2.0, z0 + 0.9, '#b0634a', { tex: 5 });
      }
    }
  }
}
