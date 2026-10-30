// src/game/monsterActors.js — the new monsters (docs/MONSTERS.md) alive in the game: bodies from the creature builder,
// moving with src/rpg/creatureMotion.js, fighting with their move sets.
//
//   const MA = createMonsterActors(THREE, scene, { shapes, shapesIn, floatText, audio, particles })   shapesIn(x0, z0, x1, z1): the shapes in a box   audio: src/game/audio.js (monster voices)
//   MA.spawn(id, { x, y, z, yaw, rank, params })   a monster of src/data/monsters.js
//   MA.targets                                      for the player's weapons and spells (the same shape as the dummies)
//   MA.update(dt, player, hooks)                    player: { pos, height }; hooks: { hurt(points, why),
//                                                   tryBlock(dx, dz, power) → false | { perfect, deflect, through },
//                                                   debuff(effect, why) }
//
// Combat (part 3):
//   damage types  each blow says what it deals (info.type: slash / pierce / blunt / crush; spells by their kind: fire,
//                 frost, lunar, light, dark…); the monster's `resist` multiplies it (0: immune)
//   hit zones     the zone whose bone is nearest where the blow lands (info.aim) takes it, × its multiplier (the
//                 Umbrafiend's core 2.5×, its head 1.4×, legs 0.7×...)
//   poise         blows wear it down (by their stagger, less if resisted); at zero it staggers — wide open — and
//                 comes back to full. Perfect blocks and deflects break it too.
//   reactions     stagger, knockdown, launch (src/rpg/creatureMotion.js REACTIONS); stun holds it in a stagger
//   its attacks   during a move's hit window, its hitbox bones strike anything within `reach` of them: blockable
//                 (a perfect block makes it recoil, a deflect staggers it); shadow bullets fly and hit; a screech's
//                 aura lays its effect (less hearing, less sight) on you if you're inside it
// Behaviour: group brains (see GROUP BRAINS below) — swarms circle and swoop, packs spread and close; groups join.
//   MA.nearTargets   the targets within 40 m (what the game hands weapons and spells); MA.groups   the groups
import { buildCreature } from '../rpg/creature.js';
import { createBatSwarmInstances } from './batInstancing.js';
import { createCreaturePartInstancing } from '../rpg/creatureInstancing.js';
import { createMotion } from '../rpg/creatureMotion.js';
import { MONSTERS, monsterSpec, statsAtLevel } from '../data/monsters.js';
import { groundAt, lineBlocked, resolveWalls } from './physics.js';
import { STEALTH } from '../rpg/stealth.js';
import { getApplicationWorkerPool } from './workers/workerPool.js';
import { reportProcess, clearProcess, clearProcessesByPrefix } from './workers/processMonitor.js';

export const RANK_K = { Wood: 1, Bronze: 1.8, Silver: 3, Gold: 5, Crystal: 8 };
const KIND_TYPE = { fire: 'fire', frost: 'frost', ice: 'frost', lunar: 'lunar', holy: 'light', light: 'light', dark: 'dark', shadow: 'dark', storm: 'storm', lightning: 'storm', earth: 'earth', arcane: 'arcane' };

