// src/game/projectiles.js — early projectiles: arrows from sentries. Each flies under gravity, stops in
// whatever it hits (walls, cover, the ground) and hurts the player if it reaches them. A dodge roll's
// invulnerable window lets one pass through you.
//
//   const P = createProjectiles(THREE, scene, shapes)
//   P.fire(from, target, { speed, lead: targetVelocity })   aims (leading a moving target) and shoots
//   P.update(dt, player) → hits: [{ dmg }]                  player: { pos, height, invulnerable }
import { lineBlocked } from './physics.js';

export const ARROW = { speed: 30, gravity: 9.8, dmg: 0.12, life: 4, radius: 0.32 };

export function createProjectiles(THREE, scene, shapes) {
  const list = [];
  const shaft = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5); shaft.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#5b4632' }), tipMat = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.8 });
  const tipGeo = new THREE.ConeGeometry(0.03, 0.1, 5); tipGeo.rotateX(-Math.PI / 2); tipGeo.translate(0, 0, -0.4);
  const make = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(shaft, mat)); g.add(new THREE.Mesh(tipGeo, tipMat)); scene.add(g); return g; };
  const tmp = new THREE.Vector3();

  function fire(from, target, { speed = ARROW.speed, lead = null } = {}) {
    // aim where the target will be when the arrow gets there (one refinement), and lift for the drop
    let tx = target.x, ty = target.y, tz = target.z;
    for (let i = 0; i < 2; i++) {
      const t = Math.hypot(tx - from.x, ty - from.y, tz - from.z) / speed;
      if (lead) { tx = target.x + lead.x * t; ty = target.y + Math.max(-2, Math.min(2, lead.y)) * t; tz = target.z + lead.z * t; }
    }
    const d = Math.hypot(tx - from.x, ty - from.y, tz - from.z), t = d / speed;
    const v = { x: (tx - from.x) / t, y: (ty - from.y) / t + 0.5 * ARROW.gravity * t, z: (tz - from.z) / t };
    const mesh = make(); mesh.position.set(from.x, from.y, from.z);
    list.push({ p: { ...from }, v, life: ARROW.life, mesh, stuck: 0 });
  }

  function update(dt, player) {
    const hits = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.stuck) { a.stuck -= dt; if (a.stuck <= 0) { scene.remove(a.mesh); list.splice(i, 1); } continue; }   // left sticking in the wall a moment
      a.life -= dt; a.v.y -= ARROW.gravity * dt;
      const n = { x: a.p.x + a.v.x * dt, y: a.p.y + a.v.y * dt, z: a.p.z + a.v.z * dt };
      // the player: the closest the arrow's path this step (a.p → n, swept, so fast arrows can't skip past)
      // comes to the body's axis
      const P = player.pos, h = player.height, sx = n.x - a.p.x, sz = n.z - a.p.z, L2 = sx * sx + sz * sz || 1e-9;
      const t = Math.max(0, Math.min(1, ((P.x - a.p.x) * sx + (P.z - a.p.z) * sz) / L2));
      const qx = a.p.x + sx * t, qy = a.p.y + (n.y - a.p.y) * t, qz = a.p.z + sz * t;
      if (Math.hypot(qx - P.x, qz - P.z) < ARROW.radius && qy > P.y - 0.1 && qy < P.y + h + 0.1) {
        if (!player.invulnerable) { hits.push({ dmg: ARROW.dmg, v: { x: a.v.x, z: a.v.z } }); scene.remove(a.mesh); list.splice(i, 1); continue; }
      }
      if (lineBlocked(shapes, a.p, n) || n.y < -1 || a.life <= 0) { a.stuck = 3; a.mesh.position.set(n.x, n.y, n.z); continue; }
      a.p = n; a.mesh.position.set(n.x, n.y, n.z);
      tmp.set(n.x + a.v.x, n.y + a.v.y, n.z + a.v.z); a.mesh.lookAt(tmp); a.mesh.rotateY(Math.PI);
    }
    return hits;
  }
  return { fire, update, clear() { for (const a of list) scene.remove(a.mesh); list.length = 0; }, get count() { return list.length; } };
}
