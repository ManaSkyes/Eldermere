// src/game/traverse.js — thief's routes (Sly Cooper style): poles, horizontal pipes, tightropes and wires,
// spires, and narrow edges to edge along with your back to the wall. Routes you have the Sneak technique for
// sparkle when you're near them; press E (or hold jump in the air) to take one. The moves themselves are in
// src/game/controller.js (traversal), the techniques in the Sneak tree (src/data/skillTrees.js).
//
// A route:
//   { kind: 'pole',  x, z, y0, y1, r, spire? }     vertical pole or drainpipe (spire: perch on its tip)
//   { kind: 'pipe',  a: [x, y, z], b: [x, y, z] }   horizontal pipe to hang from and shimmy along
//   { kind: 'rope',  a, b }                          tightrope or wire, walked on top (sloping wires slide)
//   { kind: 'spire', x, y, z }                       a tip to land and perch on
//   { kind: 'edge',  a, b, n: { x, z } }             a narrow ledge along a wall (feet line, wall normal)

// which Sneak technique each kind needs
export const ROUTE_NODE = { pole: 'poleRunner', pipe: 'poleRunner', rope: 'tightrope', spire: 'spireLanding', edge: 'wallHug', hug: 'wallHug' };

// The test course, west of the pool (x -72 to -44, z 8 to 48): two 3 m platforms joined by a tightrope, a
// wire sloping down from the second to a low platform, a pole with a spire on top, a row of spires to hop,
// a pipe between posts, and a tall wall with a narrow ledge along it.
export function testRoutes() {
  return [
    { id: 'rope1', kind: 'rope', a: [-68, 3, 14.2], b: [-68, 3, 29.8] },
    { id: 'wire1', kind: 'rope', a: [-68, 3, 34.2], b: [-68, 1.2, 41.8] },
    { id: 'pole1', kind: 'pole', x: -60, z: 20, y0: 0, y1: 6, r: 0.07, spire: true },
    { id: 'pole1top', kind: 'spire', x: -60, y: 6.1, z: 20 },
    { id: 'sp1', kind: 'spire', x: -55, y: 4, z: 24 },
    { id: 'sp2', kind: 'spire', x: -55, y: 4.6, z: 28.5 },
    { id: 'sp3', kind: 'spire', x: -55, y: 4.2, z: 33 },
    { id: 'pipe1', kind: 'pipe', a: [-62, 3.4, 38], b: [-50, 3.4, 38] },
    { id: 'pole2', kind: 'pole', x: -62.2, z: 38, y0: 0, y1: 3.5, r: 0.08 },
    { id: 'edge1', kind: 'edge', a: [-48.12, 3, 12.5], b: [-48.12, 3, 16.8], n: { x: -1, z: 0 } },
    { id: 'edge2', kind: 'edge', a: [-48.12, 3, 18.7], b: [-48.12, 3, 22.3], n: { x: -1, z: 0 } },
    { id: 'edge3', kind: 'edge', a: [-48.12, 3, 24.2], b: [-48.12, 3, 27.5], n: { x: -1, z: 0 } },
  ];
}
// solid parts of the course: platforms, the posts and spires themselves (thin and too small to stand on:
// you perch on a spire by landing on it, not by walking there), the wall with its ledge
export function testRouteShapes() {
  const S = [];
  const box = (min, max, color, label, extra = {}) => S.push({ type: 'box', min, max, color, label, ...extra });
  box([-70, 0, 10], [-66, 3, 14], '#8a7f70', 'Sneak course: tightrope to the next roof (Sneak: Tightrope)');
  box([-70, 0, 30], [-66, 3, 34], '#8a7f70', 'Wire down to the low roof (Wire slide)');
  box([-70, 0, 42], [-66, 1.2, 46], '#8a7f70');
  box([-60.07, 0, 19.93], [-59.93, 6, 20.07], '#6d6458', 'Pole with a spire (Poles and pipes, Spire landing)', { noStand: true });
  for (const [z, y] of [[24, 4], [28.5, 4.6], [33, 4.2]]) box([-55.06, 0, z - 0.06], [-54.94, y, z + 0.06], '#6d6458', z === 28.5 ? 'Spires: hop between them' : null, { noStand: true });
  box([-62.3, 0, 37.9], [-62.1, 3.5, 38.1], '#6d6458', 'Pipe: hang and shimmy (Poles and pipes)', { noStand: true });
  box([-50.1, 0, 37.9], [-49.9, 3.5, 38.1], '#6d6458', null, { noStand: true });
  box([-48, 0, 10], [-47, 6, 30], '#a39a8a', 'Narrow ledge: hug the wall (E); at a window box, S to hang, shimmy under, W back up');
  box([-48.1, 2.7, 12.5], [-48, 3, 27.5], '#8f8676');                        // the ledge: 10 cm, too narrow to walk, wide enough to edge along
  // window boxes jutting out above the ledge: in the way of a wall hug, but there's room to hang beneath them
  for (const z of [17, 22.5]) box([-48.6, 3.6, z], [-48, 5.2, z + 1.5], '#7d6650', z === 17 ? 'Window box: hang under it' : null);
  box([-51, 0, 8.5], [-48, 3, 12.5], '#8a7f70');                              // a roof at each end of the ledge
  box([-51, 0, 27.5], [-48, 3, 31.5], '#8a7f70');
  return S;
}

