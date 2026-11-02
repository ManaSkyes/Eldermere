// src/rpg/human.js — morphable human body built on the MakeHuman CC0 base mesh.
// The mesh and targets are data (data/human/*); everything here is our own code.
//
//   const human = await loadHuman('data/human/');
//   const positions = human.compute(macroWeights(params));   // decimeters
//
// Params (all 0..1 unless noted): fem, age, muscle, weight, height, proportions,
// bust, firmness, bustY (-1..1), bustSpace (-1..1), bustShape (-1..1)

export async function loadHuman(base) {
  // a single-file build embeds the data and provides it here instead of separate files
  if (globalThis.__embeddedHuman) { const { meta, bin } = await globalThis.__embeddedHuman; return new Human(meta, bin); }
  const [meta, bin] = await Promise.all([
    fetch(base + 'human.json').then(r => r.json()),
    fetch(base + 'human-targets.bin').then(r => r.arrayBuffer()),
  ]);
  return new Human(meta, bin);
}

export class Human {
  constructor(meta, bin) {
    this.meta = meta;
    this.count = meta.vertexCount;
    this.base = Float32Array.from(meta.positions);
    this.targets = {};
    for (const [name, t] of Object.entries(meta.targets)) {
      this.targets[name] = {
        idx: new Uint16Array(bin, t.offset, t.count),
        d: new Int16Array(bin, t.deltaOffset, t.count * 3),
        scale: t.scale,
      };
    }
    this.out = new Float32Array(this.base.length);
    // subdivided head vertices: recomputed from their parents after the base targets
    const sd = meta.subdiv;
    this.subdiv = sd ? { start: sd.start, parents: sd.parents, weights: sd.weights } : null;
    this.soften = softenRegions(meta);
  }
  // weights: { targetName: amount }. Returns positions for every vertex (reused buffer).
  compute(weights) {
    const out = this.out;
    out.set(this.base);
    const apply = (name, w) => {
      const t = this.targets[name];
      if (!t || Math.abs(w) < 1e-4) return;
      const s = t.scale * w, idx = t.idx, d = t.d;
      for (let k = 0; k < idx.length; k++) {
        const o = idx[k] * 3, q = k * 3;
        out[o] += d[q] * s; out[o + 1] += d[q + 1] * s; out[o + 2] += d[q + 2] * s;
      }
    };
    // 1. the MakeHuman targets (they only move original vertices)
    for (const [name, w] of Object.entries(weights)) if (!this.targets[name]?.post) apply(name, w);
    // 2. subdivided vertices follow their parents
    if (this.subdiv) {
      const { start, parents, weights: pw } = this.subdiv;
      for (let k = 0; k < parents.length; k++) {
        let x = 0, y = 0, z = 0; const ps = parents[k], ws = pw[k];
        for (let j = 0; j < ps.length; j++) { const o = ps[j] * 3; x += out[o] * ws[j]; y += out[o + 1] * ws[j]; z += out[o + 2] * ws[j]; }
        const o = (start + k) * 3; out[o] = x; out[o + 1] = y; out[o + 2] = z;
      }
    }
    // 2b. the frame: the build of the skeleton itself (petite / broad / long), not just fat or muscle on an average frame
    applyFrame(this.meta, out, weights);
    // 3. targets made in code (species shapes), which can move every vertex, including new ones
    for (const [name, w] of Object.entries(weights)) if (this.targets[name]?.post) apply(name, w);
    // the base body is a clothed mannequin: smooth away nipple detail at the source
    for (const r of this.soften) {
      // Taubin smoothing: alternating shrink and inflate steps remove small detail without flattening the shape
      for (let it = 0; it < 40; it++) {
        const f = it % 2 ? -0.53 : 0.5, tmp = new Float32Array(r.inner.length * 3);
        for (let k = 0; k < r.inner.length; k++) {
          const v = r.inner[k], nb = r.nbrs[k];
          let x = 0, y = 0, z = 0;
          for (const j of nb) { x += out[j * 3]; y += out[j * 3 + 1]; z += out[j * 3 + 2]; }
          const c = nb.length;
          tmp[k * 3] = out[v * 3] + f * (x / c - out[v * 3]); tmp[k * 3 + 1] = out[v * 3 + 1] + f * (y / c - out[v * 3 + 1]); tmp[k * 3 + 2] = out[v * 3 + 2] + f * (z / c - out[v * 3 + 2]);
        }
        for (let k = 0; k < r.inner.length; k++) { const v = r.inner[k] * 3; out[v] = tmp[k * 3]; out[v + 1] = tmp[k * 3 + 1]; out[v + 2] = tmp[k * 3 + 2]; }
      }
      // reshape the profile from a cone toward a dome: height above the torso as a function of
      // distance from the center follows a rounded curve, blended in from the edge inward
      {
        let zb = 0, nb0 = 0;
        r.all.forEach((v, k) => { if (r.share[k] < 0.15) { zb += out[v * 3 + 2]; nb0++; } });
        zb = nb0 ? zb / nb0 : 0;
        let cx = 0, cy = 0, cw = 0, H = 0;
        r.all.forEach(v => { const h = Math.max(0, out[v * 3 + 2] - zb), w = h * h; cx += out[v * 3] * w; cy += out[v * 3 + 1] * w; cw += w; H = Math.max(H, h); });
        if (cw > 0 && H > 0.05) {
          cx /= cw; cy /= cw;
          let R = 0; r.all.forEach((v, k) => { if (r.share[k] > 0.15) R = Math.max(R, Math.hypot(out[v * 3] - cx, out[v * 3 + 1] - cy)); });
          r.all.forEach((v, k) => {
            const w = Math.min(1, Math.max(0, (r.share[k] - 0.15) / 0.3)) * 0.85;
            if (w <= 0) return;
            const h = out[v * 3 + 2] - zb, q = Math.hypot(out[v * 3] - cx, out[v * 3 + 1] - cy) / (R || 1);
            const dome = H * 0.94 * Math.pow(Math.max(0, 1 - q * q), 0.55);
            out[v * 3 + 2] = zb + h + (Math.max(h, dome * 0.96) - h) * w * (h > 0 ? 1 : 0) + (dome < h ? (dome - h) * w * 0.6 : 0);
          });
        }
      }
      // round off the tip: smooth only the forward depth, most at the center, so a cone becomes a dome
      for (let it = 0; it < 18; it++) {
        const tz = new Float32Array(r.inner.length);
        for (let k = 0; k < r.inner.length; k++) {
          const v = r.inner[k], nb = r.nbrs[k]; let z = 0; for (const j of nb) z += out[j * 3 + 2];
          tz[k] = out[v * 3 + 2] + 0.5 * r.w[k] * (z / nb.length - out[v * 3 + 2]);
        }
        for (let k = 0; k < r.inner.length; k++) out[r.inner[k] * 3 + 2] = tz[k];
      }
    }
    return out;
  }
}

