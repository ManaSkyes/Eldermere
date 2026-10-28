// src/game/props.js — furniture and street clutter placed in the creator's Object mode (src/data/objects.js),
// built into the map as scenery with the same boxes and trim as the pieces (so they merge into the cell meshes
// and the solid parts block you). Called last by buildDungeonShapes (src/game/dungeonBuild.js), once the pieces
// and roads are built, so each prop can stand on whatever is under it (a raised street, a road's pavement).
//
// A prop can face any angle: at a quarter turn it's built of plain boxes; otherwise of turned solids, with hidden
// upright boxes for collision a little inside each solid part.
import { OBJECTS } from '../data/objects.js';
import { makeLamppost } from './townBuild.js';

const C = 10;
const K = {
  wood: '#7a5232', dark: '#5a3b24', iron: '#2f2b28', stone: '#bfae8e', cap: '#d2c2a2', leaf: '#4f8a3a', hay: '#d8b860', hayDark: '#b89840',
  water: '#3a6a8a', cloth: ['#c8443a', '#3a6aa8', '#f0e6d0', '#3f8a5a', '#c08a2a', '#9a5ab0'], flowers: ['#e04a6a', '#f0c040', '#e86a3a', '#c060d0', '#f2f2f2'],
  paper: '#efe4c8', copper: '#c07a40', bench: '#6a4428', plaster: '#ece0c4',
};

