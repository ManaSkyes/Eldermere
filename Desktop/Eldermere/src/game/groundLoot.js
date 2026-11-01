// src/game/groundLoot.js — small world-space models for loose items placed in Objects → Loot.
import { ITEMS } from '../rpg/equipment.js';

export function createGroundLoot(THREE, scene, dungeon, origin) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x79502f, roughness: 0.88 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x493324, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2c9, metalness: 0.82, roughness: 0.28, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe3b84d, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide });
  const add = (group, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  function bladeShape(points, material, group, x, z, y = 0.075) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return add(group, geo, material, x, y, z);
  }
  function makeHerbalTool(group) {
    add(group, new THREE.CylinderGeometry(0.035, 0.045, 1.22, 7), wood, 0, 0.055, 0, 0, 0, Math.PI / 2);
    add(group, new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8), leather, -0.48, 0.06, 0, 0, 0, Math.PI / 2);
    add(group, new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8), leather, 0.48, 0.06, 0, 0, 0, Math.PI / 2);
    bladeShape([[0, 0], [-0.12, 0.11], [-0.36, 0.19], [-0.68, 0.16], [-0.55, 0.08], [-0.32, 0.07], [-0.12, -0.02]], steel, group, -0.57, 0);
    bladeShape([[0, 0], [0.16, 0.12], [0.38, 0.1], [0.5, 0], [0.38, -0.1], [0.16, -0.12]], steel, group, 0.57, 0);
    add(group, new THREE.BoxGeometry(0.16, 0.018, 0.06), gold, -0.53, 0.09, 0);
    add(group, new THREE.BoxGeometry(0.16, 0.018, 0.06), gold, 0.53, 0.09, 0);
  }
  function makeGeneric(group) {
    add(group, new THREE.SphereGeometry(0.17, 10, 8), leather, 0, 0.16, 0);
    add(group, new THREE.CylinderGeometry(0.09, 0.13, 0.08, 8), gold, 0, 0.29, 0);
  }
  const drops = [];
  for (const o of dungeon.objects || []) {
    if (o.type !== 'item' || o.preset) continue;
    const contents = (o.contents || []).filter(r => r?.item && (r.qty ?? 1) > 0);
    const first = contents[0], raw = first?.item || '';
    const itemId = raw.startsWith('item:') ? raw.slice(5) : raw.startsWith('weapon:') ? raw.slice(7) : '';
    const group = new THREE.Group();
    group.position.set(origin.x + o.x, origin.y + (o.layer || 0) * 10 + 0.025, origin.z + o.z);
    group.rotation.y = -(o.rot || 0) * Math.PI / 180;
    if (itemId === 'herbalTool') makeHerbalTool(group); else makeGeneric(group);
    scene.add(group);
    drops.push({ object: o, group, itemId, name: ITEMS[itemId]?.name || (raw ? raw.split(':').pop() : 'Ground item'), remaining: first?.qty ?? 1, picked: false });
  }
  function nearest(pos, yaw, maxDistance = 2.4) {
    let best = null, bestD = maxDistance;
    for (const d of drops) {
      if (!d.itemId || d.picked || d.remaining <= 0) continue;
      const dx = d.group.position.x - pos.x, dz = d.group.position.z - pos.z, dist = Math.hypot(dx, dz);
      if (dist < bestD && dist > 0.001 && (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / dist > 0.15) { best = d; bestD = dist; }
    }
    return best;
  }
  function take(drop) {
    if (!drop || drop.picked) return false;
    drop.remaining--;
    if (drop.remaining <= 0) { drop.picked = true; drop.group.visible = false; }
    return true;
  }
  return { drops, nearest, take };
}