// ---- Frame (Nov 2026) ----------------------------------------------------------------------------------------
// The MakeHuman sliders keep one average adult skeleton and scale or inflate it, so a short character is a shrunken
// average adult and a big one is a fat or muscled average adult. The frame changes the skeleton's proportions:
// each bone is scaled along its length and across it (girth) about its own joint, children are carried along, and
// every vertex follows its bones by its skin weights (the joint helper vertices too, so the rig refits itself).
//   weights['frame-petite'], ['frame-broad'], ['frame-long'] (0..1; they add)
// Each profile: per bone group [length, girth] (or a single number: uniform scale), relative to 1.
export const FRAMES = {
  // small and slight: shorter limbs and torso, narrow shoulders and hips, slim joints, small hands and feet, a head
  // that keeps nearly its size (so it reads young and petite instead of a shrunk adult)
  petite: { spine: [0.9, 0.86], clavicle: [0.84, 0.86], neck: [0.92, 0.84], head: 0.97, arm: [0.88, 0.82], hand: 0.86,
            pelvis: [0.88, 0.86], leg: [0.9, 0.84], foot: 0.86, breast: 0.9 },
  // a big frame: wide ribcage and shoulders, a thick neck, heavy joints, big hands and feet
  broad:  { spine: [1.03, 1.14], clavicle: [1.18, 1.1], neck: [0.96, 1.22], head: 1.02, arm: [1.03, 1.14], hand: 1.12,
            pelvis: [1.0, 1.08], leg: [1.02, 1.12], foot: 1.1, breast: 1.06 },
  // lanky: long legs, arms, neck and torso, slimmer through the middle
  long:   { spine: [1.05, 0.96], clavicle: [1.02, 0.97], neck: [1.1, 0.95], head: 0.98, arm: [1.07, 0.95], hand: 1.03,
            pelvis: [1.0, 0.96], leg: [1.11, 0.95], foot: 1.03, breast: 0.97 },
};
const groupOf = n =>
  /^(spine|root)/.test(n) ? 'spine' : /^clavicle/.test(n) ? 'clavicle' : /^neck/.test(n) ? 'neck' :
  /^(shoulder|upperarm|lowerarm)/.test(n) ? 'arm' : /^(wrist|finger|metacarpal|thumb)/.test(n) ? 'hand' :
  /^pelvis/.test(n) ? 'pelvis' : /^(upperleg|lowerleg)/.test(n) ? 'leg' : /^(foot|toe)/.test(n) ? 'foot' :
  /^breast/.test(n) ? 'breast' : 'head';   // the head, jaw, eyes, tongue and every face bone
