// src/rpg/creatureMotion.js — how a creature (src/rpg/creature.js) moves: locomotion by body plan, its idle life, and
// its moves (keyframed attacks and actions), layered every frame.
//
//   const mo = createMotion(C, M)            C: the built creature, M: its entry in src/data/monsters.js
//   mo.update(dt, { speed })                 speed: m/s along its facing (0 = standing / hovering)
//   mo.play(name, { loop })                  start one of M.moves; mo.action → { name, u } while it plays
//   mo.onCommit = (dx, dz) => …              a move with keepRoot ended where it went: move the creature by it
//   mo.onEvent = (name, data) => …           'fire' (a projectile leaves: { pos, dir, speed, kind }), 'aura' (an area
//                                            effect goes off: { pos, radius, effect }) — for the game's combat
// A move can also have `then` (the move that follows it at once: sink → rise) and `fx` — what it makes:
//   { kind: 'orb', bone, from, fire, size, speed }   a ball of dark energy forming at the bone, fired forward
//   { kind: 'aura', bone, from, to, radius, effect } a dark aura swelling out from the bone
//   mo.root                                  the root-motion offset this frame { x, y, z } (the game moves the creature
//                                            by it; the lab shows it in place)
//
// Layers, in order: rest → locomotion (the body: bob, sway, pitch; the wings' beat) → idle life (breathing, looking
// round; less of it when moving) → the move's rotations (added) → the legs placed on the ground (two-bone IK, blended
// with the move's own leg pose by its `ik` weight).
//
// Body plans:
//   four-legged (M.gait)   legs step in a walk (one foot at a time) that turns into a trot as speed rises; each foot
//                          plants and holds still on the ground while the body passes over it, then swings forward
//   winged (M.flight)      hovering wingbeats; flying forward the body pitches nose-down and the beats slow and deepen;
//                          a move can fold or hold the wings (its `flap` weight)
//
// A move: { dur, hit: [from, to], hitbox: ['bone', ...], keys: [{ t, rot: { 'bone': [x, y, z] }, root: [x, y, z,
// pitch, roll], ik, ikLegs: { 'front.L': 0 }, flap }], keepRoot } — ikLegs: per leg; keepRoot: it ends where its root went — rotations are added to the bones (radians), root moves and pitches the whole body (metres from
// where it stands), ik (0..1, default 1) how much the legs stay planted, flap (default 1) how much the wings keep beating.
// Between keys everything eases; before the first key it eases from rest, after the last back to it.
// reactions every creature has (a monster can write its own under the same names): knocked off balance, knocked
// flat, thrown into the air. root: [x, y, z, pitch, roll].
export const REACTIONS = {
  stagger: { dur: 0.9, reaction: true, keys: [{ t: 0.2, root: [0, 0.03, -0.25, -0.25, 0.08], rot: { 'neck:0': [-0.3, 0, 0], 'head:0': [-0.2, 0, 0] }, flap: 0.4 }, { t: 0.6, root: [0, 0, -0.2, -0.1, 0] }] },
  knockdown: { dur: 1.8, reaction: true, keys: [{ t: 0.15, root: [0, -0.3, -0.25, 0, 1.3], ik: 0, flap: 0 }, { t: 0.75, root: [0, -0.3, -0.25, 0, 1.3], ik: 0, flap: 0 }, { t: 0.92, root: [0, -0.05, -0.2, 0, 0.2], ik: 0.6 }] },
  launch: { dur: 1.8, reaction: true, keys: [{ t: 0.3, root: [0, 1.8, -0.4, -0.6, 0.2], ik: 0, flap: 0 }, { t: 0.55, root: [0, 1.2, -0.6, 0.3, 0.5], ik: 0, flap: 0 }, { t: 0.68, root: [0, -0.3, -0.6, 0, 1.3], ik: 0, flap: 0 }, { t: 0.9, root: [0, -0.2, -0.6, 0, 1.0], ik: 0.3 }] },
};
export function createMotion(C, M) {
  const MOVES = { ...REACTIONS, ...(M.moves || {}) };
  const THREE = window.THREE;
  const b = C.bones, st = { t: 0, cycle: 0, speed: 0, action: null, root: { x: 0, y: 0, z: 0 } };
  const idleOpts = { moving: 0 };   // reused per creature; idle callbacks consume this synchronously
  const smooth = u => u * u * (3 - 2 * u);
  // ---- moves ----
  function sample(mv, u) {
    const keys = mv.keys, out = { rot: {}, root: [0, 0, 0, 0], ik: 1, flap: 1, ikLegs: {} }, last = keys[keys.length - 1];
    const zero = { t: 0, rot: {}, root: [0, 0, 0, 0], ik: 1, flap: 1 }, end = { t: 1, rot: {}, root: mv.keepRoot ? last.root : [0, 0, 0, 0], ik: 1, flap: 1 };   // (keepRoot: it ends where it went)
    const all = keys[0].t <= 0 ? [...keys, end] : [zero, ...keys, end];   // (a key at 0: it starts there — rise begins underground)
    let i = 0; while (i < all.length - 2 && u > all[i + 1].t) i++;
    const A = all[i], B = all[i + 1], f = smooth(Math.max(0, Math.min(1, (u - A.t) / Math.max(1e-3, B.t - A.t))));
    const names = new Set([...Object.keys(A.rot || {}), ...Object.keys(B.rot || {})]);
    for (const n of names) { const a = A.rot?.[n] || [0, 0, 0], c = B.rot?.[n] || [0, 0, 0]; out.rot[n] = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f]; }
    const ra = A.root || [0, 0, 0, 0], rb = B.root || [0, 0, 0, 0]; out.root = ra.map((v, k) => v + ((rb[k] || 0) - v) * f);
    out.ik = (A.ik ?? 1) + ((B.ik ?? 1) - (A.ik ?? 1)) * f; out.flap = (A.flap ?? 1) + ((B.flap ?? 1) - (A.flap ?? 1)) * f;
    for (const n of new Set([...Object.keys(A.ikLegs || {}), ...Object.keys(B.ikLegs || {})])) { const a = A.ikLegs?.[n] ?? 1, c = B.ikLegs?.[n] ?? 1; out.ikLegs[n] = a + (c - a) * f; }   // (one leg off the ground: a claw swipe)
    return out;
  }
  // ---- legs (two-bone IK in the creature's own space) ----
  const inv = new THREE.Matrix4(), tmp = new THREE.Vector3(), qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), qw = new THREE.Quaternion();
  // (bone matrices are fresh — synced before the legs, and each turned bone updates its own branch — so these read
  // them straight, without walking up the chain again for every question)
  const tp = new THREE.Vector3(), ts = new THREE.Vector3(), rootQi = new THREE.Quaternion();
  const local = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);
  const worldQ = (bone, out) => { bone.matrixWorld.decompose(tp, out, ts); return out.premultiply(rootQi); };
  function aimBone(bone, restDir, dir) {   // turn a bone so its rest direction points along dir (creature space)
    qw.setFromUnitVectors(restDir.clone().normalize(), dir.clone().normalize());
    worldQ(bone.parent, qp); bone.quaternion.copy(qp.invert().multiply(qw)); bone.updateMatrix(); bone.updateMatrixWorld(true);
  }
  const legs = (M.gait?.legs || []).map(L => {
    const ch = C.chain(L.chain); if (ch.length < 3) return null;
    const R = j => ch[j].userData.rest;
    // a leg splayed out sideways (spiders, insects, crabs) bends its knee up and out, not forward
    const sx = R(1).x - R(0).x, sz = R(1).z - R(0).z, out = Math.abs(sx) > Math.abs(sz) * 1.2 && Math.abs(sx) > 0.05;
    return { ...L, ch, l1: R(0).distanceTo(R(1)), l2: R(1).distanceTo(R(2)), d1: R(1).clone().sub(R(0)), d2: R(2).clone().sub(R(1)), ankle: R(2).clone(), pole: out ? new THREE.Vector3(Math.sign(sx), 0.8, 0).normalize() : null };
  }).filter(Boolean);
  function placeLeg(L, target, w) {
    const [hip, knee, ankle] = L.ch;
    const keep = w < 0.999 ? [hip.quaternion.clone(), knee.quaternion.clone(), ankle.quaternion.clone()] : null;
    const H = local(hip, new THREE.Vector3()), dv = target.clone().sub(H); let d = dv.length(); dv.normalize(); d = Math.min(d, (L.l1 + L.l2) * 0.999);
    const a = (L.l1 * L.l1 - L.l2 * L.l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.l1 * L.l1 - a * a));
    const pd = L.pole || tmp.set(0, 0, 1), pole = pd.clone().addScaledVector(dv, -pd.dot(dv)).normalize();   // the knee bends forward (or up and out)
    const K = H.clone().addScaledVector(dv, a).addScaledVector(pole, h), A = H.clone().addScaledVector(dv, d);
    aimBone(hip, L.d1, K.clone().sub(H)); aimBone(knee, L.d2, A.clone().sub(K));
    worldQ(knee, qp); ankle.quaternion.copy(qp.invert()); ankle.updateMatrix(); ankle.updateMatrixWorld(true);   // the paw keeps its rest angle to the ground
    if (keep) { hip.quaternion.copy(keep[0].slerp(hip.quaternion, w)); knee.quaternion.copy(keep[1].slerp(knee.quaternion, w)); ankle.quaternion.copy(keep[2].slerp(ankle.quaternion, w)); hip.updateMatrix(); knee.updateMatrix(); ankle.updateMatrix(); hip.updateMatrixWorld(true); }
  }
  // ---- what moves make: dark orbs (charged, then fired) and auras ----
  const live = [];
  const noiseGL = 'float hh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);} float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z);}';
  function darkMat(core, alpha) {
    return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uA: { value: alpha }, uCore: { value: new THREE.Color(core) } },
      vertexShader: 'varying vec3 vN, vP; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uT, uA; uniform vec3 uCore; varying vec3 vN, vP, vV; ${noiseGL}
        void main(){ float face = abs(dot(normalize(vN), normalize(vV))); float n = vn(vP * 4.0 + vec3(0.0, uT * 2.0, uT));
          vec3 c = mix(uCore, vec3(0.0), pow(face, 0.7));                       // black at the heart, violet at the rim
          gl_FragColor = vec4(c, uA * (0.35 + 0.65 * face) * (0.6 + 0.6 * n)); }` });
  }
  const wpos = new THREE.Vector3(), fwd = new THREE.Vector3(), qq = new THREE.Quaternion();
  function fxStep(mv, u0, u1) {
    for (const [i, f] of (mv.fx || []).entries()) {
      const key = `${st.action.name}:${i}`; st.action.fx ??= {};
      if (f.kind === 'orb') {
        if (u1 >= f.from && !st.action.fx[key]) {                                       // it starts forming at the mouth
          const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), darkMat('#6a30d0', 0.95)); m.scale.setScalar(0.001); m.renderOrder = 5;
          (C.root.parent || C.root).add(m); const o = { kind: 'orb', m, f, state: 'charge', age: 0 }; live.push(o); st.action.fx[key] = o;
        }
        const o = st.action.fx[key];
        if (o && o.state === 'charge') {
          const k = Math.min(1, (u1 - f.from) / Math.max(0.01, f.fire - f.from));
          o.m.scale.setScalar(f.size * (0.15 + 0.85 * k) * (1 + 0.08 * Math.sin(st.t * 30)));
          if (u1 >= f.fire) {                                                            // ...and fires
            C.root.getWorldQuaternion(qq); o.dir = new THREE.Vector3(0, -0.04, 1).applyQuaternion(qq).normalize(); o.state = 'fly'; o.age = 0;
            const took = api.onEvent?.('fire', { pos: o.m.position.clone(), dir: o.dir.clone(), speed: f.speed, kind: f.shot || 'shadowBullet', mesh: o.m, size: f.size });
            if (took) { o.state = 'gone'; live.splice(live.indexOf(o), 1); }               // (the game flies it from here: its own hits)
          }
        }
      } else if (f.kind === 'aura' && u1 >= f.from && !st.action.fx[key]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), darkMat('#2a1050', 0.7)); m.scale.setScalar(0.1); m.renderOrder = 5; m.material.side = THREE.DoubleSide;
        (C.root.parent || C.root).add(m); const o = { kind: 'aura', m, f, age: 0, dur: (f.to - f.from) * mv.dur }; live.push(o); st.action.fx[key] = o;
        C.bones[f.bone].getWorldPosition(wpos); m.position.copy(wpos);
        api.onEvent?.('aura', { pos: wpos.clone(), radius: f.radius, effect: f.effect });
      }
    }
  }
  function handFx() { for (const o of Object.values(st.action.fx || {})) if (o.kind === 'orb' && o.state === 'charge') { o.state = 'fly'; o.age = 2.3; o.dir = new THREE.Vector3(0, 0, 0); o.f = { ...o.f, speed: 0 }; } }   // (cut off mid-charge: it fizzles)
  function fxUpdate(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i]; o.age += dt; o.m.material.uniforms.uT.value += dt;
      if (o.kind === 'orb') {
        if (o.state === 'charge') { const bn = C.bones[o.f.bone]; bn.getWorldPosition(wpos); C.root.getWorldQuaternion(qq); fwd.set(0, 0, 1).applyQuaternion(qq); o.m.position.copy(wpos).addScaledVector(fwd, o.f.size * 1.2); if (!st.action || !st.action.fx || !Object.values(st.action.fx).includes(o)) { o.state = 'fly'; o.dir = fwd.clone(); } }
        else { o.m.position.addScaledVector(o.dir, o.f.speed * dt); if (o.age > 2.5) { o.m.parent?.remove(o.m); o.m.geometry.dispose(); live.splice(i, 1); } }
      } else {
        const k = Math.min(1, o.age / Math.max(0.05, o.dur));
        o.m.scale.setScalar(0.2 + (o.f.radius - 0.2) * (1 - Math.pow(1 - k, 2)));
        o.m.material.uniforms.uA.value = 0.7 * (1 - k) * Math.min(1, o.age * 6);
        if (k >= 1) { o.m.parent?.remove(o.m); o.m.geometry.dispose(); live.splice(i, 1); }
      }
    }
  }
  // ---- the frame ----
  function update(dt, opts = {}) { const speed = opts.speed ?? 0;   // opts.ik false: skip the foot placement (far away)
    st.t += dt; const t = st.t;
    st.speed += (speed - st.speed) * Math.min(1, dt * 4);
    const v = st.speed, moveK = Math.min(1, v / 1.5);
    // the move playing (sampled first: its weights steer the other layers)
    let act = null;
    if (st.action) {
      const mv = MOVES[st.action.name], u0 = st.action.u; st.action.u += dt * (st.action.speed || 1) / mv.dur;
      fxStep(mv, u0, Math.min(1, st.action.u));
      if (st.action.u >= 1) {
        const last = mv.keys[mv.keys.length - 1].root || [0, 0, 0];
        if (mv.keepRoot) api.onCommit?.(last[0], last[2] * (st.action.reach || 1));                              // it ends where it went
        if (st.action.loop) { st.action.u %= 1; st.action.fx = null; } else { st.action = null; if (mv.then) play(mv.then); }
      }
      if (st.action) act = sample(MOVES[st.action.name], st.action.u);
    }
    C.rest();
    const rb = b.root; rb.position.set(0, 0, 0); rb.rotation.set(0, 0, 0);
    // idle life first (breathing, looking round; less of it while moving) — the layers below add to it
    if (M.idle) { idleOpts.moving = moveK; M.idle(C, t, idleOpts); }
    if (M.gait) {   // ---- four legs ----
      const G = M.gait, trot = Math.min(1, Math.max(0, (v - G.trotAt * 0.6) / (G.trotAt * 0.8)));
      const stride = G.stride * (0.6 + 0.4 * Math.min(2, v / G.trotAt)), duty = 0.62 - 0.22 * trot;
      st.cycle += dt * (v > 0.02 ? v / stride : 0);
      const bob = v > 0.02 ? Math.abs(Math.sin(st.cycle * Math.PI * 2)) : 0;
      rb.position.y = -G.crouch * moveK - 0.025 * bob * moveK;                       // lower and bobbing as it prowls
      rb.rotation.x = G.lean * moveK;
      if (b['spine:1']) b['spine:1'].rotation.y += 0.04 * Math.sin(st.cycle * Math.PI * 2) * moveK;
      if (b['spine:2']) b['spine:2'].rotation.y -= 0.05 * Math.sin(st.cycle * Math.PI * 2) * moveK;
      if (b['neck:0']) b['neck:0'].rotation.x += G.headLow * moveK;
      C.chain('tail').forEach((bn, i) => { bn.rotation.y += 0.15 * Math.sin(st.cycle * Math.PI * 2 - i * 0.6) * moveK; bn.rotation.x -= 0.05 * moveK; });
      st.legT = l => {
        const ph = ((st.cycle + l.walk * (1 - trot) + l.trot * trot) % 1 + 1) % 1;
        if (v <= 0.02) return { z: 0, y: 0 };
        if (ph < duty) return { z: stride * (0.5 - ph / duty), y: 0 };
        const q = (ph - duty) / (1 - duty); return { z: stride * (-0.5 + q), y: G.lift * Math.sin(Math.PI * q) * (0.6 + 0.4 * trot) };
      };
    }
    if (M.flight) {   // ---- wings ----
      const F = M.flight, flap = act ? act.flap : 1, cruise = Math.min(1, v / F.cruise);
      st.cycle += dt * (F.beat - F.slow * cruise); const f = st.cycle, beat = Math.sin(f);   // (beat: phase speed, radians a second)
      for (const sd of ['L', 'R']) {
        const k = sd === 'L' ? 1 : -1, A = F.amp * (1 + 0.2 * cruise) * flap, hold = (1 - flap);
        b[`arm.${sd}:0`] && b[`arm.${sd}:0`].rotation.set(0, 0, k * ((0.15 + A * beat) + hold * 0.1));
        b[`arm.${sd}:1`] && b[`arm.${sd}:1`].rotation.set(0, k * (0.15 - 0.25 * Math.sin(f - 0.6)) * flap, k * 0.25 * Math.sin(f - 0.5) * flap);
        b[`arm.${sd}:2`] && b[`arm.${sd}:2`].rotation.set(0, 0, k * 0.35 * Math.sin(f - 1.0) * flap);
        for (const fn of F.fingers || []) b[`${fn}.${sd}:0`] && b[`${fn}.${sd}:0`].rotation.set(0, 0, k * 0.15 * Math.sin(f - 1.4) * flap);
        b[`leg.${sd}:0`] && b[`leg.${sd}:0`].rotation.set(0.2 + 0.1 * Math.sin(f - 2) + 0.4 * cruise, 0, 0);   // legs trail back in flight
      }
      rb.position.y = 0.06 * Math.sin(f - 1.6) * flap * (1 - 0.6 * cruise);
      // erratic flight, like a real bat: it darts to a new spot every half second or so and banks into each dart
      if (F.erratic) {
        const D = st.dart ??= { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, to: { x: 0, y: 0, z: 0 }, t: 0 };
        if ((D.t -= dt) <= 0) { D.t = 0.35 + Math.random() * 0.75; D.to = { x: (Math.random() - 0.5) * 2 * F.erratic[0], y: (Math.random() - 0.5) * 2 * F.erratic[1], z: (Math.random() - 0.5) * 2 * F.erratic[2] }; }
        // (in small steps: a monster animated every few frames gets a big dt, and this stiff spring blew up with it —
        // bats flung metres away and back)
        for (let left = Math.min(dt, 0.25); left > 1e-5; left -= 1 / 60) { const h = Math.min(left, 1 / 60); for (const k of ['x', 'y', 'z']) { const v = 'v' + k; D[v] += ((D.to[k] - D[k]) * 70 - D[v] * 11) * h; D[k] += D[v] * h; } }
        const er = flap;                                                                 // (a dive holds its line)
        rb.position.x += D.x * er; rb.position.y += D.y * er; rb.position.z += D.z * er;
        rb.rotation.z -= D.vx * 0.09 * er; rb.rotation.y += D.vx * 0.04 * er; rb.rotation.x -= D.vy * 0.04 * er;
      }
      rb.rotation.x = F.pitch * cruise;                                               // nose down flying forward
      if (b['spine:0']) b['spine:0'].rotation.x += 0.06 * Math.sin(f - 1.2) * flap;
    }
    // the move's rotations and root motion
    st.root.x = st.root.y = st.root.z = 0;
    if (act) {
      for (const [n, r] of Object.entries(act.rot)) { const bn = b[n]; if (bn) { bn.rotation.x += r[0]; bn.rotation.y += r[1]; bn.rotation.z += r[2]; } }
      const rs = st.action?.reach || 1; rb.position.x += act.root[0]; rb.position.y += act.root[1]; rb.position.z += act.root[2] * rs; rb.rotation.x += act.root[3] || 0; rb.rotation.z += act.root[4] || 0;
      st.root.x = act.root[0]; st.root.y = act.root[1]; st.root.z = act.root[2] * rs;
    }
    // the legs on the ground
    const ikOn = legs.length && st.legT && opts.ik !== false;   // (far away: no foot placement — nobody can see the feet)
    if (ikOn) { C.sync(); inv.copy(C.root.matrixWorld).invert(); C.root.matrixWorld.decompose(tp, rootQi, ts); rootQi.invert(); }   // (once for all the legs: each leg only turns its own bones)
    if (ikOn) for (const L of legs) {
      const o = st.legT(L), T = L.ankle.clone(); T.z += o.z; T.y = Math.max(L.ankle.y, L.ankle.y + o.y);
      placeLeg(L, T, act ? act.ik * (act.ikLegs[L.chain] ?? 1) : 1);
    }
    fxUpdate(dt);
    C.update(t);
  }
  function play(name, { loop = false, speed = 1, reach = 1 } = {}) { const mv = MOVES[name]; if (!mv) return; if (st.action?.fx) handFx(); st.action = { name, u: 0, loop, speed, reach }; }   // (reach: its forward root motion stretched to arrive where its target is)
  const api = {
    update, play, moves: MOVES, get action() { return st.action ? { name: st.action.name, u: st.action.u, def: MOVES[st.action.name] } : null }, get root() { return st.root; }, get speed() { return st.speed; }, get cycle() { return st.cycle; }, get actName() { return st.action ? st.action.name : null; },   // (actName: the move's name without building the action object)   // (cycle: the gait / wingbeat phase — a downstroke's sound keys off it)
    stop() { st.action = null; },
    onCommit: null, onEvent: null,
  };
  return api;
}
