// src/game/enemies.js — the creator's enemies, alive in the game: simple models with basic behaviour.
//
//   const E = createEnemies(THREE, scene, dungeonMap, origin, shapes, { floatText })
//   E.targets                         for combat and spells (same shape as the training dummies)
//   E.update(dt, player, hooks)       player: { pos, height, invulnerable, loudness }
//                                     hooks: { hurt(points, why), tryBlock(dx, dz, power) }
//   E.reset()                         everyone back home at full health (when you fall)
//
// Each placed enemy (src/data/objects.js) becomes `count` of its archetype + variant (vermin come three to a
// count). They stand guard, wander near home, or walk their patrol route, until they notice you: by sight (in
// front of them, within their sight range, nothing in the way) or by hearing (your noise reaches them). How far
// they see you depends on the light on you (torchlight, the map's ambient light) and how hidden you are
// (crouching, keeping still, Sneak skill): in the dark they have to be close. Then:
//   melee, brute   close in, wind up (you see it coming), strike; a raised guard blocks it
//   ranged, caster keep their distance, wind up, loose an arrow / stone / bolt / fire or frost orb
//   vermin         rush you and nip
//   boss           like a brute, and every so often a ground slam all round it (a ring shows where)
// They chase where they last saw you, give up after a while and walk home. Hits knock them back and flash;
// armour softens blows. At zero health they collapse and fade. Traps hurt them too (src/game/dungeonObjects.js),
// and they fall to their deaths in pits.
import { statsOf, variantOf, OBJECTS } from '../data/objects.js';
import { lineBlocked } from './physics.js';
import { createWorkerPool } from './workers/workerPool.js';
import { reportProcess, clearProcess } from './workers/processMonitor.js';

const C = 10;
const SHOTS = {
  arrow: { speed: 24, color: '#d8c8a0', size: 0.05, glow: false },
  bolt: { speed: 30, color: '#a0a0a8', size: 0.05, glow: false },
  stone: { speed: 18, color: '#8a8278', size: 0.08, glow: false },
  fire: { speed: 13, color: '#ff8a30', size: 0.22, glow: true },
  frost: { speed: 12, color: '#a0e8ff', size: 0.22, glow: true },
};