export function buildProps(d, kit, shapes, origin) {
  const objs = (d.objects || []).filter(o => ['furniture', 'street'].includes(OBJECTS[o.type]?.cat) && !o.preset);
  if (!objs.length) return;
  const { box, trim, prism, lamp } = kit;
  // the ground under a point: the highest solid top within this layer (a raised street, a road's collision, the
  // terrain, filler), no higher than `cap` when given; if there's nothing in this layer, the highest within the
  // 10 m below it (terrain dipping under the layer's floor); failing that, the layer's floor
  const solid = shapes.filter(s => s.type === 'box' && !s.trim && !s.prop);
  const topIn = (wx, wz, lo, hi) => { let best = -Infinity; for (const s of solid) { const t = s.max[1] - origin.y; if (t < lo || t > hi || t <= best) continue; if (wx >= s.min[0] && wx <= s.max[0] && wz >= s.min[2] && wz <= s.max[2]) best = t; } return best; };
  const groundAt = (x, z, l, cap = Infinity) => {
    const wx = x + origin.x, wz = z + origin.z;
    let t = topIn(wx, wz, l * C - 0.6, Math.min(l * C + 9.9, cap)); if (t > -Infinity) return t;
    t = topIn(wx, wz, l * C - 10.6, l * C - 0.6); return t > -Infinity ? t : l * C;
  };
  let seed = 0; const rnd = () => { const s = Math.sin(++seed * 91.7 + objs.length * 13.1) * 43758.5453; return s - Math.floor(s); };
  for (const o of objs) {
    const t = OBJECTS[o.type], q = ((Math.round((o.rot || 0) / 90) % 4) + 4) % 4, cx = o.x, cz = o.z;
    // the ground under its middle; its corners can lift it a little (a kerb, a step), but never onto a wall or roof
    const Yc = groundAt(cx, cz, o.layer);
    const Y = (o.h != null && o.mount !== 'wall' ? o.layer * C + o.h : null) ?? Math.max(Yc, ...[[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]].map(([a, b]) => groundAt(cx + a * (t.w || 1), cz + b * (t.d || 1), o.layer, Yc + 0.45)));
    // local frame: u across (−w/2..w/2), v toward the front (−d/2..d/2, front at +d/2), y up from the ground.
    // At a quarter turn the parts are plain boxes; at any other angle they're turned solids (triangles), and each
    // solid part gets a hidden upright box for collision, a little inside its turned outline.
    const deg = (((o.rot || 0) % 360) + 360) % 360, quarter = Math.abs(deg - q * 90) < 0.01 || Math.abs(deg - 360) < 0.01;
    const th = deg * Math.PI / 180, ux = Math.cos(th), uz = Math.sin(th), fx = Math.sin(th), fz = -Math.cos(th);
    const P = quarter ? (u, v) => q === 0 ? [cx + u, cz - v] : q === 1 ? [cx + v, cz + u] : q === 2 ? [cx - u, cz + v] : [cx - v, cz - u]
      : (u, v) => [cx + u * ux + v * fx, cz + u * uz + v * fz];
    const R = (u0, u1, v0, v1) => { const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
    // a turned hexahedron: corners (u, v) in order round the base, with a bottom and top height at each
    const hexa = (cs, col, tex) => {
      const b = cs.map(([u, v, y0]) => { const [x, z] = P(u, v); return [x, Y + y0, z]; }), t = cs.map(([u, v, , y1]) => { const [x, z] = P(u, v); return [x, Y + y1, z]; }), out = [];
      const quad = (a, c, d, e) => out.push(a, c, d, a, d, e);
      quad(b[0], b[1], b[2], b[3]); quad(t[0], t[1], t[2], t[3]); for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(b[k], b[k2], t[k2], t[k]); }
      kit.tris(out, col, tex);
    };
    const corners = (u0, u1, v0, v1, y0, y1) => [[u0, v0, y0, y1], [u1, v0, y0, y1], [u1, v1, y0, y1], [u0, v1, y0, y1]];
    const B = (u0, u1, v0, v1, y0, y1, col, tex = 0) => {
      if (quarter) { const [x0, z0, x1, z1] = R(u0, u1, v0, v1); box(x0, Y + y0, z0, x1, Y + y1, z1, col, { tex, prop: true }); return; }
      hexa(corners(u0, u1, v0, v1, y0, y1), col, tex);
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, hu = (u1 - u0) * 0.36, hv = (v1 - v0) * 0.36;   // collision: the part shrunk a little, then boxed upright
      const pts = [[mu - hu, mv - hv], [mu + hu, mv - hv], [mu + hu, mv + hv], [mu - hu, mv + hv]].map(([a, b]) => P(a, b));
      box(Math.min(...pts.map(p => p[0])), Y + y0, Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Y + y1, Math.max(...pts.map(p => p[1])), col, { hidden: true, prop: true });
    };
    const T = (u0, u1, v0, v1, y0, y1, col, tex = 6) => { if (quarter) { const [x0, z0, x1, z1] = R(u0, u1, v0, v1); trim(x0, Y + y0, z0, x1, Y + y1, z1, col, { tex }); } else hexa(corners(u0, u1, v0, v1, y0, y1), col, tex); };
    const uAxis = q % 2 ? 'z' : 'x', vAxis = q % 2 ? 'x' : 'z';
    const G = (u0, u1, v0, v1, y0, y1, col, endCol, along = 'u') => {
      if (quarter) { const [x0, z0, x1, z1] = R(u0, u1, v0, v1); prism({ type: 'gable', min: [x0, Y + y0, z0], max: [x1, Y + y1, z1], axis: along === 'u' ? uAxis : vAxis, color: col, endColor: endCol, tex: 2, endTex: 4 }); return; }
      const W3 = (u, v, y) => { const [x, z] = P(u, v); return [x, Y + y, z]; };
      const [a, b, c, e] = [W3(u0, v0, y0), W3(u1, v0, y0), W3(u1, v1, y0), W3(u0, v1, y0)];
      const [r0, r1] = along === 'u' ? [W3(u0, (v0 + v1) / 2, y1), W3(u1, (v0 + v1) / 2, y1)] : [W3((u0 + u1) / 2, v0, y1), W3((u0 + u1) / 2, v1, y1)];
      if (along === 'u') { kit.tris([a, b, r1, a, r1, r0, e, c, r1, e, r1, r0, a, b, c, a, c, e], col, 2); kit.tris([a, e, r0], endCol, 4); kit.tris([b, c, r1], endCol, 4); }
      else { kit.tris([a, e, r1, a, r1, r0, b, c, r1, b, r1, r0, a, b, c, a, c, e], col, 2); kit.tris([a, b, r0], endCol, 4); kit.tris([e, c, r1], endCol, 4); }
    };
    const W = (u0, u1, v0, v1, y0, y1, col, highFront) => {
      if (quarter) { const [x0, z0, x1, z1] = R(u0, u1, v0, v1); const dirs = ['-z', '+x', '+z', '-x']; const fr = dirs[q], bk = dirs[(q + 2) % 4]; prism({ type: 'wedge', min: [x0, Y + y0, z0], max: [x1, Y + y1, z1], high: highFront ? fr : bk, thick: 0.06, color: col, tex: 6 }); return; }
      const lo = y0 + 0.06, hiY = y1, yv = v => highFront ? lo + (v - v0) / (v1 - v0) * (hiY - lo) : hiY - (v - v0) / (v1 - v0) * (hiY - lo);
      hexa([[u0, v0, yv(v0) - 0.06, yv(v0)], [u1, v0, yv(v0) - 0.06, yv(v0)], [u1, v1, yv(v1) - 0.06, yv(v1)], [u0, v1, yv(v1) - 0.06, yv(v1)]], col, 6);
    };
    const barrel = (u, v, y = 0) => { B(u - 0.3, u + 0.3, v - 0.3, v + 0.3, y, y + 0.9, K.wood, 4); for (const h of [0.15, 0.7]) T(u - 0.32, u + 0.32, v - 0.32, v + 0.32, y + h, y + h + 0.06, K.iron); T(u - 0.26, u + 0.26, v - 0.26, v + 0.26, y + 0.9, y + 0.92, K.dark, 4); };
    const crate = (u, v, s, y = 0) => { B(u - s, u + s, v - s, v + s, y, y + 2 * s, K.wood, 4); T(u - s - 0.02, u + s + 0.02, v - s - 0.02, v + s + 0.02, y + s * 0.9, y + s * 1.1, K.dark, 4); T(u - s - 0.02, u + s + 0.02, v - s - 0.02, v + s + 0.02, y + 2 * s - 0.06, y + 2 * s, K.dark, 4); };
    const flower = (u, v, y, n) => { if (kit.plant) { for (let i = 0; i < Math.max(1, Math.round(n / 3)); i++) { const [px, pz] = P(u + (rnd() - 0.5) * 0.25, v + (rnd() - 0.5) * 0.25); kit.plant('flower', px, Y + y - 0.1, pz, 0.7 + rnd() * 0.3, rnd() * 6.28, Math.floor(rnd() * 6)); } return; } for (let i = 0; i < n; i++) { const a = u + (rnd() - 0.5) * 0.3, b = v + (rnd() - 0.5) * 0.3, s = 0.06 + rnd() * 0.04; T(a - s, a + s, b - s, b + s, y, y + 0.1 + rnd() * 0.08, K.flowers[Math.floor(rnd() * 5)]); } };
    switch (o.type) {
      // ---- street ----
      case 'cart': {
        B(-0.7, 0.7, -0.9, 1.1, 0.55, 0.65, K.wood, 4);                                       // the bed
        for (const s of [-1, 1]) T(s * 0.7 - 0.05, s * 0.7 + 0.05, -0.9, 1.1, 0.65, 1.05, K.wood, 4);   // sides
        T(-0.7, 0.7, 1.05, 1.1, 0.65, 1.05, K.wood, 4); T(-0.7, 0.7, -0.9, -0.85, 0.65, 1.05, K.wood, 4);
        for (const s of [-1, 1]) { T(s * 0.82 - 0.06, s * 0.82 + 0.06, -0.05, 0.05, 0.0, 1.0, K.dark, 4); T(s * 0.82 - 0.06, s * 0.82 + 0.06, -0.45, 0.45, 0.45, 0.55, K.dark, 4); T(s * 0.82 - 0.05, s * 0.82 + 0.05, -0.32, 0.32, 0.12, 0.88, K.iron); }   // wheels (a cross and a rim)
        for (const s of [-1, 1]) T(s * 0.45 - 0.04, s * 0.45 + 0.04, -1.4, -0.9, 0.45, 0.55, K.wood, 4);   // the shafts
        crate(-0.3, 0.6, 0.25, 0.65); barrel(0.25, 0.1, 0.65); T(-0.5, 0.0, -0.6, -0.2, 0.65, 0.85, K.hay, 6);
        break;
      }
      case 'stall': {
        B(-1.4, 1.4, -0.4, 0.5, 0, 0.9, K.wood, 4); T(-1.45, 1.45, -0.45, 0.55, 0.9, 0.95, K.dark, 4);   // the counter
        for (const [u, v] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) T(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 2.4 + (v < 0 ? 0.3 : 0), K.dark, 4);
        const cl = [K.cloth[Math.floor(rnd() * 6)], '#f0e6d0'];
        for (let i = 0; i < 6; i++) W(-1.5 + i * 0.5, -1.0 + i * 0.5, -1.0, 1.1, 2.3, 2.75, cl[i % 2], false);   // the striped awning, high at the back
        for (let i = 0; i < 5; i++) { const u = -1.1 + i * 0.55; T(u - 0.2, u + 0.2, -0.2, 0.25, 0.95, 1.05, '#8a6a42', 4); T(u - 0.17, u + 0.17, -0.17, 0.22, 1.05, 1.15, ['#d84a3a', '#f0c040', '#7ab040', '#e8843a', '#a04a8a'][Math.floor(rnd() * 5)]); }   // baskets of produce
        crate(-1.0, -0.8, 0.22); barrel(1.0, -0.75);
        break;
      }
      case 'sbench': {
        B(-0.9, 0.9, -0.25, 0.2, 0.4, 0.48, K.bench, 4);
        T(-0.9, 0.9, -0.3, -0.24, 0.55, 0.95, K.bench, 4);                                     // the back
        for (const s of [-1, 1]) { T(s * 0.8 - 0.06, s * 0.8 + 0.06, -0.28, 0.2, 0, 0.4, K.iron); T(s * 0.8 - 0.04, s * 0.8 + 0.04, -0.3, -0.24, 0.48, 0.95, K.iron); }
        break;
      }
      case 'planterBox': {
        B(-0.55, 0.55, -0.55, 0.55, 0, 0.6, K.stone); T(-0.6, 0.6, -0.6, 0.6, 0.6, 0.68, K.cap, 0);
        T(-0.45, 0.45, -0.45, 0.45, 0.6, 0.85, K.leaf); flower(0, 0, 0.82, 8);
        break;
      }
      case 'flowerpots': {
        for (const [u, s, h] of [[-0.25, 0.17, 0.35], [0.12, 0.2, 0.42], [0.35, 0.12, 0.28]]) { T(u - s, u + s, -s, s, 0, h, '#b0634a', 0); T(u - s + 0.03, u + s - 0.03, -s + 0.03, s - 0.03, h, h + 0.12, K.leaf); flower(u, 0, h + 0.1, 3); }
        break;
      }
      case 'signpost': {
        B(-0.08, 0.08, -0.08, 0.08, 0, 2.6, K.dark, 4); T(-0.12, 0.12, -0.12, 0.12, 2.6, 2.7, K.iron);
        T(-0.05, 0.9, -0.03, 0.03, 2.05, 2.35, K.wood, 4); T(0.9, 1.05, -0.03, 0.03, 2.1, 2.3, K.wood, 4);   // two arms, pointing different ways
        T(-0.03, 0.03, -0.9, 0.05, 1.55, 1.85, K.wood, 4); T(-0.03, 0.03, -1.05, -0.9, 1.6, 1.8, K.wood, 4);
        break;
      }
      case 'notice': {
        for (const s of [-1, 1]) B(s * 0.75 - 0.06, s * 0.75 + 0.06, -0.06, 0.06, 0, 2.1, K.dark, 4);
        T(-0.75, 0.75, -0.04, 0.04, 0.9, 1.9, K.wood, 4); G(-0.85, 0.85, -0.25, 0.25, 2.0, 2.35, '#a4483a', K.dark);
        for (let i = 0; i < 5; i++) { const u = -0.55 + rnd() * 1.1, y = 1.0 + rnd() * 0.7, s = 0.1 + rnd() * 0.06; T(u - s, u + s, 0.04, 0.06, y, y + s * 1.4, K.paper); }
        break;
      }
      case 'well': {
        for (const [a0, a1, b0, b1] of [[-1, 1, -1, -0.7], [-1, 1, 0.7, 1], [-1, -0.7, -0.7, 0.7], [0.7, 1, -0.7, 0.7]]) { B(a0, a1, b0, b1, 0, 0.85, K.stone); T(a0 - 0.04, a1 + 0.04, b0 - 0.04, b1 + 0.04, 0.85, 0.93, K.cap, 0); }
        T(-0.7, 0.7, -0.7, 0.7, 0.1, 0.12, '#1a2a30');                                         // dark water far down
        for (const s of [-1, 1]) T(s * 0.85 - 0.07, s * 0.85 + 0.07, -0.07, 0.07, 0.93, 2.4, K.dark, 4);
        T(-0.85, 0.85, -0.04, 0.04, 1.9, 1.98, K.dark, 4); T(-0.03, 0.03, -0.03, 0.03, 1.2, 1.9, '#c8b890');   // the windlass and rope
        T(-0.15, 0.15, -0.15, 0.15, 1.0, 1.25, K.wood, 4);                                    // the bucket
        G(-1.2, 1.2, -0.8, 0.8, 2.4, 3.1, '#a4483a', K.dark);
        break;
      }
      case 'trough': {
        B(-1, 1, -0.4, 0.4, 0, 0.12, K.stone);
        for (const [a0, a1, b0, b1] of [[-1, 1, -0.4, -0.3], [-1, 1, 0.3, 0.4], [-1, -0.9, -0.3, 0.3], [0.9, 1, -0.3, 0.3]]) B(a0, a1, b0, b1, 0.12, 0.7, K.stone);
        T(-0.9, 0.9, -0.3, 0.3, 0.12, 0.58, K.water);
        break;
      }
      case 'hay': {
        B(-0.7, 0.0, -0.5, 0.5, 0, 0.5, K.hay, 6); B(0.02, 0.7, -0.5, 0.5, 0, 0.5, K.hayDark, 6); B(-0.4, 0.35, -0.45, 0.45, 0.5, 1.0, K.hay, 6);
        for (const [u0, u1, y0] of [[-0.7, 0.0, 0], [0.02, 0.7, 0], [-0.4, 0.35, 0.5]]) for (const f of [0.3, 0.7]) T(u0 + (u1 - u0) * f - 0.02, u0 + (u1 - u0) * f + 0.02, -0.51, 0.51, y0, y0 + 0.51, '#8a6a30');   // the twine
        break;
      }
      case 'crates': {
        crate(-0.4, -0.15, 0.35); crate(0.42, -0.2, 0.3); crate(-0.35, -0.1, 0.28, 0.7); crate(0.3, 0.35, 0.2);
        break;
      }
      case 'barrels': {
        barrel(-0.4, -0.35); barrel(0.38, -0.3); barrel(0, 0.38); barrel(-0.05, -0.32, 0.92);
        break;
      }
      case 'laundry': {
        for (const s of [-1, 1]) B(s * 1.9 - 0.06, s * 1.9 + 0.06, -0.06, 0.06, 0, 2.6, K.dark, 4);
        T(-1.9, 1.9, -0.01, 0.01, 2.35, 2.38, '#e8e0d0');
        let u = -1.6; while (u < 1.4) { const w = 0.35 + rnd() * 0.45, h = 0.4 + rnd() * 0.5; T(u, u + w, -0.015, 0.015, 2.35 - h, 2.36, K.cloth[Math.floor(rnd() * 6)]); u += w + 0.12 + rnd() * 0.2; }
        break;
      }
      case 'slamp': makeLamppost({ ...kit, box: (x0, y0, z0, x1, y1, z1, c, e = {}) => box(x0, y0, z0, x1, y1, z1, c, { ...e, prop: true }) }, cx, cz, Y); break;
      // ---- furniture ----
      case 'table': { B(-1, 1, -0.5, 0.5, 0.7, 0.78, K.wood, 4); for (const [u, v] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) T(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.7, K.dark, 4); break; }
      case 'chair': { B(-0.22, 0.22, -0.22, 0.22, 0.42, 0.48, K.wood, 4); T(-0.22, 0.22, -0.24, -0.18, 0.48, 1.0, K.wood, 4); for (const [u, v] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) T(u - 0.03, u + 0.03, v - 0.03, v + 0.03, 0, 0.42, K.dark, 4); break; }
      case 'bed': { B(-0.5, 0.5, -1, 1, 0, 0.45, K.wood, 4); T(-0.45, 0.45, -0.95, 0.95, 0.45, 0.6, '#e8e0d0', 6); T(-0.45, 0.45, -0.95, 0.4, 0.6, 0.64, '#7a3a3a', 6); T(-0.35, 0.35, 0.55, 0.9, 0.6, 0.72, '#f2f2f2', 6); T(-0.5, 0.5, 0.95, 1.05, 0, 1.0, K.dark, 4); break; }
      case 'bookshelf': { B(-0.9, 0.9, -0.2, 0.2, 0, 2.0, K.dark, 4); for (let r = 0; r < 4; r++) { let u = -0.82; while (u < 0.8) { const w = 0.05 + rnd() * 0.06, h = 0.3 + rnd() * 0.12; T(u, u + w, 0.0, 0.21, 0.1 + r * 0.48, 0.1 + r * 0.48 + h, K.cloth[Math.floor(rnd() * 6)]); u += w + 0.01; } } break; }
      case 'barrel': barrel(0, 0); break;
      case 'crate': crate(0, 0, 0.42); break;
      case 'rug': T(-(o.w || t.w) / 2, (o.w || t.w) / 2, -(o.d || t.d) / 2, (o.d || t.d) / 2, 0.005, 0.02, '#8a3a32'); T(-(o.w || t.w) / 2 + 0.15, (o.w || t.w) / 2 - 0.15, -(o.d || t.d) / 2 + 0.15, (o.d || t.d) / 2 - 0.15, 0.02, 0.025, '#c08a3a'); break;
      case 'candles': { T(-0.12, 0.12, -0.12, 0.12, 0, 0.05, K.iron); T(-0.03, 0.03, -0.03, 0.03, 0.05, 1.2, K.iron); T(-0.04, 0.04, -0.04, 0.04, 1.2, 1.35, '#f2ead8'); lamp(...P(0, 0).flatMap((c, i) => i ? [c] : [c, Y + 1.42]), '#ffcf80'); break; }
      case 'rack': { for (const s of [-1, 1]) B(s * 0.75 - 0.05, s * 0.75 + 0.05, -0.15, 0.15, 0, 1.6, K.dark, 4); T(-0.8, 0.8, -0.05, 0.05, 1.3, 1.38, K.dark, 4); T(-0.8, 0.8, -0.05, 0.05, 0.3, 0.38, K.dark, 4); for (let i = 0; i < 4; i++) T(-0.5 + i * 0.33 - 0.02, -0.5 + i * 0.33 + 0.02, -0.02, 0.02, 0.35, 1.55, '#b8bcc2'); break; }
    }
  }
}
