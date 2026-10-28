// src/rpg/weapons.js — weapon models, built from simple parts. Sizes in decimeters.
//
// Model frame: the grip's center is at the origin, the handle runs along +Y (toward the blade or head),
// +X is the cutting edge's direction (the way the knuckles face), +Z is the flat of the blade.
// hold: 'one' (one hand), 'two' (both hands), 'bow' (off hand, vertical), 'shield' (off hand, on the forearm).
// sheath: where it rides when put away: 'hip' (left hip), 'hipR', 'back' (across the back). Most weapons
// ride on the back, clear of the arms; small ones (knives, tools, wands, books) stay at the hip. A second
// back weapon crosses the first.
// center: how far along +Y the weapon's middle is (for placing it on the back).
// pose: borrow another hold's poses and animations ('spear', 'staff', 'dagger', 'one', 'two').

export const WEAPONS = {
  sword: { name: 'Arming sword', hold: 'one', sheath: 'back', center: 3.2, build: sword(7.5, 0.44, 2.0) },
  greatsword: { name: 'Greatsword', hold: 'two', sheath: 'back', center: 4.4, build: sword(11.5, 0.55, 3.2) },
  dagger: { name: 'Dagger', hold: 'one', sheath: 'hip', center: 1.2, build: sword(2.8, 0.32, 1.1, true) },
  axe: { name: 'Hand axe', hold: 'one', sheath: 'back', center: 2.0, build: axe(6.0) },
  mace: { name: 'Flanged mace', hold: 'one', sheath: 'back', center: 2.2, build: mace(6.0) },
  spear: { name: 'Spear', hold: 'two', sheath: 'back', center: 6.0, build: spear(17) },
  staff: { name: 'Staff', hold: 'two', sheath: 'back', center: 4.0, build: staff(16) },
  bow: { name: 'Longbow', hold: 'bow', sheath: 'back', center: 0, build: bow(14) },
  shield: { name: 'Round shield', hold: 'shield', sheath: 'back', center: 0, build: shield(3.2) },
  offdagger: { name: 'Parrying dagger', hold: 'one', sheath: 'hipR', center: 1.2, build: sword(2.8, 0.32, 1.1, true) },
  shortsword: { name: 'Shortsword', hold: 'one', sheath: 'back', center: 2.3, build: sword(5.0, 0.5, 1.5) },
  rapier: { name: 'Rapier', hold: 'one', sheath: 'back', center: 3.6, build: rapier(9.2) },
  greataxe: { name: 'Great axe', hold: 'two', sheath: 'back', center: 4.0, build: greataxe(11) },
  warhammer: { name: 'Warhammer', hold: 'two', sheath: 'back', center: 4.0, build: warhammer(11) },
  club: { name: 'Club', hold: 'one', sheath: 'back', center: 2.2, build: club(6.0) },
  glaive: { name: 'Glaive', hold: 'two', pose: 'spear', sheath: 'back', center: 5.5, build: glaive(15) },
  whip: { name: 'Whip', hold: 'one', sheath: 'hip', center: 0.6, build: whip() },
  throwdagger: { name: 'Throwing knives', hold: 'one', pose: 'dagger', sheath: 'hip', center: 0.9, build: throwingKnife() },
  crossbow: { name: 'Crossbow', hold: 'bow', sheath: 'back', center: 0, build: crossbow() },
  // ---- gathering tools ----
  pickaxe: { name: 'Pickaxe', hold: 'two', sheath: 'back', center: 3.0, build: pickaxe(8.5) },
  woodaxe: { name: "Woodcutter's axe", hold: 'two', sheath: 'back', center: 3.5, build: woodaxe(9.5) },
  skinknife: { name: 'Skinning knife', hold: 'one', pose: 'dagger', sheath: 'hip', center: 0.9, build: skinningKnife() },
  sickle: { name: 'Sickle', hold: 'one', pose: 'dagger', sheath: 'hip', center: 1.2, build: sickle() },
  fishingRod: { name: 'Fishing rod', hold: 'two', pose: 'staff', sheath: 'back', center: 5.0, build: fishingRod(17) },
  chisel: { name: 'Crystal chisel and mallet', hold: 'one', pose: 'dagger', sheath: 'hip', center: 0.8, build: crystalChisel() },
  // ---- magic focuses ----
  wand: { name: 'Wand', hold: 'one', pose: 'dagger', sheath: 'hip', center: 1.4, build: wand() },
  orb: { name: 'Orb', hold: 'one', sheath: 'hipR', center: 0.6, build: orb() },
  spellbook: { name: 'Spellbook', hold: 'one', sheath: 'hipR', center: 0.6, build: spellbook() },
};

