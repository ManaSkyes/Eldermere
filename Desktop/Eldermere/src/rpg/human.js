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
  const shape = p.bustShape;                              // neutral = natural; lower rounder and flatter, higher more pointed
  W['breast-point-incr'] = f * Math.max(0, shape); W['breast-point-decr'] = f * Math.max(0, -shape);
  // the base body is a mannequin under its clothes: soften nipple detail
  W['nipple-point-decr'] = 1; W['nipple-size-decr'] = 1;
  return W;
}

export const DEFAULT_PARAMS = {
  fem: 1, age: 0, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5,
  bust: 0.5, firmness: 0.5, bustY: 0, bustSpace: 0, bustShape: 0,
};
