// src/game/physics.js — the character's body against the world: a vertical capsule (treated as a
// cylinder) moving through boxes and ramps. Meters, +Y up.
//
// World shapes:
//   box:  { type: 'box', min: [x, y, z], max: [x, y, z] }
//   ramp: { type: 'ramp', min, max, rise: '+x' | '-x' | '+z' | '-z' }  — a wedge whose top climbs from
//         min.y to max.y in the `rise` direction (stairs are boxes; ramps are slopes)
// Standing: the highest walkable surface under the body. Walls: anything the body overlaps that is
// too tall to step onto pushes it out sideways. Slopes steeper than maxSlope can't be climbed.

export const BODY = { radius: 0.35, height: 1.75, crouchHeight: 1.15, stepHeight: 0.42, maxSlope: 46 * Math.PI / 180 };

// Top of a shape at (x, z), or -Infinity if (x, z) is outside it.
export function topAt(s, x, z) {
  if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) return -Infinity;
  if (s.type !== 'ramp') return s.max[1];
  const t = { '+x': (x - s.min[0]) / (s.max[0] - s.min[0]), '-x': (s.max[0] - x) / (s.max[0] - s.min[0]),
              '+z': (z - s.min[2]) / (s.max[2] - s.min[2]), '-z': (s.max[2] - z) / (s.max[2] - s.min[2]) }[s.rise];
  return s.min[1] + (s.max[1] - s.min[1]) * t;
}
export function slopeOf(s) {
  if (s.type !== 'ramp') return 0;
  const run = s.rise.endsWith('x') ? s.max[0] - s.min[0] : s.max[2] - s.min[2];
  return Math.atan2(s.max[1] - s.min[1], run);
}

// The ground under a body at (x, z) with feet at y: the highest top within reach of a step,
// sampled across the body's footprint so it can stand on an edge.
export function groundAt(shapes, x, z, feetY, radius = BODY.radius, step = BODY.stepHeight) {
  let best = { y: -Infinity, shape: null };
  const r = radius * 0.7, pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
  for (const s of shapes) for (const [ox, oz] of pts) {
    if (s.noStand) continue;                       // rock steps on a cliff face: too small and steep to stand on
    const t = topAt(s, x + ox, z + oz);
    if (t <= feetY + step + 1e-4 && t > best.y) best = { y: t, shape: s };
  }
  return best;
}

// Push a circle at (x, z) out of every shape that blocks it at this height. Returns the corrected
// position and whether anything was hit.
export function resolveWalls(shapes, x, z, feetY, height, radius = BODY.radius, step = BODY.stepHeight) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    for (const s of shapes) {
      if (s.min[1] >= feetY + height || s.max[1] <= feetY + step) continue;     // above the head, or low enough to step on
      // ramps block by their surface, not their box: where the surface under you is within a step of
      // your feet you're on it (or sliding down it), not inside a wall. Where it's higher, a steep ramp
      // pushes you back downhill, never up and over.
      if (s.type === 'ramp') {
        const inside = x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2];
        const t = topAt(s, Math.max(s.min[0], Math.min(s.max[0], x)), Math.max(s.min[2], Math.min(s.max[2], z)));
        if (t <= feetY + step) continue;
        if (inside) {
          const run = s.rise.endsWith('x') ? s.max[0] - s.min[0] : s.max[2] - s.min[2], rate = (s.max[1] - s.min[1]) / run;
          const back = (t - (feetY + step)) / rate + 1e-3, dir = { '+x': [-1, 0], '-x': [1, 0], '+z': [0, -1], '-z': [0, 1] }[s.rise];
          x += dir[0] * back; z += dir[1] * back; hit = true; continue;
        }
      }
      const cx = Math.max(s.min[0], Math.min(s.max[0], x)), cz = Math.max(s.min[2], Math.min(s.max[2], z));
      let dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-10) {
        // center inside the box: push out along the shallowest side
        const opts = [[s.min[0] - radius - x, 0], [s.max[0] + radius - x, 0], [0, s.min[2] - radius - z], [0, s.max[2] + radius - z]];
        const o = opts.reduce((a, b) => Math.hypot(...a) < Math.hypot(...b) ? a : b);
        x += o[0]; z += o[1];
      } else {
        const d = Math.sqrt(d2), push = radius - d;
        x += dx / d * push; z += dz / d * push;
      }
      hit = true;
    }
  }
  return { x, z, hit };
}

