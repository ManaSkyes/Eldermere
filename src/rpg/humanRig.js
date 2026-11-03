// src/rpg/humanRig.js — skeleton for the morphable human, plus simple procedural poses.
// Bone ends are averages of mesh vertices (MakeHuman CC0 skeleton), so after any morph
// fit() snaps the skeleton to the new body. Rest pose: every bone has identity rotation,
// so rotations below are in the familiar world axes (x: forward/back, z: sideways).

export function createRig(THREE, meta) {
  const S = meta.skeleton;
  const bones = S.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
  S.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const roots = bones.filter((_, i) => S[i].parent < 0);
  const skeleton = new THREE.Skeleton(bones);
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  const head = new Float32Array(S.length * 3), rest = new Float32Array(S.length * 3);
  const info = {};

  const avg = (P, ids, out, o) => {
    let x = 0, y = 0, z = 0;
    for (const i of ids) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
    out[o] = x / ids.length; out[o + 1] = y / ids.length; out[o + 2] = z / ids.length;
  };

  // Put every bone at its rest position for the body positions P (decimeters).
  function fit(P) {
    S.forEach((b, i) => avg(P, b.head, head, i * 3));
    S.forEach((b, i) => {
      const p = b.parent;
      const x = head[i * 3] - (p >= 0 ? head[p * 3] : 0), y = head[i * 3 + 1] - (p >= 0 ? head[p * 3 + 1] : 0), z = head[i * 3 + 2] - (p >= 0 ? head[p * 3 + 2] : 0);
      rest[i * 3] = x; rest[i * 3 + 1] = y; rest[i * 3 + 2] = z;
    });
    resetPose();
    // rest directions of the upper arms and forearms, so poses can aim them anywhere
    for (const s of ['L', 'R']) {
      const sh = worldHead(`upperarm01.${s}`), el = worldHead(`lowerarm01.${s}`), wr = worldHead(`wrist.${s}`);
      info[`upper${s}`] = el.clone().sub(sh).normalize();
      info[`fore${s}`] = wr.clone().sub(el).normalize();
    }
  }
  function resetPose() {
    bones.forEach((b, i) => { b.position.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]); b.quaternion.identity(); });
  }
  const worldHead = (name) => { const i = S.findIndex(b => b.name === name); return new THREE.Vector3(head[i * 3], head[i * 3 + 1], head[i * 3 + 2]); };
  // Aim an arm: point the upper arm and forearm along the given world directions.
  const qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), tmp = new THREE.Vector3();
  function aimArm(side, upperDir, foreDir) {
    qU.setFromUnitVectors(info[`upper${side}`], upperDir.clone().normalize());
    byName[`upperarm01.${side}`].quaternion.copy(qU);
    tmp.copy(foreDir).normalize().applyQuaternion(qU.clone().invert());       // into the upper arm's frame
    qF.setFromUnitVectors(info[`fore${side}`], tmp);
    byName[`lowerarm01.${side}`].quaternion.copy(qF);
  }
  // legs aimed the same way: thigh and shin directions in the body's space (+Z forward, +X the left side)
  function aimLeg(side, thighDir, shinDir) {
    const hip = worldHead(`upperleg01.${side}`), knee = worldHead(`lowerleg01.${side}`), ankle = worldHead(`foot.${side}`);
    const restT = knee.clone().sub(hip).normalize(), restS = ankle.clone().sub(knee).normalize();
    qU.setFromUnitVectors(restT, thighDir.clone().normalize());
    byName[`upperleg01.${side}`].quaternion.copy(qU);
    tmp.copy(shinDir).normalize().applyQuaternion(qU.clone().invert());
    qF.setFromUnitVectors(restS, tmp);
    if (byName[`lowerleg01.${side}`]) byName[`lowerleg01.${side}`].quaternion.copy(qF);
  }
  return { bones, roots, skeleton, byName, fit, resetPose, worldHead, info, aimArm, aimLeg, V: (x, y, z) => new THREE.Vector3(x, y, z) };
}

// Procedural poses. mode: 'apose' | 'relaxed' | 'idle' | 'walk' | 'run' | 'sit' | 'climb' | 'swim' | 'slide' | 'wave'; t in seconds
// (in strides for walk/run). gait 0..1 blends the walk into a run.
// 'sit': gait is the body's femininity 0..1 (blends the two sitting poses), amount 0..1 eases down.
// 'idle', 'walk': amount is femininity. walk's blend 0..1 eases from the standing pose into the stride
// (idleT: the standing pose's clock, so the blend lands on the same idle the body will hold).
// Looking around without turning the whole body: twist (rad, + = toward the body's left) is how far the
// look is turned from the hips; it's shared up the spine (lower back, chest, neck, head), the head taking
// the first part, then the chest. pitch (rad, + = up) tips the neck and head. Applied on top of any pose.
export const LOOK_SHARE = { spine01: 0.12, spine03: 0.2, spine05: 0.23, neck02: 0.2, head: 0.25 };
export function lookTwist(rig, twist = 0, pitch = 0) {
  const B = rig.byName;
  for (const [n, k] of Object.entries(LOOK_SHARE)) { const b = B[n]; if (b) b.rotation.y += twist * k; }
  if (B.neck02) B.neck02.rotation.x -= pitch * 0.35;
  if (B.head) B.head.rotation.x -= pitch * 0.45;
}