const STEEL = [0.78, 0.8, 0.84], DARK = [0.32, 0.33, 0.36], WOOD = [0.42, 0.28, 0.16], LEATHER = [0.26, 0.17, 0.1], BRASS = [0.72, 0.56, 0.26];

// ---- a tiny mesh builder: parts are added with a color and a "metal" flag ----
function builder(THREE) {
  const parts = { metal: [], other: [] };
  const add = (geo, color, metal, m) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(color, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts[metal ? 'metal' : 'other'].push(g);
  };
  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const cyl = (r0, r1, h, y, color, metal, seg = 10) => add(new THREE.CylinderGeometry(r1, r0, h, seg), color, metal, M(0, y + h / 2, 0));
  const box = (sx, sy, sz, x, y, z, color, metal, rz = 0) => add(new THREE.BoxGeometry(sx, sy, sz), color, metal, M(x, y, z, 0, 0, rz));
  const ball = (r, x, y, z, color, metal) => add(new THREE.SphereGeometry(r, 10, 8), color, metal, M(x, y, z));
  // a blade: diamond cross-section from y0 to y1, tapering to a point
  const blade = (y0, len, w, t, color = STEEL, tipFrac = 0.18) => {
    const pos = [], rings = 8;
    const ring = (y, ww, tt) => [[ww / 2, y, 0], [0, y, tt / 2], [-ww / 2, y, 0], [0, y, -tt / 2]];
    const R = [];
    for (let i = 0; i <= rings; i++) {
      const u = i / rings, y = y0 + len * (1 - tipFrac) * u;
      R.push(ring(y, w * (1 - 0.18 * u), t * (1 - 0.2 * u)));
    }
    const tip = [0, y0 + len, 0];
    for (let i = 0; i < rings; i++) for (let k = 0; k < 4; k++) {
      const a = R[i][k], b = R[i][(k + 1) % 4], c = R[i + 1][(k + 1) % 4], d = R[i + 1][k];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    for (let k = 0; k < 4; k++) pos.push(...R[rings][k], ...R[rings][(k + 1) % 4], ...tip);
    for (let k = 0; k < 4; k++) pos.push(...R[0][(k + 1) % 4], ...R[0][k], 0, y0, 0);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    add(g, color, true);
  };
  const done = (mats) => {
    const group = new THREE.Group();
    for (const [k, list] of Object.entries(parts)) if (list.length) {
      const geo = mergeGeos(THREE, list); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats[k]); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  };
  return { add, M, cyl, box, ball, blade, done };
}
function mergeGeos(THREE, list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// ---- the weapons ----
function sword(len, w, grip, dagger = false) {
  return (THREE, mats) => {
    const b = builder(THREE), g = grip / 2;
    b.cyl(0.13, 0.13, grip, -g, LEATHER, false);                         // wrapped grip
    b.ball(0.2, 0, -g - 0.1, 0, BRASS, true);                            // pommel
    b.box(dagger ? 1.0 : 1.9, 0.16, 0.24, 0, g + 0.08, 0, DARK, true);   // crossguard (across the edge)
    b.blade(g + 0.16, len, w, w * 0.18);
    return b.done(mats);
  };
}
function axe(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.15, 0.13, len, -1.2, WOOD, false);
    // the head: a wedge with a curved bit, on the +X side near the top
    const top = len - 1.2;
    b.box(0.6, 0.9, 0.3, 0.1, top - 0.6, 0, DARK, true);
    b.box(1.5, 1.2, 0.09, 0.95, top - 0.65, 0, STEEL, true);
    b.box(0.2, 1.9, 0.07, 1.68, top - 0.65, 0, STEEL, true);              // the cutting edge, flared
    return b.done(mats);
  };
}
function mace(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.14, 0.12, len, -1.2, WOOD, false);
    b.cyl(0.16, 0.16, 1.2, -1.2, LEATHER, false);
    const top = len - 1.2;
    b.cyl(0.32, 0.32, 1.3, top - 1.2, DARK, true);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.add(new THREE.BoxGeometry(0.55, 1.1, 0.07), STEEL, true, b.M(Math.cos(a) * 0.38, top - 0.55, Math.sin(a) * 0.38, 0, -a, 0)); }
    b.ball(0.22, 0, top + 0.12, 0, DARK, true);
    return b.done(mats);
  };
}
function spear(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.14, 0.12, len, -5, WOOD, false);
    b.cyl(0.17, 0.15, 0.6, len - 5.3, DARK, true);
    b.blade(len - 4.75, 2.6, 0.55, 0.14, STEEL, 0.4);
    b.cyl(0.16, 0.1, 0.4, -5.3, DARK, true);
    return b.done(mats);
  };
}
function staff(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.17, 0.13, len, -5, WOOD, false);
    b.cyl(0.2, 0.2, 0.3, len - 5.9, BRASS, true);
    b.add(new THREE.IcosahedronGeometry(0.42, 0), [0.45, 0.7, 0.95], true, b.M(0, len - 4.75, 0));   // a crystal at the head
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; b.add(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 5), BRASS, true, b.M(Math.cos(a) * 0.3, len - 5.1, Math.sin(a) * 0.3, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)); }
    return b.done(mats);
  };
}
function bow(len) {
  return (THREE, mats) => {
    const b = builder(THREE), h = len / 2;
    // limbs curve away from the archer (+X), recurving at the tips; the string runs straight
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16 * 2 - 1, y = u * h, x = 0.9 * (1 - u * u) - 0.25 * Math.pow(Math.abs(u), 6); pts.push(new THREE.Vector3(x, y, 0)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.13, 6), WOOD, false);
    b.cyl(0.17, 0.17, 1.2, -0.6, LEATHER, false);
    b.add(new THREE.CylinderGeometry(0.018, 0.018, len * 0.99, 4), [0.85, 0.82, 0.75], false, b.M(-0.25, 0, 0));
    return b.done(mats);
  };
}
function shield(r) {
  return (THREE, mats) => {
    const b = builder(THREE);
    // face toward +Z; the arm runs along Y behind it
    b.add(new THREE.CylinderGeometry(r, r, 0.22, 28), WOOD, false, b.M(0, 0, 0.5, Math.PI / 2, 0, 0));
    b.add(new THREE.TorusGeometry(r, 0.11, 6, 32), DARK, true, b.M(0, 0, 0.5));
    b.add(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), STEEL, true, b.M(0, 0, 0.6, Math.PI / 2, 0, 0));
    for (let k = 0; k < 4; k++) b.box(0.18, r * 1.9, 0.06, 0, 0, 0.64, DARK, true, k * Math.PI / 4 + Math.PI / 8);
    return b.done(mats);
  };
}