// Is there room to stand up (for leaving a crouch)?
export function headroom(shapes, x, z, feetY, height, radius = BODY.radius) {
  for (const s of shapes) {
    if (s.min[1] >= feetY + height || s.max[1] <= feetY + 0.05) continue;
    const cx = Math.max(s.min[0], Math.min(s.max[0], x)), cz = Math.max(s.min[2], Math.min(s.max[2], z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius * 0.8 && s.min[1] > feetY + 0.5) return false;
  }
  return true;
}
// Hitting a ceiling while rising.
export function ceilingAt(shapes, x, z, headY, radius = BODY.radius) {
  let low = Infinity;
  for (const s of shapes) {
    const cx = Math.max(s.min[0], Math.min(s.max[0], x)), cz = Math.max(s.min[2], Math.min(s.max[2], z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius * 0.8 && s.min[1] >= headY - 0.3) low = Math.min(low, s.min[1]);
  }
  return low;
}

// Is there room for a body of this height standing at (x, z) with feet at y?
export function clearAt(shapes, x, z, y, height, radius = BODY.radius * 0.8) {
  for (const s of shapes) {
    if (s.min[1] >= y + height || s.max[1] <= y + 0.05) continue;
    const cx = Math.max(s.min[0], Math.min(s.max[0], x)), cz = Math.max(s.min[2], Math.min(s.max[2], z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius && topAt(s, x, z) > y + 0.05) return false;
  }
  return true;
}
const highestTop = (shapes, x, z, below = Infinity) => {
  let t = -Infinity; for (const s of shapes) { const v = topAt(s, x, z); if (v > t && v < below) t = v; } return t;
};

// What's directly ahead in direction (dx, dz): the top of the obstacle face, how high that is above the
// feet, whether there's room to stand on it (deep), and where you'd land on the far side (beyond) if
// it's thin. Used for vaulting and clambering. Returns null if nothing climbable is there.
export function ledgeAhead(shapes, x, z, dx, dz, feetY, height, maxAhead = 0.9) {
  // find the obstacle's face: the first point ahead with something too tall to step onto
  let near = -1, top = -Infinity;
  for (let d = BODY.radius + 0.05; d <= BODY.radius + maxAhead; d += 0.05) {
    const px = x + dx * d, pz = z + dz * d;
    for (const s of shapes) {
      if (s.noStand) continue;
      const t = topAt(s, px, pz);
      if (t > feetY + BODY.stepHeight * 0.7 && s.min[1] < feetY + height * 1.3 && t > top) top = t;
    }
    if (top > -Infinity) { near = d; break; }
  }
  if (near < 0) return null;
  const inD = near + 0.45, ix = x + dx * inD, iz = z + dz * inD;
  const deep = highestTop(shapes, ix, iz) >= top - 0.05 && clearAt(shapes, ix, iz, top, height);
  let beyond = null;
  for (let d = near + 0.1; d <= near + 1.6; d += 0.1) {
    const bx = x + dx * d, bz = z + dz * d, t = highestTop(shapes, bx, bz);
    if (t < top - 0.25) {                          // past the obstacle: land a body-width further on
      const lx = bx + dx * BODY.radius, lz = bz + dz * BODY.radius, ly = highestTop(shapes, lx, lz, top - 0.25);
      if (clearAt(shapes, lx, lz, ly, height)) beyond = { x: lx, z: lz, y: ly };
      break;
    }
  }
  return { top, h: top - feetY, deep, beyond, inX: ix, inZ: iz, dist: near - BODY.radius };
}

// The nearest wall beside the body (within `range` of its surface), as an outward direction, or null.
// Walls are anything too tall to step onto that overlaps the body's height.
export function wallNear(shapes, x, z, feetY, height, range = 0.3) {
  let best = null, bestD = BODY.radius + range;
  for (const s of shapes) {
    if (s.min[1] >= feetY + height || s.max[1] <= feetY + BODY.stepHeight) continue;
    const cx = Math.max(s.min[0], Math.min(s.max[0], x)), cz = Math.max(s.min[2], Math.min(s.max[2], z));
    const d = Math.hypot(x - cx, z - cz);
    if (d > 1e-4 && d < bestD) { bestD = d; best = { x: (x - cx) / d, z: (z - cz) / d, d: d - BODY.radius, shape: s }; }
  }
  return best;
}

// Water: the volume containing (x, z) at height y, as { top, bottom }, or null. Volumes are boxes
// ({ min, max }) that aren't solid: swimming and wading apply inside them.
export function waterAt(volumes, x, z, y) {
  for (const w of volumes || []) {
    if (x < w.min[0] || x > w.max[0] || z < w.min[2] || z > w.max[2]) continue;
    if (y > w.max[1] + 0.05 || y < w.min[1] - 3) continue;
    return { top: w.max[1], bottom: w.min[1], flow: w.field ? w.field(x, z) : w.flow || null };   // flow: the current here, m/s (rivers: fastest mid-stream)
  }
  return null;
}

// An edge to hang from, straight ahead in (dx, dz): any top within reach of the hands with room for the
// fingers above it, however thin (a lip, a fence top, a narrow wall). Unlike ledgeAhead it doesn't need
// room to stand on top.
//   { top, dist (from the body's surface to the face), thick (how far the top runs back),
//     stand: { x, z } where you'd stand on top after pulling up, or null;
//     over: { x, y, z } where you'd land climbing over a thin wall, or null }
export function edgeAhead(shapes, x, z, dx, dz, feetY, height, maxAhead = 0.9, reach = height * 1.6) {
  let near = -1, top = -Infinity;
  for (let d = BODY.radius + 0.02; d <= BODY.radius + maxAhead; d += 0.04) {
    const px = x + dx * d, pz = z + dz * d;
    for (const s of shapes) {
      if (s.noStand) continue;
      const t = topAt(s, px, pz);
      if (t > feetY + BODY.stepHeight * 0.7 && t <= feetY + reach && s.min[1] < t && t > top) top = t;
    }
    if (top > -Infinity) { near = d; break; }
  }
  if (near < 0) return null;
  // a step up just behind the edge (a wall's top, then the eave of the roof on it): the higher one is the edge to
  // pull up onto
  for (let d = near + 0.04, prev = top; d <= near + 0.6; d += 0.04) { const t = highestTop(shapes, x + dx * d, z + dz * d, feetY + reach); if (t > prev + 0.15 && t - top < 1.0) { top = t; near = d; break; } prev = Math.max(prev, t); }
  // fingers: nothing solid just above the edge
  const gx = x + dx * (near + 0.02), gz = z + dz * (near + 0.02);           // right at the front (edges can be 10 cm deep)
  for (const s of shapes) if (s.min[1] < top + 0.3 && topAt(s, gx, gz) > top + 0.02) return null;
  // how far back the top goes (at about the same height)
  let thick = 0;
  // (a walkable slope rising from the edge counts too: the eave of a roof)
  const slopeK = Math.tan(BODY.maxSlope);
  for (let d = near + 0.05; d <= near + 1.6; d += 0.05) { const h = highestTop(shapes, x + dx * d, z + dz * d); if (h < top - 0.08 || h > top + 0.3 + (d - near) * slopeK) break; thick = d - near; }   // stops where it drops away or a wall rises
  let stand = null, over = null;
  if (thick >= 0.45) {                                  // room for a body to stand (on the surface there: higher up a slope)
    const sd = near + Math.min(0.45, thick / 2), sx = x + dx * sd, sz = z + dz * sd, sy = Math.max(top, highestTop(shapes, sx, sz, top + 0.3 + (sd - near) * slopeK));
    if (clearAt(shapes, sx, sz, sy, height, Math.min(BODY.radius * 0.8, thick / 2))) stand = { x: sx, z: sz, y: sy };
  }
  if (!stand && thick < 0.45) {   // a thin wall: over it to the far side
    const bd = near + thick + 0.1 + BODY.radius, bx = x + dx * bd, bz = z + dz * bd, by = highestTop(shapes, bx, bz, top - 0.25);
    if (by > -Infinity && clearAt(shapes, bx, bz, by, height)) over = { x: bx, y: by, z: bz };
  }
  return { top, dist: near - BODY.radius, thick, stand, over };
}

// Is the straight line from a to b ({ x, y, z }) blocked by any shape? Boxes are tested exactly (slab
// method); ramps by sampling the line against their sloped top.
export function lineBlocked(shapes, a, b) {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], o = [a.x, a.y, a.z];
  for (const s of shapes) {
    let t0 = 0, t1 = 1, miss = false;
    for (let i = 0; i < 3 && !miss; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] <= s.min[i] || o[i] >= s.max[i]) miss = true; continue; }
      let ta = (s.min[i] - o[i]) / d[i], tb = (s.max[i] - o[i]) / d[i]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) miss = true;
    }
    if (miss) continue;
    if (s.type !== 'ramp') return true;
    for (let t = t0; t <= t1; t += Math.max(0.01, (t1 - t0) / 12)) {
      const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
      if (py < topAt(s, px, pz)) return true;
    }
  }
  return false;
}