export function createMonsterActors(THREE, scene, { shapes = [], shapesIn = null, floatText = null, audio = null, particles = null } = {}) {
  // only the shapes near a line or a spot (play.js keeps a grid of the map's): a town has thousands, and checking all
  // of them for every monster's ground, sight and walls was what sank the frame rate once they started hunting
  let shapesInF = shapesIn;
  const near = (a, b) => shapesInF ? shapesInF(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1) : shapes;
  const blocked = (a, b) => lineBlocked(near(a, b), a, b);
  const actors = [], targets = [], shots = [];
  const batSwarm = createBatSwarmInstances(THREE, scene);
  const creaturePartInstances = createCreaturePartInstancing(THREE, scene);
  let batInstancing = true, umbrafiendTwoInfluence = false;
  // Creature AI and presentation share one FIFO pool. Any free worker takes the next queued
  // job, regardless of which subsystem submitted it; workers start only when workload warrants it.
  let presentationMode = 'main';
  let aiMode = 'main', aiGeneration = 0, aiSequence = 0, aiPending = false, aiDispatchCount = 0, aiWorkerMs = 0, aiQueueMs = 0, aiDispatchMs = 0, aiLastError = '', aiLastDispatchAt = 0;
  let nextGroupSenseKey = 1; const groupSenseKeys = new WeakMap(), groupSenseCache = new Map();
  let presentationGeneration = 0, presentationSequence = 0, presentationPending = false, presentationPendingSince = 0;
  let presentationLastDispatch = 0, presentationPlanAt = 0, presentationPlayerAt = null;
  let presentationWorkerMs = 0, presentationQueueMs = 0, presentationDispatchMs = 0, presentationRoundTripMs = 0, presentationBatchMs = 0, presentationDispatchCount = 0, presentationLastError = '', nextPresentationActorId = 1;
  let aiRoundTripMs = 0, aiBatchMs = 0;
  let presentationPlans = new Map();
  const SHARED_WORKERS = 12; // Application-wide maximum; the shared pool grows only when queued demand requires it.
  let sharedPool = null, sharedPoolPromise = null;
  const syncSharedWorkerProcesses = snap => {
    clearProcessesByPrefix('shared-worker-');
    for (const w of snap?.workers || []) reportProcess('shared-worker-'+w.id, { label:'Shared worker '+w.id, kind:'worker', status:w.busy?'busy':'idle', task:w.task||(w.lastTask?'Idle · last task: '+w.lastTask:'Idle · waiting for shared work') });
    if (snap) reportProcess('shared-worker-queue', { label:'Shared worker scheduler', kind:'worker', status:snap.queued||snap.busy?'busy':'idle', queued:snap.queued, task:'Shared FIFO · '+snap.busy+'/'+snap.active+' busy · '+snap.queued+' queued' });
  };
  const shouldUseWorkers = () => aiMode === 'worker' || presentationMode === 'worker' ||
    (aiMode === 'auto' && actors.length >= 4) || (presentationMode === 'auto' && actors.length >= 4);
  const ensureSharedPool = () => {
    if (sharedPool || sharedPoolPromise || !shouldUseWorkers()) return;
    sharedPoolPromise = (async () => {
      const pool = getApplicationWorkerPool();
      await pool.ready();
      if (!shouldUseWorkers()) { pool.close(); return null; }
      sharedPool = pool;
      reportProcess('shared-worker-queue', { label:'Shared worker scheduler', kind:'worker', status:'idle', task:'Shared FIFO · AI perception + creature presentation' });
      syncSharedWorkerProcesses(pool.snapshot());
      return pool;
    })().catch(error => {
      aiLastError = presentationLastError = error?.message || 'Shared worker startup failed';
      reportProcess('shared-worker-queue', { label:'Shared worker scheduler', kind:'worker', status:'error', task:aiLastError });
      return null;
    }).finally(() => { sharedPoolPromise = null; });
  };
  const maybeCloseSharedPool = () => {
    if (aiMode !== 'main' || presentationMode !== 'main') return;
    sharedPool = null; sharedPoolPromise = null; // Do not close the application pool: foliage may still be using it.
    clearProcess('shared-worker-queue'); clearProcessesByPrefix('shared-worker-');
  };
  const ensureAiPool = ensureSharedPool;
  const ensurePresentationPool = ensureSharedPool;
  const setAiMode = mode => {
    aiMode = ['main','worker','auto'].includes(mode) ? mode : 'main';
    aiGeneration++; aiPending = false; groupSenseCache.clear(); aiLastError = '';
    if (aiMode === 'main') clearProcess('creature-ai-queue'); else ensureSharedPool();
    maybeCloseSharedPool();
  };
  const setPresentationMode = mode => {
    presentationMode = ['main','worker','auto'].includes(mode) ? mode : 'main';
    presentationGeneration++; presentationPending = false; presentationPlans.clear(); presentationPlanAt = 0; presentationPlayerAt = null;
    if (presentationMode === 'main') clearProcess('npc-presentation-queue'); else ensureSharedPool();
    maybeCloseSharedPool();
  };
  const dispatchCreatureSense = player => {
    if (aiMode === 'main' || (aiMode === 'auto' && actors.length < 4)) return;
    ensureSharedPool();
    const now = performance.now();
    // Group detection only reevaluates every 250 ms; don't serialize hundreds of member snapshots every frame.
    if (!sharedPool || aiPending || !groups.length || now - aiLastDispatchAt < 200) return;
    aiLastDispatchAt = now;
    const pool = sharedPool, generation = aiGeneration, sequence = ++aiSequence, batchStartedAt = performance.now();
    const snapshots = groups.map(G => {
      let key = groupSenseKeys.get(G);
      if (!key) { key = nextGroupSenseKey++; groupSenseKeys.set(G, key); }
      return { key, members: G.members.map(m => ({ x:m.pos.x, y:m.pos.y, z:m.pos.z, alt:m.alt||0, hover:m.M?.hover||0, alive:!!m.alive })) };
    });
    aiPending = true; aiDispatchCount++;
    reportProcess('shared-worker-queue', { label:'Shared worker scheduler', kind:'worker', status:'busy', queued:pool.snapshot().queued+2, task:'AI perception · '+snapshots.length+' groups' });
    reportProcess('creature-ai-queue', { label:'Creature AI perception', kind:'worker', status:'busy', queued:snapshots.length, task:'Nearest living member and distance calculations' });
    const chunks = [snapshots.filter((_,i)=>i%2===0), snapshots.filter((_,i)=>i%2===1)].filter(a=>a.length);
    Promise.all(chunks.map((chunk,i)=>pool.run('creature-ai-sense', { player:{x:player.pos.x,y:player.pos.y,z:player.pos.z}, groups:chunk, sequence, chunk:i })))
      .then(results => {
        if (generation !== aiGeneration || sequence !== aiSequence) return;
        for (const result of results) for (const item of result.results || []) groupSenseCache.set(item.key, { ...item, at:performance.now() });
        aiWorkerMs = results.reduce((n,r)=>n+(r.__timing?.workerMs||0),0);
        aiQueueMs = Math.max(0,...results.map(r=>r.__timing?.queueMs||0));
        aiDispatchMs = results.reduce((n,r)=>n+(r.__timing?.dispatchMs||0),0);
        aiRoundTripMs = Math.max(0,...results.map(r=>r.__timing?.roundTripMs||0));
        aiLastError = '';
      })
      .catch(error => { aiLastError=error?.message||'Creature AI perception failed'; reportProcess('creature-ai-queue',{label:'Creature AI perception',kind:'worker',status:'error',task:aiLastError}); })
      .finally(() => {
        if (generation !== aiGeneration) return;
        aiBatchMs = performance.now() - batchStartedAt;
        aiPending = false;
        const snap = pool.snapshot();
        syncSharedWorkerProcesses(snap);
        reportProcess('creature-ai-queue',{label:'Creature AI perception',kind:'worker',status:aiLastError?'error':'idle',task:aiLastError||aiMode+' · '+actors.length+' creatures · '+aiDispatchCount+' batches · CPU '+aiWorkerMs.toFixed(2)+' ms · queue '+aiQueueMs.toFixed(2)+' ms · transfer '+aiDispatchMs.toFixed(2)+' ms · round trip '+aiRoundTripMs.toFixed(2)+' ms'});
      });
  };
  const getCreatureSense = G => {
    const key = groupSenseKeys.get(G), result = key ? groupSenseCache.get(key) : null;
    return result && performance.now() - result.at < 500 ? result : null;
  };
  const getPresentationPlan = (actor, player) => {
    if (presentationMode === 'main' || (presentationMode === 'auto' && actors.length < 4)) return null;
    if (!presentationPlanAt || performance.now() - presentationPlanAt > 240 || !presentationPlayerAt ||
        Math.hypot(player.pos.x - presentationPlayerAt.x, player.pos.z - presentationPlayerAt.z) > 3.5) return null;
    const plan = presentationPlans.get(actor.presentationId);
    if (!plan || Math.hypot(actor.pos.x - plan.x, actor.pos.z - plan.z) > 2.5) return null;
    return plan;
  };
  const wp = new THREE.Vector3(), v2 = new THREE.Vector3();
  const motionOpts = { speed: 0, ik: false };   // reused for each actor's synchronous pose update
  // the health bar over its head (part 5 will make what's shown depend on what you know of it)
  function bar() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })); sp.scale.set(0.8, 0.1, 1); sp.renderOrder = 20;
    let last = -1;
    return { sp, cv, draw(f) { f = Math.round(Math.max(0, f) * 62) / 62; if (f === last) return; last = f; const g = cv.getContext('2d'); g.clearRect(0, 0, 64, 8); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#a04ad8'; g.fillRect(1, 1, 62 * Math.max(0, f), 6); sp.material.map.needsUpdate = true; } };
  }
  // ---- its sounds: louder near you, panned to its side of your view (hooks.ear: the camera) ----
  const earR = new THREE.Vector3();
  function sfx(A, name) {
    if (!audio || !name || !A.player) return;
    const p = A.player.pos, dx = A.pos.x - p.x, dz = A.pos.z - p.z, d = Math.hypot(dx, dz, A.pos.y - p.y);
    const gain = 1 / (1 + (d / 5) ** 2); let pan = 0;
    const ear = A.hooks?.ear; if (ear && d > 0.3) { earR.setFromMatrixColumn(ear.matrixWorld, 0); pan = (dx * earR.x + dz * earR.z) / Math.max(0.3, Math.hypot(dx, dz)) * 0.8; }
    audio.monster(name, gain, pan);
  }
  function voices(A, dt, speed) {
    const V = A.M.voice || {}, act = A.mo.action; if (!act) A.sfxName = null;
    if (act?.def?.sfx) { if (A.sfxName !== act.name || act.u < A.sfxU) { A.sfxName = act.name; A.sfxU = -1; } for (const [at, n] of act.def.sfx) if (at > A.sfxU && at <= act.u) sfx(A, n); A.sfxU = act.u; }   // (a move's sounds, as it passes each mark)
    if (V.flap) {   // wing beats: quick and steady, a gap while it glides in the dive
      const glide = act?.name === 'swoop' && act.u > 0.36 && act.u < 0.62;
      const ph = Math.floor((A.mo.cycle + Math.PI / 2) / (Math.PI * 2)); if (ph !== A.flapPh) { A.flapPh = ph; if (!glide && A.near) sfx(A, V.flap); }   // (wing beats only from the closest few: twenty bats' flaps are noise)   // (once a beat, on the downstroke)
    }
    if (V.step && speed > 0.3 && !act) { if ((A.stepT -= dt * speed) <= 0) { A.stepT = 0.55; sfx(A, V.step); } }
    if (V.growl && A.state === 'fight' && !act && (A.growlT -= dt) <= 0) { A.growlT = 4 + Math.random() * 6; sfx(A, V.growl); }
    if (A.hurtT > 0) A.hurtT -= dt;
  }
  function spawn(id, { x = 0, y = 0, z = 0, yaw = 0, rank = null, params = {}, scale = null, group = null, level = null } = {}) {
    const M = MONSTERS[id]; if (!M) throw new Error(`no monster ${id}`);
    const { spec } = monsterSpec(id, params), C = buildCreature(THREE, spec, { particles, instances: id === 'umbrafiend' ? creaturePartInstances : null, twoInfluenceVariant: id === 'umbrafiend' }), mo = createMotion(C, M);
    if (id === 'umbrafiend') C.setSkinnedVariant(umbrafiendTwoInfluence);
    // a placed group's stats (src/data/objects.js: the editor's numbers, as multipliers of the group's defaults)
    // a level chart (the workshop's): its numbers at this level replace the rank's scaling
    const LV = level != null && M.levels ? statsAtLevel(M, level) : null, B0 = LV ? { ...M.stats, hp: LV.hp, speed: LV.speed, aggro: LV.aggro, poise: LV.poise } : M.stats;
    const rk = LV ? 1 : RANK_K[rank || M.rank[0]] || 1, K = scale || {}, S = { ...B0, hp: B0.hp * (K.hp ?? 1), speed: B0.speed * (K.speed ?? 1), aggro: B0.aggro * (K.sight ?? 1) };
    const A = { id, M, C, mo, S, group, level, presentationId: nextPresentationActorId++, armor: LV?.armor || 0, exp: Math.round(LV?.exp ?? M.stats.exp ?? S.hp * 0.35 * rk),   // (combat exp for killing it: its level chart's, or by its health)
      dmgK: (K.damage ?? 1) * (LV?.damage ?? 1), rank: rank || M.rank[0], k: rk, pos: { x, y, z }, home: { x, y, z }, yaw, hp: S.hp * rk, maxHp: S.hp * rk, poise: S.poise * Math.sqrt(rk), maxPoise: S.poise * Math.sqrt(rk),
      alive: true, state: 'idle', cool: {}, hitDone: true, stunT: 0, slowT: 0, slowK: 1, bleed: null, lost: 0, dead: 0, moveSpeed: 0, behaviorLodDt: 0, bar: bar() };
    scene.add(C.root); A.attached = true; C.root.traverse(o => { if (o.isMesh) o.userData.noLampShadow = true; });
    A.bar.draw(1); A.alt = A.altGoal = M.roost ?? 0;   // (a swarm starts up high) A.flapT = Math.random() * 0.2; A.growlT = 3 + Math.random() * 5; A.stepT = 0;
    mo.onCommit = (dx, dz) => { const c = Math.cos(A.yaw), s = Math.sin(A.yaw); A.pos.x += dx * c + dz * s; A.pos.z += -dx * s + dz * c; if (A.landDy) { A.pos.y += A.landDy; A.landDy = 0; } A.gx = 1e9; if (!M.flight && shapes.length) { const r = settle(A, A.pos.x, A.pos.z); A.pos.x = r.x; A.pos.z = r.z; } };
    mo.onEvent = (name, d) => {
      if (name === 'fire') {   // a shadow bullet: the game flies it now
        // aimed at you — up a slope or a stair as well as level (within a cone in front of it, so it can't shoot behind)
        const mv = mo.action?.def || {}; if (A.player) { const p = A.player.pos, to = v2.set(p.x - d.pos.x, p.y + 1.1 - d.pos.y, p.z - d.pos.z).normalize(); if (to.dot(d.dir) > 0.5) d.dir.copy(to); }
        shots.push({ m: d.mesh, dir: d.dir.clone(), speed: d.speed, size: d.size || 0.1, dmg: (mv.damage || 10) * A.k * A.dmgK, power: mv.power || 0.8, type: mv.type || 'dark', who: M.name, age: 0 });
        return true;
      }
      if (name === 'aura' && A.player) {   // a screech's darkness: on you if you're inside it
        const p = A.player.pos, dy = (p.y + 1.2) - d.pos.y;
        if (Math.hypot(p.x - d.pos.x, dy, p.z - d.pos.z) < d.radius) A.hooks?.debuff?.(d.effect, `${M.name}'s screech`);
      }
    };
    const T = A.target = { kind: 'monster', pos: { x, y, z }, radius: S.radius, height: S.height, alive: true, material: 'flesh', actor: A, hit: (dmg, info) => hitActor(A, dmg, info) };
    actors.push(A); targets.push(T); makeGroup(A, group); placeBody(A);
    return A;
  }
  // ---- being hit ----
  function hitActor(A, dmg, info = {}) {
    if (!A.alive) return;
    const M = A.M, type = info.type || KIND_TYPE[info.kind] || 'slash', res = M.resist?.[type] ?? (type === 'shadow' ? M.resist?.dark : undefined) ?? 1;
    A.hooks?.struck?.(A, type);   // (the bestiary learns how it takes this type)
    // the zone nearest where the blow lands
    let zone = { mult: 1 }, best = Infinity;
    if (info.aim && M.zones) for (const [name, Z] of Object.entries(M.zones)) for (const bn of Z.bones) {
      const b = A.C.bones[bn]; if (!b) continue; wp.setFromMatrixPosition(b.matrixWorld); if (Z.at) wp.add(v2.set(...Z.at));
      const d = (wp.x - info.aim.x) ** 2 + (wp.y - info.aim.y) ** 2 + (wp.z - info.aim.z) ** 2; if (d < best) { best = d; zone = { ...Z, name }; }
    }
    const real = Math.max(0, dmg - (A.armor || 0) * 0.1) * res * zone.mult,   // (armour from its level chart takes a little off every blow)
    top = { x: A.target.pos.x, y: A.target.pos.y + A.target.height + 0.25, z: A.target.pos.z };
    if (res === 0) { floatText?.('Immune', top, '#8a8a9a'); }
    else floatText?.(real >= 10 ? Math.round(real) : real.toFixed(1), top, res < 0.5 ? '#a090c8' : res > 1 ? '#ffcf6a' : zone.mult > 1.2 ? '#ffe0a0' : '#ffffff');
    A.hp -= real; A.state = 'fight'; A.lost = 0; if (A.group) { if (M.temper === 'passive') { A.group.state = 'flee'; A.group.fleeT = 7; A.group.from = info.from || A.player?.pos; } else { A.group.state = 'fight'; A.group.lost = 0; } A.group.awake = true; }   // (hit one and the whole group comes for you)
    if (A.hp <= 0) { die(A); return; }
    if (res > 0 && (A.hurtT || 0) <= 0) { sfx(A, M.voice?.hurt); A.hurtT = 0.35; }
    // poise: battered off balance (resisted blows batter less), then a stagger
    A.poise -= (info.stagger || 0) * 10 * Math.max(0.25, Math.min(1, res)) + (info.perfect ? 3 : 0);
    if (info.launch) react(A, 'launch', 0);
    else if (info.knockdown) react(A, 'knockdown', 0);
    else if (info.stun) react(A, 'stagger', info.stun);
    else if (A.poise <= 0) react(A, 'stagger', 0.6);
    if (info.slow) { A.slowT = Math.max(A.slowT, info.slow.t); A.slowK = info.slow.k; }
    if (info.bleed) A.bleed = { dps: Math.max(A.bleed?.dps || 0, info.bleed.dps * res), t: Math.max(A.bleed?.t || 0, info.bleed.t), tick: 0 };
    // a little knockback, away from the blow
    if (info.from) { const dx = A.pos.x - info.from.x, dz = A.pos.z - info.from.z, l = Math.hypot(dx, dz) || 1, k = Math.min(0.35, 0.08 + (info.stagger || 0) * 0.12) * Math.max(0.3, Math.min(1, res)); A.pos.x += dx / l * k; A.pos.z += dz / l * k; }
  }
  function react(A, kind, stun) {
    if (A.mo.action?.def?.keepRoot) { const r = A.mo.root; A.mo.onCommit?.(r.x, r.z); A.landDy = 0; }   // (cut off mid-leap: it stays where the leap had got it, not back where it started)
    A.attacking = false;
    A.poise = A.maxPoise; A.stunT = Math.max(A.stunT, stun); A.hitDone = true;
    A.mo.play(kind);
    floatText?.(kind === 'stagger' ? 'Staggered' : kind === 'launch' ? 'Launched' : 'Knocked down', { x: A.target.pos.x, y: A.target.pos.y + A.target.height + 0.5, z: A.target.pos.z }, '#c8a8ff');
  }
  function die(A) {
    if (A.alive && A.exp > 0) A.hooks?.xp?.(A.exp, A);   // (combat exp to your character level)
    if (A.alive) A.hooks?.killed?.(A);   // (the bestiary: its page, the level and health it had)
    sfx(A, A.M.voice?.die); A.alive = false; A.target.alive = false; A.dead = 0.001; A.mo.stop(); if (A.M.harvest) A.corpse = { t: 0, side: Math.random() < 0.5 ? 1 : -1 };   // (an animal's body stays, to be skinned) A.bar.sp.visible = false;
    floatText?.('Slain', { x: A.target.pos.x, y: A.target.pos.y + A.target.height + 0.4, z: A.target.pos.z }, '#c8a8ff');
  }
  // the body where the actor is, facing its way; the target follows the body (a lunge carries what you can hit)
  function placeBody(A) {
    const C = A.C, M = A.M;
    const act = A.mo.action, land = act && A.landDy ? A.landDy * Math.min(1, Math.max(0, (act.u - 0.25) / 0.5)) : 0;   // (a leap's landing height, eased in over its flight)
    C.root.position.set(A.pos.x, A.pos.y + (M.hover || 0) + (A.alt || 0) + land, A.pos.z); C.root.rotation.order = 'YXZ'; C.root.rotation.y = A.yaw; C.root.rotation.x = act && A.landDy ? 0 : (A.pitch || 0);
    C.sync();
    // a flyer's dive can't go through the ground: during a move, the body is held a little above the ground under
    // where its root motion has carried it (sampled ~12 times a second, from nearby shapes only)
    if (M.flight && A.mo.action && shapes.length && C.bones.root.position.y < -0.2) {   // (only while it's diving)
      wp.setFromMatrixPosition(C.bones.root.matrixWorld);
      if ((A.diveT = (A.diveT || 0) - 1) <= 0) { A.diveT = 5; const g = groundAt(near(wp, wp), wp.x, wp.z, wp.y + 3, 0.2, 0); A.diveG = g && Number.isFinite(g.y) ? g.y : null; }
      if (A.diveG != null && wp.y < A.diveG + 0.4) { C.bones.root.position.y += (A.diveG + 0.4 - wp.y) / (C.root.scale.y || 1); C.sync(); }
    } else A.diveT = 0;
    const core = C.bones['spine:1'] || C.bones.root; wp.setFromMatrixPosition(core.matrixWorld);   // (matrices fresh from sync: no walk up the bone chain)
    A.target.pos.x = wp.x; A.target.pos.z = wp.z; A.target.pos.y = wp.y - A.target.height / 2;
    A.bar.sp.position.set(wp.x, wp.y + A.target.height * 0.5 + 0.45, wp.z);
  }
  // ---- the ground under it: its height, and for four-legged ones the slope (body tilted to it, nose up a hill) ----
  const ga = (x, z, y, A) => { const g = groundAt(A?.groundSh && Math.abs(x - A.nearX) < 2 && Math.abs(z - A.nearZ) < 2 ? A.groundSh : near({ x, z }, { x, z }), x, z, y + 1.2, 0.3); return g && Number.isFinite(g.y) ? g.y : null; };   // (from the shapes it already has round it, when it's still among them)
  function groundUnder(A) {
    A.gx = A.pos.x; A.gz = A.pos.z;
    if (!A.M.flight) settle(A, A.pos.x, A.pos.z);   // (refreshes what's round it)
    const g = ga(A.pos.x, A.pos.z, A.pos.y, A); if (g != null) A.pos.y = g;
    if (A.M.gait && !A.M.flight && A.attached) {   // (the slope only matters while it's drawn)
      const L = A.M.stats.len ?? 0.6, fx = Math.sin(A.yaw) * L, fz = Math.cos(A.yaw) * L;
      const hf = ga(A.pos.x + fx, A.pos.z + fz, A.pos.y, A), hb = ga(A.pos.x - fx, A.pos.z - fz, A.pos.y, A);
      if (hf != null && hb != null) { A.pitchGoal = Math.max(-0.6, Math.min(0.6, -Math.atan2(hf - hb, 2 * L))); A.pos.y = Math.max(A.pos.y, (hf + hb) / 2 - 0.05); }
    }
  }
  // a leap that lands higher or lower than it took off: the arc is bent to come down on the ground where it lands
  // (not through a hill or a stair, nor floating over a dip)
  function clearLeap(A, mv, reach) {
    const far = mv.keys[mv.keys.length - 1].root[2], eye = { x: A.pos.x, y: A.pos.y + 0.6, z: A.pos.z }, fx = Math.sin(A.yaw), fz = Math.cos(A.yaw);
    for (const k of [1, 0.7, 0.45]) { const d = far * reach * k + 0.5; if (!blocked(eye, { x: eye.x + fx * d, y: eye.y, z: eye.z + fz * d })) return reach * k; }
    return 0;
  }
  function planLanding(A, mv, reach) {
    A.landDy = 0; if (!mv?.lunge || !mv.keepRoot || !shapes.length) return;
    const last = mv.keys[mv.keys.length - 1].root, dz = last[2] * reach, x = A.pos.x + Math.sin(A.yaw) * dz, z = A.pos.z + Math.cos(A.yaw) * dz;
    const g = ga(x, z, A.pos.y + 1.5); if (g != null && Math.abs(g - A.pos.y) < 3) A.landDy = g - A.pos.y;
  }
  // ---- its attacks on you ----
  function strike(A, player, hooks) {
    const act = A.mo.action, mv = act?.def;
    if (!act || !mv) return;
    if (A.hitDone || !mv.hit || !mv.damage || !mv.hitbox || mv.hitbox[0] === 'aura' || act.u < mv.hit[0] || act.u > mv.hit[1]) return;
    const p = player.pos, lo = p.y + 0.25, hi = p.y + player.height - 0.15;
    for (const bn of mv.hitbox) {
      const b = A.C.bones[bn]; if (!b) continue; wp.setFromMatrixPosition(b.matrixWorld);
      const cy = Math.max(lo, Math.min(hi, wp.y)), d = Math.hypot(wp.x - p.x, wp.y - cy, wp.z - p.z);
      if (d > (mv.reach || 0.5) + 0.35) continue;
      A.hitDone = true;
      const dmg = mv.damage * A.k * A.dmgK, bl = hooks.tryBlock?.(A.pos.x - p.x, A.pos.z - p.z, (mv.power || 1) * Math.pow(A.k, 0.3));
      if (bl && A.M.flight) {   // a flyer that hits a raised guard bounces off it and hangs stunned for a moment: your opening
        const r = A.mo.root; A.mo.onCommit?.(r.x, r.z); A.alt = (A.alt || 0) + r.y; A.mo.stop();   // (it stays where the dive had it, not back where it started)
        const bx = A.pos.x - p.x, bz = A.pos.z - p.z, bl2 = Math.hypot(bx, bz) || 1; A.pos.x += bx / bl2 * 0.9; A.pos.z += bz / bl2 * 0.9;
        react(A, 'stagger', bl.deflect ? Math.max(1.4, bl.deflect) : bl.perfect ? 1.4 : 1); A.alt = Math.max(A.alt, -0.6);
        if (bl.through > 0) hooks.hurt?.(dmg * bl.through, A.M.name);
        return;
      }
      if (bl) {
        if (mv.stunOnBlock && !bl.deflect) { react(A, 'stagger', bl.perfect ? mv.stunOnBlock * 1.4 : mv.stunOnBlock); }   // (a claw that hits your guard leaves it stunned)
        else if (bl.deflect) { react(A, 'stagger', bl.deflect); }                         // turned aside: staggered open
        else if (bl.perfect) { A.poise -= A.maxPoise * 0.5; react(A, 'stagger', 0); }   // a perfect block knocks it back
        if (bl.through > 0) hooks.hurt?.(dmg * bl.through, A.M.name);
      } else hooks.hurt?.(dmg, A.M.name);
      return;
    }
  }
  // ======================================================================================================
  // GROUP BRAINS. Every monster belongs to a group (a placed swarm or pack; a lone spawn is a group of one). The group
  // thinks — what it's doing, whether it sees you, where it's going — once for all its members; each member only
  // works out its own small part (its place in the circle, its next attack). Two groups of the same kind that meet
  // (swarms, packs) join into one: more monsters, one brain, so a crowd gets cheaper per head, not dearer.
  //   idle     standing guard / roosting at home (or wandering near it); a swarm hangs high up, circling
  //   patrol   following the placed route (loop or there-and-back), members in loose formation round the leader point
  //   fight    hunting you — a swarm circles you erratically as one mass, changing direction, and members peel off
  //            to swoop; a pack spreads round you and closes, each choosing its moves
  //   return   lost you: back to the route (or home), gathering up whoever's left, then idle/patrol again
  // ======================================================================================================
  const groups = [];
  const JOIN = { swarm: 8, pack: 6 };
  function makeGroup(A, g) {
    const G = g || {};
    if (!G._ready) {
      Object.assign(G, { _ready: true, members: [], liveScratch: [], sepCells: new Map(), sepBucketPool: [], rankScratch: [], M: A.M, kind: A.M.group || 'solo', state: 'idle', center: { x: A.pos.x, y: A.pos.y, z: A.pos.z }, anchor: { x: A.pos.x, z: A.pos.z },
        home: { x: A.pos.x, y: A.pos.y, z: A.pos.z }, seeT: Math.random() * 0.25, seen: false, canSee: false, open: true, awareness: 0, lastKnown: null, investigateT: 0, lost: 0, orbitDir: Math.random() < 0.5 ? 1 : -1, flipT: 1 + Math.random() * 2, attackT: 1, screechT: 4,
        pi: 0, pdir: 1, path: null, mode: 'loop', behaviour: 'stand', awake: false, thinkDt: 0, wander: null, wanderT: 0 });
      const o = G.place;   // a placed group: its route (map coords → world) and what it does when idle
      if (o) { G.behaviour = o.behaviour || 'stand'; G.mode = o.patrolMode || 'loop'; if (G.behaviour === 'patrol' && o.patrol?.length && G.origin) G.path = [{ x: o.x, z: o.z }, ...o.patrol].map(q => ({ x: G.origin.x + q.x, z: G.origin.z + q.z })); }
      groups.push(G);
    }
    if (!G.members.includes(A)) G.members.push(A);
    A.group = G; A.slot = G.members.length - 1; A.phase = Math.random() * Math.PI * 2; A.rad = 0.7 + Math.random() * 0.6;
    return G;
  }
  const alive = G => G.members.filter(m => m.alive);
  // Diminishing returns for group detection: interpolate linearly in log(group size)
  // between the requested calibration points. Solo/duo detection remains the baseline.
  function groupDetectionScale(n) {
    const points = [[2, 1], [4, 1], [10, 1.7], [30, 2.55], [90, 2.805]];
    if (n <= 2) return 1;
    for (let i = 1; i < points.length; i++) {
      const [n1, v1] = points[i - 1], [n2, v2] = points[i];
      if (n <= n2) return v1 + (v2 - v1) * (Math.log(n / n1) / Math.log(n2 / n1));
    }
    // Detection bonus is capped at the largest calibrated group size. Huge swarms must not
    // gain extra vision simply because more members were placed or merged into the group.
    return points[points.length - 1][1];
  }
  function groupThink(G, dt, player) {
    const live = G.members, n = live.length; if (!n) return;
    let cx = 0, cy = 0, cz = 0; for (const m of live) { cx += m.pos.x; cy += m.pos.y; cz += m.pos.z; } G.center.x = cx / n; G.center.y = cy / n; G.center.z = cz / n;
    const A0 = live[0], S = A0.S, M = G.M, p = player.pos, dx = p.x - G.center.x, dz = p.z - G.center.z, dist = Math.hypot(dx, dz);
    G.dist = dist;
    // Detection originates from the nearest living member, not the pack center. This prevents
    // large packs from being effectively blind until the player reaches their middle.
    // One shared scan every 0.25 s keeps the cost bounded even for very large groups.
    if ((G.seeT -= dt) <= 0) {
      G.seeT = 0.25;
      let nearest = null, nearestD2 = Infinity, aliveCount = 0;
      const workerSense = aiMode !== 'main' ? getCreatureSense(G) : null;
      if (workerSense) {
        nearestD2 = workerSense.nearestD2; aliveCount = workerSense.aliveCount;
        nearest = workerSense.nearest ? { pos:workerSense.nearest, M:{hover:workerSense.nearest.hover}, alt:workerSense.nearest.alt } : null;
      } else {
        for (const member of live) {
          if (!member.alive) continue;
          aliveCount++;
          const mx = p.x - member.pos.x, mz = p.z - member.pos.z, d2 = mx * mx + mz * mz;
          if (d2 < nearestD2) { nearestD2 = d2; nearest = member; }
        }
      }
      const detectDist = nearest ? Math.sqrt(nearestD2) : dist;
      const detectSize = groupDetectionScale(aliveCount);
      const ey = nearest ? nearest.pos.y + (nearest.M.hover || 0) + (nearest.alt || 0) + 1.1 : G.center.y + (M.hover || 0) + avgAlt(G) + 0.4;
      const eye = nearest ? { x: nearest.pos.x, y: ey, z: nearest.pos.z } : { x: G.center.x, y: ey, z: G.center.z };
      const chest = { x: p.x, y: p.y + 1.2, z: p.z };
      const range = S.aggro * detectSize * (G.state === 'fight' ? 1.6 : 1), below = ey - (p.y + 1.2);
      const inCone = M.flight ? below > -1.5 : true;
      G.detectDist = detectDist; G.detectSize = detectSize;
      G.open = !blocked(eye, chest);
      G.canSee = detectDist < range * Math.max(0.2, Math.min(1, player.visibility ?? 1)) && inCone && G.open;
      // Swarms use the same final sight test as other groups, including player visibility.
      // Previously this bypassed the visibility multiplier applied inside G.canSee.
      if (G.kind === 'swarm') G.seen = G.canSee;
    }
    if (M.temper === 'passive') {
      if (G.state === 'flee' && (G.fleeT -= dt) <= 0) G.state = 'idle';
      G.seen = false;
    } else if (G.kind === 'swarm') {
      if (G.seen) { if (G.state !== 'fight') { G.state = 'fight'; G.attackT = 0.6 + Math.random() * 0.6; } G.lost = 0; }
      else if (G.state === 'fight' && (G.lost += dt) > 6) { G.state = 'return'; }
    } else {
      // One shared awareness meter per pack. Sight is slowed by the player's visibility; noise can
      // reveal a last-known position through walls, but hearing alone starts an investigation, not combat.
      const visibility = Math.max(0.2, Math.min(1, player.visibility ?? 1));
      const sightRange = S.aggro * (G.state === 'fight' ? 1.6 : 1) * visibility * (G.detectSize || groupDetectionScale(live.length));
      const detectDist = G.detectDist ?? dist;
      const sightRate = G.canSee && detectDist < sightRange ? (1 - detectDist / sightRange) * 1.2 : 0;
      const loudness = Math.max(0, player.loudness || 0), perception = A0.S.perception ?? 1;
      let hearingRange = loudness * perception * (G.detectSize || groupDetectionScale(live.length));
      if (!G.open) hearingRange *= STEALTH.muffled;
      const hearingRate = hearingRange > detectDist ? (1 - detectDist / Math.max(0.01, hearingRange)) * STEALTH.hearRate : 0;
      const signal = sightRate > 0 || hearingRate > 0;
      G.awareness = Math.max(0, Math.min(1, G.awareness + (signal ? (sightRate + hearingRate) * dt : -STEALTH.decay * dt)));
      G.seen = G.canSee && G.awareness >= 1;
      if (signal) {
        if (!G.lastKnown) G.lastKnown = { x: p.x, z: p.z };
        else { G.lastKnown.x = p.x; G.lastKnown.z = p.z; }
        G.investigateT = 0;
      }
      if (G.state === 'fight') {
        if (G.seen) G.lost = 0;
        else if ((G.lost += dt) > 6) { G.state = 'investigate'; G.investigateT = 0; if (G.lastKnown) { G.anchor.x = G.lastKnown.x; G.anchor.z = G.lastKnown.z; } }
      } else if (G.seen) {
        G.state = 'fight'; G.attackT = 0.6 + Math.random() * 0.6; G.lost = 0;
      } else if (G.awareness >= STEALTH.suspicious && G.lastKnown) {
        if (G.state !== 'investigate') G.investigateT = 0;
        G.state = 'investigate'; G.anchor.x = G.lastKnown.x; G.anchor.z = G.lastKnown.z;
      } else if (G.state === 'investigate') {
        G.investigateT += dt;
        if (G.investigateT > 5 || Math.hypot(G.center.x - G.anchor.x, G.center.z - G.anchor.z) < 2.5) {
          G.state = 'idle'; G.awareness = Math.min(G.awareness, STEALTH.suspicious - 0.01);
        }
      }
    }
    // erratic circling: the whole swarm swings round the other way every second or two
    if ((G.flipT -= dt) <= 0) { G.flipT = 0.8 + Math.random() * 2.2; if (Math.random() < 0.6) G.orbitDir *= -1; }
    // where the group is heading when not fighting: home, its route, or back to it
    if (G.state === 'return') {
      const to = G.path ? nearestOnPath(G) : G.home; G.anchor.x = to.x; G.anchor.z = to.z;
      if (Math.hypot(G.center.x - to.x, G.center.z - to.z) < 2.5) G.state = 'idle';
    } else if (G.state === 'idle') {
      if (G.path) {   // walk the anchor along the route at an easy pace
        const t = G.path[G.pi], ax = t.x - G.anchor.x, az = t.z - G.anchor.z, l = Math.hypot(ax, az), v = S.speed * 0.35 * dt;
        if (l < 0.3) { if (G.mode === 'back') { if (G.pi + G.pdir >= G.path.length || G.pi + G.pdir < 0) G.pdir *= -1; G.pi += G.pdir; } else G.pi = (G.pi + 1) % G.path.length; }
        else if (Math.hypot(G.center.x - G.anchor.x, G.center.z - G.anchor.z) < 3) { G.anchor.x += ax / l * Math.min(l, v); G.anchor.z += az / l * Math.min(l, v); }   // (it waits for stragglers)
      } else if (G.behaviour === 'wander' || (M.temper === 'passive' && G.behaviour === 'stand')) {   // (grazing animals drift about)
        if ((G.wanderT -= dt) <= 0) { G.wanderT = 3 + Math.random() * 4; const a = Math.random() * Math.PI * 2, r = Math.random() * 4; G.anchor.x = G.home.x + Math.cos(a) * r; G.anchor.z = G.home.z + Math.sin(a) * r; }
      } else { G.anchor.x = G.home.x; G.anchor.z = G.home.z; }
    }
    // a big swarm stacks into layers of ~20 — a circling tower: the lowest layer attacks, the rest wheel above, and
    // as the bottom ones fall the next ones drop down to take their place
    // (only for monsters whose data asks for it — `tower` in src/data/monsters.js: bats; a rat swarm won't stack)
    // Three bands (only for monsters with `tower` — bats): 1 the attacking band, the only one with a brain; 2 a circling
    // band above it, purely for show; 3 the reserve, higher, wheeling the other way, also for show (only `show` of
    // them drawn). As attackers fall, the next in line drop down a band and take their places.
    if (G.kind === 'swarm') {
      const T = M.tower, a = T?.attack ?? Infinity, c = a + (T?.circle ?? 0), sh = c + (T?.show ?? Infinity); let r = 0, b = 0;
      for (const m of live) if (m.alive) { m.layer = r < a ? 0 : r < c ? 1 : 2; m.shown = r < sh; r++; if (m.mo.actName === 'swoop') b++; }
      G.alive = r; G.per = a; G.busy = b;
    }   // (busy: how many are diving — counted once here for the whole swarm)
    if (G.kind !== 'swarm' && G.state === 'fight') packThink(G, dt, player);
    G.screechT -= dt; G.attackT -= dt; G.rangedT = (G.rangedT ?? 1) - dt;
  }
  // a pack in a fight: who attacks next, keeping apart, and who gets full detail
  function packThink(G, dt, player) {
    const live = G.liveScratch || (G.liveScratch = []); live.length = 0; for (const m of G.members) if (m.alive) live.push(m); const n = live.length, p = player.pos;
    if (G.postBase == null) G.postBase = Math.random() * Math.PI * 2;
    // attack turns: one at a time for a small pack, up to three for a big one, the nearest free one goes
    let attackers = 0; for (const m of live) if (m.attacking || (m.mo.actName && m.mo.actName !== 'shadowBullet' && m.mo.actName !== 'stagger')) attackers++;
    if (G.attackT <= 0 && attackers < Math.min(3, 1 + Math.floor(n / 6))) {
      let best = null, bd = Infinity;
      for (const m of live) { if (m.attacking || m.mo.actName || m.stunT > 0) continue; const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bd) { bd = d; best = m; } }
      if (best) { best.attacking = true; best.attackGive = 3.5; G.attackT = (1.4 + Math.random() * 1.2) / (1 + n * 0.1); }
    }
    // keeping apart (in what they aim for, not by pushing bodies): a few times a second, each steers off any packmate
    // within 1.8 m; and who's nearest gets full detail (the rest a step or two down: see the tiers)
    if ((G.sepT = (G.sepT ?? 0) - dt) <= 0) {
      G.sepT = 0.2;
      for (const m of live) { m.sepX = 0; m.sepZ = 0; }
      // Spatial buckets avoid comparing every pair in a large pack. At 90 fiends this checks nearby
      // neighbors only instead of all 4,005 possible pairs, while preserving the same 1.8 m separation rule.
      const cellSize = 2, cells = G.sepCells || (G.sepCells = new Map()), pool = G.sepBucketPool || (G.sepBucketPool = []), cellKey = (x, z) => `${x},${z}`;
      cells.clear(); for (const bucket of pool) bucket.length = 0; let usedBuckets = 0;
      for (let i = 0; i < n; i++) {
        const m = live[i], cx = Math.floor(m.pos.x / cellSize), cz = Math.floor(m.pos.z / cellSize), key = cellKey(cx, cz);
        let bucket = cells.get(key);
        if (!bucket) { bucket = pool[usedBuckets] || (pool[usedBuckets] = []); usedBuckets++; cells.set(key, bucket); }
        bucket.push(m);
      }
      for (const [key, bucket] of cells) {
        const comma = key.indexOf(','), cx = Number(key.slice(0, comma)), cz = Number(key.slice(comma + 1));
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const other = cells.get(cellKey(cx + ox, cz + oz)); if (!other) continue;
          for (const A of bucket) for (const B of other) {
            if (A === B || A.slot >= B.slot) continue;
            const dx = A.pos.x - B.pos.x, dz = A.pos.z - B.pos.z, d2 = dx * dx + dz * dz;
            if (d2 > 3.24 || d2 < 1e-6) continue; const d = Math.sqrt(d2), k = (1.8 - d) / d * 1.5;
            A.sepX += dx * k; A.sepZ += dz * k; B.sepX -= dx * k; B.sepZ -= dz * k;
          }
        }
      }
      const byD = G.rankScratch || (G.rankScratch = []); byD.length = 0;
      for (const m of live) { m._rankDist2 = (m.pos.x - p.x) ** 2 + (m.pos.z - p.z) ** 2; byD.push(m); }
      byD.sort((a, b) => a._rankDist2 - b._rankDist2);
      byD.forEach((m, r) => { m.rank = r; });
    }
  }
  const avgAlt = G => { let a = 0; for (const m of G.members) a += m.alt || 0; return a / Math.max(1, G.members.length); };
  function nearestOnPath(G) { let best = G.path[0], bd = Infinity, bi = 0; G.path.forEach((q, i) => { const d = Math.hypot(q.x - G.center.x, q.z - G.center.z); if (d < bd) { bd = d; best = q; bi = i; } }); G.pi = bi; return best; }
  // joining: two groups of the same monster that meet become one
  let joinT = 0;
  function joinGroups() {
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      const A = groups[a], B = groups[b]; if (A.M !== B.M || !JOIN[A.kind] || !A.members.length || !B.members.length) continue;
      if (!(A.awake || B.awake)) continue;
      if (Math.hypot(A.center.x - B.center.x, A.center.z - B.center.z) > JOIN[A.kind]) continue;
      if (A.state === 'idle' && B.state === 'idle' && !A.path === !B.path && (A.path || B.path)) continue;   // (two patrols crossing keep their own routes)
      const [big, small] = A.members.length >= B.members.length ? [A, B] : [B, A];
      for (const m of small.members) { big.members.push(m); m.group = big; m.slot = big.members.length - 1; }
      small.members.length = 0; if (small.state === 'fight') { big.state = 'fight'; big.lost = 0; } if (!big.path && small.path) { big.path = small.path; big.mode = small.mode; }
    }
    for (let i = groups.length - 1; i >= 0; i--) if (!groups[i].members.length) groups.splice(i, 1);
  }
  // ---- a member's part ----
  function turnTo(A, want, dt, rate) { const turn = ((want - A.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; A.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * rate); return turn; }
  function stepToward(A, tx, tz, speed, dt, face = true) {
    if (!A.M.flight) return walkTo(A, tx, tz, speed, dt);
    const dx = tx - A.pos.x, dz = tz - A.pos.z, l = Math.hypot(dx, dz); if (l < 0.15) return 0;
    const v = Math.min(l, speed * dt) * (A.slowT > 0 ? A.slowK : 1), fx = dx / l, fz = dz / l, nx = A.pos.x + fx * v, nz = A.pos.z + fz * v;
    if (face) turnTo(A, Math.atan2(dx, dz), dt, 5);
    if (!A.M.flight) { if ((A.wallT = (A.wallT || 0) - dt) <= 0) { A.wallT = 0.2; A.wall = blocked({ x: A.pos.x, y: A.pos.y + 0.5, z: A.pos.z }, { x: nx + fx * 0.8, y: A.pos.y + 0.5, z: nz + fz * 0.8 }); } if (A.wall) return 0; }
    A.pos.x = nx; A.pos.z = nz; return v / dt;
  }
  // a walker's way of moving: it can only go the way it faces, so it turns into a new direction (sharper turns slow
  // it down), builds speed and sheds it with some momentum — no strafing backwards away from you. A target behind it
  // means stopping, wheeling round, then running.
  function walkTo(A, tx, tz, speed, dt) {
    const dx = tx - A.pos.x, dz = tz - A.pos.z, l = Math.hypot(dx, dz);
    let want = l > 0.25 ? Math.atan2(dx, dz) : A.yaw;
    if (A.detourT > 0) { A.detourT -= dt; want = A.detour; }                       // (going round something in the way)
    const v0 = A.v || 0, turnRate = 6.5 - 3.5 * Math.min(1, v0 / Math.max(1, speed));   // (slow: spins on the spot; at a run: wide turns)
    const err = l > 0.25 ? turnTo(A, want, dt, turnRate) : 0;
    const brake = Math.min(1, l / Math.max(0.5, v0 * v0 / 16 + 0.3));              // (eases off as it arrives)
    const goal = l > 0.25 ? speed * Math.max(0, Math.cos(err)) ** 2 * brake * (A.slowT > 0 ? A.slowK : 1) : 0;
    A.v = v0 + Math.sign(goal - v0) * Math.min(Math.abs(goal - v0), dt * (goal > v0 ? 9 : 14));
    if (A.v < 0.01) { A.v = 0; return 0; }
    const fx = Math.sin(A.yaw), fz = Math.cos(A.yaw), step = A.v * dt;
    // walls, trees, crates: the body is kept out of them (nearby shapes only), and if it's walking into one it picks a
    // way round — a few directions either side, the first clear one, held for a moment
    const r = settle(A, A.pos.x + fx * step, A.pos.z + fz * step), moved = Math.hypot(r.x - A.pos.x, r.z - A.pos.z);
    A.pos.x = r.x; A.pos.z = r.z;
    if (r.hit && moved < step * 0.5 && !(A.detourT > 0)) {
      const eye = { x: A.pos.x, y: A.pos.y + 0.5, z: A.pos.z }, base = l > 0.25 ? Math.atan2(dx, dz) : A.yaw;
      for (const o of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) { const a = base + o * (A.slot % 2 ? -1 : 1); if (!blocked(eye, { x: eye.x + Math.sin(a) * 2, y: eye.y, z: eye.z + Math.cos(a) * 2 })) { A.detour = a; A.detourT = 0.8; break; } }
      A.v *= 0.6;
    }
    // stuck (barely getting anywhere for a while): give up on that spot and choose another
    A.stuckT = moved < step * 0.3 ? (A.stuckT || 0) + dt : Math.max(0, (A.stuckT || 0) - dt * 2);
    if (A.stuckT > 1.5) { A.stuckT = 0; A.postT = 0; A.attacking = false; A.detourT = 0; }
    return moved / dt;
  }
  // out of any wall at this spot (a body ~0.45 m round, standing ~1.2 m tall)
  // (the shapes round it are fetched a few times a second — 2.5 m about — not every step; boxes only, not the ground's columns under it)
  function settle(A, x, z) {
    if (!A.nearSh || (A.nearT = (A.nearT || 0) - 1) <= 0 || Math.abs(x - A.nearX) + Math.abs(z - A.nearZ) > 1.5) {
      A.nearT = 15; A.nearX = x; A.nearZ = z; const y0 = A.pos.y + 0.3, y1 = A.pos.y + 1.2;
      const found = near({ x: x - 2.5, z: z - 2.5 }, { x: x + 2.5, z: z + 2.5 });
      const ground = A.groundSh || (A.groundSh = []); ground.length = 0;
      for (const s of found) if (s.min && s.max[0] > x - 2.5 && s.min[0] < x + 2.5 && s.max[2] > z - 2.5 && s.max[2] < z + 2.5) ground.push(s);   // nearby shapes, including ground
      const nearSh = A.nearSh || (A.nearSh = []); nearSh.length = 0;
      for (const s of ground) if (s.max[1] > y0 && s.min[1] < y1) nearSh.push(s);
    }
    return resolveWalls(A.nearSh, x, z, A.pos.y, 1.2, Math.min(0.5, A.S.radius || 0.45));
  }
  function memberThink(A, dt, player) {
    const G = A.group, M = A.M, S = A.S, p = player.pos, dx = p.x - A.pos.x, dz = p.z - A.pos.z, dist = Math.hypot(dx, dz);
    for (const k in A.cool) A.cool[k] -= dt;
    A.state = G.state === 'fight' ? 'fight' : G.state === 'return' ? 'home' : 'idle';
    const swarm = G.kind === 'swarm', roost = M.roost ?? 0;
    if (A.mo.actName) { A.v = 0; return 0; }                         // in a move: its own root motion
    if (A.stunT > 0) { A.mo.play('stagger'); return 0; }
    const n = G.members.length, k = A.slot / Math.max(1, n);
    if (G.state === 'fight') {
      if (swarm) {
        // circle you: each bat its own place in the ring, the whole ring turning one way, then the other
        const L = A.layer || 0;
        if (L) {   // bands 2 and 3: for show — a ring above you, the reserve higher and wider turning the other way; no brain
          const dir = L === 1 ? G.orbitDir : -G.orbitDir;
          A.phase += dir * dt * (L === 1 ? 0.9 : 0.6) * (0.85 + 0.3 * A.rad);
          const rr = (L === 1 ? 5.5 : 8) + 2 * A.rad, tx = p.x + Math.cos(A.phase) * rr, tz = p.z + Math.sin(A.phase) * rr;
          A.altGoal = (L === 1 ? 3.6 : 6.5) + 0.6 * Math.sin(A.phase * 1.7 + A.slot);
          const ddx = tx - A.pos.x, ddz = tz - A.pos.z, l = Math.hypot(ddx, ddz), v = Math.min(l, S.speed * 1.3 * dt);
          if (l > 0.01) { A.pos.x += ddx / l * v; A.pos.z += ddz / l * v; A.yaw = Math.atan2(ddx, ddz); }
          return v / dt;
        }
        A.phase += G.orbitDir * dt * (1.1 + 0.4 * Math.sin(A.slot * 1.7));
        const r = (3 + 2.2 * A.rad) * (0.85 + 0.15 * Math.sin(A.phase * 2.3 + A.slot)), tx = p.x + Math.cos(A.phase) * r, tz = p.z + Math.sin(A.phase) * r;
        A.altGoal = 0.2 + 1.3 * (0.5 + 0.5 * Math.sin(A.phase * 1.3 + A.slot * 0.9));
        const sp = stepToward(A, tx, tz, S.speed * 1.15, dt, dist > 7);
        if (dist <= 7) turnTo(A, Math.atan2(dx, dz) + G.orbitDir * 1.2, dt, 4);   // (banking round you, side-on)
        // the group sends one in at a time (a few at most), close and low enough to strike
        const busy = G.busy || 0;   // (only those diving: a stunned one doesn't hold the next back)
        if (!L && G.attackT <= 0 && busy < Math.min(8, 1 + Math.floor((G.alive || n) / 5)) && dist > 2.2 && dist < 6.5 && (A.alt || 0) < 1.2 && Math.random() < 0.5) {
          const mv = M.moves.swoop;
          if (mv && !(A.cool.swoop > 0)) {
            A.yaw = Math.atan2(dx, dz); const reach = Math.max(mv.lunge.min, Math.min(mv.lunge.max, (dist - mv.lunge.stop) / mv.lunge.travel));
            A.mo.play('swoop', { reach }); A.hitDone = false; A.cool.swoop = mv.cooldown * (0.8 + Math.random() * 0.6) / Math.max(1, (G.alive || n) / Math.min(G.per || 20, 40)); G.attackT = (0.9 + Math.random() * 0.6) / (1 + (G.alive || n) * 0.15); return 0;   // (the whole swarm's rate, carried by the bottom layer: each of them comes round faster)   // (the bigger the swarm, the faster they come: 8 bats ~every 0.6 s, 24 ~every 0.3 s)
          }
        }
        if (!L && G.screechT <= 0 && dist < 4.5 && M.moves.screech && !(A.cool.screech > 0) && Math.random() < 0.02) { A.yaw = Math.atan2(dx, dz); A.mo.play('screech'); A.hitDone = false; A.cool.screech = 9; G.screechT = 7 + Math.random() * 5; return 0; }
        return sp;
      }
      // a PACK hunts like ambush predators: each takes a post round you (spread out, at 5–9 m), holds it watching you,
      // shifts to a new one now and then; the pack hands out attacks one or two at a time — that one goes in fast
      // (a leap, a leaping claw, a bite), the rest wait their turn or spit a shadow bullet from their posts
      const want = Math.atan2(dx, dz), facing = Math.abs(((want - A.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.45;
      if (A.attacking) {
        if ((A.attackGive -= dt) <= 0) { A.attacking = false; return 0; }   // (couldn't get its strike in: back to a post)
        turnTo(A, want, dt, 5);
        const opts = (M._melee ??= Object.entries(M.moves || {}).filter(([, mv]) => mv.range && mv.melee !== false && mv.range[1] < 6)).filter(([nm, mv]) => dist >= mv.range[0] && dist <= mv.range[1] && !(A.cool[nm] > 0));
        if (opts.length && facing) {
          const [nm, mv] = opts[Math.floor(Math.random() * opts.length)];
          let reach = mv.lunge ? Math.max(mv.lunge.min ?? 0.6, Math.min(mv.lunge.max ?? 2.5, (dist - (mv.lunge.stop ?? 0.5)) / mv.lunge.travel)) : 1;
          if (mv.keepRoot) reach = clearLeap(A, mv, reach);   // (not through a wall: shorter, or not at all)
          if (reach > 0) { planLanding(A, mv, reach); A.mo.play(nm, { reach }); A.cool[nm] = (mv.cooldown || 2) * (0.8 + Math.random() * 0.4); A.hitDone = false; A.attacking = false; return 0; }
        }
        const a = Math.atan2(-dx, -dz), rr = Math.max(2.2, Math.min(dist - 0.6, 3.5));   // close to striking distance (pounce range)
        return stepToward(A, p.x + Math.sin(a) * rr, p.z + Math.cos(a) * rr, S.speed * 1.15, dt, false);
      }
      // its post: an angle round you (its share of the circle, nudged now and then) and a distance; kept off the others
      if ((A.postT = (A.postT || 0) - dt) <= 0 || A.postA == null) {
        A.postT = 2 + Math.random() * 2.5;
        const share = (A.slot / Math.max(1, n)) * Math.PI * 2 + G.postBase;
        // a post you can see from where you stand (not inside a house or behind a tree): a few tries round its share
        const chest = { x: p.x, y: p.y + 0.8, z: p.z };
        for (let t = 0; t < 5; t++) {
          A.postA = share + (Math.random() - 0.5) * (Math.PI * 2 / Math.max(3, n)) * (0.8 + t * 0.5); A.postR = 5 + Math.random() * 4;
          if (!blocked(chest, { x: p.x + Math.sin(A.postA) * A.postR, y: p.y + 0.8, z: p.z + Math.cos(A.postA) * A.postR })) break;
        }
      }
      let tx = p.x + Math.sin(A.postA) * A.postR, tz = p.z + Math.cos(A.postA) * A.postR;
      tx += A.sepX || 0; tz += A.sepZ || 0;
      const away = Math.hypot(tx - A.pos.x, tz - A.pos.z);
      let sp = 0;
      if (away > 0.6) sp = stepToward(A, tx, tz, S.speed * (away > 3 ? 1 : 0.55), dt);   // (running to a far post, prowling to a near one)
      else sp = walkTo(A, A.pos.x, A.pos.z, 0, dt);                                     // (at its post: comes to a stop...)
      if (away <= 0.6 && (A.v || 0) < 0.3) turnTo(A, want, dt, 3);                    // (...then turns to watch you — never walking one way while facing another)
      // from its post, now and then, a shadow bullet (the pack takes turns)
      const sb = M.moves.shadowBullet;
      if (sb && G.rangedT <= 0 && away < 2 && facing && dist >= sb.range[0] && dist <= sb.range[1] && !(A.cool.shadowBullet > 0) && Math.random() < 0.05) {
        A.mo.play('shadowBullet'); A.cool.shadowBullet = sb.cooldown; A.hitDone = false; G.rangedT = (2.2 + Math.random() * 1.8) / Math.sqrt(Math.max(1, n / 2)); return 0;
      }
      return sp;
    }
    if (G.state === 'flee') {   // an animal running from you: away, at full tilt
      const f = G.from || player.pos, ax = A.pos.x - f.x, az = A.pos.z - f.z, l = Math.hypot(ax, az) || 1;
      return stepToward(A, A.pos.x + ax / l * 8, A.pos.z + az / l * 8, S.speed * 1.25, dt);
    }
    // idle / patrol / return: a loose ring round the group's anchor (a swarm high up, circling slowly)
    const a = swarm ? A.phase += dt * 0.6 * G.orbitDir : A.slot * 2.39996, r = swarm ? 1.5 + 2 * A.rad : (n > 1 ? 0.9 + 0.5 * Math.sqrt(A.slot) : 0);
    A.altGoal = swarm ? roost * (0.8 + 0.3 * Math.sin(A.phase * 0.7 + A.slot)) : 0;
    const sp = G.state === 'return' ? S.speed * 0.8 : swarm ? S.speed * 0.6 : S.speed * 0.4;
    return stepToward(A, G.anchor.x + Math.cos(a) * r, G.anchor.z + Math.sin(a) * r, sp, dt, true) * (swarm ? 0.3 : 1);
  }
  const frustum = new THREE.Frustum(), pmat = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 3); let frameN = 0;
  const nearTargets = [], barCand = [], barShown = new Set();
  const VIS = 55, WAKE = 70;
  // One shared, soft contact-shadow batch for every creature: no shadow maps and one draw call.
  const shadowSize = 32, shadowPixels = new Uint8Array(shadowSize * shadowSize * 4);
  const shadowWorld = new THREE.Vector3();
  for (let y = 0; y < shadowSize; y++) for (let x = 0; x < shadowSize; x++) {
    const dx = (x + 0.5) / shadowSize * 2 - 1, dz = (y + 0.5) / shadowSize * 2 - 1;
    const r = Math.sqrt(dx * dx + dz * dz), a = Math.max(0, 1 - r);
    const i = (y * shadowSize + x) * 4;
    // Black texels make the shadow unambiguously dark in r128; only alpha carries the soft edge.
    shadowPixels[i] = shadowPixels[i + 1] = shadowPixels[i + 2] = 0;
    shadowPixels[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
  }
  const shadowTexture = new THREE.DataTexture(shadowPixels, shadowSize, shadowSize, THREE.RGBAFormat);
  shadowTexture.needsUpdate = true; shadowTexture.magFilter = THREE.LinearFilter; shadowTexture.minFilter = THREE.LinearFilter; shadowTexture.generateMipmaps = false;
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const shadowBatch = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, 4096);
  shadowBatch.name = 'creature-contact-shadows'; shadowBatch.count = 0; shadowBatch.frustumCulled = false; shadowBatch.renderOrder = 1;
  scene.add(shadowBatch);
  const shadowDummy = new THREE.Object3D();
  function updateCreatureShadows(player) {
    let count = 0;
    for (const A of actors) {
      if (!A.alive || !A.attached || count >= shadowBatch.instanceMatrix.count) continue;
      const dx = A.pos.x - player.pos.x, dz = A.pos.z - player.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > VIS * VIS) continue;
      // Read the animated root bone, not A.pos: lunges/jumps translate the pose before
      // actor root motion is committed back into A.pos at the end of the move.
      A.C.bones.root.getWorldPosition(shadowWorld);
      const groundY = A.pos.y + 0.025;
      const lift = Math.max(0, shadowWorld.y - A.pos.y);
      const radius = Math.max(0.32, Math.min(1.35, (A.M.stats.radius || 0.5) * 1.35));
      const spread = 1 + Math.min(2.5, lift * 0.22);
      shadowDummy.position.set(shadowWorld.x, groundY, shadowWorld.z);
      shadowDummy.rotation.set(-Math.PI / 2, 0, 0);
      shadowDummy.scale.set(radius * 2.4 * spread, radius * 1.65 * spread, 1);
      shadowDummy.updateMatrix(); shadowBatch.setMatrixAt(count, shadowDummy.matrix);
      count++;
    }
    shadowBatch.count = count;
    shadowBatch.instanceMatrix.needsUpdate = true;
    if (shadowBatch.instanceColor) shadowBatch.instanceColor.needsUpdate = true;
  }   // drawn within VIS m (and on screen); a group thinks every frame within WAKE m or while fighting
  function attach(A, on) { if (A.attached === on) return; A.attached = on; if (on) scene.add(A.C.root); else scene.remove(A.C.root); A.C.setPartsVisible?.(on); if (on) A.C.sync(); }
  function dispatchPresentationPlan(snapshot, player) {
    const shouldUseWorker = presentationMode === 'worker' || (presentationMode === 'auto' && actors.length >= 4);
    if (!snapshot.length) return;
    if (!shouldUseWorker) {
      if (presentationMode === 'auto') reportProcess('npc-presentation-queue', { label:'NPC presentation planner', kind:'worker', status:'idle', task:`Auto threshold not reached · ${actors.length}/4 active creatures` });
      return;
    }
    if (!sharedPool) { ensurePresentationPool(); return; }
    const now = performance.now();
    if (presentationPending || now - presentationLastDispatch < 80) {
      const snap = sharedPool.snapshot();
      reportProcess('npc-presentation-queue', { label:'NPC presentation planner', kind:'worker', status:presentationPending?'busy':'idle', queued:snap.queued, workerMs:presentationWorkerMs, task:'Mesh LOD · animation cadence · effects · CPU '+presentationWorkerMs.toFixed(2)+' ms / queue '+presentationQueueMs.toFixed(2)+' ms / transfer '+presentationDispatchMs.toFixed(2)+' ms' });
      syncSharedWorkerProcesses(snap);
      return;
    }
    presentationPending = true; presentationPendingSince = now; presentationLastDispatch = now; presentationDispatchCount++; presentationLastError = ''; const batchStartedAt = now;
    const generation = presentationGeneration, sequence = ++presentationSequence;
    const playerAt = { x:player.pos.x, z:player.pos.z };
    const chunkSize = Math.max(1, Math.ceil(snapshot.length / SHARED_WORKERS));
    const chunks = [];
    for (let i = 0; i < snapshot.length; i += chunkSize) chunks.push(snapshot.slice(i, i + chunkSize));
    reportProcess('shared-worker-queue', { label:'Shared worker scheduler', kind:'worker', status:'busy', queued:(sharedPool.snapshot().queued||0)+chunks.length, task:'Creature presentation · '+snapshot.length+' actors' });
    reportProcess('npc-presentation-queue', { label:'NPC presentation planner', kind:'worker', status:'busy', queued:chunks.length, workerMs:presentationWorkerMs, task:'Computing creature mesh LOD and animation/effect budgets · CPU '+presentationWorkerMs.toFixed(2)+' ms' });
    Promise.all(chunks.map(actors => sharedPool.run('npc-presentation-plan', { generation, sequence, actors }))).then(results => {
      if (generation !== presentationGeneration || results.some(result => result.generation !== generation || result.sequence !== sequence)) return;
      presentationWorkerMs = results.reduce((n, result) => n + (result.__timing?.workerMs || 0), 0); presentationQueueMs = Math.max(0, ...results.map(result => result.__timing?.queueMs || 0)); presentationDispatchMs = results.reduce((n, result) => n + (result.__timing?.dispatchMs || 0), 0); presentationRoundTripMs = Math.max(0, ...results.map(result => result.__timing?.roundTripMs || 0));
      presentationLastError = '';
      presentationPlans = new Map(results.flatMap(result => result.plans || []).map(plan => [plan.id, plan]));
      presentationPlanAt = performance.now(); presentationPlayerAt = playerAt;
    }).catch(error => {
      presentationLastError = error?.message || 'Presentation task failed';
      reportProcess('npc-presentation-queue', { label:'NPC presentation planner', kind:'worker', status:'error', task:error?.message || 'Presentation task failed' });
      if (presentationMode === 'auto') setPresentationMode('main');
    }).finally(() => { if (generation === presentationGeneration) { presentationBatchMs = performance.now() - batchStartedAt; presentationPending = false; presentationPendingSince = 0; const snap=sharedPool?.snapshot?.(); if(snap) { syncSharedWorkerProcesses(snap); reportProcess('npc-presentation-queue', { label:'NPC presentation planner', kind:'worker', status:presentationLastError?'error':'idle', queued:snap.queued, workerMs:presentationWorkerMs, task:(presentationLastError||'Plan ready')+' · '+presentationDispatchCount+' batches · CPU '+presentationWorkerMs.toFixed(2)+' ms · max queue '+presentationQueueMs.toFixed(2)+' ms · batch '+presentationBatchMs.toFixed(2)+' ms'}); } } });
    const snap = sharedPool.snapshot();
    snap.workers.forEach(w => reportProcess('shared-worker-'+w.id, { label:'Shared worker '+w.id, kind:'worker', status:w.busy?'busy':'idle', task:w.task || (w.lastTask ? 'Idle · last task: '+w.lastTask : 'Idle · no task assigned'), workerMs:presentationWorkerMs }));
  }
  let lastUpdateTelemetry = { updateMs:0, total:0, alive:0, dead:0, awakeGroups:0, awakeActors:0, attached:0, withinRenderRange:0, visible:0, presentationBatchSize:0 };
  function update(dt, player, hooks = {}) {
    const updateStartedAt = performance.now();
    frameN++; if (hooks.ear) { pmat.multiplyMatrices(hooks.ear.projectionMatrix, hooks.ear.matrixWorldInverse); frustum.setFromProjectionMatrix(pmat); }
    // shadow bullets in flight
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i], a = s.m.position.clone(); s.age += dt; s.m.position.addScaledVector(s.dir, s.speed * dt); if (s.m.material.uniforms) s.m.material.uniforms.uT.value += dt;
      const p = player.pos, c = s.m.position, cy = Math.max(p.y + 0.3, Math.min(p.y + player.height - 0.1, c.y)), hitMe = Math.hypot(c.x - p.x, c.y - cy, c.z - p.z) < 0.4 + s.size;
      let gone = s.age > 3 || blocked(a, c);
      if (!gone && hitMe) {
        const bl = hooks.tryBlock?.(-s.dir.x, -s.dir.z, s.power);
        if (bl) { if (bl.through > 0) hooks.hurt?.(s.dmg * bl.through, `${s.who}'s shadow bullet`); } else hooks.hurt?.(s.dmg, `${s.who}'s shadow bullet`);
        gone = true; if (audio) audio.monster('shotHit', 0.9, 0);
      }
      if (gone) { s.m.parent?.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); shots.splice(i, 1); }
    }
    // the groups: who's awake, what each is doing, who joins whom
    const aiStartedAt = performance.now();
    dispatchCreatureSense(player);
    const senseDispatchMs = performance.now() - aiStartedAt;
    const groupStartedAt = performance.now();
    for (const G of groups) {
      const d = Math.hypot(G.center.x - player.pos.x, G.center.z - player.pos.z);
      G.awake = d < WAKE || G.state === 'fight' || G.state === 'return' || G.state === 'flee' || G.state === 'investigate';
      G.thinkDt += dt;
      if (G.awake || G.thinkDt > 1) { groupThink(G, G.thinkDt, player); G.thinkDt = 0; }
    }
    if ((joinT -= dt) <= 0) { joinT = 0.5; joinGroups(); }
    const groupThinkMs = performance.now() - groupStartedAt;
    const actorLoopStartedAt = performance.now();
    nearTargets.length = 0; barCand.length = 0; batSwarm.beginFrame();
    // Presentation plans are rate-limited to 80 ms. Only allocate the 450-actor worker snapshot when a dispatch can actually happen.
    const collectPresentationSnapshot = presentationMode !== 'main' && actors.length >= 4 && !presentationPending && performance.now() - presentationLastDispatch >= 80;
    const visualSnapshots = [];
    // Sample one actor in sixteen to estimate expensive sub-stages without calling performance.now() for every actor.
    const actorStageMs = { visibility:0, behavior:0, ground:0, poseAndScene:0, combatAndAudio:0, sampledActors:0 };
    for (let i = actors.length - 1; i >= 0; i--) {
      const A = actors[i], sampleActor = (i & 15) === 0; A.player = player; A.hooks = hooks;
      if (sampleActor) actorStageMs.sampledActors++;
      if (!A.alive && A.corpse) {   // a body to harvest: it falls on its side and lies there — until skinned, or you're far away
        const K = A.corpse; K.t += dt; attach(A, true);
        if (K.t < 1.2) { const f = Math.min(1, K.t / 0.9), e = f * f * (3 - 2 * f); A.mo.update(dt, { speed: 0, ik: false }); placeBody(A); A.C.root.rotation.z = K.side * e * Math.PI / 2; A.C.root.position.y += e * (A.M.stats.radius || 0.5) * 0.42; A.C.sync(); }   // (lifted by its girth, so it lies on the ground, not in it)
        const far = Math.hypot(A.pos.x - player.pos.x, A.pos.z - player.pos.z) > VIS + 10;
        if (K.harvested || far) { attach(A, false); if (A.barOn) scene.remove(A.bar.sp); A.C.dispose(); actors.splice(i, 1); targets.splice(targets.indexOf(A.target), 1); const G = A.group; if (G) G.members.splice(G.members.indexOf(A), 1); }
        continue;
      }
      if (!A.alive) {   // dissolving: it sinks and thins away
        A.dead += dt; attach(A, true); A.mo.update(dt, { speed: 0 }); A.C.uniforms.uSmoke.value = Math.max(0, 0.7 - A.dead * 0.5);
        A.C.root.position.y -= dt * 0.35; A.C.root.scale.multiplyScalar(1 - dt * 0.45); A.C.sync();
        if (A.dead > 2.2) { attach(A, false); if (A.barOn) scene.remove(A.bar.sp); A.C.dispose(); actors.splice(i, 1); targets.splice(targets.indexOf(A.target), 1); const G = A.group; if (G) G.members.splice(G.members.indexOf(A), 1); }
        continue;
      }
      const G = A.group;
      // a sleeping group's members cost nothing at all: not in the scene, not moved, not animated
      if (!G.awake) { attach(A, false); if (A.C.puffs) A.C.puffs.sleep = true; if (A.barOn) { scene.remove(A.bar.sp); A.barOn = false; } continue; }
      if (A.stunT > 0) A.stunT -= dt; if (A.slowT > 0) A.slowT -= dt;
      if (A.bleed) { A.bleed.t -= dt; A.bleed.tick += dt; if (A.bleed.tick >= 1) { A.bleed.tick -= 1; hitActor(A, A.bleed.dps, { type: 'bleed' }); } if (A.bleed && A.bleed.t <= 0) A.bleed = null; if (!A.alive) continue; }
      A.poise = Math.min(A.maxPoise, A.poise + A.maxPoise * 0.12 * dt);
      // ---- detail tiers ----
      //   0 engaged and close (or mid-attack): everything, every frame
      //   1 on screen within 35 m: other monsters animate every 2nd frame (feet only within 15 m)
      //   2 on screen, 35–55 m: other monsters animate every 6th frame, a trickle of smoke
      //   3 off screen or past 55 m: taken out of the scene (no draw, no matrix walk, no smoke), not animated
      const visibilityStartedAt = sampleActor ? performance.now() : 0;
      const d = Math.hypot(A.pos.x - player.pos.x, A.pos.z - player.pos.z), fighting = G.state === 'fight';
      sph.center.set(A.pos.x, A.pos.y + 1 + (A.alt || 0), A.pos.z); const on = !hooks.ear || frustum.intersectsSphere(sph);
      const presentation = getPresentationPlan(A, player);
      let tier;
      if (presentation) tier = presentation.tier;
      else {
        // Only nearby fighters need full-rate idle/combat pose work; active moves stay full-rate up to 30 m.
        tier = A.mo.actName && d < 30 ? 0 : !on || d > VIS ? 3 : fighting && d < 15 ? 0 : d < 35 ? 1 : 2;
        // Editor-placed swarms are capped at 30 bats each, but nearby groups can merge into a larger AI group.
        // Keep only the first 30 bat visuals while that merged swarm is idle; their AI/combat remains active.
        if (G.kind === 'swarm' && !fighting && A.id === 'nocturianBat' && A.slot >= 30) tier = 3;
        if (fighting && A.layer && tier < 3) tier = A.shown === false ? 3 : Math.max(tier, A.layer);
        if (fighting && G.kind !== 'swarm' && A.rank != null && tier < 3 && !A.mo.actName && !A.attacking) tier = Math.max(tier, A.rank < 8 ? 0 : A.rank < 16 ? 1 : 2);
      }
      if (sampleActor) actorStageMs.visibility += performance.now() - visibilityStartedAt;
      const isUmbrafiend = A.id === 'umbrafiend';
      A.near = d < 7 && tier < 2;
      // Umbrafiends keep their full bodies and update their poses every frame; only soft shadow details
      // and distant glow sprites are reduced to make large packs affordable.
      if (isUmbrafiend) for (const glow of A.C.glows) glow.visible = tier < 2;
      const behaviorStartedAt = sampleActor ? performance.now() : 0;
      // Off-screen actors still participate in combat and group behavior, but their decision/movement
      // step only needs to run at 12 Hz. Keep elapsed time so cooldowns and movement remain time-based;
      // active moves still use the normal path and continue advancing below.
      let speed;
      if (tier >= 3 && !A.mo.actName) {
        A.behaviorLodDt = (A.behaviorLodDt || 0) + dt;
        if (A.behaviorLodDt >= 1 / 12) {
          const behaviorDt = Math.min(A.behaviorLodDt, 0.12);
          A.behaviorLodDt -= behaviorDt;
          speed = memberThink(A, behaviorDt, player);
          A.moveSpeed = speed;
        } else {
          speed = A.moveSpeed || 0;
        }
      } else {
        A.behaviorLodDt = 0;
        speed = memberThink(A, dt, player);
        A.moveSpeed = speed;
      }
      if (sampleActor) actorStageMs.behavior += performance.now() - behaviorStartedAt;
      if ((A.alt ?? 0) !== (A.altGoal ?? 0)) { const da = (A.altGoal || 0) - (A.alt || 0); A.alt = (A.alt || 0) + Math.sign(da) * Math.min(Math.abs(da), dt * (da < 0 ? 3.5 : 1.5)); }   // (a swarm pours down fast, climbs back slower)
      // the ground under it, when it has moved: a walker every 0.35 m; a flyer only every 1.5 m (it isn't standing on it), and
      // the upper layers of a tower not at all (they're metres up: the bottom layer's ground does)
      const groundStartedAt = sampleActor ? performance.now() : 0;
      if (shapes.length && !(A.M.flight && A.layer) && (Math.abs(A.pos.x - (A.gx ?? 1e9)) + Math.abs(A.pos.z - (A.gz ?? 1e9)) > (A.M.flight ? 1.5 : 0.35))) groundUnder(A);
      else if (A.M.flight && A.layer) A.pos.y = A.group.center.y;
      if (sampleActor) actorStageMs.ground += performance.now() - groundStartedAt;
      if (A.pitch !== A.pitchGoal) A.pitch = (A.pitch || 0) + ((A.pitchGoal || 0) - (A.pitch || 0)) * Math.min(1, dt * 6);
      const poseStartedAt = sampleActor ? performance.now() : 0;
      const vis = tier < 3;
      attach(A, vis); const shownNow = vis && A.wasHidden; if (shownNow) A.lodDt = Math.min(A.lodDt || 0, 0.1); A.wasHidden = !vis;   // (shownNow: placed at once below — not drawn where it went out of sight)
      // The engaged layer keeps its full skinned model. Circling/reserve Nocturian bats use a 3-batch proxy;
      // their actor, target, flight path and group brain remain individual and unchanged.
      if (batInstancing && A.id === 'nocturianBat' && G.kind === 'swarm' && vis && !A.mo.actName && A.alive) batSwarm.add(A);
      A.C.furOn?.(tier <= 1);   // (fur only up close)
      if (A.C.puffs) { A.C.puffs.sleep = !vis || (fighting && A.layer > 0); A.C.puffs.extLod = true;   // (the circling and reserve bands give off no smoke)
        A.C.puffs.lod = presentation?.effectLod ?? (isUmbrafiend ? (tier === 0 ? 1 : tier === 1 ? 0.35 : 0.08) : (tier === 0 ? 1 : tier === 1 ? 0.6 : 0.15)); }
      if (fighting && d < 30 && vis) { barCand.push(A); A.barD = d; }
      A.lodDt = (A.lodDt || 0) + dt;
      if (vis) {
        // Match the worker policy when a plan is temporarily unavailable.
        // Keep Umbrafiend moves responsive, but let distant idle poses reuse their last skeleton pose.
        const every = presentation?.animationEvery ?? (isUmbrafiend ? (A.mo.actName ? 1 : tier === 0 ? 1 : tier === 1 ? 3 : 6) : (tier === 0 ? 1 : tier === 1 ? 3 : 10));
        if (shownNow || (frameN + i) % every === 0) { motionOpts.speed = speed; motionOpts.ik = presentation ? presentation.ik : (speed > 0.2 || !!A.mo.actName) && (tier === 0 || (tier === 1 && d < 15)); A.mo.update(Math.min(A.lodDt, 0.2), motionOpts); A.lodDt = 0; placeBody(A); }
      } else { if (A.mo.actName) { motionOpts.speed = 0; motionOpts.ik = false; A.mo.update(A.lodDt, motionOpts); A.lodDt = 0; } A.target.pos.x = A.pos.x; A.target.pos.z = A.pos.z; A.target.pos.y = A.pos.y + (A.M.hover || 0) + (A.alt || 0); }
      if (sampleActor) actorStageMs.poseAndScene += performance.now() - poseStartedAt;
      const combatStartedAt = sampleActor ? performance.now() : 0;
      if (tier === 0) strike(A, player, hooks);
      if (d < 30) voices(A, dt, speed);
      if (d < 40) nearTargets.push(A.target);
      if (sampleActor) actorStageMs.combatAndAudio += performance.now() - combatStartedAt;   // (only these go to your weapons and spells: they look through every target each frame)
      if (collectPresentationSnapshot) visualSnapshots.push({ id:A.presentationId, x:A.pos.x, z:A.pos.z, distance:d, inFrustum:on, visibilityDistance:VIS,
        fighting, act:!!A.mo.actName, swarmReserve:G.kind==='swarm'&&!fighting&&A.id==='nocturianBat'&&A.slot>=30,
        layered:!!A.layer, layer:A.layer||0, shown:A.shown, swarm:G.kind==='swarm', rank:A.rank,
        attacking:!!A.attacking, umbrafiend:isUmbrafiend, speed });
    }
    const actorLoopMs = performance.now() - actorLoopStartedAt;
    const presentationDispatchStartedAt = performance.now();
    dispatchPresentationPlan(visualSnapshots, player);
    const presentationDispatchMainMs = performance.now() - presentationDispatchStartedAt;
    const telemetry = { updateMs:0, aiDispatchMs:senseDispatchMs, groupThinkMs, actorLoopMs, actorStageMs, presentationDispatchMainMs, total:actors.length, alive:0, dead:0, awakeGroups:0, awakeActors:0, attached:0, withinRenderRange:0, visible:0, presentationBatchSize:visualSnapshots.length };
    for (const G of groups) if (G.awake) telemetry.awakeGroups++;
    for (const A of actors) {
      if (A.alive) telemetry.alive++; else telemetry.dead++;
      if (A.group?.awake && A.alive) telemetry.awakeActors++;
      if (A.attached) telemetry.attached++;
      const dx = A.pos.x - player.pos.x, dz = A.pos.z - player.pos.z;
      if (dx * dx + dz * dz <= VIS * VIS) telemetry.withinRenderRange++;
      if (A.attached && A.C?.root?.visible !== false) telemetry.visible++;
    }
    lastUpdateTelemetry = telemetry;
    updateCreatureShadows(player);
    batSwarm.finish(performance.now() / 1000);
    // health bars: only the five nearest of those fighting you (a swarm of thirty bars is clutter, and thirty sprites)
    barCand.sort((a, b) => a.barD - b.barD);
    const want = new Set(barCand.slice(0, 5));
    for (const A of barShown) if (!want.has(A)) { scene.remove(A.bar.sp); A.barOn = false; barShown.delete(A); }
    for (const A of want) { if (!barShown.has(A)) { scene.add(A.bar.sp); A.barOn = true; barShown.add(A); } A.bar.draw(A.hp / A.maxHp); }
    lastUpdateTelemetry.updateMs = performance.now() - updateStartedAt;
  }
  return {
    spawn, actors, targets, nearTargets, groups, update,
    presentationSnapshot() { const pool = sharedPool?.snapshot?.() || null; return { mode:presentationMode, actorCount:actors.length, population:{...lastUpdateTelemetry}, pending:presentationPending, pendingAgeMs:presentationPending && presentationPendingSince ? Math.max(0, performance.now()-presentationPendingSince) : 0, dispatchCount:presentationDispatchCount, workerMs:presentationWorkerMs, queueMs:presentationQueueMs, dispatchMs:presentationDispatchMs, roundTripMs:presentationRoundTripMs, batchMs:presentationBatchMs, lastError:presentationLastError, pool }; },
    aiSnapshot() { return { mode:aiMode, actorCount:actors.length, groupCount:groups.length, population:{...lastUpdateTelemetry}, pending:aiPending, dispatchCount:aiDispatchCount, workerMs:aiWorkerMs, queueMs:aiQueueMs, dispatchMs:aiDispatchMs, roundTripMs:aiRoundTripMs, batchMs:aiBatchMs, lastError:aiLastError, pool:sharedPool?.snapshot?.()||null }; },
    setAiMode, setPresentationMode,
    setBatInstancing(on) { batInstancing = !!on; },
    setUmbrafiendPartInstancing(on) { creaturePartInstances.setEnabled(!!on); },
    setUmbrafiendSkinningVariant(on) { umbrafiendTwoInfluence = !!on; for (const A of actors) if (A.M?.name === 'Umbrafiend') A.C.setSkinnedVariant(umbrafiendTwoInfluence); },
    // bodies lying to be harvested (src/game/harvest.js): { A, x, y, z, reach }
    corpses() { return actors.filter(A => A.corpse && !A.corpse.harvested && A.corpse.t > 1).map(A => ({ A, x: A.pos.x, y: A.pos.y, z: A.pos.z, reach: (A.M.stats.radius || 0.5) * 2 + 2 })); },
    harvested(A) { if (A.corpse) A.corpse.harvested = true; }, set shapesIn(f) { shapesInF = f; },
    clear() { setAiMode('main'); setPresentationMode('main'); for (const A of actors) { scene.remove(A.C.root); scene.remove(A.bar.sp); A.C.dispose(); } scene.remove(shadowBatch); shadowGeometry.dispose(); shadowMaterial.dispose(); shadowTexture.dispose(); batSwarm.dispose(); actors.length = 0; targets.length = 0; groups.length = 0; nearTargets.length = 0; barShown.clear(); },
  };
}
