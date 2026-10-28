// src/game/bridgeBuild.js — the bridges' structure. Where a road crosses water or a drop (src/data/paths.js
// bridgesOf) its deck is already laid by the road builder (a 0.9 m slab, straight from bank to bank); this adds the
// rest:
//   stone (in town, or a main road): parapets along both sides, piers every 12 m or so standing on the bed, and
//     stone arches springing between them (one arch on a short span, several on a long one)
//   timber (a country street away from buildings): a post-and-rail fence each side, and trestle bents of posts
//     under the deck
// Piers and posts are solid (you bump into them swimming); arches are for looks.
import { pathsOf, samplePath, bridgesOf, profileOf, outerHalfOf, ROAD, PATH_KINDS } from '../data/paths.js';
import { carvedFn } from '../data/water.js';
import { pieceFoot } from '../data/dungeon.js';

const C = 10;
const STONE = '#a49a8a', STONE_D = '#8e8577', WOOD = '#6b4f34', WOOD_D = '#56402a';

export function buildBridges(d, origin, kit, shapes) {
  const G = carvedFn(d); if (!G) return;
  const solid = (x0, y0, z0, x1, y1, z1, surface = 'stone') => shapes.push({ type: 'box', hidden: true, surface, bridgePart: true, min: [origin.x + x0, origin.y + y0, origin.z + z0], max: [origin.x + x1, origin.y + y1, origin.z + z1] });
  // a convex block from 4 corners at the bottom and 4 at the top (any turn): drawn through kit.tris
  const block = (B, T, color, tex = 8) => { const [a, b, c, e] = B, [f, g, h, k] = T; kit.tris([a, b, c, a, c, e, f, h, g, f, k, h, a, f, g, a, g, b, b, g, h, b, h, c, c, h, k, c, k, e, e, k, f, e, f, a], color, tex); };
  const near = (x, z) => Object.entries(d.cells).some(([k, pc]) => { const [cx, cy] = k.split(',').map(Number), [fx, fz] = pieceFoot(pc); return x > cx * C - 30 && x < (cx + fx) * C + 30 && z > cy * C - 30 && z < (cy + fz) * C + 30; });
  for (const p of pathsOf(d)) {
    const spans = bridgesOf(d, p); if (!spans.length) continue;
    const S = samplePath(p, 0.5), prof = profileOf(d, p, S), Y = (p.layer || 0) * C, o = outerHalfOf(p), hw = o + 0.15;
    const top = s => Y + ROAD.kerbH + prof.heightAt(s), at = s => { let k = S.findIndex(q => q.s >= s); if (k < 0) k = S.length - 1; return S[k]; };
    const side = (q, off) => [q.x - q.tz * off, q.z + q.tx * off];
    for (const b of spans) {
      const mid = at((b.s0 + b.s1) / 2), stone = b.style === 'stone' ? true : b.style === 'timber' ? false : (PATH_KINDS[p.kind] && p.kind !== 'road') || p.road >= 7 || near(mid.x, mid.z);   // (the road's choice, or auto)
      // ---- parapets / fences along both sides ----
      for (let s = b.s0; s < b.s1 - 0.01; s += 1) {
        const s2 = Math.min(b.s1, s + 1), q0 = at(s), q1 = at(s2), y0 = top(s), y1 = top(s2);
        for (const sd of [1, -1]) {
          if (stone) {
            const o0 = sd * (o - 0.05), o1 = sd * (o - 0.45), [ax, az] = side(q0, o0), [bx, bz] = side(q0, o1), [cx, cz] = side(q1, o1), [ex, ez] = side(q1, o0);
            block([[ax, y0 - 0.05, az], [bx, y0 - 0.05, bz], [cx, y1 - 0.05, cz], [ex, y1 - 0.05, ez]], [[ax, y0 + 1.0, az], [bx, y0 + 1.0, bz], [cx, y1 + 1.0, cz], [ex, y1 + 1.0, ez]], STONE);
            const [px, pz] = side(q0, sd * (o - 0.25)); solid(px - 0.2, y0, pz - 0.2, px + 0.2, y0 + 1.0, pz + 0.2);
          } else {
            const [px, pz] = side(q0, sd * (o - 0.15));
            if (Math.round(s - b.s0) % 2 === 0) { block([[px - 0.08, y0 - 0.05, pz - 0.08], [px + 0.08, y0 - 0.05, pz - 0.08], [px + 0.08, y0 - 0.05, pz + 0.08], [px - 0.08, y0 - 0.05, pz + 0.08]], [[px - 0.08, y0 + 1.0, pz - 0.08], [px + 0.08, y0 + 1.0, pz - 0.08], [px + 0.08, y0 + 1.0, pz + 0.08], [px - 0.08, y0 + 1.0, pz + 0.08]], WOOD_D, 4); }
            const [rx, rz] = side(q1, sd * (o - 0.15)), n = [-(rz - pz), rx - px], l = Math.hypot(...n) || 1, w = 0.05 / l;
            for (const ry of [0.55, 0.95]) block([[px + n[0] * w, y0 + ry - 0.05, pz + n[1] * w], [px - n[0] * w, y0 + ry - 0.05, pz - n[1] * w], [rx - n[0] * w, y1 + ry - 0.05, rz - n[1] * w], [rx + n[0] * w, y1 + ry - 0.05, rz + n[1] * w]], [[px + n[0] * w, y0 + ry + 0.05, pz + n[1] * w], [px - n[0] * w, y0 + ry + 0.05, pz - n[1] * w], [rx - n[0] * w, y1 + ry + 0.05, rz - n[1] * w], [rx + n[0] * w, y1 + ry + 0.05, rz + n[1] * w]], WOOD, 4);
            solid(px - 0.12, y0, pz - 0.12, px + 0.12, y0 + 1.0, pz + 0.12, 'wood');
          }
        }
      }
      // ---- supports: piers (stone) or trestle bents (timber), evenly between the ends ----
      const nSup = Math.max(0, Math.ceil(b.len / (stone ? 12 : 6)) - 1), sups = [b.s0];
      for (let k = 1; k <= nSup; k++) sups.push(b.s0 + b.len * k / (nSup + 1));
      sups.push(b.s1);
      for (let k = 1; k < sups.length - 1; k++) {
        const s = sups[k], q = at(s), deckBot = top(s) - ROAD.kerbH - 0.95;
        let bed = Infinity; for (const off of [-hw, 0, hw]) { const [x, z] = side(q, off); bed = Math.min(bed, G(x, z)); }
        bed -= 0.6; if (deckBot - bed < 0.5) continue;
        if (stone) {
          const t = 0.75, cut = (sd, al) => side({ x: q.x + q.tx * al, z: q.z + q.tz * al, tx: q.tx, tz: q.tz }, sd * hw);
          const B = [cut(1, -t), cut(-1, -t), cut(-1, t), cut(1, t)];
          block(B.map(([x, z]) => [x, bed, z]), B.map(([x, z]) => [x, deckBot + 0.05, z]), STONE_D);
          for (let off = -hw + 0.5; off <= hw - 0.4; off += 0.9) { const [x, z] = side(q, off); solid(x - 0.6, bed, z - 0.6, x + 0.6, deckBot, z + 0.6); }
          // a cutwater: a pointed nose upstream and down (a short wedge each side along the flow is enough here)
        } else {
          for (const off of [-hw + 0.3, -hw / 3, hw / 3, hw - 0.3]) {
            const [x, z] = side(q, off); block([[x - 0.15, bed, z - 0.15], [x + 0.15, bed, z - 0.15], [x + 0.15, bed, z + 0.15], [x - 0.15, bed, z + 0.15]], [[x - 0.15, deckBot, z - 0.15], [x + 0.15, deckBot, z - 0.15], [x + 0.15, deckBot, z + 0.15], [x - 0.15, deckBot, z + 0.15]], WOOD_D, 4);
            solid(x - 0.18, bed, z - 0.18, x + 0.18, deckBot, z + 0.18, 'wood');
          }
          const [ax, az] = side(q, -hw), [bx, bz] = side(q, hw), n = [q.tx * 0.15, q.tz * 0.15];
          block([[ax - n[0], deckBot - 0.35, az - n[1]], [ax + n[0], deckBot - 0.35, az + n[1]], [bx + n[0], deckBot - 0.35, bz + n[1]], [bx - n[0], deckBot - 0.35, bz - n[1]]], [[ax - n[0], deckBot, az - n[1]], [ax + n[0], deckBot, az + n[1]], [bx + n[0], deckBot, bz + n[1]], [bx - n[0], deckBot, bz - n[1]]], WOOD, 4);   // the cap beam
        }
      }
      // ---- stone arches: between each pair of supports, the solid between the arch's curve and the deck ----
      if (stone) for (let k = 0; k + 1 < sups.length; k++) {
        const sa = sups[k] + (k ? 0.75 : 0), sb = sups[k + 1] - (k + 1 < sups.length - 1 ? 0.75 : 0), hs = (sb - sa) / 2, sm = (sa + sb) / 2; if (hs < 0.8) continue;
        let low = Infinity; for (let s = sa; s <= sb; s += 1) { const q = at(s); low = Math.min(low, G(q.x, q.z)); }
        const rise = Math.max(0.3, Math.min(hs * 0.85, 4.5, top(sm) - ROAD.kerbH - 0.95 - low - 0.4));
        for (let s = sa; s < sb - 0.01; s += 0.5) {
          const s2 = Math.min(sb, s + 0.5), q0 = at(s), q1 = at(s2), d0 = top(s) - ROAD.kerbH - 0.9, d1 = top(s2) - ROAD.kerbH - 0.9;
          const u0 = d0 - rise * ((s - sm) / hs) ** 2, u1 = d1 - rise * ((s2 - sm) / hs) ** 2; if (d0 - u0 < 0.03 && d1 - u1 < 0.03) continue;
          const aw = o - 0.03, [ax, az] = side(q0, aw), [bx, bz] = side(q0, -aw), [cx, cz] = side(q1, -aw), [ex, ez] = side(q1, aw);   // (flush under the deck's sides, not sticking out in its shadow)
          block([[ax, u0, az], [bx, u0, bz], [cx, u1, cz], [ex, u1, ez]], [[ax, d0 + 0.02, az], [bx, d0 + 0.02, bz], [cx, d1 + 0.02, cz], [ex, d1 + 0.02, ez]], STONE);
        }
      }
    }
  }
}