export function applyPose(rig, mode, t, gait = 0, amount = 1, blend = 1, idleT = 0, squat = 0) {
  rig.resetPose();
  const B = rig.byName;
  // mouth (and lower beak) opening, 0..1, in every pose
  if (rig.info.jaw && B.jaw) B.jaw.rotation.x += 0.45 * rig.info.jaw;
  if (mode === 'apose') return;
  const rot = (name, x = 0, y = 0, z = 0) => { const b = B[name]; if (b) b.rotation.set(x, y, z); };
  const add = (name, x = 0, y = 0, z = 0) => { const b = B[name]; if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; } };

  const V = rig.V;
  // Relaxed stance: arms hang at the sides, elbows slightly bent, fingers curled a little.
  const armsDown = (swingL = 0, swingR = 0, out = 0, bend = 0) => {
    for (const [s, sx, sw] of [['L', 1, swingL], ['R', -1, swingR]]) {
      // a bent arm swings mostly behind the body (the elbow drives back); a hanging arm swings evenly
      const up = V(sx * (0.16 + out + (rig.info.armOut || 0)), -1, 0.02).applyAxisAngle(V(1, 0, 0), -(sw > 0 ? sw * (1 - 0.55 * bend) : sw * (1 + 0.3 * bend)));   // armOut: room for a full skirt
      // bend 0: forearm hangs; bend 1: elbow near a right angle, as when running
      const fore = V(sx * (0.06 - 0.14 * bend), -1 + 0.95 * bend, 0.28 + 0.4 * Math.max(0, sw) + 0.75 * bend).applyAxisAngle(V(1, 0, 0), -sw * (1.2 - 0.8 * bend));
      rig.aimArm(s, up, fore);
    }
  };
  armsDown();
  for (const s of ['L', 'R']) for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${s}`, -0.25); rot(`finger${f}-3.${s}`, -0.2); }
  // ---- standing (idle), masculine and feminine, blended by amount (femininity 0..1) ----
  //   masculine: feet a little wider than the hips, weight even, chest up, arms hanging slightly out
  //   feminine:  weight on one leg (contrapposto): that leg straight under the body, the other knee bent
  //              and resting forward on the ball of the foot, hips shifted over the standing leg and
  //              shoulders countering, arms in close. The weight swaps sides every so often.
  // Returns the pieces so the walk can blend from (and back to) it.
  const legLen0 = () => { const h = rig.worldHead('upperleg01.L'), a = rig.worldHead('foot.L'); return Math.max(1e-3, h.y - a.y); };
  const hipHalf0 = () => Math.abs(rig.worldHead('upperleg01.L').x - rig.worldHead('upperleg01.R').x) / 2;
  const rotX = (v, a) => v.applyAxisAngle(V(1, 0, 0), a);
  function stance(f, tt) {
    const hh = hipHalf0(), ll = legLen0(), out = {};
    const w = Math.tanh(Math.sin(tt * 0.33 + 0.8) * 3) * f;          // + weight on the left, − on the right; holds, then swaps
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const bear = Math.max(0, w * sx);                                // how much this is the standing leg
      const rest = Math.max(0, -w * sx);                               // how much this is the relaxed leg
      const track = (1.6 * (1 - f) + 0.6 * f) - 0.6 * bear + 0.5 * rest;   // foot position, × hip half-width from centre
      const inward = hh * (1 - track) / ll;
      const fwd = 0.28 * rest, knee = 0.04 + 0.5 * rest;
      out[side] = { thigh: rotX(V(-sx * inward, -1, 0).normalize(), -fwd), shin: rotX(V(-sx * inward * 0.6, -1, 0).normalize(), -(fwd - knee)), foot: -0.35 * rest };
    }
    const br = Math.sin(tt * 1.6);
    out.rootX = hh * 0.9 * w;                                         // hips over the standing leg
    out.spine = [[ 'spine05', -0.05 * (1 - f) + 0.01 * br, 0, -0.08 * w ], [ 'spine03', 0.015 * br, 0, -0.05 * w ], [ 'spine01', -0.01 * br, 0.06 * w, 0.12 * w ],
      [ 'neck02', 0.02 * Math.sin(tt * 0.5), 0.12 * Math.sin(tt * 0.31), 0.02 * Math.sin(tt * 0.7) + 0.08 * w ]];
    out.arms = { out: 0.13 * (1 - f) - 0.02 * f, bend: 0.15 * (1 - f) + 0.2 * f, swing: 0.02 * br + 0.06 * f };
    return out;
  }
  const applyStance = (S, k = 1) => {
    for (const [n, x, y, z] of S.spine) add(n, x * k, y * k, z * k);
    rig.roots[0].position.x += S.rootX * k;
  };
  if (mode === 'idle' || mode === 'perch') {
    const S = stance(Math.max(0, Math.min(1, amount ?? 0.5)), t);
    for (const side of ['L', 'R']) { rig.aimLeg(side, S[side].thigh, S[side].shin); add(`foot.${side}`, S[side].foot); }
    armsDown(S.arms.swing, S.arms.swing, S.arms.out, S.arms.bend);
    applyStance(S);
    if (mode === 'perch') {                                      // perched on a spire: feet together on the tip, arms out a little for balance
      const sw = Math.sin(t * 1.7) * 0.06, inw = hipHalf0() / legLen0();
      // knees and feet pressed together, crouched deep, up on the balls of the feet on the tip. The crouch is
      // aimed directly (not layered on), so the knees stay together however deep it goes.
      const k = Math.max(0.6, Math.min(1.35, squat || 1.2)), a = SQUAT.hip * k, kn = SQUAT.knee * k;
      for (const [sd, sx] of [['L', 1], ['R', -1]]) {
        rig.aimLeg(sd, rotX(V(-sx * inw * 1.1, -1, 0).normalize(), -a), rotX(V(sx * inw * 0.25, -1, 0).normalize(), -(a - kn)));
        add(`foot.${sd}`, -(kn - a) - 0.35);
      }
      add('spine05', 0.32 * k); add('spine03', 0.12 * k); add('neck02', -0.3 * k);
      rig.roots[0].position.x -= S.rootX;                        // no hip shift: balanced over both feet
      for (const [sd, sx] of [['L', 1], ['R', -1]]) rig.aimArm(sd, V(sx * 0.55, -0.45 + sw * sx, 0.65), V(sx * 0.3, -0.35 + sw * sx, 0.9));   // arms low and forward, out a little
    }
  }
  if (mode === 'air') {
    // in the air: gait is vertical speed (÷ 6 m/s, −1..1). Rising, one knee drives up and the arms swing
    // forward and up; falling, both legs reach down ready to land and the arms go out for balance.
    // blend eases from the standing pose (taking off), amount is femininity (knees closer together).
    const f = Math.max(0, Math.min(1, amount ?? 0.5)), up = Math.max(-1, Math.min(1, gait || 0)), rise = Math.max(0, up), fall = Math.max(0, -up);
    const bl = Math.max(0, Math.min(1, blend)), S0 = bl < 1 && mode !== 'wallrun' ? stance(f, idleT) : null;
    const hh = hipHalf0(), ll = legLen0(), inward = hh * (1 - (0.9 - 0.5 * f)) / ll;
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const lead = side === 'L';
      const a = lead ? 0.25 + 0.7 * rise + 0.3 * fall : 0.05 - 0.1 * rise + 0.3 * fall;
      const kn = lead ? 0.45 + 1.0 * rise + 0.35 * fall : 0.45 + 0.35 * rise + 0.3 * fall;
      let thigh = rotX(V(-sx * inward, -1, 0).normalize(), -a), shin = rotX(V(-sx * inward * 0.6, -1, 0).normalize(), -(a - kn));
      let ft = -0.25 * rise + 0.1 * fall;
      if (S0) { thigh = S0[side].thigh.clone().lerp(thigh, bl).normalize(); shin = S0[side].shin.clone().lerp(shin, bl).normalize(); ft = S0[side].foot + (ft - S0[side].foot) * bl; }
      rig.aimLeg(side, thigh, shin); add(`foot.${side}`, ft);
    }
    const sw = (0.55 * rise + 0.15 * fall) * bl;
    armsDown(sw, sw, (0.35 * fall + 0.05) * bl, (0.45 * rise + 0.15) * bl);
    add('spine05', (0.1 * rise - 0.04 * fall) * bl); add('neck02', -0.06 * rise * bl);
    if (S0) applyStance(S0, 1 - bl);
  }
  if (mode === 'walk' || mode === 'run' || mode === 'tightrope' || mode === 'wallrun') {
    // One gait that blends from a walk (gait 0) to a run (gait 1). t counts strides: one full cycle
    // (a step with each leg) per 1.0. The game advances it by distance, so feet don't skate.
    // amount is how feminine the body is (0..1), blending two styles:
    //   masculine: feet tracking about hip width apart, more swing through the shoulders and chest,
    //              arms swinging a little out from the body, a heavier bounce
    //   feminine:  feet landing close to one line under the body, hips swaying and dropping over the
    //              standing leg, arms closer in and swinging more forward than back, chest steadier
    // The legs are aimed (not rotated from the rest pose), so the stance is narrow whatever the rest pose.
    const k = mode === 'run' || mode === 'wallrun' ? 1 : Math.max(0, Math.min(1, gait || 0)), L = (a, b) => a + (b - a) * k;
    const f = Math.max(0, Math.min(1, amount ?? 0.5)), F = (m, w) => m + (w - m) * f;
    const ph = t * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    const hipA = L(0.38, 0.6), kneeA = L(0.7, 1.5), lift = L(0, 0.3);
    const hipL = rig.worldHead('upperleg01.L'), hipR = rig.worldHead('upperleg01.R'), ank = rig.worldHead('foot.L');
    const hipHalf = Math.abs(hipL.x - hipR.x) / 2, legLen = Math.max(1e-3, hipL.y - ank.y);
    // where each foot tracks, as a share of hip half-width from the centre line (running narrows it)
    const track = F(0.75, 0.15) * L(1, 0.7);
    const inward = hipHalf * (1 - track) / legLen;
    // blend (0..1): starting off and stopping ease between the stance and the full stride
    const bl = Math.max(0, Math.min(1, blend)), S0 = bl < 1 ? stance(f, idleT) : null;
    // which way the legs stride, relative to the hips (rig.info.walkDir, rad: 0 forward, +π/2 toward the
    // body's left): the legs swing about the axis square to it, so strafing steps sideways (combat stance)
    const wd = rig.info.walkDir || 0, wAxis = V(Math.cos(wd), 0, -Math.sin(wd)), rotW = (v, an) => v.applyAxisAngle(wAxis, an), fwdK = Math.cos(wd);
    for (const [side, sg, sx] of [['L', 1, 1], ['R', -1, -1]]) {
      const ls = s * sg, lc = c * sg;
      // thigh swing: forward positive; a run carries the thigh higher in front
      const a = hipA * ls + lift * Math.max(0, Math.sin(ph * sg + 0.6));
      // knee: bends most as the leg swings through, nearly straight at heel strike, a little give on landing
      const swing = Math.max(0, Math.cos(ph + (sg > 0 ? 0 : Math.PI)));
      const kn = L(0.06, 0.12) + kneeA * Math.pow(swing, 1.6) + L(0.1, 0.18) * Math.max(0, ls) * Math.max(0, -lc);
      let thigh = rotW(V(-sx * inward, -1, 0).normalize(), -a);
      let shin = rotW(V(-sx * inward * 0.6, -1, 0).normalize(), -(a - kn));
      // ankle: toes up reaching forward, pushing off behind, held up while the foot clears the ground
      let ft = (0.22 * ls - L(0.15, 0.3) * Math.max(0, -ls) * Math.max(0, lc)) * Math.abs(fwdK) * Math.sign(fwdK || 1) - 0.12 * swing;
      if (S0) { thigh = S0[side].thigh.clone().lerp(thigh, bl).normalize(); shin = S0[side].shin.clone().lerp(shin, bl).normalize(); ft = S0[side].foot + (ft - S0[side].foot) * bl; }
      rig.aimLeg(side, thigh, shin);
      add(`foot.${side}`, ft);
    }
    // arms swing opposite the legs, elbows bending more as the pace picks up
    const sw = L(0.32, 0.6) * F(1.1, 0.85) * bl, fwdBias = F(0, 0.08) * bl;
    const A = S0 ? S0.arms : { out: 0, bend: 0, swing: 0 }, mixA = (x, y) => S0 ? A[x] + (y - A[x]) * bl : y;
    armsDown(-sw * s + fwdBias + (S0 ? A.swing * (1 - bl) : 0), sw * s + fwdBias + (S0 ? A.swing * (1 - bl) : 0), mixA('out', F(0.05, -0.02)), mixA('bend', L(F(0.05, 0.12), 1)));
    if (S0) applyStance(S0, 1 - bl);
    // body: hips turn with the legs and the chest counters them; lean into the run
    add('spine05', L(0.03, 0.16) * bl, 0.09 * s * F(1.25, 0.6) * bl, 0.025 * c * F(1, 0.5) * bl); add('spine03', L(0.01, 0.08) * bl);
    add('spine01', 0, -0.11 * s * F(0.8, 1.2) * bl, 0.05 * c * F(0.2, 1) * L(1, 0.4) * bl);   // hip drop over the standing leg
    add('neck02', -L(0.03, 0.18) * bl, 0.04 * s * F(1, 0.5) * bl, -0.03 * c * F(0.2, 1) * L(1, 0.4) * bl);
    // hips sway toward the standing leg (feminine more), and the body bobs: lowest with the legs apart
    // walking, lowest mid-stance running; the masculine walk bounces a little more
    rig.roots[0].position.x += hipHalf * 0.35 * c * F(0.25, 1) * L(1, 0.4) * bl;
    rig.roots[0].position.y -= L(0.12 * (1 - Math.abs(c)), 0.3 * Math.abs(c)) * F(1.2, 0.85) * bl;
  }
  if (mode === 'twirl') {
    // the twirl onto a route: balled up tight, knees to the chest, arms wrapped in (the game spins the body)
    const k = Math.min(1, Math.sin(Math.PI * Math.max(0, Math.min(1, t))) * 1.8);
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      const inw = hipHalf0() / legLen0() * 0.9;                    // knees and feet together, like Sly
      rig.aimLeg(sd, rotX(V(-sx * inw, -1, 0).normalize(), -(0.3 + 1.0 * k)), rotX(V(-sx * inw, -1, 0).normalize(), -(0.3 + 1.0 * k) + 0.4 + 1.5 * k));
      add(`foot.${sd}`, -0.4 * k);
      rig.aimArm(sd, V(sx * 0.4, -0.5, 0.3).lerp(V(sx * 0.3, -0.2, 0.85), k).normalize(), V(sx * 0.1, -0.6, 0.6).lerp(V(-sx * 0.55, 0.05, 0.8), k).normalize());
    }
    add('spine05', 0.3 * k); add('spine03', 0.15 * k); add('neck02', 0.1 * k);
  }
  if (mode === 'wallrun') {
    // the run, plus: the arm nearest the wall reaches forward and up along it (fingers brushing it), the far
    // arm pumps wide for balance, the head turns a little toward where you're going. idleT carries the side:
    // +1 the wall on the left (+X), −1 on the right.
    const ws = (idleT || 1) > 0 ? 1 : -1, ph = t * Math.PI * 2, sw = Math.sin(ph);
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      if (sx === ws) rig.aimArm(sd, V(sx * 0.55, 0.35 + 0.08 * sw, 0.75).normalize(), V(sx * 0.45, 0.45 + 0.1 * sw, 0.75).normalize());
      else rig.aimArm(sd, V(sx * 0.6, -0.55 + 0.25 * sw, 0.35 * -sw).normalize(), V(sx * 0.3, 0.1 + 0.3 * sw, 0.9).normalize());
    }
    add('spine05', 0.12, 0, 0); add('neck02', 0, 0, 0.2 * ws);
  }
  if (mode === 'wallup') {
    // running straight up a wall (head-on wall run): the feet plant on the wall in turn, one knee driving
    // high to the chest as the other leg straightens and pushes down; the opposite hand slaps the wall up
    // above. Chest close to the wall, head tipped back looking up. t counts strides (a step with each foot
    // per 1.0); amount (0..1) is how far through the run-up you are: near the end both arms reach up for
    // the top. blend eases in from the jump.
    const ph = t * Math.PI * 2, bl = Math.max(0, Math.min(1, blend)), p = Math.max(0, Math.min(1, amount ?? 0));
    const reach = Math.max(0, (p - 0.65) / 0.35), inw = hipHalf0() / legLen0() * 0.35;
    const sq = Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), 0.5), hi = { L: 0.5 + 0.5 * sq, R: 0.5 - 0.5 * sq };   // how high each knee is (quick through the middle)
    for (const [sd, sx, other] of [['L', 1, 'R'], ['R', -1, 'L']]) {
      const h = hi[sd], a = (0.3 + 1.2 * h) * bl, kn = (0.12 + 1.3 * h) * bl;
      rig.aimLeg(sd, rotX(V(-sx * inw, -1, 0).normalize(), -a), rotX(V(-sx * inw * 0.6, -1, 0).normalize(), -(a - kn)));
      add(`foot.${sd}`, (0.25 + 0.35 * h) * bl);                                  // the sole flat against the wall
      // the arm opposite the high knee reaches up the wall; the other pulls down past the hip
      const up = Math.max(hi[other], reach);
      const upper = V(sx * 0.35, -0.75, 0.25).lerp(V(sx * 0.28, 0.92, 0.32), up), fore = V(sx * 0.1, -0.15, 0.95).lerp(V(sx * 0.18, 0.9, 0.45), up);
      rig.aimArm(sd, upper.normalize(), fore.normalize());
    }
    add('spine05', 0.12 * bl, 0.08 * Math.sin(ph) * bl); add('spine03', 0.05 * bl); add('spine01', 0, -0.08 * Math.sin(ph) * bl);
    add('neck02', -(0.3 + 0.15 * reach) * bl);
  }
  if (mode === 'tightrope') {
    // walking a rope: the feet on one line (the walk at its most feminine track), arms straight out to the
    // sides, swaying gently to keep balance
    const sw = Math.sin(t * 1.3 + (idleT || 0) * 0.7) * 0.1;
    for (const [sd, sx] of [['L', 1], ['R', -1]]) rig.aimArm(sd, V(sx, 0.06 + sw * sx, 0.05), V(sx, 0.14 + sw * sx * 1.2, 0.12));
    add('spine05', 0, 0, sw * 0.4); add('neck02', 0.12);              // eyes down the rope
  }
  if (mode === 'ropecrouch') {
    // crouched low on a rope: one foot ahead of the other on the line (back heel up), knees deep, arms out
    // for balance, swaying a little; t steps (small shuffles) when moving, gait 0..1 how much
    const inw = hipHalf0() / legLen0(), step = Math.sin(t * Math.PI) * 0.3 * (gait || 0), sw = Math.sin((idleT || 0) * 1.4) * 0.07 + Math.sin(t * Math.PI) * 0.04 * (gait || 0);
    for (const [sd, sx, fw] of [['L', 1, 0.25], ['R', -1, -0.25]]) {
      const a = 1.25 + fw + step * sx, kn = 2.2 + fw * 0.4;
      rig.aimLeg(sd, rotX(V(-sx * inw * 0.9, -1, 0).normalize(), -a), rotX(V(-sx * inw * 0.6, -1, 0).normalize(), -(a - kn)));
      add(`foot.${sd}`, -(kn - a) - (fw < 0 ? 0.5 : 0.1));
      rig.aimArm(sd, V(sx, -0.05 + sw * sx, 0.15), V(sx, 0.05 + sw * sx * 1.2, 0.25));
    }
    add('spine05', 0.45, 0, sw * 0.4); add('spine03', 0.15); add('neck02', -0.25);
  }
  if (mode === 'wireslide') {
    // sliding down a wire Sly style: both hands up on the wire together, body leaning back, legs out in front
    // (feet first) and together; the game tilts and places the body so the hands are on the wire
    const sw = Math.sin(t * 9) * 0.03, inw = hipHalf0() / legLen0();
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      rig.aimArm(sd, V(sx * 0.12, 1, -0.05).normalize(), V(-sx * 0.06, 1, -0.02).normalize());
      for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${sd}`, -1.0); rot(`finger${f}-3.${sd}`, -0.8); }
      rig.aimLeg(sd, rotX(V(-sx * inw, -1, 0).normalize(), -(0.75 + sw)), rotX(V(-sx * inw, -1, 0).normalize(), -(0.55 + sw)));
      add(`foot.${sd}`, 0.2);
    }
    add('spine05', -0.08); add('neck02', 0.1);
  }
  if (mode === 'pole') {
    // on a pole: hands gripping it in front, one above the other in turn; legs bent and wrapped round it
    const ph = t * Math.PI, a = Math.sin(ph);
    for (const [sd, sx, sg] of [['L', 1, 1], ['R', -1, -1]]) {
      const hi = 0.5 + 0.5 * a * sg;
      rig.aimArm(sd, V(sx * 0.22, 0.45 + 0.5 * hi, 0.7).normalize(), V(-sx * 0.35, 0.35 + 0.55 * hi, 0.8).normalize());
      const lo = 0.5 - 0.5 * a * sg;
      rig.aimLeg(sd, rotX(V(sx * 0.3, -1, 0).normalize(), -(0.7 + 0.4 * lo)), rotX(V(-sx * 0.35, -1, 0).normalize(), -(0.7 + 0.4 * lo) + (1.2 + 0.3 * lo)));
      add(`foot.${sd}`, -0.3);
      for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${sd}`, -1.0); rot(`finger${f}-3.${sd}`, -0.8); }
    }
    add('spine05', 0.08); add('neck02', -0.25);
  }
  if (mode === 'wallhug') {
    // back flat to a wall, arms spread against it, sidling: the leading foot steps out to the side and the
    // other follows; head turned the way you're going. gait: 0 still, ±1 sidling right/left.
    const dir = Math.sign(gait || 0), ph = t * Math.PI, step = Math.abs(Math.sin(ph)) * (dir ? 1 : 0);
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      rig.aimArm(sd, V(sx * 0.78, -0.55, -0.3), V(sx * 0.55, -0.75, -0.35));
      const lead = dir && sx === -dir ? 1 : 0;                       // right (−X) leads when going right
      rig.aimLeg(sd, V(sx * (0.08 + 0.16 * step * (lead ? 1 : 0.3)), -1, 0.02).normalize(), V(sx * (0.06 + 0.1 * step * (lead ? 1 : 0.3)), -1, -0.03).normalize());
      add(`foot.${sd}`, 0, sx * 0.2, 0);
    }
    add('spine05', -0.06); add('neck02', 0, -dir * 0.55, 0);
  }
  if (mode === 'hang') {
    // hanging from a ledge: both arms straight up to the edge, body long, legs loose, toes down.
    // t sways it gently; gait -1..1 is a shimmy (reaching the leading hand along the edge)
    const sway = Math.sin(t) * 0.03, sh = Math.max(-1, Math.min(1, gait || 0));
    for (const [s2, sx] of [['L', 1], ['R', -1]]) {
      const lead = sx === Math.sign(sh) ? Math.abs(sh) : 0;
      rig.aimArm(s2, V(sx * (0.22 + 0.25 * lead), 1, 0.12), V(sx * (0.1 + 0.2 * lead), 1, 0.2));
    }
    rig.aimLeg('L', V(0.04, -1, 0.06 + sway), V(0.03, -1, -0.04));
    rig.aimLeg('R', V(-0.04, -1, 0.02 - sway), V(-0.03, -1, -0.1));
    add('foot.L', -0.5); add('foot.R', -0.45);
    add('neck02', -0.3); add('spine05', -0.04);
    for (const s2 of ['L', 'R']) for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${s2}`, -0.9); rot(`finger${f}-3.${s2}`, -0.7); }
  }
  if (mode === 'sit') {
    // Two ways of sitting on the ground, blended by how feminine the body is:
    //   masculine: cross-legged, forearms resting on the knees, a slight slouch
    //   feminine:  knees drawn up together, feet flat in front, hands resting on the shins
    const f = Math.max(0, Math.min(1, gait)), k = Math.max(0, Math.min(1, amount)), br = Math.sin(t * 1.6) * 0.012;
    const M = {
      'foot.L': [0.3, 0, -0.4], 'foot.R': [0.3, 0, 0.4],
      spine05: [0.18, 0, 0], spine03: [0.12, 0, 0], spine01: [0.04, 0, 0], neck02: [-0.22, 0, 0],
    };
    const F = {
      'foot.L': [0.05, 0, 0], 'foot.R': [0.05, 0, 0],
      spine05: [0.16, 0, 0], spine03: [0.1, 0, 0], spine01: [0.03, 0, 0], neck02: [-0.18, 0, 0.1],
    };
    for (const name of Object.keys(M)) {
      const a = M[name], b = F[name] || [0, 0, 0];
      add(name, (a[0] + (b[0] - a[0]) * f) * k, (a[1] + (b[1] - a[1]) * f) * k, (a[2] + (b[2] - a[2]) * f) * k);
    }
    add('spine03', br * k);
    // a little life while seated: a slow weight shift and the head drifting, more so in the softer feminine sit
    add('spine05', 0, 0, (0.015 + 0.02 * f) * Math.sin(t * 0.35) * k);
    add('neck02', 0.02 * Math.sin(t * 0.23) * k, (0.06 + 0.06 * f) * Math.sin(t * 0.17) * k, 0.03 * f * Math.sin(t * 0.29) * k);
    // legs by direction: masculine knees wide, shins crossed in front (left over right);
    // feminine knees up together, feet flat and a little apart
    const LEGS = {
      M: { L: [V(0.85, -0.15, 0.5), V(-0.9, -0.05, 0.45)], R: [V(-0.85, -0.15, 0.5), V(0.9, 0.02, 0.2)] },
      F: { L: [V(-0.04, 0.5, 0.86), V(0.14, -0.97, 0.12)], R: [V(0.04, 0.5, 0.86), V(-0.14, -0.97, 0.12)] },
    };
    const stand = side => [rig.worldHead(`lowerleg01.${side}`).sub(rig.worldHead(`upperleg01.${side}`)).normalize(), rig.worldHead(`foot.${side}`).sub(rig.worldHead(`lowerleg01.${side}`)).normalize()];
    for (const sd of ['L', 'R']) {
      const st = stand(sd), m = LEGS.M[sd], fl = LEGS.F[sd];
      const t = m[0].clone().normalize().lerp(fl[0].clone().normalize(), f), sh = m[1].clone().normalize().lerp(fl[1].clone().normalize(), f);
      rig.aimLeg(sd, st[0].clone().lerp(t, k), st[1].clone().lerp(sh, k));
    }
    // arms: masculine forearms rest on the knees; feminine left hand on the floor, right on the lap
    const mix = (a, b) => a.clone().lerp(b, f).normalize();
    const hang = side => [V(side * 0.16, -1, 0.02), V(side * 0.06, -1, 0.28)];
    const mArm = side => [V(side * 0.3, -0.95, 0.2), V(side * 0.55, -0.55, 0.65)];
    const fArmL = [V(0.12, -0.82, 0.56), V(-0.55, -0.12, 0.83)], fArmR = [V(-0.12, -0.82, 0.56), V(0.55, -0.12, 0.83)];   // hands resting on the shins, just below the knees
    for (const [s, side, fa] of [['L', 1, fArmL], ['R', -1, fArmR]]) {
      const h = hang(side), m = mArm(side);
      const up = mix(m[0], fa[0]), fore = mix(m[1], fa[1]);
      rig.aimArm(s, h[0].clone().lerp(up, k), h[1].clone().lerp(fore, k));
    }
    // lower the body so the seat rests on the ground
    const leg = rig.worldHead('upperleg01.L').y - rig.worldHead('foot.L').y;
    rig.roots[0].position.y -= (leg + 0.75 - 1.15) * k;
  }
  if (mode === 'climb') {
    // t: progress 0..1 through the move; gait 0 = clamber (reach up, haul, knee onto the ledge),
    // 1 = vault (one hand planted on the obstacle, legs tucked and swung over)
    const u = Math.max(0, Math.min(1, t)), v = gait >= 0.5;
    if (!v) {
      const reach = 1 - Math.min(1, u / 0.45), push = Math.min(1, Math.max(0, (u - 0.3) / 0.5));
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        const up = V(sx * 0.25, 0.75, 0.6).lerp(V(sx * 0.35, -0.7, 0.55), push).normalize(), fore = V(0, 0.55, 0.85).lerp(V(sx * 0.05, -0.95, 0.3), push).normalize();
        rig.aimArm(s, up, fore);
      }
      const knee = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.35) / 0.6)));
      add('upperleg01.R', -1.2 * knee); add('lowerleg01.R', 1.6 * knee); add('upperleg01.L', -0.4 * knee); add('lowerleg01.L', 0.6 * knee);
      add('spine05', 0.25 * push); add('spine03', 0.1 * push); add('neck02', -0.25 * push + 0.15 * reach);
      void reach;
    } else {
      // a speed vault: the left hand plants on the top as you reach it and slides back under you as you
      // pass; the legs tuck together and swing over to the right; the right arm stays low and forward for
      // balance. Then the legs reach down for the landing.
      const tuck = Math.sin(Math.PI * Math.min(1, u / 0.85)), land = Math.max(0, (u - 0.6) / 0.4);
      const plant = Math.min(1, u / 0.25), pass = Math.max(0, Math.min(1, (u - 0.2) / 0.6));
      rig.aimArm('L', V(0.2, -0.55, 0.8).lerp(V(0.3, -0.95, -0.15), pass).normalize(), V(0.08, -0.7, 0.7).lerp(V(0.1, -1, 0.05), Math.max(pass, 1 - plant)).normalize());
      rig.aimArm('R', V(-0.3, -0.55, 0.75).lerp(V(-0.45, -0.7, 0.45), land).normalize(), V(-0.05, -0.15, 1).lerp(V(-0.15, -0.6, 0.75), land).normalize());
      // legs: together, swung a little right, knees to the chest at the top; straightening to land
      const side = -0.4 * tuck, a = 0.2 + 1.4 * tuck, kn = 0.3 + 1.95 * tuck - 0.7 * land;
      for (const [sd, sx] of [['L', 1], ['R', -1]]) {
        const th = V(side + sx * 0.03, -Math.cos(a), Math.sin(a)).normalize();
        const sh = V(side * 0.6 + sx * 0.02, -Math.cos(a - kn), Math.sin(a - kn)).normalize();
        rig.aimLeg(sd, th, sh); add(`foot.${sd}`, -0.2 * tuck);
      }
      add('spine05', 0.18 * tuck, 0, -0.12 * tuck); add('spine03', 0.06 * tuck); add('neck02', -0.12 * tuck);
    }
  }
  if (mode === 'swim') {
    // gait 0 = treading water: upright, arms sculling, legs slowly cycling. gait 1 = front crawl (the body
    // is laid flat by the game): arms windmill alternately (reach past the head, pull under the chest to the
    // hip, recover out to the side), legs flutter-kick, head low. In between, the two blend.
    const k = Math.max(0, Math.min(1, gait)), ph = t * Math.PI * 2 * 0.45;
    const s1 = Math.sin(ph * 0.8), c1 = Math.cos(ph * 0.8);
    for (const [sd, sx, off] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const tread = [V(sx * 0.85, -0.35 + 0.12 * s1, 0.35 + 0.15 * c1), V(sx * 0.6, -0.1, 0.8 + 0.15 * s1)];
      // crawl: θ goes overhead (0) → under the chest (π/2) → hip (π) → out over the back (3π/2)
      const th = ph + off, cs = Math.cos(th), sn = Math.sin(th);
      const up = V(sx * (0.12 + 0.55 * Math.max(0, -sn)), cs, Math.max(sn, -0.55)).normalize();
      const fore = up.clone().add(V(0, 0, 0.35 * Math.max(0, sn)).add(V(sx * 0.25 * Math.max(0, -sn), 0.2 * Math.max(0, -sn), 0))).normalize();   // elbow bends on the pull and recovery
      rig.aimArm(sd, tread[0].clone().lerp(up, k).normalize(), tread[1].clone().lerp(fore, k).normalize());
    }
    const kick = Math.sin(ph * 3);
    add('upperleg01.L', (1 - k) * (-0.35 - 0.25 * s1) + k * 0.28 * kick); add('upperleg01.R', (1 - k) * (-0.35 + 0.25 * s1) - k * 0.28 * kick);
    add('lowerleg01.L', (1 - k) * (0.5 + 0.4 * Math.max(0, c1)) + k * (0.15 + 0.2 * Math.max(0, -kick))); add('lowerleg01.R', (1 - k) * (0.5 + 0.4 * Math.max(0, -c1)) + k * (0.15 + 0.2 * Math.max(0, kick)));
    add('foot.L', 0.5 + 0.3 * k); add('foot.R', 0.5 + 0.3 * k);
    add('spine05', 0, 0.12 * k * Math.sin(ph), 0); add('spine03', 0, 0.1 * k * Math.sin(ph), 0);     // a little body roll with each stroke
    add('neck02', -0.45 * k);                                                                        // look ahead along the water
  }
  if (mode === 'slide') {
    // a feet-first slide: lead leg out straight, the other folded under, leaning back on one hand
    rig.aimLeg('L', V(0.08, -0.25, 1), V(0.08, -0.2, 1));
    rig.aimLeg('R', V(-0.12, -0.45, 0.85), V(-0.05, -0.85, -0.5));
    add('spine05', -0.35); add('spine03', -0.1); add('neck02', 0.35);
    rig.aimArm('R', V(-0.35, -0.85, -0.4), V(-0.1, -1, -0.1));                     // hand trailing on the ground
    rig.aimArm('L', V(0.3, -0.75, 0.6), V(0.12, -0.55, 0.85));                      // the other resting forward toward the knee
    rig.roots[0].position.y -= rig.worldHead('upperleg01.L').y - rig.worldHead('foot.L').y + 0.75 - 1.5;   // seat just off the ground
  }
  if (mode === 'wallclimb') {
    // climbing a wall: hands and feet alternate. t counts moves (one hand-over-hand per 1.0); gait 0..1 is
    // how much you're moving (still, both hands hold at head height). Looking up the wall.
    const ph = t * Math.PI, sw = Math.sin(ph) * Math.max(0.25, Math.min(1, gait));
    for (const [sd, sx, sg] of [['L', 1, 1], ['R', -1, -1]]) {
      const reach = 0.5 + 0.5 * sw * sg, step = 0.5 - 0.5 * sw * sg;              // this hand up while the other foot steps up
      rig.aimArm(sd, V(sx * 0.42, 0.35, 0.42).lerp(V(sx * 0.22, 1, 0.18), reach).normalize(), V(sx * 0.05, 0.85, 0.55).lerp(V(sx * 0.08, 1, 0.12), reach).normalize());
      const a = 0.15 + 0.9 * step, kn = 0.35 + 1.25 * step;
      rig.aimLeg(sd, rotX(V(sx * 0.12, -1, 0).normalize(), -a), rotX(V(sx * 0.06, -1, 0).normalize(), -(a - kn)));
      add(`foot.${sd}`, -0.25);
      for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${sd}`, -0.9); rot(`finger${f}-3.${sd}`, -0.7); }
    }
    add('spine05', -0.06, 0.05 * sw); add('spine01', 0, -0.05 * sw, 0.04 * sw); add('neck02', -0.35);
  }
  if (mode === 'climbleap') {
    // a leap on a wall, Conan Exiles style. t: progress 0..1; amount/blend: where the coil ends and the
    // flight ends (fractions of t); gait: -1 left .. 0 up .. 1 right.
    //   coil   feet drawn up high on the rock, elbows down pulling the chest in, head tucked, looking up
    //   spring legs drive straight and toes point, both arms reach high (the leading one out to the side
    //          on a side leap), back arched, eyes on the hold
    //   catch  hands bite, elbows give, knees come up to find the rock again
    const u = Math.max(0, Math.min(1, t)), a = Math.max(0.05, amount ?? 0.25), b = Math.max(a + 0.05, blend ?? 0.75), sd = Math.max(-1, Math.min(1, gait || 0));
    const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    // weights of the three key poses
    const toSpring = sm((u - a * 0.6) / (a * 0.4 + (b - a) * 0.35)), toCatch = sm((u - (a + (b - a) * 0.7)) / ((1 - b) + (b - a) * 0.3));
    const wC = 1 - toSpring, wS = toSpring * (1 - toCatch), wK = toCatch;
    const mix = (c, s2, k) => c.clone().multiplyScalar(wC).add(s2.clone().multiplyScalar(wS)).add(k.clone().multiplyScalar(wK)).normalize();
    for (const [sdn, sx] of [['L', 1], ['R', -1]]) {
      const lead = sd ? Math.max(0, -sd * sx) : 0;            // the arm on the side you leap toward (right = −X)
      const upC = V(sx * 0.5, 0.05, 0.55), foC = V(sx * 0.02, 0.9, 0.45);
      const trail = sd ? Math.max(0, sd * sx) : 0;
      const upS = V(sx * (0.18 + 0.95 * lead) + (-sd) * 0.25 * trail * sx * sx, 1 - 0.25 * lead, 0.12), foS = V(sx * (0.12 + 0.95 * lead), 1 - 0.2 * lead, 0.08);
      const upK = V(sx * (0.3 + 0.3 * lead), 0.95, 0.3), foK = V(sx * (0.06 + 0.2 * lead), 0.75, 0.6);
      rig.aimArm(sdn, mix(upC, upS, upK), mix(foC, foS, foK));
      // legs (aimed): coil = knees to chest with feet on the rock; spring = straight; catch = knees up again, one higher
      const th = (ang) => rotX(V(sx * 0.12, -1, 0).normalize(), -ang);
      // a side leap swings the straight legs away from where you're going, so the body makes a diagonal line
      const swingX = V(sd * 0.35, 0, 0), legC = [th(1.5), th(1.5 - 2.25)], legS = [th(0.08).add(swingX), th(0.0).add(swingX)], kk = sx > 0 ? 0.75 : 0.45;
      const legK = [th(kk), th(kk - 1.15)];
      rig.aimLeg(sdn, mix(legC[0], legS[0], legK[0]), mix(legC[1], legS[1], legK[1]));
      add(`foot.${sdn}`, -0.15 * wC - 0.6 * wS - 0.25 * wK);
      for (let f = 2; f <= 5; f++) { rot(`finger${f}-2.${sdn}`, -0.9 * (wC + wK) - 0.3 * wS); rot(`finger${f}-3.${sdn}`, -0.7 * (wC + wK) - 0.2 * wS); }
    }
    add('spine05', 0.3 * wC - 0.12 * wS + 0.04 * wK, 0, -0.22 * sd * wS); add('spine03', 0.14 * wC - 0.05 * wS, 0, -0.1 * sd * wS);
    add('spine01', 0, 0, 0.12 * sd * wS);
    add('neck02', -0.15 * wC - 0.45 * wS - 0.3 * wK, 0.15 * sd * wS, 0);
  }
  if (mode === 'wallkick') {
    // an athletics wall jump, from the push to the tuck. t: 0..1 over about half a second.
    //   gait: side · +1 wall on the left (pushing right), −1 wall on the right
    //   amount: 0 side kick · 1 head-on (wall in front: both feet drive off it, falling back) · 2 wall behind
    // side: the foot nearest the wall plants and drives (leg out to that side), the other knee comes up, the
    // body leans away; the far arm swings up and away, the near arm drives down. Head-on: both legs straight
    // into the wall, back arched, arms thrown up and back, then knees tuck. Behind: legs push back, arms fling
    // forward and up.
    const u = Math.max(0, Math.min(1, t)), kind = Math.round(amount ?? 0), ws = gait >= 0 ? 1 : -1;
    const push = 1 - Math.max(0, Math.min(1, (u - 0.25) / 0.45)), tuck = 1 - push, pz = push * push * (3 - 2 * push);
    const rx2 = (v, ang) => v.applyAxisAngle(V(1, 0, 0), ang);
    if (kind === 0) {
      for (const [sdn, sx] of [['L', 1], ['R', -1]]) {
        const near = sx === ws;                                     // the leg and arm on the wall's side
        const thP = near ? V(sx * 0.75, -0.65, 0.05) : rx2(V(sx * 0.05, -1, 0), -1.25), shP = near ? V(sx * 0.7, -0.7, 0.0) : rx2(V(0, -1, 0), 0.4);
        const thT = rx2(V(sx * 0.1, -1, 0), -0.7), shT = rx2(V(sx * 0.05, -1, 0), 0.5);
        rig.aimLeg(sdn, thT.clone().lerp(thP, pz).normalize(), shT.clone().lerp(shP, pz).normalize());
        add(`foot.${sdn}`, near ? -0.1 * pz : -0.3);
        const upP = near ? V(sx * 0.55, -0.75, 0.15) : V(sx * 0.6, 0.75, 0.2), foP = near ? V(sx * 0.35, -0.9, 0.3) : V(sx * 0.45, 0.85, 0.3);
        const upT = V(sx * 0.35, -0.5, 0.5), foT = V(sx * 0.1, -0.2, 0.95);
        rig.aimArm(sdn, upT.clone().lerp(upP, pz).normalize(), foT.clone().lerp(foP, pz).normalize());
      }
      add('spine05', 0.05, 0, -0.3 * ws * pz); add('spine03', 0, 0, -0.12 * ws * pz); add('spine01', 0, 0.1 * ws * pz, 0.1 * ws * pz);
      add('neck02', -0.1, -0.2 * ws * pz, 0.15 * ws * pz);
    } else {
      const front = kind === 1;
      for (const [sdn, sx] of [['L', 1], ['R', -1]]) {
        const thP = front ? V(sx * 0.12, -0.45, 0.88) : V(sx * 0.1, -0.75, -0.65), shP = thP.clone();
        const thT = rx2(V(sx * 0.1, -1, 0), -1.1), shT = rx2(V(sx * 0.05, -1, 0), 0.75);
        rig.aimLeg(sdn, thT.clone().lerp(thP, pz).normalize(), shT.clone().lerp(shP, pz).normalize());
        add(`foot.${sdn}`, front ? 0.25 * pz - 0.3 * tuck : -0.5);
        const upP = front ? V(sx * 0.35, 0.8, -0.45) : V(sx * 0.3, 0.75, 0.6), foP = front ? V(sx * 0.2, 0.9, -0.35) : V(sx * 0.15, 0.85, 0.55);
        const upT = V(sx * 0.35, -0.45, 0.55), foT = V(sx * 0.05, -0.1, 1);
        rig.aimArm(sdn, upT.clone().lerp(upP, pz).normalize(), foT.clone().lerp(foP, pz).normalize());
      }
      add('spine05', front ? -0.35 * pz + 0.15 * tuck : 0.25 * pz, 0, 0); add('spine03', front ? -0.12 * pz : 0.1 * pz);
      add('neck02', front ? 0.25 * pz - 0.1 * tuck : -0.3 * pz);
    }
  }
  if (mode === 'roll') {
    // a dodge roll: tucked into a ball, knees to the chest, arms wrapped round the shins, head down. The
    // game turns the whole body through the roll; t 0..1 eases into the tuck and out of it at the end.
    const u = Math.max(0, Math.min(1, t)), k = Math.min(1, Math.sin(Math.PI * u) * 1.6);
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      rig.aimLeg(sd, V(sx * 0.1, -1, 0).lerp(V(sx * 0.12, 0.45, 1), k).normalize(), V(sx * 0.06, -1, 0).lerp(V(sx * 0.03, -0.75, -0.65), k).normalize());
      add(`foot.${sd}`, -0.4 * k);
      rig.aimArm(sd, V(sx * 0.18, -1, 0.05).lerp(V(sx * 0.3, -0.25, 0.92), k).normalize(), V(sx * 0.05, -0.9, 0.3).lerp(V(-sx * 0.55, -0.35, 0.75), k).normalize());
    }
    add('spine05', 0.55 * k); add('spine03', 0.3 * k); add('spine01', 0.15 * k); add('neck02', 0.45 * k);
    // sink the hips down to the folded legs, so the ball's centre is low and the game can turn it there
    rig.roots[0].position.y -= k * (rig.worldHead('upperleg01.L').y - rig.worldHead('foot.L').y) * 0.7;
  }
  if (mode === 'wave') {
    const w = 0.35 * Math.sin(t * 7);
    rig.aimArm('R', V(-0.75, 0.55, 0.15), V(-0.15 + w, 1, 0.2));
    add('neck02', 0, -0.15, 0.04);
    add('spine03', 0.01 * Math.sin(t * 1.6));
  }
  // Squat (0..1), layered on standing, walking and the air: hips and knees fold, the ankles keep the feet
  // flat and the chest leans forward over them. Crouching, and absorbing a landing. squatDrop() is how far
  // it lowers the hips (as a share of leg length), so the game can keep the feet on the ground.
  if (squat > 0 && (mode === 'idle' || mode === 'walk' || mode === 'run' || mode === 'air' || mode === 'wallhug' || mode === 'tightrope')) {
    const k = Math.min(1.2, squat);
    for (const side of ['L', 'R']) { add(`upperleg01.${side}`, -SQUAT.hip * k); add(`lowerleg01.${side}`, SQUAT.knee * k); add(`foot.${side}`, -(SQUAT.knee - SQUAT.hip) * k); }
    add('spine05', 0.32 * k); add('spine03', 0.12 * k); add('neck02', -0.3 * k);
  }
}
const SQUAT = { hip: 1.0, knee: 1.9 };
export const squatDrop = k => (2 - Math.cos(SQUAT.hip * k) - Math.cos((SQUAT.knee - SQUAT.hip) * k)) / 2;