export function createEnemies(THREE, scene, d, origin, shapes, { floatText } = {}) {
  let aiMode = 'main', aiPool = null, aiPoolPromise = null, aiGeneration = 0, aiFrame = 0, aiPending = false, aiLastPlayer = null, aiLastDispatch = 0, aiLastWorkerMs = 0;
  const AI_WORKERS = 2;
  const setAiMode = mode => {
    aiMode = ['main', 'worker', 'auto'].includes(mode) ? mode : 'main';
    aiGeneration++; aiPending = false; aiLastPlayer = null;
    if (aiMode === 'main') { aiPool?.close(); aiPool = null; aiPoolPromise = null; clearProcess('npc-ai-queue'); }
    else if (!aiPoolPromise) {
      aiPoolPromise = (async () => { const pool = createWorkerPool(AI_WORKERS); await pool.ready(); if (aiMode === 'main') { pool.close(); return null; } aiPool = pool; return pool; })().catch(error => { reportProcess('npc-ai-queue', { label:'NPC AI pipeline', kind:'worker', status:'error', task:error?.message || 'Worker startup failed' }); aiPoolPromise = null; return null; });
    }
    return aiMode;
  };
  const workerSnapshot = () => ({ mode: aiMode, pool: aiPool?.snapshot?.() || null, pending: aiPending, lastWorkerMs: aiLastWorkerMs, npcCount: units?.length || 0 });
  const placed = (d.objects || []).filter(o => OBJECTS[o.type]?.cat === 'enemy');
  // walls to bump into: the solid boxes near each 10 m cell, looked up by cell
  const grid = new Map(), gk = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`;
  for (const s of shapes) {
    if (s.type !== 'box') continue;
    for (let x = Math.floor(s.min[0] / C); x <= Math.floor(s.max[0] / C); x++) for (let z = Math.floor(s.min[2] / C); z <= Math.floor(s.max[2] / C); z++) {
      const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s);
    }
  }
  const near = (x, z) => grid.get(gk(x, z)) || [];
  const blocked = (a, b) => lineBlocked(shapes, a, b);

  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1 });
  const glowMat = c => new THREE.MeshBasicMaterial({ color: c });
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();

  // ---- the simple models ----
  function weaponMesh(kind, trim) {
    const g = new THREE.Group(), wood = M('#6a4428'), steel = M('#c0c4ca');
    if (kind === 'sword') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.02), steel); b.position.y = 0.45; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), M(trim)); h.position.y = 0.05; g.add(h); }
    else if (kind === 'club') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.8, 6), wood); b.position.y = 0.4; g.add(b); }
    else if (kind === 'staff') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6), wood); b.position.y = 0.3; g.add(b); const o = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat(trim)); o.position.y = 1.08; g.add(o); }
    else if (kind === 'bow') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 4, 12, Math.PI), wood); b.rotation.z = -Math.PI / 2; b.position.y = 0.1; g.add(b); }
    else if (kind === 'sling') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), M('#8a6a4a')); b.position.y = 0.1; g.add(b); }
    return g;
  }
  function buildModel(v) {
    const L = v.look, s = L.size || 1, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const mb = M(L.body), mt = M(L.trim), eyes = glowMat(L.eyes), parts = { body, mats: [mb, mt] };
    if (L.stone) { mb.roughness = 1; }
    if (L.shape === 'man') {
      const torso = new THREE.Mesh(L.robe ? new THREE.ConeGeometry(0.34, 1.1, 8) : new THREE.CylinderGeometry(0.2, 0.24, L.bony ? 0.6 : 0.65, 8), L.robe ? mb : (L.bony ? mt : mb));
      torso.position.y = L.robe ? 0.75 : 1.05; body.add(torso);
      if (L.bony) for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 4, 10), mb); r.rotation.x = Math.PI / 2; r.position.y = 0.92 + i * 0.13; body.add(r); }
      if (!L.robe) for (const x of [-0.11, 0.11]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.75, 6), L.bony ? mb : mt); leg.position.set(x, 0.38, 0); body.add(leg); parts[x < 0 ? 'legL' : 'legR'] = leg; }
      const head = new THREE.Mesh(L.bony ? new THREE.SphereGeometry(0.15, 10, 8) : new THREE.BoxGeometry(0.26, 0.28, 0.26), mb); head.position.y = 1.55; body.add(head); parts.head = head;
      for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyes); e.position.set(x, 1.57, -0.13); body.add(e); }
      if (L.robe) { const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 8), mb); hood.position.y = 1.74; body.add(hood); }
      if (L.crown) { const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.1, 8, 1, true), glowMat(L.trim)); cr.position.y = 1.72; body.add(cr); }
      const armR = new THREE.Group(); armR.position.set(0.28, 1.3, 0); body.add(armR); parts.arm = armR;
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), L.bony ? mb : mt); a.position.y = -0.3; armR.add(a);
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), L.bony ? mb : mt); armL.position.set(-0.28, 1.0, 0); body.add(armL);
      if (v.weapon) { const w = weaponMesh(v.weapon, L.trim); w.position.y = -0.6; w.rotation.x = -Math.PI / 2; armR.add(w); }
      parts.height = 1.8 * s; parts.radius = 0.32 * s;
    } else if (L.shape === 'beast') {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), mb); torso.position.y = 1.05; torso.rotation.x = 0.25; body.add(torso);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mt); belly.position.set(0, 0.85, -0.12); belly.scale.set(1, 0.9, 0.8); body.add(belly);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), mb); head.position.set(0, 1.45, -0.32); body.add(head); parts.head = head;
      for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyes); e.position.set(x, 1.48, -0.5); body.add(e); }
      for (const x of [-0.22, 0.22]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.65, 6), mb); leg.position.set(x, 0.33, 0); body.add(leg); parts[x < 0 ? 'legL' : 'legR'] = leg; }
      const armR = new THREE.Group(); armR.position.set(0.5, 1.3, -0.1); body.add(armR); parts.arm = armR;
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.85, 6), mb); a.position.y = -0.42; armR.add(a);
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.85, 6), mb); armL.position.set(-0.5, 0.9, -0.1); body.add(armL);
      if (v.weapon) { const w = weaponMesh(v.weapon, L.trim); w.scale.setScalar(1.4); w.position.y = -0.85; w.rotation.x = -Math.PI / 2; armR.add(w); }
      if (L.crown) { const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.1, 8, 1, true), glowMat(L.trim)); cr.position.set(0, 1.65, -0.32); body.add(cr); }
      parts.height = 1.7 * s; parts.radius = 0.5 * s;
    } else {                                                        // vermin: a rat, a bat or a spider
      if (L.shape === 'rat') {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mb); b.scale.set(0.8, 0.7, 1.4); b.position.y = 0.13; body.add(b);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.35, 4), mt); t.rotation.x = Math.PI / 2.4; t.position.set(0, 0.1, 0.33); body.add(t);
        for (const x of [-0.04, 0.04]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), eyes); e.position.set(x, 0.18, -0.2); body.add(e); }
      } else if (L.shape === 'bat') {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mb); b.position.y = 1.4; body.add(b);
        for (const x of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.01, 0.16), mt); w.position.set(x * 0.2, 1.4, 0); body.add(w); parts[x < 0 ? 'wingL' : 'wingR'] = w; }
        for (const x of [-0.03, 0.03]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), eyes); e.position.set(x, 1.42, -0.09); body.add(e); }
      } else {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mb); b.scale.set(1, 0.7, 1.2); b.position.y = 0.2; body.add(b);
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mt); h.position.set(0, 0.18, -0.2); body.add(h);
        for (let i = 0; i < 8; i++) { const sd = i < 4 ? -1 : 1, k = i % 4, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), mb); leg.position.set(sd * 0.17, 0.12, -0.12 + k * 0.08); leg.rotation.z = sd * 1.1; body.add(leg); }
        for (const x of [-0.03, 0.03]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), eyes); e.position.set(x, 0.22, -0.27); body.add(e); }
      }
      parts.height = L.shape === 'bat' ? 1.6 : 0.4; parts.radius = 0.22;
    }
    root.scale.setScalar(s);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    // a health bar over its head (shown once it's hurt or after you)
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    bar.scale.set(0.8, 0.1, 1); bar.renderOrder = 9; bar.visible = false; scene.add(bar);
    parts.bar = bar; parts.barCv = cv;
    return { root, parts };
  }

  // ---- spawning ----
  const units = [];
  for (const o of placed) {
    const v = variantOf(o); if (!v || v.monster) continue;   // (monster groups — swarms, packs — are src/game/monsterActors.js's)
    const st = statsOf(o), n = (o.count || 1) * (o.type === 'swarm' ? 3 : 1);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = n === 1 ? 0 : 0.6 + 0.45 * Math.sqrt(i);
      const home = { x: origin.x + o.x + Math.cos(a) * r, y: origin.y + o.layer * C, z: origin.z + o.z + Math.sin(a) * r };
      const { root, parts } = buildModel(v); scene.add(root);
      const yaw = -(o.rot || 0) * Math.PI / 180;
      const u = {
        o, v, st, kind: 'enemy', arch: o.type, root, parts, home: { ...home }, homeYaw: yaw,
        pos: { ...home }, yaw, radius: parts.radius, height: parts.height, alive: true, material: v.look.stone ? 'stone' : v.look.bony ? 'bone' : 'flesh',
        hp: st.hp, state: 'idle', alert: 0, lastSeen: null, lost: 0, cool: 0, wind: 0, flash: 0, kx: 0, kz: 0, dead: 0, step: 0,
        patrolI: 0, wander: null, wanderT: Math.random() * 3, slamT: 6,
        hit(dmg, info) { hitUnit(u, dmg, info); },
      };
      units.push(u);
    }
  }
  const targets = units;   // combat and spells hit these

  function hitUnit(u, dmg, info = {}) {
    if (!u.alive) return;
    const real = dmg * 100 / (100 + (u.st.armor || 0) * (1 - (info.pierce || 0)));   // armour softens a blow (a piercing thrust ignores some)
    u.hp -= real; u.flash = 0.15;
    const dx = u.pos.x - (info.from?.x ?? u.pos.x), dz = u.pos.z - (info.from?.z ?? u.pos.z), l = Math.hypot(dx, dz) || 1, k = Math.min(3, 0.6 + (info.stagger || 0)) / (u.v.look.size || 1);
    u.kx += dx / l * k * 3; u.kz += dz / l * k * 3;
    if (u.state !== 'fight') { u.state = 'fight'; u.alert = 1; } else u.alert = Math.max(u.alert, 0.8);
    // hit from somewhere it can't see: it goes looking that way (roughly where you are), and so do its friends nearby
    if (lastP && !u.sawLast) {
      const d = Math.hypot(lastP.x - u.pos.x, lastP.z - u.pos.z), j = Math.min(4, d * 0.2);
      u.lastSeen = { x: lastP.x + (Math.random() - 0.5) * 2 * j, z: lastP.z + (Math.random() - 0.5) * 2 * j }; u.lost = 0; u.lookT = null;
      for (const w of units) if (w !== u && w.alive && Math.hypot(w.pos.x - u.pos.x, w.pos.z - u.pos.z) < 10 && Math.abs(w.pos.y - u.pos.y) < 4 && !w.sawLast) {
        w.state = 'fight'; w.alert = Math.max(w.alert, 0.7); w.lost = 0; w.lookT = null; w.lastSeen = { x: lastP.x + (Math.random() - 0.5) * 2 * (j + 2), z: lastP.z + (Math.random() - 0.5) * 2 * (j + 2) };
      }
    }
    u.wind = Math.max(0, u.wind - (info.stagger || 0) * 0.3);         // a heavy blow can interrupt a wind-up
    if (info.stun) { u.stun = Math.max(u.stun || 0, info.stun / (u.arch === 'boss' ? 3 : u.arch === 'brute' ? 1.6 : 1)); u.wind = 0; u.slamming = false; }   // stunned: does nothing for a moment (big foes shake it off sooner)
    if (info.slow) { u.slowT = Math.max(u.slowT || 0, info.slow.t); u.slowK = info.slow.k; }
    if (info.bleed) { u.bleed = { dps: Math.max(u.bleed?.dps || 0, info.bleed.dps), t: Math.max(u.bleed?.t || 0, info.bleed.t), tick: 0 }; }   // bleeding: hurts every second for a while
    const heavy = u.arch === 'boss' || u.arch === 'brute' || (u.v.look.size || 1) > 1.3;
    if (info.knockdown) { if (heavy) u.stun = Math.max(u.stun || 0, 0.5); else { u.stun = Math.max(u.stun || 0, info.knockdown); u.down = info.knockdown; } u.wind = 0; }   // knocked flat (too heavy: only staggered)
    if (info.launch) { if (heavy) u.stun = Math.max(u.stun || 0, 0.6); else { u.air = { t: 0, len: info.launch }; u.stun = Math.max(u.stun || 0, info.launch + 0.3); } u.wind = 0; }   // thrown into the air                                                         // slowed (a hamstring cut)
    floatText?.(real >= 10 ? Math.round(real) : real.toFixed(1), { x: u.pos.x, y: u.pos.y + u.height + 0.3, z: u.pos.z }, info.kind === 'fire' ? '#ff8a3a' : '#ffffff');
    if (u.hp <= 0) { u.alive = false; u.dead = 0.001; u.parts.bar.visible = false; }
  }
  function drawBar(u) {
    const cv = u.parts.barCv, g = cv.getContext('2d'), f = Math.max(0, u.hp / u.st.hp);
    g.clearRect(0, 0, 64, 8); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, 0, 64, 8); g.fillStyle = f > 0.5 ? '#d84a3a' : f > 0.25 ? '#e0903a' : '#e0d03a'; g.fillRect(1, 1, 62 * f, 6);
    u.parts.bar.material.map.needsUpdate = true;
  }

  // ---- moving: steer toward a point, slide along walls, keep apart ----
  function moveToward(u, tx, tz, speed, dt, stopAt = 0.1) {
    const dx = tx - u.pos.x, dz = tz - u.pos.z, dist = Math.hypot(dx, dz);
    if (u.slowT > 0) speed *= u.slowK ?? 1;
    if (dist > stopAt) { const k = Math.min(dist - stopAt, speed * dt) / dist; u.pos.x += dx * k; u.pos.z += dz * k; turnTo(u, dx, dz, dt); u.step += speed * dt; return false; }
    return true;
  }
  const turnTo = (u, dx, dz, dt, rate = 8) => { const want = Math.atan2(-dx, -dz); let dd = want - u.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); u.yaw += dd * Math.min(1, dt * rate); };
  function collide(u) {
    const r = u.radius, y0 = u.pos.y + 0.35, y1 = u.pos.y + Math.min(u.height, 1.8);
    for (const s of near(u.pos.x, u.pos.z)) {
      if (s.max[1] <= y0 || s.min[1] >= y1) continue;
      const cx = Math.max(s.min[0], Math.min(s.max[0], u.pos.x)), cz = Math.max(s.min[2], Math.min(s.max[2], u.pos.z));
      const dx = u.pos.x - cx, dz = u.pos.z - cz, dd = Math.hypot(dx, dz);
      if (dd < r) {
        if (dd > 1e-4) { u.pos.x = cx + dx / dd * r; u.pos.z = cz + dz / dd * r; }
        else { const ex = Math.min(u.pos.x - s.min[0], s.max[0] - u.pos.x), ez = Math.min(u.pos.z - s.min[2], s.max[2] - u.pos.z); if (ex < ez) u.pos.x = u.pos.x - s.min[0] < s.max[0] - u.pos.x ? s.min[0] - r : s.max[0] + r; else u.pos.z = u.pos.z - s.min[2] < s.max[2] - u.pos.z ? s.min[2] - r : s.max[2] + r; }
      }
    }
  }

  // ---- missiles (arrows, stones, bolts, orbs) ----
  const shots = [];
  let lastP = null;                                               // where the player was last frame
  function shoot(u, target, kind, spread = 0) {
    const S = SHOTS[kind] || SHOTS.arrow, from = { x: u.pos.x - Math.sin(u.yaw) * 0.4, y: u.pos.y + u.height * 0.75, z: u.pos.z - Math.cos(u.yaw) * 0.4 };
    if (spread) target = { x: target.x + (Math.random() - 0.5) * 2 * spread, y: target.y + (Math.random() - 0.5) * spread, z: target.z + (Math.random() - 0.5) * 2 * spread };   // aiming at someone half-hidden: wide of the mark
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z, l = Math.hypot(dx, dy, dz) || 1;
    let mesh;
    if (S.glow) { mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: S.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); mesh.scale.setScalar(S.size * 3); }
    else { mesh = new THREE.Mesh(new THREE.CylinderGeometry(S.size * 0.3, S.size * 0.3, 0.5, 4), M(S.color)); mesh.lookAt(dx, dy, dz); mesh.rotateX(Math.PI / 2); }
    mesh.position.set(from.x, from.y, from.z); scene.add(mesh);
    shots.push({ p: from, v: { x: dx / l * S.speed, y: dy / l * S.speed, z: dz / l * S.speed }, mesh, life: 3, dmg: u.st.damage, kind, from: u });
  }

  // a unit sees the player? (in range, in front, nothing in the way)
  function sees(u, p, ph, seen = 1) {
    const dx = p.x - u.pos.x, dz = p.z - u.pos.z, dist = Math.hypot(dx, dz);
    const vis = u.st.sight * (u.st.perception ?? 1);
    // in the dark (or hidden) they must be close; while they're tracking you well they keep better hold of you
    const fighting = u.state === 'fight', track = fighting ? u.alert : 0;
    const range = fighting ? Math.max(1.5, vis * Math.max(seen, 0.5 * track)) : Math.max(2.5 * (u.st.perception ?? 1), vis * seen);
    if (dist > range || Math.abs(p.y - u.pos.y) > 6) return false;
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
    if (dot < (track > 0.5 ? -1 : fighting ? 0 : 0.35) && dist > 2) return false;     // tracking well: all round; searching: a wide arc; otherwise ahead
    const eye = { x: u.pos.x, y: u.pos.y + u.height * 0.9, z: u.pos.z }, head = { x: p.x, y: p.y + ph * 0.85, z: p.z };
    return !blocked(eye, head);
  }

  const RANGED = { ranged: true, caster: true };
  // player.light: how lit you are (0 dark … 1+ in torchlight); player.visibility: how hidden (stealth.js, 1 = in plain view)
  // hooks.pits: pit boxes ({ min, max }) they fall into
  // player.sneak: Sneak skill (how fast staying hidden makes them lose you: steeply worse at low skill)
  // returns { detection (0–1, the most any enemy has on you: up to 0.5 suspicious, above that hunting you),
  //           unaware (enemies close by who don't know you're there), escaped (enemies that just gave up on you) }
  function update(dt, player, { hurt, tryBlock, pits = [] }) {
    let detection = 0, unaware = 0, escaped = 0;
    const p = player.pos, ph = player.height, chest = { x: p.x, y: p.y + ph * 0.6, z: p.z };
    const seen = Math.min(1, Math.max(0.12, player.light ?? 1)) * (player.visibility ?? 1);
    lastP = { x: p.x, y: p.y, z: p.z };
    for (const u of units) {
      // dying: fall over (or down a pit), fade, gone
      if (!u.alive) {
        if (u.dead > 0 && u.fell) { u.dead += dt; u.root.position.y = u.pos.y - u.dead * u.dead * 9; if (u.dead > 1.2) { u.root.visible = false; u.dead = -1; } continue; }
        if (u.dead > 0) { u.dead += dt; u.root.rotation.x = Math.min(Math.PI / 2, u.dead * 4) * (u.arch === 'swarm' ? 0 : 1); u.root.position.y = u.pos.y - Math.min(0.3, u.dead * 0.2);
          if (u.dead > 2.5) { u.root.visible = false; u.dead = -1; } }
        continue;
      }
      const st = u.st, dx = p.x - u.pos.x, dz = p.z - u.pos.z;
      const cachedSense = u._workerSense, senseFresh = cachedSense && performance.now() - cachedSense.at < 180 && Math.hypot(p.x - cachedSense.px, p.z - cachedSense.pz) < 2.5;
      const dist = senseFresh ? cachedSense.dist : Math.hypot(dx, dz);
      // noticing you: by sight, or by hearing (your noise carries `loudness` metres; their hearing stretches it)
      const saw = sees(u, p, ph, seen), heard = senseFresh ? cachedSense.heard : (dist < (player.loudness || 0) * (st.hearing * (st.perception ?? 1) / 14) && Math.abs(p.y - u.pos.y) < 5);
      const close = senseFresh ? cachedSense.close : Math.max(0, 1 - dist / Math.max(1, st.sight * (st.perception ?? 1)));
      // Staying hidden wears their hold on you down, much faster with real Sneak skill: (hidden)² × skill^1.6
      const conceal = 1 - seen, drain = conceal * conceal * Math.min(1.5, Math.pow(Math.max(0, player.sneak ?? 0) / 100, 1.6)) * 0.45;
      if (u.state !== 'fight') {
        if (saw || heard) { u.alert += dt * (saw ? 0.4 + 2.4 * seen + 1.2 * close : 1.5); turnTo(u, dx, dz, dt, 3); if (!u.lastSeen) u.lastSeen = { x: p.x, z: p.z }; }
        else u.alert = Math.max(0, u.alert - dt * 0.5);
        if (u.alert >= 1) { u.state = 'fight'; u.alert = 1; if (!u.lastSeen) u.lastSeen = { x: p.x, z: p.z }; }
        else if (dist < 15 && Math.abs(p.y - u.pos.y) < 4) unaware++;
      } else {
        // hunting: in sight it keeps (or regains) its hold, unless you're well hidden and skilled; out of sight it fades
        if (saw) u.alert = Math.min(1, u.alert + dt * (1.4 * seen + 0.6 * close + (dist < 2.5 ? 1 : 0)) - dt * drain);
        else u.alert -= dt * (0.06 + drain);
        if (saw && u.alert >= 0.5) { u.lastSeen = { x: p.x, z: p.z }; u.lost = 0; }    // knows where you are
        else u.lost += dt;
        if (u.alert <= 0 || u.lost > 30) { u.state = 'home'; u.alert = 0; u.lastSeen = null; u.lookT = null; escaped++; }
      }
      u.sawLast = saw && (u.state !== 'fight' || u.alert >= 0.5);
      detection = Math.max(detection, u.state === 'fight' ? 0.5 + 0.5 * Math.max(0, u.alert) : 0.5 * Math.min(1, u.alert));

      u.cool = Math.max(0, u.cool - dt); if (u.slowT > 0) u.slowT -= dt;
      if (u.bleed) { u.bleed.t -= dt; u.bleed.tick += dt; if (u.bleed.tick >= 1) { u.bleed.tick -= 1; hitUnit(u, u.bleed.dps, { kind: 'bleed' }); } if (u.bleed && u.bleed.t <= 0) u.bleed = null; if (!u.alive) continue; }
      if (u.down > 0) u.down -= dt; if (u.air) { u.air.t += dt; if (u.air.t >= u.air.len) u.air = null; }
      let speed = 0;
      if (u.stun > 0) { u.stun -= dt; u.cool = Math.max(u.cool, 0.3); }   // stunned or deflected: reeling, no moving or attacking
      else if (u.state === 'fight') {
        const ranged = RANGED[u.arch], keep = ranged ? Math.min(st.reach * 0.6, 10) : 0;
        if (u.wind > 0) {                                        // winding up: committed, slowly turning toward you
          u.wind -= dt; turnTo(u, dx, dz, dt, ranged ? 6 : 2.5);
          if (u.wind <= 0) {
            if (ranged) { if (u.sawLast) shoot(u, chest, u.v.shot, (0.15 + (1 - seen) * 2.6) * Math.min(2, dist / 12)); }   // the more hidden you are, the wider they miss
            else if (u.slamming) {
              u.slamming = false; const r = 3.2 * (u.v.look.size || 1) / 1.8;
              if (dist < r && Math.abs(p.y - u.pos.y) < 1.5 && !player.invulnerable) hurt(st.damage * 0.8, `${u.v.name}'s slam`);
              if (u.ring) { scene.remove(u.ring); u.ring = null; }
            } else {
              const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), inFront = (dx * fx + dz * fz) / Math.max(0.01, dist) > 0.3;
              if (dist < st.reach + u.radius + 0.4 && inFront && Math.abs(p.y - u.pos.y) < 1.6) {
                if (player.invulnerable) { /* dodged */ }
                else {
                  const bl = tryBlock?.(-dx, -dz, u.arch === 'brute' || u.arch === 'boss' ? 1.6 : 1);
                  if (bl?.deflect) { u.stun = Math.max(u.stun || 0, u.arch === 'boss' ? bl.deflect / 3 : bl.deflect); u.wind = 0; }   // turned aside: staggered open
                  if (bl) { floatText?.(bl.deflect ? 'Deflected' : bl.perfect ? 'Perfect block' : 'Blocked', { x: p.x, y: p.y + ph + 0.2, z: p.z }, '#9fd0ff'); if (bl.through > 0) hurt(st.damage * bl.through, u.v.name); }   // (some gets past: src/game/combat.js tryBlock)
                  else hurt(st.damage, u.v.name);
                }
              }
            }
            u.cool = ranged ? 1.6 : u.arch === 'swarm' ? 0.7 : 1.2;
          }
        } else {
          const knows = u.sawLast, target = knows ? { x: p.x, z: p.z } : u.lastSeen;
          if (target) {
            const tdist = Math.hypot(target.x - u.pos.x, target.z - u.pos.z);
            if (ranged && knows && dist < st.reach) {
              if (dist < keep * 0.6) { moveToward(u, u.pos.x - dx, u.pos.z - dz, st.speed * 0.7, dt); speed = st.speed * 0.7; turnTo(u, dx, dz, dt); }   // backing off
              else turnTo(u, dx, dz, dt);
              if (u.cool <= 0) u.wind = u.arch === 'caster' ? 0.9 : 0.6;
            } else if (!ranged && knows && dist < st.reach + u.radius + 0.2) {
              turnTo(u, dx, dz, dt);
              if (u.cool <= 0) {
                if (u.arch === 'boss' && (u.slamT -= 1) <= 0) { u.slamming = true; u.slamT = 5; u.wind = 1.4; showRing(u); }
                else u.wind = u.arch === 'swarm' ? 0.25 : u.arch === 'brute' || u.arch === 'boss' ? 0.9 : 0.55;
              }
            } else if (tdist > 0.6) { moveToward(u, target.x, target.z, knows ? st.speed : st.speed * 0.7, dt, ranged && knows ? keep : 0.3); speed = st.speed; }
            else if (!knows) {                                     // got there, nobody: look around a while
              u.lookT = (u.lookT ?? 3) - dt; u.yaw += dt * 1.6;
              if (u.lookT <= 0) { u.lastSeen = null; u.lookT = null; }
            }
          }
        }
      } else if (u.state === 'home') {                           // gave up: back home
        if (moveToward(u, u.home.x, u.home.z, st.speed * 0.6, dt, 0.3)) { u.state = 'idle'; } else speed = st.speed * 0.6;
      } else {                                                     // idle: guard, wander or patrol
        const b = u.o.behaviour || 'stand';
        if (b === 'patrol' && (u.o.patrol || []).length) {
          const pts = [{ x: u.o.x, z: u.o.z }, ...u.o.patrol], n = pts.length;
          if (u.patrolDir == null) u.patrolDir = 1;
          const tp = pts[u.patrolI % n], tx = origin.x + tp.x + (u.home.x - origin.x - u.o.x), tz = origin.z + tp.z + (u.home.z - origin.z - u.o.z);
          if (moveToward(u, tx, tz, st.speed * 0.45, dt, 0.25)) {
            if (u.o.patrolMode === 'back') { if (u.patrolI + u.patrolDir >= n || u.patrolI + u.patrolDir < 0) u.patrolDir *= -1; u.patrolI += u.patrolDir; }
            else u.patrolI = (u.patrolI + 1) % n;
          } else speed = st.speed * 0.45;
        } else if (b === 'wander') {
          u.wanderT -= dt;
          if (!u.wander || u.wanderT <= 0) { const a = Math.random() * Math.PI * 2, r = Math.random() * 3; u.wander = { x: u.home.x + Math.cos(a) * r, z: u.home.z + Math.sin(a) * r }; u.wanderT = 3 + Math.random() * 4; }
          if (!moveToward(u, u.wander.x, u.wander.z, st.speed * 0.3, dt, 0.2)) speed = st.speed * 0.3;
        } else if (Math.hypot(u.home.x - u.pos.x, u.home.z - u.pos.z) > 0.3) { if (!moveToward(u, u.home.x, u.home.z, st.speed * 0.5, dt, 0.2)) speed = st.speed * 0.5; }
        else { let dd = u.homeYaw - u.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); u.yaw += dd * Math.min(1, dt * 2); }
      }
      // knockback, keeping apart (from each other and from you), walls
      u.pos.x += u.kx * dt; u.pos.z += u.kz * dt; u.kx *= Math.max(0, 1 - dt * 8); u.kz *= Math.max(0, 1 - dt * 8);
      for (const w of units) { if (w === u || !w.alive) continue; const ex = u.pos.x - w.pos.x, ez = u.pos.z - w.pos.z, e = Math.hypot(ex, ez), m = u.radius + w.radius; if (e < m && e > 1e-4) { const k = (m - e) / e * 0.5; u.pos.x += ex * k; u.pos.z += ez * k; } }
      if (dist < u.radius + 0.35 && dist > 1e-4) { const k = (u.radius + 0.35 - dist) / dist; u.pos.x -= dx * k; u.pos.z -= dz * k; }
      collide(u);
      for (const h of pits) if (u.pos.x > h.min[0] && u.pos.x < h.max[0] && u.pos.z > h.min[2] && u.pos.z < h.max[2] && u.pos.y >= h.max[1] - 0.1 && u.pos.y < h.max[1] + 3) {   // over a pit: down it goes
        u.alive = false; u.fell = true; u.dead = 0.001; u.parts.bar.visible = false; break;
      }
      if (!u.alive) continue;
      // the model: where it is, which way it faces, a walk cycle, the wind-up pose, a flash when hit
      const P = u.parts, bob = Math.sin(u.step * 5);
      const hop = u.air ? Math.sin(Math.PI * u.air.t / u.air.len) * 2.2 * Math.min(1, u.air.len) : 0;   // launched: up and back down
      u.root.position.set(u.pos.x, u.pos.y + hop + (u.v.look.shape === 'bat' ? Math.sin(performance.now() / 300 + u.home.x) * 0.15 : 0), u.pos.z); u.root.rotation.y = u.yaw;
      u.root.rotation.x = u.down > 0 && u.arch !== 'swarm' ? -1.3 * Math.min(1, u.down / 0.25) : 0;   // knocked flat on its back
      if (P.legL) { P.legL.rotation.x = speed ? bob * 0.6 : 0; P.legR.rotation.x = speed ? -bob * 0.6 : 0; }
      if (P.wingL) { const f = Math.sin(performance.now() / 60); P.wingL.rotation.z = f * 0.7; P.wingR.rotation.z = -f * 0.7; }
      if (P.arm) P.arm.rotation.x = u.wind > 0 ? (RANGED[u.arch] ? -1.4 : -2.4) : u.cool > 0.9 ? 0.9 : -0.2;
      for (const m of P.mats) m.emissive?.set(u.flash > 0 ? '#ff3a2a' : u.wind > 0 && !RANGED[u.arch] ? '#4a1a10' : '#000000');
      u.flash = Math.max(0, u.flash - dt);
      const showBar = u.hp < st.hp || u.state === 'fight';
      P.bar.visible = showBar; if (showBar) { P.bar.position.set(u.pos.x, u.pos.y + u.height + 0.35, u.pos.z); if (u._bar !== Math.round(u.hp)) { u._bar = Math.round(u.hp); drawBar(u); } }
      if (u.ring) { u.ring.position.set(u.pos.x, u.pos.y + 0.05, u.pos.z); u.ring.material.opacity = 0.35 + 0.35 * Math.sin(performance.now() / 80); }
    }
    // missiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.life -= dt;
      const n = { x: s.p.x + s.v.x * dt, y: s.p.y + s.v.y * dt, z: s.p.z + s.v.z * dt };
      const sx = n.x - s.p.x, sz = n.z - s.p.z, sl = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((p.x - s.p.x) * sx + (p.z - s.p.z) * sz) / sl));
      const cx = s.p.x + sx * t, cz = s.p.z + sz * t, cy = s.p.y + (n.y - s.p.y) * t;
      if (Math.hypot(p.x - cx, p.z - cz) < 0.4 && cy > p.y && cy < p.y + ph && !player.invulnerable) {
        const bl = tryBlock?.(-s.v.x, -s.v.z, 0.8);
        if (bl) { floatText?.(bl.perfect ? 'Perfect block' : 'Blocked', { x: p.x, y: p.y + ph + 0.2, z: p.z }, '#9fd0ff'); if (bl.through > 0) hurt(s.dmg * bl.through, s.from.v.name); }
        else hurt(s.dmg, s.from.v.name);
        scene.remove(s.mesh); shots.splice(i, 1); continue;
      }
      if (s.life <= 0 || blocked(s.p, n)) { scene.remove(s.mesh); shots.splice(i, 1); continue; }
      s.p = n; s.mesh.position.set(n.x, n.y, n.z);
    }
    // Dispatch pure sensory-distance work asynchronously. Results are consumed on later frames only
    // while the player remains nearby; combat, collision, animation and scene mutation stay on main.
    aiFrame++;
    if (aiMode !== 'main' && units.length >= (aiMode === 'auto' ? 24 : 1) && !aiPending &&
        (aiFrame % 4 === 0 || !aiLastPlayer || Math.hypot(p.x - aiLastPlayer.x, p.z - aiLastPlayer.z) > 1.25)) {
      const generation = aiGeneration, playerSnap = { x:p.x, y:p.y, z:p.z, loudness:player.loudness || 0 };
      const npcs = units.map((u,index)=>({ index, x:u.pos.x, y:u.pos.y, z:u.pos.z, sight:u.st.sight || 1, hearing:u.st.hearing || 14, perception:u.st.perception || 1, alive:u.alive })).filter(n=>n.alive);
      aiLastPlayer = { ...playerSnap }; aiLastDispatch = performance.now(); aiPending = true;
      reportProcess('npc-ai-queue', { label:'NPC AI dispatch', kind:'worker', status:'queued', task:`${npcs.length} NPC sensory candidates`, queued:1 });
      (async () => {
        try {
          const pool = aiPool || await aiPoolPromise;
          if (!pool || generation !== aiGeneration) return;
          const result = await pool.run('npc-ai-sense', { player:playerSnap, npcs });
          if (generation !== aiGeneration || !result || Math.hypot(p.x - playerSnap.x, p.z - playerSnap.z) > 2.5) return;
          const at = performance.now(), timing = result.__timing || {};
          aiLastWorkerMs = Number(timing.workerMs) || 0;
          for (const row of result.results || []) {
            const u = units[row.index]; if (!u || !u.alive || !Number.isFinite(row.dist)) continue;
            u._workerSense = { dist:row.dist, close:row.close, heard:row.heard, px:playerSnap.x, pz:playerSnap.z, at };
          }
        } catch (error) {
          reportProcess('npc-ai-queue', { label:'NPC AI pipeline', kind:'worker', status:'error', task:error?.message || 'Task failed' });
          if (aiMode === 'auto') { aiMode = 'main'; aiGeneration++; }
        } finally {
          aiPending = false;
          if (aiMode !== 'main') reportProcess('npc-ai-queue', { label:'NPC AI dispatch', kind:'worker', status:'idle', task:`last ${aiLastWorkerMs.toFixed(2)} ms` });
        }
      })();
    }
    if (aiPool) {
      const snap = aiPool.snapshot();
      for (const w of snap.workers) reportProcess(`npc-worker-${w.id}`, { label:`NPC Worker ${w.id}`, kind:'worker', status:w.busy?'working':'idle', task:w.task || '', queued:snap.queued });
    }
    return { detection, unaware, escaped };
  }
  function showRing(u) {
    const r = 3.2 * (u.v.look.size || 1) / 1.8;
    u.ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 40), new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    u.ring.rotation.x = -Math.PI / 2; scene.add(u.ring);
  }
  function reset() {
    for (const s of shots) scene.remove(s.mesh); shots.length = 0;
    for (const u of units) {
      Object.assign(u, { pos: { ...u.home }, yaw: u.homeYaw, hp: u.st.hp, alive: true, fell: false, state: 'idle', alert: 0, lastSeen: null, lost: 0, cool: 0, wind: 0, dead: 0, kx: 0, kz: 0, patrolI: 0, slamming: false });
      if (u.ring) { scene.remove(u.ring); u.ring = null; }
      u.root.visible = true; u.root.rotation.x = 0; u._bar = null;
    }
  }
  // a noise at `at` that carries `r` metres (spells, blasts, backfires): anyone who hears it comes to look
  function noise(at, r, kind = 'noise') {
    for (const u of units) {
      if (!u.alive || Math.abs(at.y - u.pos.y) > 8) continue;
      const d = Math.hypot(at.x - u.pos.x, at.z - u.pos.z);
      let reach = r * (u.st.perception ?? 1) * Math.sqrt((u.st.hearing || 14) / 14);
      if (lineBlocked(shapes, { x: at.x, y: at.y + 1, z: at.z }, { x: u.pos.x, y: u.pos.y + 1.2, z: u.pos.z })) reach *= 0.6;   // muffled by walls
      if (d > reach || u.sawLast) continue;
      const j = Math.min(5, d * 0.15);
      if (u.state !== 'fight') u.alert = 0.7; else u.alert = Math.max(u.alert, 0.7);   // heard it: on the hunt, but doesn't know exactly where you are
      u.state = 'fight'; u.lost = 0; u.lookT = null;
      u.lastSeen = { x: at.x + (Math.random() - 0.5) * 2 * j, z: at.z + (Math.random() - 0.5) * 2 * j };
    }
    void kind;
  }
  return { targets, update, reset, units, noise, setAiMode, workerSnapshot };
}
