// src/game/ground.js — the ground: the terrain (src/data/terrain.js), its paint layers (src/data/ground.js) and the
// dynamic filler (src/data/fill.js) as one surface.
//
//   buildGround(d, kit, shapes, origin, lo) → { surfaces, shapes, splat } or null
//     surfaces  indexed meshes, one per 20 m chunk, on a 2 m grid (texture 10: the shader paints them from `splat`)
//     shapes    collision: a 1 m grid of columns up to the surface, merged where their tops match
//     splat     { w, h, data }: 1 texel per square metre, RGBA = surface kind, moisture, temperature, wetness
//
// The surface WARPS to meet what stands on it: within 4 m of a piece it bends to the piece's floor (under the piece
// it's left out, unless the piece is a cellar more than 4 m under it); within 3.5 m of a road, to the road's paving
// (just under it, so curved edges never show a gap or fight with it). So a tile or road on uneven ground never has
// the ground poking through it or a hole beside it.
// Filler where there is no terrain on its layer makes its own ground: heights blended smoothly from the tiles and
// roads around it, warped the same way, with a skirt down along any open edge.
// Surface kind (splat R): the painted surface, else the filler's kind (yard → dirt, rubble → rough grass, sheds →
// cobbles, greenery → grass), else auto (grass / rock by slope, frost and snow when cold, dry grass or lush by
// moisture). Wetness (A): along the shores of the water table.
// Water table: every 4 m square with a level where the ground dips below it holds water (swimmable).
import { fillOf } from '../data/fill.js';
import { terrainOf } from '../data/terrain.js';
import { groundOf, groundAt, MAT_INDEX, WATER_RES } from '../data/ground.js';
import { samplePath } from '../data/paths.js';
import { carvedTerrain } from '../data/water.js';
import { makeCliffs, rockOut as rockOutAt } from './rock.js';
import { waterClutter, landClutter } from './clutter.js';
import { placeFoliage } from './foliagePlace.js';
import { pieceFoot } from '../data/dungeon.js';

const C = 10, R = 2, SINK = 0.06, PIECE_FALL = 4, ROAD_FALL = 3.5, ROAD_DIP = 0.06, PIECE_DIP = 0.05, CHUNK = 20;
const FILL_MAT = { g: 1, y: 2, r: 9, s: 8 };
const K = { leaf: ['#2f5a22', '#3a6a28', '#28501e', '#36602a'], timber: '#5a3b24', wood: '#7a5232', iron: '#2f2b28',
  stone: ['#bfae8e', '#a49278', '#9a8a72'], flowers: ['#e04a6a', '#f0c040', '#e86a3a', '#c060d0', '#f2f2f2'], roofs: ['#b4553a', '#a4483a', '#5f6f8f', '#7a5a8a', '#b86a3a'], walls: ['#ece0c4', '#7a5232', '#dcc8a8', '#a49278', '#b0634a'] };