function rapier(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.11, 0.11, 1.5, -0.75, LEATHER, false);                        // grip
    b.ball(0.2, 0, -0.85, 0, STEEL, true);                               // pommel
    b.box(1.6, 0.11, 0.14, 0, 0.82, 0, STEEL, true);                     // quillons
    // swept hilt: a knuckle bow from guard to pommel, and two rings around the ricasso
    const bow = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12; bow.push(new THREE.Vector3(0.55 * Math.sin(Math.PI * u) + 0.12, 0.8 - 1.65 * u, 0)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 20, 0.04, 5), STEEL, true);
    for (const z of [-1, 1]) b.add(new THREE.TorusGeometry(0.28, 0.035, 5, 16), STEEL, true, b.M(0, 1.05, z * 0.12, 0, Math.PI / 2, 0));
    b.blade(0.9, len, 0.22, 0.09, STEEL, 0.08);                           // long, slender, mostly for the thrust
    return b.done(mats);
  };
}
function greataxe(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.17, 0.14, len, -2.5, WOOD, false);
    b.cyl(0.19, 0.19, 1.4, -2.5, LEATHER, false);                        // lower grip
    b.cyl(0.19, 0.19, 0.9, 0.2, LEATHER, false);                         // upper grip
    const top = len - 2.5;
    b.box(0.7, 1.6, 0.42, 0, top - 1.0, 0, DARK, true);                  // socket
    // a broad crescent head on the cutting side, a smaller beard behind
    const shape = new THREE.Shape();
    shape.moveTo(0.3, 0.6); shape.quadraticCurveTo(1.6, 1.4, 2.4, 1.9); shape.quadraticCurveTo(2.0, 0, 2.4, -1.9);
    shape.quadraticCurveTo(1.6, -1.4, 0.3, -0.6); shape.lineTo(0.3, 0.6);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1 }), STEEL, true, b.M(0, top - 1.0, -0.06));
    b.box(0.9, 0.7, 0.1, -0.6, top - 1.0, 0, STEEL, true);
    b.cyl(0.08, 0.02, 0.6, top - 0.2, DARK, true);                       // top spike
    return b.done(mats);
  };
}
function warhammer(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.17, 0.14, len, -2.5, WOOD, false);
    b.cyl(0.19, 0.19, 1.4, -2.5, LEATHER, false);
    b.cyl(0.19, 0.19, 0.9, 0.2, LEATHER, false);
    const top = len - 2.5;
    for (const y of [top - 2.4, top - 1.6]) b.box(0.3, 0.7, 0.3, 0, y, 0, DARK, true);   // langets down the haft
    b.box(1.6, 0.85, 0.85, 0.55, top - 0.75, 0, DARK, true);             // the head block
    b.box(0.25, 1.0, 1.0, 1.4, top - 0.75, 0, STEEL, true);              // striking face
    b.add(new THREE.ConeGeometry(0.3, 1.5, 6), STEEL, true, b.M(-0.95, top - 0.75, 0, 0, 0, Math.PI / 2));  // back spike
    b.add(new THREE.ConeGeometry(0.18, 0.9, 6), STEEL, true, b.M(0, top + 0.1, 0));                         // top spike
    return b.done(mats);
  };
}
function club(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.14, 0.42, len, -1.2, WOOD, false, 9);                         // thickening toward the end
    b.cyl(0.16, 0.16, 1.1, -1.2, LEATHER, false);
    const top = len - 1.2;
    const rad = y => 0.14 + 0.28 * (y + 1.2) / len;                       // the club's radius at height y
    for (let k = 0; k < 7; k++) { const a = k * 2.4, y = top - 0.5 - k * 0.45, r = rad(y) * 0.92; b.ball(0.1, Math.cos(a) * r, y, Math.sin(a) * r, WOOD, false); }   // knots
    b.cyl(rad(top - 2.8) + 0.03, rad(top - 2.55) + 0.03, 0.25, top - 2.8, DARK, true);   // an iron band, hugging the wood
    return b.done(mats);
  };
}
function glaive(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.14, 0.12, len, -5, WOOD, false);
    b.cyl(0.17, 0.15, 0.7, len - 5.4, DARK, true);
    // a long single-edged blade, curving back toward the tip
    const top = len - 4.8, shape = new THREE.Shape();
    shape.moveTo(-0.14, 0); shape.lineTo(0.6, 0.35); shape.quadraticCurveTo(1.05, 2.8, 0.2, 5.2);
    shape.quadraticCurveTo(-0.05, 3.0, -0.14, 0);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 1 }), STEEL, true, b.M(0, top, -0.04));
    b.add(new THREE.ConeGeometry(0.12, 0.5, 5), STEEL, true, b.M(-0.25, top + 0.5, 0, 0, 0, Math.PI / 2.5));  // back hook
    b.cyl(0.16, 0.1, 0.4, -5.3, DARK, true);
    return b.done(mats);
  };
}
function whip() {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.13, 0.11, 2.0, -1.0, LEATHER, false);                         // handle
    b.ball(0.16, 0, -1.05, 0, DARK, true);
    // the lash: braided leather tapering to a cracker, hanging in loose loops from the handle's end
    const pts = [];
    // leaving the handle's end, then hanging in loose coils beside it
    for (let i = 0; i <= 40; i++) { const u = i / 40, a = u * Math.PI * 4, k = 0.35 + 0.45 * u; pts.push(new THREE.Vector3(0.8 - 0.8 * Math.cos(a) * k + 0.25 * u - 0.52 * Math.max(0, 1 - u * 5), 1.0 + 0.4 * Math.sin(Math.min(1, u * 6) * Math.PI) - 4.2 * u, 0.6 * Math.sin(a) * k)); }
    const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 120, 1, 5);
    // taper: shrink each ring toward the tip
    const P = tube.attributes.position, C = [];
    for (let i = 0; i <= 120; i++) C.push(curve.getPointAt(i / 120));
    for (let i = 0; i < P.count; i++) {
      const ring = Math.floor(i / 6), c = C[Math.min(120, ring)], r = 0.09 * (1 - 0.85 * ring / 120);
      P.setXYZ(i, c.x + (P.getX(i) - c.x) * r, c.y + (P.getY(i) - c.y) * r, c.z + (P.getZ(i) - c.z) * r);
    }
    b.add(tube, LEATHER, false);
    return b.done(mats);
  };
}
function throwingKnife() {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.08, 0.08, 0.9, -0.45, LEATHER, false);                         // cord-wrapped handle, no guard
    b.add(new THREE.TorusGeometry(0.13, 0.035, 5, 10), STEEL, true, b.M(0, -0.6, 0, 0, Math.PI / 2, 0));   // ring pommel
    b.blade(0.45, 1.8, 0.28, 0.06, STEEL, 0.35);
    // two more in a sheath strap would ride on the belt; one is enough in the hand
    return b.done(mats);
  };
}
function crossbow() {
  return (THREE, mats) => {
    const b = builder(THREE);
    // held like the bow (left hand at the origin, +X away from the shooter), but the stock runs along X
    // and the prod lies across it
    b.box(5.8, 0.42, 0.34, -0.6, -0.05, 0, WOOD, false);                  // stock
    b.box(1.3, 0.85, 0.3, -3.2, -0.35, 0, WOOD, false);                   // butt
    b.box(4.2, 0.06, 0.08, 0.3, 0.19, 0, DARK, true);                     // bolt groove rail
    const pts = [];
    for (let i = 0; i <= 14; i++) { const u = i / 14 * 2 - 1; pts.push(new THREE.Vector3(2.15 - 0.6 * u * u, 0.1, u * 3.2)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.11, 6), DARK, true);   // steel prod
    // the string, from each prod tip back to the nut
    const rod = (a, c, r, color) => {
      const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c), len = A.distanceTo(C);
      const g = new THREE.CylinderGeometry(r, r, len, 4);
      const m = new THREE.Matrix4().compose(A.clone().add(C).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1));
      b.add(g, color, false, m);
    };
    for (const z of [-1, 1]) rod([1.55, 0.1, z * 3.2], [-0.45, 0.22, z * 0.12], 0.022, [0.85, 0.82, 0.75]);
    b.box(0.3, 0.3, 0.5, -0.5, 0.2, 0, DARK, true);                       // the nut that holds the string
    b.box(0.08, 0.5, 0.08, -1.0, -0.45, 0, DARK, true);                   // trigger
    b.add(new THREE.TorusGeometry(0.35, 0.05, 5, 12), DARK, true, b.M(2.3, -0.2, 0, 0, Math.PI / 2, 0));   // foot stirrup
    b.box(2.2, 0.08, 0.08, 0.4, 0.27, 0, [0.5, 0.36, 0.22], false);       // a loaded bolt
    return b.done(mats);
  };
}