// ---- geometry ----
const lerp3 = (a, b, s) => ({ x: a[0] + (b[0] - a[0]) * s, y: a[1] + (b[1] - a[1]) * s, z: a[2] + (b[2] - a[2]) * s });
// nearest point on a route to p ({ x, y, z }): { s (0..1 along it, or height for a pole), point, dist }
export function nearestOnRoute(r, p) {
  if (r.kind === 'pole') { const y = Math.max(r.y0, Math.min(r.y1, p.y)); const point = { x: r.x, y, z: r.z }; return { s: y, point, dist: Math.hypot(p.x - r.x, p.y - y, p.z - r.z) }; }
  if (r.kind === 'spire') { const point = { x: r.x, y: r.y, z: r.z }; return { s: 0, point, dist: Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) }; }
  const a = r.a, b = r.b, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  const s = Math.max(0, Math.min(1, ((p.x - a[0]) * d[0] + (p.y - a[1]) * d[1] + (p.z - a[2]) * d[2]) / L2));
  const point = lerp3(a, b, s); return { s, point, dist: Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z) };
}
export const routePoint = (r, s) => r.kind === 'pole' ? { x: r.x, y: s, z: r.z } : r.kind === 'spire' ? { x: r.x, y: r.y, z: r.z } : lerp3(r.a, r.b, s);
export const routeLength = r => r.kind === 'pole' ? r.y1 - r.y0 : r.kind === 'spire' ? 0 : Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]);

// ---- drawn: ropes, wires and pipes as thin cylinders; spires as little points ----
export function buildRoutes(THREE, scene, routes) {
  const rope = new THREE.MeshStandardMaterial({ color: '#b8a27a', roughness: 0.9 }), metal = new THREE.MeshStandardMaterial({ color: '#7d848c', metalness: 0.7, roughness: 0.4 });
  const cyl = (a, b, r, mat) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    m.castShadow = true; scene.add(m);
  };
  for (const r of routes) {
    if (r.kind === 'rope') cyl(r.a, r.b, 0.02, rope);
    else if (r.kind === 'pipe') cyl(r.a, r.b, 0.06, metal);
    else if (r.kind === 'spire') { const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), metal); m.position.set(r.x, r.y - 0.1, r.z); scene.add(m); }
  }
}

// ---- sparkles: little twinkling lights on the routes you can use, near you ----
export function createSparkles(THREE, scene, max = 14) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(190,220,255,0.9)'); grd.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(230,240,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 60); g.moveTo(4, 32); g.lineTo(60, 32); g.stroke();   // a four-point twinkle
  const tex = new THREE.CanvasTexture(cv);
  const pool = Array.from({ length: max }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; scene.add(s); return s; });
  return {
    // points: [{ x, y, z, key }] — where to sparkle this frame
    update(points, time) {
      pool.forEach((s, i) => {
        const p = points[i]; s.visible = !!p; if (!p) return;
        const tw = 0.6 + 0.4 * Math.sin(time * 6 + i * 1.7) * Math.sin(time * 2.3 + i);
        s.position.set(p.x, p.y + 0.05 * Math.sin(time * 3 + i), p.z); s.scale.setScalar(0.28 + 0.1 * tw); s.material.opacity = 0.55 + 0.45 * tw;
      });
    },
  };
}