let frameCache = null;
function applyFrame(meta, out, weights) {
  const k = Object.keys(FRAMES).map(f => [FRAMES[f], weights['frame-' + f] || 0]).filter(([, w]) => Math.abs(w) > 1e-4);
  if (!k.length) return;
  const S = meta.skeleton, nb = S.length;
  if (!frameCache) frameCache = { group: S.map(b => groupOf(b.name)) };
  const scaleOf = (g, which) => { let v = 1; for (const [F, w] of k) { const e = F[g] ?? 1, s = Array.isArray(e) ? e[which] : e; v += w * (s - 1); } return v; };
  const avg = (ids, o) => { let x = 0, y = 0, z = 0; for (const i of ids) { x += out[i * 3]; y += out[i * 3 + 1]; z += out[i * 3 + 2]; } o[0] = x / ids.length; o[1] = y / ids.length; o[2] = z / ids.length; return o; };
  // joints and bone axes on the current body
  const H = new Float64Array(nb * 3), A = new Float64Array(nb * 9), H2 = new Float64Array(nb * 3), t = [0, 0, 0], h = [0, 0, 0];
  for (let i = 0; i < nb; i++) {
    avg(S[i].head, h); avg(S[i].tail, t); H[i * 3] = h[0]; H[i * 3 + 1] = h[1]; H[i * 3 + 2] = h[2];
    let ax = t[0] - h[0], ay = t[1] - h[1], az = t[2] - h[2]; const L = Math.hypot(ax, ay, az) || 1; ax /= L; ay /= L; az /= L;
    const g = frameCache.group[i], e = (FRAMES.petite[g] ?? 1), uniform = !Array.isArray(e);
    const ls = scaleOf(g, 0), gs = uniform ? ls : scaleOf(g, 1);
    // A = gs·I + (ls − gs)·a·aᵀ  (length along the bone, girth across it)
    const d = ls - gs, a = [ax, ay, az];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) A[i * 9 + r * 3 + c] = (r === c ? gs : 0) + d * a[r] * a[c];
  }
  // new joints: each child's offset from its parent's joint is carried by the parent's scale
  for (let i = 0; i < nb; i++) {
    const p = S[i].parent;
    if (p < 0) { H2[i * 3] = H[i * 3]; H2[i * 3 + 1] = H[i * 3 + 1]; H2[i * 3 + 2] = H[i * 3 + 2]; continue; }
    const dx = H[i * 3] - H[p * 3], dy = H[i * 3 + 1] - H[p * 3 + 1], dz = H[i * 3 + 2] - H[p * 3 + 2], M = p * 9;
    H2[i * 3] = H2[p * 3] + A[M] * dx + A[M + 1] * dy + A[M + 2] * dz;
    H2[i * 3 + 1] = H2[p * 3 + 1] + A[M + 3] * dx + A[M + 4] * dy + A[M + 5] * dz;
    H2[i * 3 + 2] = H2[p * 3 + 2] + A[M + 6] * dx + A[M + 7] * dy + A[M + 8] * dz;
  }
  // every vertex follows its bones (linear blend of each bone's scale about its joint)
  const n = meta.vertexCount, SI = meta.skinIndex, SW = meta.skinWeight;
  let minY0 = Infinity, minY1 = Infinity;
  for (let v = 0; v < n; v++) {
    const x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2]; let nx = 0, ny = 0, nz = 0, ws = 0;
    for (let j = 0; j < 4; j++) {
      const w = SW[v * 4 + j] / 255; if (w <= 0) continue; const b = SI[v * 4 + j], M = b * 9;
      const dx = x - H[b * 3], dy = y - H[b * 3 + 1], dz = z - H[b * 3 + 2];
      nx += w * (H2[b * 3] + A[M] * dx + A[M + 1] * dy + A[M + 2] * dz);
      ny += w * (H2[b * 3 + 1] + A[M + 3] * dx + A[M + 4] * dy + A[M + 5] * dz);
      nz += w * (H2[b * 3 + 2] + A[M + 6] * dx + A[M + 7] * dy + A[M + 8] * dz); ws += w;
    }
    if (ws > 0) { if (v < meta.bodyVertexCount) { minY0 = Math.min(minY0, y); } out[v * 3] = nx / ws; out[v * 3 + 1] = ny / ws; out[v * 3 + 2] = nz / ws; if (v < meta.bodyVertexCount) minY1 = Math.min(minY1, out[v * 3 + 1]); }
  }
  const dy = minY0 - minY1;   // feet stay on the ground
  if (isFinite(dy)) for (let v = 0; v < n; v++) out[v * 3 + 1] += dy;
}