// what each kind of tile next door suggests to Auto filler (weights over g y r s)
function suggest(p) {
  const pt = p.part, v = p.variant || 1;
  if (pt === 'F') return [{ g: 1 }, { g: 1 }, { y: 1 }, { r: 1 }, { s: 1 }, { r: 0.5, g: 0.5 }, { g: 1 }][v] || { g: 1 };
  if (pt === 'R' || pt === 'B') return v === 4 ? { g: 1 } : { g: 0.6, y: 0.4 };
  if (pt === 'W') return { g: 0.5, r: 0.5 };
  return { s: 0.5, y: 0.4, g: 0.1 };
}
const hash = (x, z, k) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z, k) => { const i = Math.floor(x), j = Math.floor(z), a = x - i, b = z - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
  return (hash(i, j, k) * (1 - sa) + hash(i + 1, j, k) * sa) * (1 - sb) + (hash(i, j + 1, k) * (1 - sa) + hash(i + 1, j + 1, k) * sa) * sb; };
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function buildGround(d, kit, shapes, origin, lo = 0) {
  const profileOn = !!globalThis.__ELDERMERE_PROFILE_GROUND__ || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('profileGround'));
  const profileStart = profileOn ? performance.now() : 0;
  const profileMarks = [];
  let profileLast = profileStart; const profileMark = label => { if (profileOn) { const at = performance.now(); profileMarks.push({ phase: label, ms: +(at - profileLast).toFixed(2), at }); profileLast = at; } };
  const t = terrainOf(d), f = fillOf(d), gp = groundOf(d); if (!t && !f) return null;
  const W = d.w * C, H = d.h * C, N = W * H, NX = W / R, NZ = H / R, VX = NX + 1, VZ = NZ + 1, NV = VX * VZ;
  // ---- what stands where ----
  const pieceTop = new Float32Array(N).fill(-Infinity), pieceLayers = new Map(), tiles = [], pieceB = new Map();
  for (const [key, p] of Object.entries(d.cells)) {
    const [x, y, b] = key.split(',').map(Number), [fx, fy] = pieceFoot(p), x0 = x * C + (p.ox || 0), z0 = y * C + (p.oz || 0), x1 = x0 + fx * C, z1 = z0 + fy * C, fl = b * C + (p.elev || 0);
    for (let j = Math.max(0, Math.round(z0)); j < Math.min(H, Math.round(z1)); j++) for (let i = Math.max(0, Math.round(x0)); i < Math.min(W, Math.round(x1)); i++) {
      const k = j * W + i; if (fl > pieceTop[k]) pieceTop[k] = fl;
      for (let l = b; l < b + p.height; l++) { let a = pieceLayers.get(l); if (!a) pieceLayers.set(l, a = new Uint8Array(N)); a[k] = 1; }
    }
    const pc = { x0, z0, x1, z1, y: fl, b, w: suggest(p) }; if (p.theme === 'T' || p.theme === 'O') tiles.push(pc);
    for (let i = Math.floor((x0 - PIECE_FALL) / C); i <= Math.floor((x1 + PIECE_FALL) / C); i++) for (let j = Math.floor((z0 - PIECE_FALL) / C); j <= Math.floor((z1 + PIECE_FALL) / C); j++) { const k = i * 4096 + j; (pieceB.get(k) || pieceB.set(k, []).get(k)).push(pc); }
  }
  const roadTop = new Float32Array(N).fill(-Infinity), roadLow = new Float32Array(N).fill(Infinity), roadCover = new Float32Array(N).fill(NaN), roadB = new Map();   // the paving's highest and lowest top touching each square; roadCover: the paving's top where it covers the square's middle
  for (const s of shapes) if (s.path && !s.bridge) {
    const top = s.max[1] - origin.y, x0 = s.min[0] - origin.x, z0 = s.min[2] - origin.z, x1 = s.max[0] - origin.x, z1 = s.max[2] - origin.z;
    for (let j = Math.max(0, Math.floor(z0)); j < Math.min(H, Math.ceil(z1)); j++) for (let i = Math.max(0, Math.floor(x0)); i < Math.min(W, Math.ceil(x1)); i++) { const k = j * W + i; if (top > roadTop[k]) roadTop[k] = top; if (top < roadLow[k]) roadLow[k] = top; if (i + 0.5 >= x0 && i + 0.5 <= x1 && j + 0.5 >= z0 && j + 0.5 <= z1 && !(roadCover[k] > top)) roadCover[k] = top; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bk = Math.floor(cx / C) * 4096 + Math.floor(cz / C); (roadB.get(bk) || roadB.set(bk, []).get(bk)).push([cx, cz, top]);
  }
  // the paving on a half-metre grid (the roads' collision is laid out on it): its top where it covers each half
  // square. A grid point is under the paving when all four half squares round it are
  const W2 = W * 2, H2 = H * 2, half = new Float32Array(W2 * H2).fill(NaN);
  for (const s of shapes) if (s.path && !s.bridge) {
    const top = s.max[1] - origin.y, x0 = s.min[0] - origin.x, z0 = s.min[2] - origin.z, x1 = s.max[0] - origin.x, z1 = s.max[2] - origin.z;
    for (let j = Math.max(0, Math.round(z0 * 2)); j < Math.min(H2, Math.round(z1 * 2)); j++) for (let i = Math.max(0, Math.round(x0 * 2)); i < Math.min(W2, Math.round(x1 * 2)); i++) { const k = j * W2 + i; if (!(half[k] > top)) half[k] = top; }
  }
  const pavedAt = (x, z, h) => { const i = Math.round(x * 2), j = Math.round(z * 2); for (const [a, b] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W2 || jj >= H2) return false; const tp = half[jj * W2 + ii]; if (!(tp - h > -1.2 && tp - h < 0.8)) return false; } return true; };
  // the warp at a grid point: base height h → bent toward nearby pieces' floors and roads' paving
  const warp = (x, z, h) => {
    let sw = 0, sd = 0, under = null;
    for (const pc of pieceB.get(Math.floor(x / C) * 4096 + Math.floor(z / C)) || []) {
      if (pc.y < h - 4) continue;                                                          // a cellar: the ground stays over it
      const dd = Math.hypot(Math.max(pc.x0 - x, 0, x - pc.x1), Math.max(pc.z0 - z, 0, z - pc.z1));
      if (dd <= 0.01) { if (under == null || pc.y > under) under = pc.y; continue; }
      if (dd >= PIECE_FALL) continue; const w = smooth(1 - dd / PIECE_FALL); sw += w; sd += w * (pc.y - PIECE_DIP - h);
    }
    if (under != null) return under - PIECE_DIP;
    const ci = Math.round(x), cj = Math.round(z), rr = Math.ceil(ROAD_FALL);
    let best = Infinity, bt = 0;
    // the nearest road square: its paving's top there (at a road's edge, the pavement), which the ground meets
    // from either side (cut down to it, or built up to it), so there's no trench or wall along the road
    for (let b = -rr; b < rr; b++) for (let a = -rr; a < rr; a++) { const i = ci + a, j = cj + b; if (i < 0 || j < 0 || i >= W || j >= H) continue; const top = roadCover[j * W + i]; if (Number.isNaN(top) || Math.abs(top - h) > 6) continue; const dd = Math.hypot(i + 0.5 - x, j + 0.5 - z); if (dd < best || (dd === best && top < bt)) { best = dd; bt = top; } }
    if (best <= 0.75) return bt - ROAD_DIP;                                                 // at (or under) the road's edge: just below its paving
    if (best < ROAD_FALL) { const w = smooth(1 - (best - 0.75) / (ROAD_FALL - 0.75)); sw += w * 1.5; sd += w * 1.5 * (bt - ROAD_DIP - h); }
    return sw > 0 ? h + sd / Math.max(1, sw) : h;
  };
  const isRoadAt = (k, h) => roadTop[k] > -Infinity && Math.abs(roadTop[k] - h) < 4;
  profileMark('occupancy + roads');
  // ---- the filler: per layer, each painted square's kind; off-terrain layers get their own ground ----
  const kinds = new Map(), sheets = [];                                                     // sheets: { heights (per grid point, NaN unused), quads (Uint8: 1 own, 2 under a road's edge), l, kind }
  const CT = carvedTerrain(d), bodies = CT?.bodies || [];                                    // the terrain with its rivers and lakes carved in (src/data/water.js)
  const TH = new Float32Array(NV); if (t) for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) TH[j * VX + i] = CT.h[Math.min(t.nz - 1, j) * t.nx + Math.min(t.nx - 1, i)] - SINK;
  let thMin = Infinity; for (let v = 0; v < NV; v++) thMin = Math.min(thMin, TH[v]);
  const LOB = Math.min(lo * C - 3, (Number.isFinite(thMin) ? thMin : lo * C) - 3);          // the deepest the earth goes (skirts, collision): under the lowest ground, however deep it's dug
  const tQuad = (i, j) => (TH[j * VX + i] + TH[j * VX + i + 1] + TH[(j + 1) * VX + i] + TH[(j + 1) * VX + i + 1]) / 4;
  if (f) for (const [ls, mask] of Object.entries(f.layers)) {
    const l = +ls, floor = l * C, occ = pieceLayers.get(l), kind = new Array(N).fill('.'), inLayer = y => y >= floor - 1 && y < floor + C;
    const near = tiles.filter(n => Math.abs(n.b - l) <= 1 && n.y >= floor - 3 && n.y < floor + C + 3);
    const quads = new Uint8Array(NX * NZ); let any = false;
    for (let k = 0; k < N; k++) {
      const m = mask[k]; if (m === '.' || occ?.[k] || inLayer(roadTop[k])) continue;
      const i = k % W, j = (k - i) / W, px = i + 0.5, pz = j + 0.5; let kk = m;
      if (m === 'a') {
        const ws = { g: 0, y: 0, r: 0, s: 0 };
        for (const n of near) { const dd = Math.hypot(Math.max(n.x0 - px, 0, px - n.x1), Math.max(n.z0 - pz, 0, pz - n.z1)); if (dd > 24) continue; const wt = 1 / ((1 + dd / 4) ** 2); for (const [q, v] of Object.entries(n.w)) ws[q] += v * wt; }
        const tot = ws.g + ws.y + ws.r + ws.s; if (tot < 1e-4) kk = 'g';
        else { let pick = Math.min(0.999, Math.max(0, (vnoise(px / 8, pz / 8, l * 3 + 1) * 0.7 + vnoise(px / 3, pz / 3, l * 3 + 2) * 0.25 + hash(i, j, 9) * 0.05 - 0.5) * 1.6 + 0.5)) * tot; kk = 's'; for (const q of ['g', 'y', 'r', 's']) { pick -= ws[q]; if (pick <= 0) { kk = q; break; } } }
      }
      kind[k] = kk;
      const qi = Math.floor(i / R), qj = Math.floor(j / R);
      // a plate of filler at this layer's height, where the terrain isn't in the layer; never over painted water, and
      // never over ground dug below the ground floor (a pond or pit dug from layer 0 down isn't capped by filler)
      const tq = t ? tQuad(qi, qj) : null, wetSq = gp?.water?.[`${qi},${qj}`] !== undefined;
      if (!(t && inLayer(tq)) && !wetSq && !(t && l <= 0 && tq < floor - 1)) { quads[qj * NX + qi] = 1; any = true; }
    }
    kinds.set(l, kind);
    if (!any) continue;
    // reach in under nearby road edges (2 m), so curves never leave a gap
    const own = quads.slice();
    for (let q = 0; q < NX * NZ; q++) if (own[q] === 1) { const qi = q % NX, qj = (q - qi) / NX; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = qi + a, jj = qj + b; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || quads[jj * NX + ii]) continue; const k = (jj * R + 1) * W + ii * R + 1; if (inLayer(roadTop[k]) && !occ?.[k]) quads[jj * NX + ii] = 2; } }
    // heights: blended from the tiles and roads around (smooth), then warped like the terrain
    const HF = new Float32Array(NV).fill(NaN);
    const blend = (x, z) => {
      let sw = 0, sy = 0;
      for (const n of near) { const dd = Math.hypot(Math.max(n.x0 - x, 0, x - n.x1), Math.max(n.z0 - z, 0, z - n.z1)); if (dd > 30) continue; const wt = 1 / (0.3 + dd) ** 2; sw += wt; sy += wt * n.y; }
      const bi = Math.floor(x / C), bj = Math.floor(z / C);
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) for (const [rx, rz, ry] of roadB.get((bi + a) * 4096 + bj + b) || []) { if (!inLayer(ry)) continue; const dd = Math.hypot(rx - x, rz - z); if (dd > 12) continue; const wt = 1 / (0.3 + dd) ** 2; sw += wt; sy += wt * ry; }
      return sw > 1e-6 ? sy / sw : floor;
    };
    for (let q = 0; q < NX * NZ; q++) if (quads[q]) { const qi = q % NX, qj = (q - qi) / NX; for (const [a, b] of [[qi, qj], [qi + 1, qj], [qi, qj + 1], [qi + 1, qj + 1]]) { const v = b * VX + a; if (Number.isNaN(HF[v])) HF[v] = warp(a * R, b * R, blend(a * R, b * R)); } }
    sheets.push({ HF, quads, l, kind, occ, terrain: false });
  }
  if (t) {                                                                                  // the terrain sheet: everywhere, but under pieces
    const HF = new Float32Array(NV); for (let v = 0; v < NV; v++) HF[v] = warp((v % VX) * R, Math.floor(v / VX) * R, TH[v]);
    const quads = new Uint8Array(NX * NZ);
    for (let q = 0; q < NX * NZ; q++) {
      const qi = q % NX, qj = (q - qi) / NX, h0 = tQuad(qi, qj), h = (HF[qj * VX + qi] + HF[qj * VX + qi + 1] + HF[(qj + 1) * VX + qi] + HF[(qj + 1) * VX + qi + 1]) / 4; let hidden = 0;   // (h: as warped, for roads; h0: as carved, for cellars)
      for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) { const k = (qj * R + b) * W + qi * R + a; if (pieceTop[k] >= h0 - 4 || (roadCover[k] - h > -1.2 && roadCover[k] - h < 0.8)) hidden++; }   // (under a piece, or right under a road's paving; a road well above the ground keeps the ground drawn below it)
      quads[q] = hidden === R * R ? 0 : 1;
    }
    sheets.unshift({ HF, quads, l: null, terrain: true });
  }
  profileMark('filler sheets');
  // ---- the meshes: per 20 m chunk, shared grid points, smooth normals ----
  const surfaces = [], cols = [];
  const per = CHUNK / R;
  // Fine chunks: where the terrain meets roads, pieces or water it's built on a 1 m grid instead, and only the
  // squares entirely under a piece or the paving are left out, so its edge follows a curved road closely (no
  // square gaps). A skirt along a fine chunk's border with a coarse one hides the seam.
  const TER = sheets.find(S => S.terrain), fine = new Uint8Array(Math.ceil(NX / per) * Math.ceil(NZ / per)), CW = Math.ceil(NX / per);
  const fineH = new Map(), meterH = new Float32Array(N).fill(NaN);
  const baseAt = (x, z) => { const fx = Math.min(NX - 1e-4, x / R), fz = Math.min(NZ - 1e-4, z / R), i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j; return (TH[j * VX + i] * (1 - a) + TH[j * VX + i + 1] * a) * (1 - b) + (TH[(j + 1) * VX + i] * (1 - a) + TH[(j + 1) * VX + i + 1] * a) * b; };
  const FH = (x, z) => { x = Math.max(0, Math.min(W, x)); z = Math.max(0, Math.min(H, z)); if (x % R === 0 && z % R === 0) return TER.HF[(z / R) * VX + x / R]; const k = x * 65536 + z; let v = fineH.get(k); if (v === undefined) { v = warp(x, z, baseAt(x, z)); fineH.set(k, v); } return v; };
  // cliffs: ground too steep for a slope becomes rock (src/game/rock.js); wet where a waterfall pours over it
  const fallsL = bodies.flatMap(B => B.falls || []);
  const wetAt = (x, y, z) => fallsL.some(f => { const rx = x - f.x, rz = z - f.z, al = rx * f.dx + rz * f.dz, ac = Math.abs(rz * f.dx - rx * f.dz); return al > -2 && al < 4 && ac < 7 && y < f.top + 0.5 && y > f.bot - 1.5; });
  const ROCK = TER ? makeCliffs({ W, H, FH, blocked: (i, j) => pieceTop[j * W + i] > -Infinity || roadTop[j * W + i] > -Infinity, wetAt, origin }) : null;
  if (TER) for (let cj = 0; cj < NZ; cj += per) for (let ci = 0; ci < NX; ci += per) {
    let need = false;
    if (ROCK?.any) for (let j = cj * R; j < Math.min(H, (cj + per) * R) && !need; j++) for (let i = ci * R; i < Math.min(W, (ci + per) * R); i++) if (ROCK.weight(i + 0.5, j + 0.5) > 0) { need = true; break; }
    for (let j = cj * R; j < Math.min(H, (cj + per) * R) && !need; j++) for (let i = ci * R; i < Math.min(W, (ci + per) * R); i++) { const k = j * W + i; if (roadTop[k] > -Infinity || pieceTop[k] > -Infinity || (bodies.length && gp?.water?.[`${Math.floor(i / R)},${Math.floor(j / R)}`] !== undefined)) { need = true; break; } }
    if (need) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = ci / per + a, jj = cj / per + b; if (ii >= 0 && jj >= 0 && ii < CW && jj < Math.ceil(NZ / per)) fine[jj * CW + ii] = 1; }   // (and the chunks round it, so a road's falloff is fine too)
  }
  for (const S of sheets) {
    const { HF, quads } = S, hAt = (i, j) => HF[Math.max(0, Math.min(VZ - 1, j)) * VX + Math.max(0, Math.min(VX - 1, i))];
    for (let cj = 0; cj < NZ; cj += per) for (let ci = 0; ci < NX; ci += per) {
      if (S.terrain && fine[(cj / per) * CW + ci / per]) {                                  // ---- a fine chunk ----
        const P = [], Nn = [], I = [], vmap = new Map();
        const vf = (x, z, y = FH(x, z), side = null) => { const key = `${x},${z},${y}${side ? side.join() : ''}`; let n = vmap.get(key); if (n !== undefined) return n; n = P.length / 3; P.push(origin.x + x, origin.y + y, origin.z + z);
          if (side) Nn.push(side[0], 0, side[1]); else { const nx = -(FH(x + 1, z) - FH(x - 1, z)) / 2, nz = -(FH(x, z + 1) - FH(x, z - 1)) / 2, ln = Math.hypot(nx, 1, nz); Nn.push(nx / ln, 1 / ln, nz / ln); } vmap.set(key, n); return n; };
        const x0 = ci * R, z0 = cj * R, x1 = Math.min(W, (ci + per) * R), z1 = Math.min(H, (cj + per) * R);
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
          const k = z * W + x, h0 = baseAt(x + 0.5, z + 0.5), hs = [FH(x, z), FH(x + 1, z), FH(x + 1, z + 1), FH(x, z + 1)], hm = (hs[0] + hs[1] + hs[2] + hs[3]) / 4;
          if (pieceTop[k] >= h0 - 4) continue;                                                // under a piece
          if (pavedAt(x, z, hm) && pavedAt(x + 1, z, hm) && pavedAt(x, z + 1, hm) && pavedAt(x + 1, z + 1, hm)) continue;   // entirely under the paving
          meterH[k] = hm;
          if (ROCK?.any && Math.max(ROCK.weight(x, z), ROCK.weight(x + 1, z), ROCK.weight(x, z + 1), ROCK.weight(x + 1, z + 1)) > 0) {   // rock: a quarter-metre grid, pushed out by the rock shape
            const Q = 4, rv = (px, pz) => { const key = `r${px},${pz}`; let n = vmap.get(key); if (n !== undefined) return n; n = P.length / 3; const q = ROCK.pos(px, pz); P.push(origin.x + q[0], origin.y + q[1], origin.z + q[2]);
              const e2 = 0.06, A = ROCK.pos(px - e2, pz), Bq = ROCK.pos(px + e2, pz), Cq = ROCK.pos(px, pz - e2), D = ROCK.pos(px, pz + e2), tx = [Bq[0] - A[0], Bq[1] - A[1], Bq[2] - A[2]], tz = [D[0] - Cq[0], D[1] - Cq[1], D[2] - Cq[2]];
              let nx = tz[1] * tx[2] - tz[2] * tx[1], ny = tz[2] * tx[0] - tz[0] * tx[2], nz = tz[0] * tx[1] - tz[1] * tx[0]; const ln = Math.hypot(nx, ny, nz) || 1; Nn.push(nx / ln, ny / ln, nz / ln); vmap.set(key, n); return n; };
            for (let b2 = 0; b2 < Q; b2++) for (let a2 = 0; a2 < Q; a2++) { const xa = x + a2 / Q, za = z + b2 / Q, xb = xa + 1 / Q, zb = za + 1 / Q; const a = rv(xa, za), b = rv(xb, za), e = rv(xb, zb), g = rv(xa, zb); I.push(a, e, b, a, g, e); }
            continue;
          }
          const a = vf(x, z), b = vf(x + 1, z), e = vf(x + 1, z + 1), g = vf(x, z + 1); I.push(a, e, b, a, g, e);
        }
        // skirts: along the borders with coarse chunks (hiding the seam) and the map's edge
        const edges = [[z0 === 0 || !fine[(cj / per - 1) * CW + ci / per], (x) => [x, z0, x + 1, z0, [0, -1]], x0, x1], [z1 === H || !fine[(cj / per + 1) * CW + ci / per], (x) => [x + 1, z1, x, z1, [0, 1]], x0, x1],
          [x0 === 0 || !fine[(cj / per) * CW + ci / per - 1], (z) => [x0, z + 1, x0, z, [-1, 0]], z0, z1], [x1 === W || !fine[(cj / per) * CW + ci / per + 1], (z) => [x1, z, x1, z + 1, [1, 0]], z0, z1]];
        for (const [on, seg, a0, a1] of edges) if (on) for (let a = a0; a < a1; a++) {
          const [xa, za, xb, zb, sd] = seg(a), edge = xa === 0 || xb === 0 || za === 0 || zb === 0 || xa === W || xb === W || za === H || zb === H, bot = edge ? LOB : Math.min(FH(xa, za), FH(xb, zb)) - 0.6;
          const p0 = vf(xa, za, undefined, sd), p1 = vf(xb, zb, undefined, sd), p2 = vf(xb, zb, bot, sd), p3 = vf(xa, za, bot, sd); I.push(p0, p1, p2, p0, p2, p3);
        }
        if (I.length) surfaces.push({ positions: new Float32Array(P), normals: new Float32Array(Nn), index: I, tex: 10 });
        continue;
      }
      const vmap = new Map(), P = [], Nn = [], I = [];
      const vert = (i, j, y = hAt(i, j), side = null) => {                                // side: [nx, nz] for a skirt's points (facing out, not up)
        const key = `${i},${j},${y}${side ? side.join() : ''}`; let n = vmap.get(key); if (n !== undefined) return n;
        n = P.length / 3; P.push(origin.x + i * R, origin.y + y, origin.z + j * R);
        if (side) Nn.push(side[0], 0, side[1]);
        else { let gx = hAt(i + 1, j) - hAt(i - 1, j), gz = hAt(i, j + 1) - hAt(i, j - 1); if (Number.isNaN(gx)) gx = 0; if (Number.isNaN(gz)) gz = 0;
          const nx = -gx / (2 * R), nz = -gz / (2 * R), ln = Math.hypot(nx, 1, nz); Nn.push(nx / ln, 1 / ln, nz / ln); }
        vmap.set(key, n); return n;
      };
      for (let qj = cj; qj < Math.min(NZ, cj + per); qj++) for (let qi = ci; qi < Math.min(NX, ci + per); qi++) {
        if (!quads[qj * NX + qi]) continue;
        const a = vert(qi, qj), b = vert(qi + 1, qj), e = vert(qi + 1, qj + 1), g = vert(qi, qj + 1); I.push(a, e, b, a, g, e);
        if (!S.terrain) for (const [di, dj, i0, j0, i1, j1] of [[0, -1, qi, qj, qi + 1, qj], [0, 1, qi + 1, qj + 1, qi, qj + 1], [-1, 0, qi, qj + 1, qi, qj], [1, 0, qi + 1, qj, qi + 1, qj + 1]]) {
          const sd = [di, dj];   // a skirt down along an open edge
          const ii = qi + di, jj = qj + dj; if (ii >= 0 && jj >= 0 && ii < NX && jj < NZ && (quads[jj * NX + ii] || S.occ?.[(jj * R + 1) * W + ii * R + 1])) continue;
          const bot = Math.min(hAt(i0, j0), hAt(i1, j1)) - 0.5, b0 = t ? Math.min(bot, TH[j0 * VX + i0] - 0.4, TH[j1 * VX + i1] - 0.4) : Math.min(bot, lo * C - 0.5);
          const p0 = vert(i0, j0, undefined, sd), p1 = vert(i1, j1, undefined, sd), p2 = vert(i1, j1, b0, sd), p3 = vert(i0, j0, b0, sd); I.push(p0, p1, p2, p0, p2, p3);
        }
        if (S.terrain) for (const [on, i0, j0, i1, j1, sd] of [[qj === 0, qi, qj, qi + 1, qj, [0, -1]], [qj === NZ - 1, qi + 1, qj + 1, qi, qj + 1, [0, 1]], [qi === 0, qi, qj + 1, qi, qj, [-1, 0]], [qi === NX - 1, qi + 1, qj, qi + 1, qj + 1, [1, 0]]]) {
          if (!on) continue;                                                                   // an earth skirt round the map's edge
          const b0 = LOB, p0 = vert(i0, j0, undefined, sd), p1 = vert(i1, j1, undefined, sd), p2 = vert(i1, j1, b0, sd), p3 = vert(i0, j0, b0, sd); I.push(p0, p1, p2, p0, p2, p3);
        }
      }
      if (!I.length) continue;
      surfaces.push({ positions: new Float32Array(P), normals: new Float32Array(Nn), index: I, tex: 10 });
    }
    // collision: a column per square metre (its height from the warped grid), not under roads
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const qi = Math.floor(i / R), qj = Math.floor(j / R); if ((!quads[qj * NX + qi] && !(S.terrain && fine[Math.floor(qj / per) * CW + Math.floor(qi / per)])) || quads[qj * NX + qi] === 2) continue;
      const k = j * W + i, fineHere = S.terrain && fine[Math.floor(qj / per) * CW + Math.floor(qi / per)];
      if (fineHere && Number.isNaN(meterH[k])) continue;                                   // (left out of a fine chunk: under a piece or the paving)
      const fx = (i + 0.5) / R - qi, fz = (j + 0.5) / R - qj;
      const h = fineHere ? meterH[k] : (hAt(qi, qj) * (1 - fx) + hAt(qi + 1, qj) * fx) * (1 - fz) + (hAt(qi, qj + 1) * (1 - fx) + hAt(qi + 1, qj + 1) * fx) * fz;
      if (!fineHere && (isRoadAt(k, h) || pieceTop[k] >= h - 0.3)) continue;
      const fld = S.terrain && ROCK ? ROCK.fieldAt(i, j) : null;
      // a cliff's square is solid right up to the top of the cliff behind it: one climbable wall at its foot, not a
      // stair of 1 m columns (too tall to step up, too short to climb)
      const hc = fld ? Math.max(h, fld.top(fld.uOf(origin.x + i + 0.5, origin.z + j + 0.5)) - origin.y) : h;
      cols.push([i, j, Math.round((Number.isFinite(hc) ? hc : h) * 20) / 20, S.terrain ? LOB : h - 1.5, fld]);
    }
    S.hAt = (x, z) => { const qi = Math.min(NX - 1, Math.max(0, Math.floor(x / R))), qj = Math.min(NZ - 1, Math.max(0, Math.floor(z / R))), fx = x / R - qi, fz = z / R - qj;
      return (hAt(qi, qj) * (1 - fx) + hAt(qi + 1, qj) * fx) * (1 - fz) + (hAt(qi, qj + 1) * (1 - fx) + hAt(qi + 1, qj + 1) * fx) * fz; };
  }
  cols.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const outShapes = [];
  for (let n = 0; n < cols.length;) {
    const [i, j, top, bot, fld] = cols[n]; let e = n + 1, i1 = i + 1, b2 = bot;
    while (e < cols.length && cols[e][1] === j && cols[e][0] === i1 && cols[e][2] === top && cols[e][4] === fld) { b2 = Math.min(b2, cols[e][3]); i1++; e++; }
    outShapes.push({ type: 'box', hidden: true, surface: fld ? 'climbStone' : 'grass', terrain: true, ...(fld ? { field: fld, cliff: true } : {}), min: [origin.x + i, origin.y + b2, origin.z + j], max: [origin.x + i1, origin.y + top, origin.z + j + 1] });   // (a cliff's columns: a climbing face)
    n = e;
  }
  profileMark('terrain mesh');
  // ---- the water: each body's squares, merged along each row where level and flow match; wet shores ----
  const TS = sheets.find(S => S.terrain), wet = new Uint8Array(N);
  const fx2 = kit.waterFx || (kit.waterFx = { mist: [], spray: [], fleck: [] }), sounds = kit.waterSounds || (kit.waterSounds = []);
  const wDepth = new Float32Array(N).fill(-1), wSpeed = new Float32Array(N), wSD = new Float32Array(N), wLv = new Float32Array(N);   // the water per square metre, for the plants
  if (bodies.length) {
    const flows = (gp.flows || []).filter(fl => fl.points?.length >= 2).map(fl => ({ fl, S: samplePath({ points: fl.points }, 1) }));
    for (const B of bodies) {
      // the flow at each square: along the nearest flow line through this body, fading out past its ends and far to the side
      const mine = flows.filter(F => F.S.some(q => B.has.has(`${Math.floor(q.x / R)},${Math.floor(q.z / R)}`)));
      const flowAt = (x, z, raw = false) => {
        let best = null, bd = Infinity;
        for (const F of mine) for (let n = 0; n < F.S.length; n++) { const q = F.S[n], dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bd) { bd = dd; best = { F, n }; } }
        if (!best) return null;
        const { F, n } = best, S = F.S, a = S[Math.max(0, n - 1)], b = S[Math.min(S.length - 1, n + 1)], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        let k = 1 - smooth((Math.sqrt(bd) - 12) / 20);                                         // fades from 12 m to the side
        const end = n === 0 ? a : n === S.length - 1 ? b : null; if (end) { const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len, past = n === 0 ? -((x - a.x) * tx + (z - a.z) * tz) : (x - b.x) * tx + (z - b.z) * tz; if (past > 0) k *= 1 - smooth(past / 8); }
        const sp = (F.fl.speed ?? 1.5) * k; if (sp < 0.05) return null;
        if (raw) return { x: (b.x - a.x) / len * sp, z: (b.z - a.z) / len * sp };
        return { x: Math.round((b.x - a.x) / len * sp * 4) / 4, z: Math.round((b.z - a.z) / len * sp * 4) / 4 };
      };
      // ---- the surface as one mesh on a 1 m grid (like the roads). It spreads out from the body's squares to
      // wherever the ground lies under the water (up to a square past them, never under a road or piece), so its edge
      // is the ground's own smooth contour, not the painted squares. Per corner: depth, distance from the shore,
      // the current (fastest mid-stream, slowing to the banks; faster in rapids) and how rough the water is.
      // A river's surface follows its flow downhill (src/data/water.js); where it drops it falls as a curtain.
      const hW = (x, z) => TER ? FH(x, z) : B.level - 1;
      const LV = B.levelAt ? (x, z) => B.levelAt(x, z) : () => ({ lv: B.level, rough: 0 });
      const near = new Set(); for (const [ci, cj] of B.cells) for (let b2 = -1; b2 <= 1; b2++) for (let a2 = -1; a2 <= 1; a2++) near.add((ci + a2) * 65536 + cj + b2);
      let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
      for (const [ci, cj] of B.cells) { bx0 = Math.min(bx0, ci * R - 2 * R); bz0 = Math.min(bz0, cj * R - 2 * R); bx1 = Math.max(bx1, ci * R + 3 * R); bz1 = Math.max(bz1, cj * R + 3 * R); }
      bx0 = Math.max(0, bx0); bz0 = Math.max(0, bz0); bx1 = Math.min(W, bx1); bz1 = Math.min(H, bz1);
      const GW = bx1 - bx0 + 1, GH = bz1 - bz0 + 1, gi = (x, z) => (z - bz0) * GW + (x - bx0);
      const depth = new Float32Array(GW * GH), lvl = new Float32Array(GW * GH), rgh = new Float32Array(GW * GH), quadIn = new Uint8Array(GW * GH);
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const k = gi(x, z), q = LV(x, z), hg = hW(x, z); lvl[k] = q.lv; rgh[k] = q.rough;
        // past a fall's lip (the ground has dropped away below), the upper surface stops: no shelf of water hanging
        // out over the drop; these corners belong to the pool below
        for (const f of B.falls || []) { const rx = x - f.x, rz = z - f.z, al = rx * f.dx + rz * f.dz, ac = Math.abs(rz * f.dx - rx * f.dz); if (al > -4 && al < 10 && ac < 16 && lvl[k] > f.bot + 0.05 && hg < lvl[k] - 1.2) { lvl[k] = f.bot; rgh[k] = 1; } }
        depth[k] = lvl[k] - hg;
      }
      const corners = (x, z) => [gi(x, z), gi(x + 1, z), gi(x, z + 1), gi(x + 1, z + 1)];
      const wetQ = (x, z) => corners(x, z).some(k => depth[k] > 0), fallQ = (x, z) => { const c = corners(x, z).map(k => lvl[k]); return Math.max(...c) - Math.min(...c) > 0.5 && (B.falls || []).some(f => Math.abs((x + 0.5 - f.x) * f.dx + (z + 0.5 - f.z) * f.dz) < 3); };   // (a steep stretch that isn't a fall stays a sloping surface: rapids)
      const blockedM = (x, z) => { const k = z * W + x; return roadTop[k] > -Infinity || pieceTop[k] > -Infinity; };
      const stack = [];
      for (const [ci, cj] of B.cells) for (let z = cj * R; z < cj * R + R; z++) for (let x = ci * R; x < ci * R + R; x++) if (x >= bx0 && z >= bz0 && x < bx1 && z < bz1 && !quadIn[gi(x, z)] && corners(x, z).some(k => depth[k] > -0.15)) { quadIn[gi(x, z)] = 1; stack.push([x, z]); }
      while (stack.length) { const [x, z] = stack.pop(); for (const [a2, b2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + a2, zz = z + b2; if (xx < bx0 || zz < bz0 || xx >= bx1 || zz >= bz1 || quadIn[gi(xx, zz)]) continue;
        if (!near.has(Math.floor(xx / R) * 65536 + Math.floor(zz / R)) || blockedM(xx, zz) || !wetQ(xx, zz)) continue; quadIn[gi(xx, zz)] = 1; stack.push([xx, zz]); } }
      // distance from the shore (a chamfer pass): 0 on dry corners and at the mesh's edge (a road wall, say)
      const SD = new Float32Array(GW * GH);
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const all = x > bx0 && z > bz0 && x < bx1 && z < bz1 && quadIn[gi(x - 1, z - 1)] && quadIn[gi(x, z - 1)] && quadIn[gi(x - 1, z)] && quadIn[gi(x, z)];
        SD[gi(x, z)] = !all || depth[gi(x, z)] <= 0.05 ? 0 : 1e9;
      }
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) { const k = gi(x, z); if (!SD[k]) continue; let v = SD[k]; if (x > bx0) v = Math.min(v, SD[k - 1] + 1); if (z > bz0) { v = Math.min(v, SD[k - GW] + 1); if (x > bx0) v = Math.min(v, SD[k - GW - 1] + 1.414); if (x < bx1) v = Math.min(v, SD[k - GW + 1] + 1.414); } SD[k] = v; }
      for (let z = bz1; z >= bz0; z--) for (let x = bx1; x >= bx0; x--) { const k = gi(x, z); if (!SD[k]) continue; let v = SD[k]; if (x < bx1) v = Math.min(v, SD[k + 1] + 1); if (z < bz1) { v = Math.min(v, SD[k + GW] + 1); if (x < bx1) v = Math.min(v, SD[k + GW + 1] + 1.414); if (x > bx0) v = Math.min(v, SD[k + GW - 1] + 1.414); } SD[k] = v; }
      // the widest point within 6 m round each corner: the current runs at full speed there, falling off to the banks
      const MX = new Float32Array(GW * GH), tmp = new Float32Array(GW * GH), RM = 6;
      for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { let m = 0; for (let a = Math.max(0, x - RM); a <= Math.min(GW - 1, x + RM); a++) m = Math.max(m, SD[z * GW + a]); tmp[z * GW + x] = m; }
      for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { let m = 0; for (let b = Math.max(0, z - RM); b <= Math.min(GH - 1, z + RM); b++) m = Math.max(m, tmp[b * GW + x]); MX[z * GW + x] = m; }
      const FL = new Float32Array(GW * GH * 2);
      if (mine.length) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const k = gi(x, z), fl = flowAt(x, z, true); if (!fl) continue;
        const f = Math.min(1, SD[k] / Math.max(0.75, MX[k])), prof = (1 - (1 - f) * (1 - f)) * (1 + 1.5 * rgh[k]);   // a parabola across the stream; rapids run faster
        FL[k * 2] = fl.x * prof; FL[k * 2 + 1] = fl.z * prof;
      }
      // clutter in the water (src/game/clutter.js): stones and driftwood at the edges, boulders out in the stream; the
      // water foams round a boulder (and breaks white past it in a current); boulders are solid, and climbable
      const clutD = (ci, cj) => +groundAt(gp, 'clut', ci * R + 1, cj * R + 1) || 0;
      const wAt = (x, z) => { const xi = Math.round(x), zi = Math.round(z); if (xi < bx0 || zi < bz0 || xi > bx1 || zi > bz1) return null; const k = gi(xi, zi); return depth[k] > 0.05 ? { depth: depth[k], shore: SD[k] } : null; };
      const boulders = !gp?.clut ? [] : waterClutter(kit, clutD, B.cells, wAt, B.level, Math.round(origin.x * 7 + origin.z * 3));
      for (const st2 of boulders.stones || []) { const k = gi(Math.round(Math.max(bx0, Math.min(bx1, st2.x))), Math.round(Math.max(bz0, Math.min(bz1, st2.z)))), sp = Math.hypot(FL[k * 2], FL[k * 2 + 1]); if (sp > 0.3) sounds.push({ kind: 'gurgle', x: origin.x + st2.x, y: origin.y + B.level, z: origin.z + st2.z, s: Math.min(0.4, sp / 4) }); }
      for (const b of boulders) {
        { const k = gi(Math.round(Math.max(bx0, Math.min(bx1, b.x))), Math.round(Math.max(bz0, Math.min(bz1, b.z)))), sp = Math.hypot(FL[k * 2], FL[k * 2 + 1]); sounds.push({ kind: 'gurgle', x: origin.x + b.x, y: origin.y + B.level, z: origin.z + b.z, s: 0.3 + Math.min(0.7, sp / 2) }); }   // water breaking on it
        outShapes.push({ type: 'box', hidden: true, surface: 'climbStone', min: [origin.x + b.x - b.r * 0.7, origin.y + b.bed, origin.z + b.z - b.r * 0.7], max: [origin.x + b.x + b.r * 0.7, origin.y + b.top - 0.15, origin.z + b.z + b.r * 0.7] });
        for (let z = Math.max(bz0, Math.floor(b.z - b.r - 4)); z <= Math.min(bz1, Math.ceil(b.z + b.r + 4)); z++) for (let x = Math.max(bx0, Math.floor(b.x - b.r - 4)); x <= Math.min(bx1, Math.ceil(b.x + b.r + 4)); x++) {
          const k = gi(x, z), d0 = Math.hypot(x - b.x, z - b.z) - b.r, fx = FL[k * 2], fz = FL[k * 2 + 1], sp = Math.hypot(fx, fz);
          let ring = d0 < 1.4 ? 1 - Math.max(0, d0) / 1.4 : 0;                                // foam hugging the rock
          if (sp > 0.3) { const al = ((x - b.x) * fx + (z - b.z) * fz) / sp, ac = Math.abs(((z - b.z) * fx - (x - b.x) * fz) / sp); if (al > 0 && al < 4 + sp * 2 && ac < b.r * (0.6 + al * 0.15)) ring = Math.max(ring, (1 - al / (4 + sp * 2)) * Math.min(1, sp / 1.2)); }   // a white wake downstream
          rgh[k] = Math.max(rgh[k], ring * 0.9);
          if (ring > 0.5 && sp > 0.4 && !(x % 2) && !(z % 2)) fx2.fleck.push([origin.x + x, origin.y + lvl[k], origin.z + z, fx / sp, fz / sp, Math.min(2, sp)]);
        }
      }
      // spray over rapids, and the sound of running water (src/gfx/water.js draws the spray, src/game/audio.js the sound)
      for (let z = bz0; z <= bz1; z += 2) for (let x = bx0; x <= bx1; x += 2) {
        const k = gi(x, z); if (depth[k] <= 0.1) continue; const sp = Math.hypot(FL[k * 2], FL[k * 2 + 1]);
        if (rgh[k] > 0.55 && sp > 0.6) fx2.fleck.push([origin.x + x, origin.y + lvl[k], origin.z + z, FL[k * 2] / sp, FL[k * 2 + 1] / sp, Math.min(2.5, sp)]);
        if (!(x % 4) && !(z % 4) && (sp > 0.3 || rgh[k] > 0.4)) { const S = { x: origin.x + x, y: origin.y + lvl[k], z: origin.z + z }; sounds.push({ kind: 'river', ...S, s: Math.min(0.6, 0.2 + sp / 4) }); if (rgh[k] > 0.4) sounds.push({ kind: 'rough', ...S, s: rgh[k] * 0.6 }); }
      }
      for (let z = bz0; z < Math.min(bz1, H); z++) for (let x = bx0; x < Math.min(bx1, W); x++) if (quadIn[gi(x, z)]) { const k = gi(x, z), m = z * W + x; if (depth[k] > wDepth[m]) { wDepth[m] = depth[k]; wSpeed[m] = Math.hypot(FL[k * 2], FL[k * 2 + 1]); wSD[m] = SD[k]; wLv[m] = lvl[k]; } }
      const P = [], A = [], I = [], vid = new Int32Array(GW * GH).fill(-1);
      const vtx = (x, z) => { const k = gi(x, z); if (vid[k] >= 0) return vid[k]; vid[k] = P.length / 3; P.push(origin.x + x, origin.y + lvl[k], origin.z + z); A.push(depth[k], SD[k], FL[k * 2], FL[k * 2 + 1], rgh[k]); return vid[k]; };
      const fallQuads = [];
      for (let z = bz0; z < bz1; z++) for (let x = bx0; x < bx1; x++) if (quadIn[gi(x, z)]) { if (fallQ(x, z)) { fallQuads.push([x, z]); continue; } const a = vtx(x, z), b = vtx(x + 1, z), c = vtx(x + 1, z + 1), e = vtx(x, z + 1); I.push(a, e, b, b, e, c); }
      if (I.length) (kit.waterMeshes ||= []).push({ positions: new Float32Array(P), data: new Float32Array(A), index: I, y: origin.y + B.level });
      // the falls: for each drop on the river's line (src/data/water.js), a sheet of water as wide as the river at
      // its lip, leaving the edge on a falling arc and hugging the rock where the rock stands further out
      for (const f of B.falls || []) {
        const px = -f.dz, pz = f.dx, topH = (a, s2) => hW(f.x + f.dx * s2 + px * a, f.z + f.dz * s2 + pz * a);
        let lip = 0; for (let s2 = -5; s2 <= 4; s2 += 0.25) { if (topH(0, s2) - topH(0, s2 + 0.25) > 0.15) { lip = s2; break; } }   // (the edge: where the bed starts to drop steeply)
        const wetA = a => f.top - topH(a, lip - 0.75) > 0.05;
        let aL = 0, aR = 0; while (aL > -15 && wetA(aL - 0.5)) aL -= 0.5; while (aR < 15 && wetA(aR + 0.5)) aR += 0.5;
        if (aR - aL < 0.9) continue;
        const sp = Math.max(1, Math.hypot(...(() => { const v = flowAt(f.x, f.z, true); return v ? [v.x, v.z] : [1, 0]; })()));
        const faceS = (a, y) => { let s2 = lip; while (s2 < lip + 8 && topH(a, s2) > y) s2 += 0.2; const X = f.x + f.dx * s2 + px * a, Z = f.z + f.dz * s2 + pz * a, wgt = ROCK ? ROCK.weight(X, Z) : 0; return s2 + (wgt > 0 ? wgt * Math.max(0, rockOutAt(X, y, Z)) : 0); };
        const P2 = [], UV = [], ED = [], I2 = [], cols2 = Math.round((aR - aL) / 0.5), drop = f.top - f.bot + 0.15, rows = Math.max(2, Math.ceil(drop / 0.35));
        const aM = (aL + aR) / 2, prof = []; for (let r = 0; r <= rows; r++) { const fall = drop * r / rows, t = Math.sqrt(2 * fall / 9.8); prof.push(Math.max(lip + sp * t * 0.9, faceS(aM, f.top - fall) + 0.25, r ? prof[r - 1] : -Infinity)); }   // (never back toward the cliff)
        for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols2; c++) {
          const a = aL + (aR - aL) * c / cols2, fall = drop * r / rows, y = f.top - fall, t = Math.sqrt(2 * fall / 9.8);
          // one profile for the whole sheet (from the rock at its middle): it falls straight, and where the rock at
          // the sides stands out in front of it the water fades there instead of wrapping round the rock
          const s2 = prof[r] + 0.06 * Math.sin(a * 2.3 + fall * 1.7), inRock = faceS(a, y) > s2 + 0.1;
          P2.push(origin.x + f.x + f.dx * s2 + px * a, origin.y + y, origin.z + f.z + f.dz * s2 + pz * a); UV.push(a, fall); ED.push(inRock ? 0 : Math.min(a - aL, aR - a), fall / drop);
          if (r && c) { const n0 = (r - 1) * (cols2 + 1) + c - 1, n1 = n0 + 1, n2 = n0 + cols2 + 1, n3 = n2 + 1; I2.push(n0, n2, n1, n1, n2, n3); }
        }
        kit.waterFalls.push({ positions: new Float32Array(P2), uv: new Float32Array(UV), edge: new Float32Array(ED), index: I2 });
        // mist and spray at its foot, and its roar
        const footS = prof[rows];
        for (let a = aL; a <= aR; a += 0.75) { const X = origin.x + f.x + f.dx * footS + px * a, Z = origin.z + f.z + f.dz * footS + pz * a; fx2.mist.push([X, origin.y + f.bot, Z, f.dx, f.dz, drop]); fx2.spray.push([X, origin.y + f.bot, Z, f.dx, f.dz, drop]); }
        sounds.push({ kind: 'fall', x: origin.x + f.x + f.dx * footS, y: origin.y + (f.top + f.bot) / 2, z: origin.z + f.z + f.dz * footS, s: Math.min(1.5, drop * (aR - aL) / 16) });
      }
      // the current for swimming: bilinear from the corners
      const field = (wx, wz) => { const fx = Math.max(bx0, Math.min(bx1 - 1e-3, wx - origin.x)), fz = Math.max(bz0, Math.min(bz1 - 1e-3, wz - origin.z)), x = Math.floor(fx), z = Math.floor(fz), a = fx - x, b = fz - z;
        const g = (xx, zz, o) => FL[gi(xx, zz) * 2 + o], v = o => (g(x, z, o) * (1 - a) + g(x + 1, z, o) * a) * (1 - b) + (g(x, z + 1, o) * (1 - a) + g(x + 1, z + 1, o) * a) * b;
        const vx = v(0), vz = v(1); return Math.abs(vx) + Math.abs(vz) < 0.02 ? null : { x: vx, z: vz }; };
      // swimming: a box per run of squares along a row at the same level (a river's surface steps down its length)
      const cellLv = (ci, cj) => Math.round(LV((ci + 0.5) * R, (cj + 0.5) * R).lv * 20) / 20;
      let deepest = 3; for (let k = 0; k < depth.length; k++) if (depth[k] > deepest) deepest = depth[k];   // (the swimmable water reaches the deepest bed)
      const srows = new Map(); for (const [ci, cj] of B.cells) (srows.get(cj) || srows.set(cj, []).get(cj)).push([ci, cellLv(ci, cj)]);
      for (const [cj, list] of srows) {
        list.sort((p, q) => p[0] - q[0]);
        for (let n = 0; n < list.length;) { let e = n + 1; while (e < list.length && list[e][0] === list[e - 1][0] + 1 && list[e][1] === list[n][1]) e++;
          const top = list[n][1]; kit.swim.push({ min: [origin.x + list[n][0] * R, origin.y + top - deepest - 1, origin.z + cj * R], max: [origin.x + (list[e - 1][0] + 1) * R, origin.y + top, origin.z + cj * R + R], field }); n = e; }
      }
      for (const [ci, cj] of B.cells) for (let j = Math.max(0, cj * R - 5); j < Math.min(H, cj * R + R + 5); j++) for (let i = Math.max(0, ci * R - 5); i < Math.min(W, ci * R + R + 5); i++) {   // (the shore: sand and gravel under the water, thinning out up the bank)
        const BL = cellLv(ci, cj), gh = TS ? TS.hAt(i + 0.5, j + 0.5) : BL, hd = Math.max(0, Math.max(ci * R - i - 0.5, i + 0.5 - ci * R - R, cj * R - j - 0.5, j + 0.5 - cj * R - R)); if (gh < BL + 1.5) wet[j * W + i] = Math.max(wet[j * W + i], gh < BL ? 255 : Math.round(200 * (1 - (gh - BL) / 1.5) * Math.max(0, 1 - hd / 5)));
      }
    }
  }
  profileMark('water');
  // ---- the splat: surface kind, moisture, temperature, wetness per square metre ----
  const data = new Uint8Array(N * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = i + 0.5, z = j + 0.5; let m = MAT_INDEX[groundAt(gp, 'mat', x, z)] ?? 0;
    if (!m) { const lt = TS ? Math.floor((TS.hAt(x, z) + SINK + 0.01) / C) : lo; const kd = (kinds.get(lt) || [...kinds.values()][0])?.[k]; if (kd && kd !== '.') m = FILL_MAT[kd] ?? 0; }
    if (ROCK?.any && ROCK.weight(x, z) > 0.35) m = 3;                                            // a cliff is rock, whatever's painted (no grass on the faces)
    data[k * 4] = m; data[k * 4 + 1] = Math.round(+groundAt(gp, 'moist', x, z) / 9 * 255); data[k * 4 + 2] = Math.round(+groundAt(gp, 'temp', x, z) / 9 * 255); data[k * 4 + 3] = wet[k];
  }
  profileMark('splat texture data');
  // ---- plants (src/game/foliagePlace.js, drawn by src/gfx/foliage.js): painted, and growing on their own ----
  // the ground's height as drawn: a fine chunk's 1 m grid, or the coarse 2 m one
  const drawnH = (x, z) => { if (!TER) return TS.hAt(x, z); const ci = Math.floor(x / R / per), cj = Math.floor(z / R / per); if (!fine[cj * CW + ci]) return TER.hAt(x, z);
    const i = Math.max(0, Math.min(W - 1, Math.floor(x))), j = Math.max(0, Math.min(H - 1, Math.floor(z))), a = x - i, b = z - j; return (FH(i, j) * (1 - a) + FH(i + 1, j) * a) * (1 - b) + (FH(i, j + 1) * (1 - a) + FH(i + 1, j + 1) * a) * b; };
  if (TS) placeFoliage({ kit, gp, W, H, hAt: drawnH, pieceTop, roadTop, groundAt, isFill: (i, j) => { const k = j * W + i; for (const kd of kinds.values()) if (kd[k] && kd[k] !== '.') return true; return false; },
    kindAt: (i, j) => data[(j * W + i) * 4], cliffAt: (x, z) => ROCK ? ROCK.weight(x, z) : 0, wDepth, wSpeed, wSD, wLv });
  profileMark('foliage');
  // ---- clutter on land (src/game/clutter.js): by the surface it lands on; never on water, roads or pieces ----
  if (gp?.clut && TS) {
    const inWater = (x, z) => { const k = `${Math.floor(x / R)},${Math.floor(z / R)}`; return bodies.some(B => B.has.has(k)); };
    landClutter(kit, (ci, cj) => +groundAt(gp, 'clut', ci * R + 1, cj * R + 1) || 0, W, H,
      (x, z) => { const k = Math.floor(z) * W + Math.floor(x); return inWater(x, z) || roadTop[k] > -Infinity || pieceTop[k] > -Infinity; },
      (x, z) => (TER ? FH(Math.round(x), Math.round(z)) : TS.hAt(x, z)) + SINK * 0, (x, z) => data[(Math.floor(z) * W + Math.floor(x)) * 4], (x, z) => ROCK ? ROCK.weight(x, z) : 0, Math.round(origin.x * 7 + origin.z * 3));
  }
  profileMark('land clutter');
  // ---- scenery on the filler ----
  for (const [l, kind] of kinds) {
    const own = sheets.find(S => !S.terrain && S.l === l);
    const gyAt = (i, j) => own && own.quads[Math.floor(j / R) * NX + Math.floor(i / R)] === 1 ? own.hAt(i + 0.5, j + 0.5) : TS ? TS.hAt(i + 0.5, j + 0.5) : l * C;
    buildFeatures(kit, kind, W, H, l, gyAt, k => !!pieceLayers.get(l)?.[k], k => roadTop[k] >= l * C - 1 && roadTop[k] < l * C + C);
  }
  profileMark('filler scenery');
  if (profileOn) {
    const phases = profileMarks.map(({ phase, ms }) => ({ phase, ms }));
    const totalMs = +(performance.now() - profileStart).toFixed(2);
    console.groupCollapsed(`[Eldermere ground] ${d.w}×${d.h} · ${totalMs} ms`);
    console.table([...phases, { phase: 'TOTAL', ms: totalMs }]);
    console.groupEnd();
  }
  return { surfaces, shapes: outShapes, splat: { w: W, h: H, data, x: origin.x, z: origin.z } };
}

