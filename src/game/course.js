// src/game/course.js — the gauntlet: an obstacle course for a character at Athletics 5000 and Sneak 5000.
// South of the start, z −56 to −132 (athletics, over lava), then west (sneak, over poison) and back north into
// a walled garden to the finish. Everything here is data the game reads: shapes (src/game/physics.js), routes
// (src/game/traverse.js), hazard zones, checkpoints, sentries (which shoot when they spot you) and the finish.
//
//   ATHLETICS (over lava)                                    SNEAK (over poison, watched by sentries)
//   0 Start · checkpoint, the timer starts as you leave      5 Wire slide down to the first roof · checkpoint
//   1 Runway: spike strip (jump), rail (vault), tunnel       6 Tightrope under a sentry (crouch low on it)
//     (slide under), then a wall run over a lava pit         7 Pole up to a spire, spire hops, a roof · checkpoint
//   2 Landing · checkpoint; a wall-jump shaft (side to       8 Wall hug along a 10 cm ledge watched by a sentry;
//     side; too high to run up) to the platform edge          window boxes: hang under, pull back up · checkpoint
//   3 High platform · checkpoint; a 9 m gap to a tower       9 Pipe shimmy to a pole, down into the garden
//     2 m higher (sprint, Skywalker double jump, catch)     10 Garden: a sentry sweeping over crates; roll cover to
//   4 The tower · checkpoint                                    cover (Cloaked dodge) or Vanish · FINISH

const box = (min, max, color, label, extra = {}) => ({ type: 'box', min, max, color, label, ...extra });

export function courseShapes() {
  const S = [], P = (...a) => S.push(box(...a));
  const stone = '#857a6c', dark = '#5f574d', metal = '#8a8f96';
  // ---- athletics ----
  P([-4, 0, -60], [4, 3, -56], '#6d7f5a', 'OBSTACLE COURSE · Athletics 5000 + Sneak 5000 · T: back to checkpoint');
  P([-2, 0, -80], [2, 3, -60], stone);                                                    // the runway
  P([-2, 3, -68.2], [2, 3.9, -68], metal, 'Vault the rail', { surface: 'metal' });
  P([-2, 4.4, -77], [2, 6, -71], dark, 'Slide under (1.4 m): crouch before you reach it');   // tunnel roof: crouch height fits, standing doesn't
  P([2.2, 0, -91], [2.8, 7, -77.5], '#9a8f80', 'Wall run over the lava');
  P([-3, 0, -98], [4, 3, -90], stone);                                                    // landing
  P([-1.2, 0, -106], [1.2, 3, -98], stone);                                               // shaft floor
  P([-1.8, 0, -106], [-1.2, 16.5, -98], '#9a8f80', 'Wall-jump shaft: side to side, then grab the ledge');
  P([1.2, 0, -106], [1.8, 16.5, -98], '#9a8f80');
  P([-3, 0, -118], [3, 13.5, -106], stone);                                               // high platform (13.5 m: too high to run up, kick up the shaft)
  P([-3, 0, -131], [3, 15.5, -127], stone, 'Tower: 9 m across, 2 m up · sprint, double jump and catch the edge');
  // ---- sneak ----
  P([-18, 0, -132], [-12, 6, -126], stone, 'Sneak: tightrope under the sentry (crouch low on it)');   // B0
  P([-34, 0, -132], [-30, 6, -126], stone);                                               // R1
  P([-36.07, 0, -129.07], [-35.93, 9, -128.93], dark, 'Pole to the spire', { noStand: true });
  for (const [z, y] of [[-124.5, 9], [-120, 9.6]]) P([-36.06, 0, z - 0.06], [-35.94, y, z + 0.06], dark, null, { noStand: true });
  P([-40, 0, -117], [-33, 8.5, -112], stone);                                             // R2
  P([-37, 0, -112], [-19, 13, -111], '#9a8f80', 'Hug the wall along the ledge · window boxes: hang under');
  P([-33, 8.2, -112.1], [-19, 8.5, -112], '#7d746a');                                     // the 10 cm ledge (south face)
  for (const x of [-28, -23.5]) P([x, 9.1, -112.6], [x + 1.5, 10.7, -112], '#7d6650');   // window boxes
  P([-19, 0, -117], [-13, 8.5, -112], stone);                                             // R3
  P([-16.25, 0, -103.45], [-16.05, 9, -103.25], dark, null, { noStand: true });          // the pole at the pipe's end
  // garden: low walls round it, crates for cover, the finish
  P([-31, 0, -104.5], [-8, 1.6, -104], '#8a8070');                                       // south wall (the poison stays out)
  P([-31, 0, -88], [-8, 1.6, -87.5], '#8a8070');
  P([-31.5, 0, -104.5], [-31, 1.6, -87.5], '#8a8070'); P([-8, 0, -104.5], [-7.5, 1.6, -87.5], '#8a8070');
  for (const [x, z] of [[-13, -96.5], [-19.5, -98], [-24, -95.5]]) P([x - 0.9, 0, z - 0.9], [x + 0.9, 1.3, z + 0.9], '#9c7a56', null, { surface: 'wood' });
  P([-30.5, 0, -99], [-27.5, 0.4, -95], '#c9b458', 'FINISH');
  // sentry pillars
  for (const s of courseSentries()) P([s.x - 0.35, 0, s.z - 0.35], [s.x + 0.35, s.y - 0.3, s.z + 0.35], '#5a5550');
  return S;
}