// A climbable face straight ahead in (dx, dz): the nearest shape whose surface can be climbed
// (src/data/surfaces.js `climb`), overlapping the body's height, whose side the ray from the body hits
// within maxAhead of the body's surface. { shape, dist, n: outward face normal {x, z}, top } or null.
// band: [lo, hi] heights the shape must overlap (default: around the waist and chest)
export function climbAhead(shapes, x, z, dx, dz, feetY, height, maxAhead = 0.4, isClimbable, band = null) {
  let best = null;
  const lo = band ? band[0] : feetY + height * 0.3, hi = band ? band[1] : feetY + height * 0.5;
  for (const s of shapes) {
    if (!isClimbable(s) || s.max[1] <= lo || s.min[1] >= hi) continue;
    // 2D slab test of the ray against the box's footprint
    let t0 = -Infinity, t1 = Infinity, axis = -1, sign = 0;
    for (const [i, o, d] of [[0, x, dx], [2, z, dz]]) {
      if (Math.abs(d) < 1e-9) { if (o < s.min[i] || o > s.max[i]) { t0 = Infinity; break; } continue; }
      let ta = (s.min[i] - o) / d, tb = (s.max[i] - o) / d, sg = -Math.sign(d);
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) { t0 = ta; axis = i; sign = sg; }
      t1 = Math.min(t1, tb);
    }
    if (!(t0 <= t1) || t0 < 0 || axis < 0) continue;
    const dist = t0 - BODY.radius;
    if (dist > maxAhead || (best && dist >= best.dist)) continue;
    best = { shape: s, dist, n: axis === 0 ? { x: sign, z: 0 } : { x: 0, z: sign }, top: s.max[1] };
  }
  return best;
}