// The chest regions (by skin weight), smoothed after morphing so the shape is round rather than
// conical. The outer ring stays fixed so the smoothing blends into the rest of the torso.
function softenRegions(meta) {
  const names = meta.skeleton.map(b => b.name), regions = [];
  const shareOf = (i, bone) => { let s = 0; for (let k = 0; k < 4; k++) if (names[meta.skinIndex[i * 4 + k]] === bone) s += meta.skinWeight[i * 4 + k] / 255; return s; };
  for (const side of ['L', 'R']) {
    const inR = new Set();
    for (let i = 0; i < meta.bodyVertexCount; i++) if (shareOf(i, `breast.${side}`) > 0.08) inR.add(i);
    const nb = new Map(), T = meta.bodyTris;
    for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = T[t + e], b = T[t + (e + 1) % 3];
      if (inR.has(a)) (nb.get(a) || nb.set(a, new Set()).get(a)).add(b);
      if (inR.has(b)) (nb.get(b) || nb.set(b, new Set()).get(b)).add(a);
    }
    const inner = [...inR].filter(i => shareOf(i, `breast.${side}`) > 0.22);
    const all = [...inR], share = all.map(i => shareOf(i, `breast.${side}`));
    regions.push({ inner, nbrs: inner.map(i => [...nb.get(i)]), w: inner.map(i => Math.min(1, (shareOf(i, `breast.${side}`) - 0.22) / 0.5)), all, share });
  }
  return regions;
}

// Low/average/high blend used by the macro sliders (0 -> low, 0.5 -> average, 1 -> high)
function tri(v) {
  v = Math.min(1, Math.max(0, v));
  return v < 0.5 ? { min: 1 - v * 2, average: v * 2, max: 0 } : { min: 0, average: (1 - v) * 2, max: (v - 0.5) * 2 };
}
function pair(v) { v = Math.min(1, Math.max(0, v)); return { lo: Math.max(0, (0.5 - v) * 2), hi: Math.max(0, (v - 0.5) * 2) }; }
function signed(v) { return { up: Math.max(0, v), down: Math.max(0, -v) }; }

// Turns creator parameters into target weights.
export function macroWeights(p) {
  const W = {};
  const G = { female: p.fem, male: 1 - p.fem };
  const A = { young: 1 - p.age, old: p.age };
  const M = tri(p.muscle), Wt = tri(p.weight);
  for (const g in G) for (const a in A) {
    const ga = G[g] * A[a];
    if (ga <= 0) continue;
    for (const m in M) for (const w in Wt) {
      const k = ga * M[m] * Wt[w];
      if (k > 0) W[`universal-${g}-${a}-${m}muscle-${w}weight`] = (W[`universal-${g}-${a}-${m}muscle-${w}weight`] || 0) + k;
    }
    W[`ethnic-${g}-${a}`] = ga;
    const h = pair(p.height), pr = pair(p.proportions);
    W[`height-${g}-${a}-minheight`] = ga * h.lo; W[`height-${g}-${a}-maxheight`] = ga * h.hi;
    W[`proportions-${g}-${a}-uncommonproportions`] = ga * pr.lo; W[`proportions-${g}-${a}-idealproportions`] = ga * pr.hi;
  }
  // chest shaping applies on the feminine side
  // the chest can have its own sex (transformations); otherwise it follows the body
  const f = p.chestFem ?? G.female, cup = pair(p.bust), firm = pair(p.firmness);
  W['breast-cup-mincup'] = f * cup.lo; W['breast-cup-maxcup'] = f * cup.hi;
  // firmness: the middle of the slider is the full "firm" shape (the base mesh's average sags);
  // higher lifts further, lower softens toward the base mesh's low-firmness shape
  const fw = 1 + (p.firmness - 0.5) * 2.4;
  W['breast-firm-minfirmness'] = f * Math.max(0, -fw); W['breast-firm-maxfirmness'] = f * Math.min(1.8, Math.max(0, fw));
  const ty = signed(p.bustY), ts = signed(p.bustSpace);
  W['breast-trans-up'] = f * ty.up; W['breast-trans-down'] = f * ty.down;
  W['breast-dist-incr'] = f * ts.up; W['breast-dist-decr'] = f * ts.down;
  // shape: the base mesh's default is quite conical, so the neutral setting starts rounder
  W['frame-petite'] = p.petite || 0; W['frame-broad'] = p.broad || 0; W['frame-long'] = p.long || 0;
  const shape = p.bustShape;                              // neutral = natural; lower rounder and flatter, higher more pointed
  W['breast-point-incr'] = f * Math.max(0, shape); W['breast-point-decr'] = f * Math.max(0, -shape);
  // the base body is a mannequin under its clothes: soften nipple detail
  W['nipple-point-decr'] = 1; W['nipple-size-decr'] = 1;
  return W;
}

export const DEFAULT_PARAMS = {
  fem: 1, age: 0, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5,
  bust: 0.5, firmness: 0.5, bustY: 0, bustSpace: 0, bustShape: 0,
  petite: 0, broad: 0, long: 0,   // the frame (applyFrame)
};