export function courseRoutes() {
  return [
    { id: 'cWire', kind: 'rope', a: [-3.2, 15.5, -129], b: [-11.8, 6, -129] },
    { id: 'cRope', kind: 'rope', a: [-18.2, 6, -129], b: [-29.8, 6, -129] },
    { id: 'cPole1', kind: 'pole', x: -36, z: -129, y0: 0, y1: 9, r: 0.07, spire: true },
    { id: 'cSpire0', kind: 'spire', x: -36, y: 9.1, z: -129 },
    { id: 'cSpire1', kind: 'spire', x: -36, y: 9, z: -124.5 },
    { id: 'cSpire2', kind: 'spire', x: -36, y: 9.6, z: -120 },
    { id: 'cEdge1', kind: 'edge', a: [-32.8, 8.5, -112.12], b: [-28.2, 8.5, -112.12], n: { x: 0, z: -1 } },
    { id: 'cEdge2', kind: 'edge', a: [-26.3, 8.5, -112.12], b: [-23.7, 8.5, -112.12], n: { x: 0, z: -1 } },
    { id: 'cEdge3', kind: 'edge', a: [-21.8, 8.5, -112.12], b: [-19.2, 8.5, -112.12], n: { x: 0, z: -1 } },
    { id: 'cPipe', kind: 'pipe', a: [-16.15, 9, -111.6], b: [-16.15, 9, -103.6] },
    { id: 'cPole3', kind: 'pole', x: -16.15, z: -103.35, y0: 0, y1: 9, r: 0.08 },
  ];
}

// hazard zones: lava (burns and sends you back to the checkpoint), poison (hurts while you're in it, and for
// a few seconds after), spikes (a stab and a bounce)
export function courseHazards() {
  return [
    { kind: 'lava', min: [-12, -2, -132], max: [12, 0.6, -60] },
    { kind: 'poison', min: [-46, -2, -140], max: [-8, 1.5, -104.6] },
    { kind: 'spikes', min: [-2, 3, -65], max: [2, 3.35, -64] },                       // only the spikes themselves (jump them)
  ];
}
export const HAZARD = { lava: { dmg: 0.35, respawn: true }, poison: { dps: 0.09, linger: 2.5 }, spikes: { dmg: 0.2, bounce: 7, cool: 0.8 } };