// ---- tools ----
function pickaxe(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.16, 0.14, len, -2.0, WOOD, false);
    b.cyl(0.18, 0.18, 1.2, -2.0, LEATHER, false);
    const top = len - 2.0;
    b.box(0.5, 0.6, 0.5, 0, top - 0.35, 0, DARK, true);                   // the eye around the haft
    // the head: a curved pick on both sides, tapering to points
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(side * (0.2 + 2.2 * u), top - 0.35 - 0.7 * u * u, 0)); }
      const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 16, 1, 6), P = tube.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const ring = Math.floor(i / 7), c = curve.getPointAt(Math.min(16, ring) / 16), r = 0.2 * (1 - 0.92 * ring / 16);
        P.setXYZ(i, c.x + (P.getX(i) - c.x) * r, c.y + (P.getY(i) - c.y) * r, c.z + (P.getZ(i) - c.z) * r);
      }
      b.add(tube, STEEL, true);
    }
    return b.done(mats);
  };
}
function woodaxe(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    // a long, slightly curved haft
    const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(-0.25 * Math.sin(u * Math.PI), -2.2 + u * len, 0)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.15, 7), WOOD, false);
    const top = len - 2.2;
    b.box(0.55, 0.9, 0.42, 0, top - 0.55, 0, DARK, true);
    const shape = new THREE.Shape();                                     // a narrow felling head with a long bit
    shape.moveTo(0.25, 0.4); shape.lineTo(1.6, 0.55); shape.quadraticCurveTo(1.9, 0, 1.6, -0.75); shape.lineTo(0.25, -0.4); shape.lineTo(0.25, 0.4);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 }), STEEL, true, b.M(0, top - 0.55, -0.08));
    b.box(0.4, 0.75, 0.38, -0.4, top - 0.55, 0, DARK, true);              // a flat poll for driving wedges
    return b.done(mats);
  };
}
function skinningKnife() {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.12, 0.13, 1.2, -0.6, [0.55, 0.45, 0.32], false);              // bone handle
    b.cyl(0.14, 0.14, 0.12, 0.55, BRASS, true);
    const shape = new THREE.Shape();                                     // a short, deep-bellied blade
    shape.moveTo(-0.12, 0); shape.lineTo(0.12, 0); shape.quadraticCurveTo(0.42, 0.9, 0.05, 1.7); shape.quadraticCurveTo(-0.05, 0.9, -0.12, 0);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.03, bevelSegments: 1 }), STEEL, true, b.M(0, 0.65, -0.02));
    return b.done(mats);
  };
}
function sickle() {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.13, 0.12, 1.4, -0.7, WOOD, false);
    b.cyl(0.15, 0.15, 0.15, 0.65, DARK, true);
    // the crescent blade, sweeping out and back over the hand
    const outer = [], inner = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI * 0.05 + i / 16 * Math.PI * 1.15; outer.push([Math.sin(a) * 1.15, 0.8 + 1.15 - Math.cos(a) * 1.15]); inner.push([Math.sin(a) * 0.9, 0.8 + 1.15 - Math.cos(a) * 0.95 + 0.08]); }
    const shape = new THREE.Shape(); shape.moveTo(outer[0][0], outer[0][1]);
    for (const p of outer) shape.lineTo(p[0], p[1]);
    for (const p of inner.reverse()) shape.lineTo(p[0], p[1]);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), STEEL, true, b.M(0, -0.1, -0.02));
    return b.done(mats);
  };
}
function fishingRod(len) {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.15, 0.04, len, -3, [0.62, 0.52, 0.3], false, 8);               // a tapering cane rod
    b.cyl(0.17, 0.16, 1.6, -3, LEATHER, false);                         // cork-and-cord grip
    b.add(new THREE.TorusGeometry(0.22, 0.05, 6, 12), DARK, true, b.M(0.2, -0.6, 0, 0, Math.PI / 2, 0));   // the reel, a simple spool
    b.cyl(0.18, 0.18, 0.12, -0.66, WOOD, false);
    for (let k = 1; k <= 4; k++) b.add(new THREE.TorusGeometry(0.06, 0.012, 4, 8), DARK, true, b.M(0.06, -3 + len * k / 5, 0, 0, Math.PI / 2, 0));   // line guides
    // the line, from the tip hanging down to a float and hook
    const tip = len - 3;
    b.add(new THREE.CylinderGeometry(0.008, 0.008, 6, 3), [0.9, 0.9, 0.9], false, b.M(0.06, tip - 3, 0));
    b.ball(0.1, 0.06, tip - 5.2, 0, [0.85, 0.2, 0.15], false);             // float
    return b.done(mats);
  };
}
function crystalChisel() {
  return (THREE, mats) => {
    const b = builder(THREE);
    // held: the chisel; the mallet rides on the belt beside it (shown here bound to the chisel)
    b.cyl(0.11, 0.11, 1.1, -0.55, WOOD, false);                          // grip
    b.cyl(0.07, 0.04, 1.3, 0.5, STEEL, true, 6);                          // the chisel shaft
    b.add(new THREE.ConeGeometry(0.06, 0.3, 4), STEEL, true, b.M(0, 1.95, 0));
    b.box(0.6, 0.42, 0.42, 0.0, -0.72, 0, WOOD, false);                   // a small mallet head as the pommel
    b.add(new THREE.OctahedronGeometry(0.16, 0), [0.55, 0.85, 0.95], true, b.M(0, 0.3, 0));   // a crystal set in the ferrule
    return b.done(mats);
  };
}
// ---- focuses ----
function wand() {
  return (THREE, mats) => {
    const b = builder(THREE);
    b.cyl(0.09, 0.04, 3.2, -0.6, [0.3, 0.2, 0.14], false, 7);             // dark wood, tapering
    b.cyl(0.11, 0.11, 0.9, -0.7, LEATHER, false);
    for (const y of [0.35, 1.3]) b.cyl(0.08, 0.075, 0.08, y, BRASS, true);   // brass bands
    b.add(new THREE.OctahedronGeometry(0.11, 0), [0.75, 0.6, 1.0], true, b.M(0, 2.68, 0));   // a crystal tip
    return b.done(mats);
  };
}
function orb() {
  return (THREE, mats) => {
    const b = builder(THREE);
    // held in the palm on a small cradle; the orb sits above the hand
    b.cyl(0.18, 0.1, 0.4, -0.2, DARK, true, 8);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 4), BRASS, true, b.M(Math.cos(a) * 0.22, 0.38, Math.sin(a) * 0.22, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)); }
    b.add(new THREE.SphereGeometry(0.5, 20, 14), [0.55, 0.65, 0.95], true, b.M(0, 0.95, 0));
    return b.done(mats);
  };
}
function spellbook() {
  return (THREE, mats) => {
    const b = builder(THREE);
    // closed, held by the spine; +X is the fore-edge, Y runs top to bottom of the book
    const H = 2.4, W = 1.8, T = 0.45;
    b.box(W, H, T, W / 2 - 0.1, 0.5, 0, [0.4, 0.12, 0.16], false);          // leather cover
    b.box(W - 0.15, H - 0.16, T - 0.12, W / 2 - 0.05, 0.5, 0, [0.92, 0.88, 0.76], false);   // pages showing at the edges
    b.box(W + 0.02, 0.12, T + 0.04, W / 2 - 0.1, 0.5 + H / 2 - 0.25, 0, BRASS, true);   // corner fittings
    b.box(W + 0.02, 0.12, T + 0.04, W / 2 - 0.1, 0.5 - H / 2 + 0.25, 0, BRASS, true);
    b.box(0.5, 0.18, T + 0.08, W - 0.2, 0.5, 0, BRASS, true);             // clasp
    b.add(new THREE.OctahedronGeometry(0.16, 0), [0.75, 0.6, 1.0], true, b.M(W / 2 - 0.1, 0.5, T / 2 + 0.05));   // a gem on the cover
    return b.done(mats);
  };
}

// Materials shared by every weapon: metal (with vertex colors) and everything else
export function weaponMaterials(THREE) {
  return {
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.3 }),
    other: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.75 }),
  };
}