// the scenery on painted filler, by kind (greenery · yard · rubble · sheds)
function buildFeatures(kit, kind, W, H, l, gyAt, isPiece, isRoad) {
  const { box, trim, prism } = kit;
  const K_ = (i, j) => i < 0 || j < 0 || i >= W || j >= H ? '#' : kind[j * W + i];
  const same = (i, j, r, q) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (K_(i + a, j + b) !== q) return false; return true; };
  const openAt = (i, j) => i >= 0 && j >= 0 && i < W && j < H && kind[j * W + i] === '.' && !isPiece(j * W + i) && !isRoad(j * W + i);
  const sheds = new Set();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, q = kind[k]; if (q === '.') continue;
    const Y = gyAt(i, j), x = i + 0.5, z = j + 0.5, h1 = hash(i, j, l * 7 + 1), h2 = hash(i, j, l * 7 + 2);
    if (q === 'g') {
      if (h1 < 0.03 && same(i, j, 2, 'g') && kit.plant) kit.plant('tree', x, Y - 0.05, z, 0.6 + h2 * 0.7, hash(i, j, 6) * 6.28, Math.floor(hash(i, j, 5) * 3));
      else if (h1 < 0.08 && same(i, j, 1, 'g') && kit.plant) kit.plant('bush', x, Y - 0.05, z, 0.6 + h2 * 0.6, hash(i, j, 6) * 6.28, Math.floor(h2 * 3));
      else if (h1 < 0.1 && kit.plant) kit.plant('flower', x, Y - 0.02, z, 0.9 + h2 * 0.4, hash(i, j, 6) * 6.28, Math.floor(hash(i, j, 40) * 6));
      else if (h1 < 0.4 && kit.plant) kit.plant('grass', x + (h2 - 0.5) * 0.6, Y - 0.02, z + (hash(i, j, 7) - 0.5) * 0.6, 0.8 + h2 * 0.5, hash(i, j, 6) * 6.28, Math.floor(h2 * 3));
      else if (h1 < 0.03 && same(i, j, 2, 'g')) {
        const s = 0.6 + h2 * 0.7, th = 2.6 * s + 1, leaf = K.leaf[Math.floor(hash(i, j, 5) * 4)];
        box(x - 0.22 * s, Y - 0.3, z - 0.22 * s, x + 0.22 * s, Y + th, z + 0.22 * s, K.timber, { tex: 4 });
        for (const [r, hh, oy] of [[2.0, 1.3, 0.75], [1.5, 1.1, 1.05], [0.85, 0.8, 1.3]]) trim(x - r * s, Y + th * oy - 0.4, z - r * s, x + r * s, Y + th * oy - 0.4 + hh * s, z + r * s, leaf, { tex: 6 });
      } else if (h1 < 0.08 && same(i, j, 1, 'g')) { const s = 0.5 + h2 * 0.6; trim(x - 0.6 * s, Y - 0.15, z - 0.5 * s, x + 0.6 * s, Y + 0.8 * s, z + 0.5 * s, K.leaf[Math.floor(h2 * 4)], { tex: 6 }); }
      else if (h1 < 0.1) for (let n = 0; n < 4; n++) { const fx = x + (hash(i, j, 20 + n) - 0.5) * 0.8, fz = z + (hash(i, j, 30 + n) - 0.5) * 0.8; trim(fx - 0.07, Y - 0.05, fz - 0.07, fx + 0.07, Y + 0.18, fz + 0.07, K.flowers[Math.floor(hash(i, j, 40 + n) * 5)], { tex: 6 }); }
    } else if (q === 'y') {
      if (h1 < 0.035 && same(i, j, 1, 'y')) {
        if (h2 < 0.5) { box(x - 0.42, Y - 0.2, z - 0.42, x + 0.42, Y + 0.84, z + 0.42, K.wood, { tex: 4 }); trim(x - 0.44, Y + 0.38, z - 0.44, x + 0.44, Y + 0.46, z + 0.44, K.timber, { tex: 4 }); if (h2 < 0.25) box(x - 0.3, Y + 0.84, z - 0.3, x + 0.3, Y + 1.44, z + 0.3, K.wood, { tex: 4 }); }
        else for (const [ox, oz] of [[-0.35, 0], [0.35, 0.1]]) { box(x + ox - 0.3, Y - 0.2, z + oz - 0.3, x + ox + 0.3, Y + 0.9, z + oz + 0.3, K.wood, { tex: 4 }); trim(x + ox - 0.32, Y + 0.7, z + oz - 0.32, x + ox + 0.32, Y + 0.76, z + oz + 0.32, K.iron, { tex: 6 }); }
      }
      for (const [di, dj, a0, b0, a1, b1] of [[0, -1, i, j, i + 1, j + 0.12], [0, 1, i, j + 0.88, i + 1, j + 1], [-1, 0, i, j, i + 0.12, j + 1], [1, 0, i + 0.88, j, i + 1, j + 1]]) {
        if (!openAt(i + di, j + dj)) continue;
        for (const y of [0.4, 1.1]) trim(a0, Y + y, b0, a1, Y + y + 0.1, b1, K.wood, { tex: 4 });
        box(a0, Y - 0.3, b0, Math.min(a1, a0 + 0.12), Y + 1.5, Math.min(b1, b0 + 0.12), K.timber, { tex: 4 });
        box(a0, Y, b0, a1, Y + 1.25, b1, K.timber, { hidden: true });
      }
    } else if (q === 'r') {
      if (h1 < 0.05) for (let n = 0; n < 4; n++) { const s = 0.15 + hash(i, j, 50 + n) * 0.25, rx = x + (hash(i, j, 60 + n) - 0.5) * 0.9, rz = z + (hash(i, j, 70 + n) - 0.5) * 0.9; box(rx - s, Y - 0.15, rz - s, rx + s, Y + s * (0.6 + hash(i, j, 80 + n)), rz + s, K.stone[n % 3]); }
      else if (h1 < 0.17) { if (kit.plant) kit.plant(h2 < 0.5 ? 'bush' : 'tallgrass', x, Y - 0.05, z, 0.5 + h2 * 0.4, h1 * 40, Math.floor(h2 * 2)); else trim(x - 0.45, Y - 0.1, z - 0.45, x + 0.45, Y + 0.3 + h2 * 0.35, z + 0.45, '#4f6a2e', { tex: 6 }); }
      else if (h1 < 0.2) trim(x - 0.4, Y - 0.1, z - 0.35, x + 0.4, Y + 0.7, z + 0.35, K.leaf[1], { tex: 6 });
      for (const [di, dj, a0, b0, a1, b1] of [[0, -1, i, j, i + 1, j + 0.4], [0, 1, i, j + 0.6, i + 1, j + 1], [-1, 0, i, j, i + 0.4, j + 1], [1, 0, i + 0.6, j, i + 1, j + 1]])
        if (openAt(i + di, j + dj) && vnoise(i / 3, j / 3, 11) > 0.55) box(a0, Y - 0.3, b0, a1, Y + 0.3 + vnoise(i / 1.5, j / 1.5, 12) * 1.0, b1, K.stone[0]);
    } else if (q === 's') {
      const bi = Math.floor(i / 4) * 4, bj = Math.floor(j / 4) * 4, bk = `${bi},${bj}`; if (sheds.has(bk)) continue; sheds.add(bk);
      let full = true, ymin = Infinity, ymax = -Infinity;
      for (let b = 0; b < 4 && full; b++) for (let a = 0; a < 4; a++) { if (bi + a >= W || bj + b >= H || kind[(bj + b) * W + bi + a] !== 's') { full = false; break; } const yy = gyAt(bi + a, bj + b); ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy); }
      if (!full || ymax - ymin > 1.2 || hash(bi, bj, 90) < 0.12) continue;
      const Y0 = ymin, Yt = ymax, x0 = bi + 0.15, x1 = bi + 3.85, z0 = bj + 0.15, z1 = bj + 3.85, hh = 2.6 + hash(bi, bj, 91) * 2.4, wc = K.walls[Math.floor(hash(bi, bj, 92) * 5)];
      const tex = wc === K.walls[4] ? 5 : wc === K.walls[1] ? 4 : wc === K.walls[3] ? 0 : 3, roof = K.roofs[Math.floor(hash(bi, bj, 93) * 5)], rt = hash(bi, bj, 94);
      box(x0, Y0 - 0.3, z0, x1, Yt + hh, z1, wc, { tex });
      if (rt < 0.45) prism({ type: 'gable', min: [x0 - 0.25, Yt + hh, z0 - 0.25], max: [x1 + 0.25, Yt + hh + 1.4, z1 + 0.25], axis: rt < 0.22 ? 'x' : 'z', color: roof, endColor: wc, tex: 2, endTex: tex || 3 });
      else if (rt < 0.8) prism({ type: 'wedge', min: [x0 - 0.25, Yt + hh, z0 - 0.25], max: [x1 + 0.25, Yt + hh + 1.0, z1 + 0.25], high: ['+x', '-x', '+z', '-z'][Math.floor(hash(bi, bj, 95) * 4)], thick: 0.08, color: roof, tex: 2 });
      else trim(x0 - 0.1, Yt + hh, z0 - 0.1, x1 + 0.1, Yt + hh + 0.25, z1 + 0.1, '#d4c4a4');
      if (hash(bi, bj, 96) < 0.4) box(x0 + 0.3, Yt + hh, z0 + 0.3, x0 + 0.9, Yt + hh + 2.0, z0 + 0.9, '#b0634a', { tex: 5 });
    }
  }
}