export function courseCheckpoints() {
  return [
    { id: 0, name: 'Start', x: 0, y: 3, z: -58, start: true },
    { id: 1, name: 'Landing', x: 0, y: 3, z: -95 },
    { id: 2, name: 'High platform', x: 0, y: 13.5, z: -109 },
    { id: 3, name: 'Tower', x: 0, y: 15.5, z: -129 },
    { id: 4, name: 'First roof', x: -15, y: 6, z: -129 },
    { id: 5, name: 'Pole roof', x: -32, y: 6, z: -129 },
    { id: 6, name: 'Ledge roof', x: -37, y: 8.5, z: -114.5 },
    { id: 7, name: 'Pipe roof', x: -16, y: 8.5, z: -114.5 },
    { id: 8, name: 'Garden', x: -16, y: 0, z: -101.5 },
    { id: 9, name: 'Finish', x: -29, y: 0.4, z: -97, finish: true },
  ];
}

// sentries: a head on a pillar, sweeping its gaze (yaw ± sweep), that shoots arrows once it has spotted you
//   yaw: facing (−Z at 0, as everywhere) · sweep: half-angle of the sweep (rad) · period: seconds per sweep
//   perception: sharper than the test sentry (2.2×), since the course is for a master thief
export function courseSentries() {
  return [
    { id: 's1', x: -24, y: 8.5, z: -137, yaw: Math.PI, sweep: 0.6, period: 7, shoots: true, perception: 2.2 },          // watches the tightrope
    { id: 's2', x: -46, y: 11, z: -122.5, yaw: -Math.PI / 2, sweep: 0.5, period: 6, shoots: true, perception: 2.2 },    // watches the spires
    { id: 's3', x: -26, y: 10.5, z: -121, yaw: Math.PI, sweep: 0.45, period: 8, shoots: true, perception: 2.2 },        // watches the wall ledge
    { id: 's4', x: -19, y: 2.2, z: -89, yaw: 0, sweep: 0.75, period: 5, shoots: true, perception: 2.2 },                // sweeps the garden
  ];
}

// ---- drawn: lava, poison mist, spikes, checkpoint flags ----
export function buildCourse(THREE, scene) {
  const parts = { lava: [], poison: [], flags: [] };
  for (const h of courseHazards()) {
    const sx = h.max[0] - h.min[0], sz = h.max[2] - h.min[2];
    if (h.kind === 'lava') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff4a0a' }));
      m.rotation.x = -Math.PI / 2; m.position.set((h.min[0] + h.max[0]) / 2, 0.08, (h.min[2] + h.max[2]) / 2); scene.add(m); parts.lava.push(m);
    } else if (h.kind === 'poison') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h.max[1], sz), new THREE.MeshBasicMaterial({ color: '#4fbf2a', transparent: true, opacity: 0.55, depthWrite: false }));
      m.position.set((h.min[0] + h.max[0]) / 2, h.max[1] / 2, (h.min[2] + h.max[2]) / 2); scene.add(m); parts.poison.push(m);
    } else if (h.kind === 'spikes') {
      const mat = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.8, roughness: 0.3 });
      for (let x = h.min[0] + 0.15; x < h.max[0]; x += 0.3) for (let z = h.min[2] + 0.15; z < h.max[2]; z += 0.3) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 6), mat); c.position.set(x, h.min[1] + 0.27, z); scene.add(c);
      }
    }
  }
  for (const cp of courseCheckpoints()) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#d8d2c4' })); pole.position.y = 1.1; g.add(pole);
    const mat = new THREE.MeshStandardMaterial({ color: cp.finish ? '#e8c440' : '#6a7f9a', emissive: '#000000', side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), mat); flag.position.set(0.42, 1.9, 0); g.add(flag);
    g.position.set(cp.x + 0.9, cp.y, cp.z); scene.add(g); parts.flags.push({ cp, mat, flag });
  }
  return {
    update(time, activeId) {
      for (const m of parts.lava) m.material.color.setRGB(1, 0.27 + 0.08 * Math.sin(time * 2.1), 0.03);   // glowing, pulsing
      for (const m of parts.poison) m.material.opacity = 0.5 + 0.08 * Math.sin(time * 1.3);
      for (const f of parts.flags) { const on = f.cp.id === activeId; f.mat.emissive.set(on ? (f.cp.finish ? '#7a5a00' : '#2a6aff') : '#000000'); f.flag.rotation.y = Math.sin(time * 3 + f.cp.id) * 0.25; }
    },
  };
}
