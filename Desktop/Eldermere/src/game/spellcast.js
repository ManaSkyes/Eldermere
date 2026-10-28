// src/game/spellcast.js — casting combat spells in the game: the readied spell (chosen on the spell wheel,
// Q, from your prepared spells), speaking it (hold F) or casting it voiceless (hold G: much quicker,
// weaker and dearer), casting straight from the hotbar (hold the number), mana, backfires, and the flames
// themselves: bolts that fly straight, fireballs that burst, and burning.
//
// How a cast comes out (power, mana, time, backfire chance) is src/rpg/magic.js (castProfile); what each
// spell does when thrown is SPELL_CAST in src/data/spells.js.
//
//   const S = createSpellcast({ THREE, scene, shapes, character, player, body, vitals, audio, hurtPlayer, toast })
//   S.update(dt, input, targets, locked)   → the cast bar state for the HUD
import { SPELLS, SPELL_CAST } from '../data/spells.js';
import { castProfile, trainCast, knowsSpell, preparedOf } from '../rpg/magic.js';
import { effectiveMain } from '../rpg/stats.js';
import { lineBlocked } from './physics.js';
import { ITEMS } from '../rpg/equipment.js';
import { nodeRank, hasNode } from '../data/skillTrees.js';

// tap or hold: a press shorter than this is a tap (a quick cast); longer becomes a long, spoken cast
export const CAST_HOLD = 0.15;

export function createSpellcast({ onNoise, THREE, scene, shapes, character, player, body, vitals, audio, hurtPlayer, toast }) {
  const st = player.state;
  // what can be cast: prepared spells (src/rpg/magic.js) that have an effect in the game so far
  const known = () => preparedOf(character).filter(id => SPELL_CAST[id]);
  let request = null;                                       // a cast asked for from the hotbar: { id, key }
  let press = null;                                         // a cast button held down, not yet a tap or a hold: { btn, t }
  // How the hands are set decides what each mouse button does for magic. Each button gets a role:
  //   'quick'  a press starts a quick (voiceless) cast that finishes by itself
  //   'long'   hold to speak a long cast (let go early: it unravels, no mana spent)
  //   'dual'   tap (under 0.15 s) for a quick cast, hold for a long cast (let go of the long cast early: backfire)
  // and the hand that casts with it.
  //   main hand            off hand           left mouse         right mouse
  //   focus                empty              quick              long
  //   focus                shield / weapon    dual               (the shield blocks)
  //   focus                focus              dual (right hand)  dual (left hand)
  //   weapon               focus              (the weapon)       dual (left hand)
  //   empty                focus              -                  dual (left hand)
  //   empty                empty, a focus bracelet worn (or the spell mastered past 100): quick / long, bare-handed
  //   weapon               empty, a bracelet   (the weapon)       dual (left hand)
  // Without any focus, and the spell not mastered past 100, you can't cast.
  function layout() {
    const b = body(); if (!b) return null;
    const eq = b.gear.equipped(), main = eq.mainHand && ITEMS[eq.mainHand], off = eq.offHand && eq.offHand !== eq.mainHand ? ITEMS[eq.offHand] : null;
    const wrist = Object.entries(eq).some(([slot, id]) => slot !== 'mainHand' && slot !== 'offHand' && ITEMS[id]?.focus);
    const innate = readied && (character.spells?.[readied] ?? 0) > 100;
    if (main?.focus) {
      if (!off) return { L: 'quick', R: 'long', handL: 'R', handR: 'R', drawn: true, name: 'focusMain' };
      if (off.focus) return { L: 'dual', R: 'dual', handL: 'R', handR: 'L', drawn: true, name: 'twoFoci' };
      return { L: 'dual', R: null, handL: 'R', drawn: true, name: 'focusShield' };
    }
    if (off?.focus) return { L: null, R: 'dual', handR: 'L', drawn: true, name: 'focusOff' };
    if (!main && !off && (wrist || innate)) return { L: 'quick', R: 'long', handL: 'R', handR: 'R', drawn: false, name: 'bare' };
    if (main && !off && (wrist || innate)) return { L: null, R: 'dual', handR: 'L', drawn: true, name: 'weaponWrist' };
    return null;
  }
  let readied = known()[0] || null, casting = null;
  const bolts = [], bursts = [], burning = new Map(), detonate = [];       // target → { dps, t }

  // ---- the look of fire: a glowing core, a soft halo, embers trailing ----
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,190,80,0.95)'); grd.addColorStop(0.6, 'rgba(255,90,20,0.45)'); grd.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
  })();
  const glowSprite = (size, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.setScalar(size); scene.add(s); return s;
  };
  // the casting hand's glow while you speak the spell
  const handGlow = glowSprite(0.3, 0); const handLight = new THREE.PointLight('#ff8030', 0, 4); scene.add(handLight);
  const embers = [];
  function ember(p, spread = 0.08, life = 0.5) {
    const s = glowSprite(0.08 + Math.random() * 0.06, 0.9);
    s.position.set(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread);
    embers.push({ s, t: 0, life, vy: 0.4 + Math.random() * 0.6 });
  }

  const fireSkill = () => character.skills.fire ?? 100;
  // the Fire tree (src/data/skillTrees.js): what each node does to fire once it's thrown
  const fr = id => nodeRank(character, 'fire', id) || 0, fh = id => hasNode(character, 'fire', id);
  function damageOf(spell, prof) {
    const C = SPELL_CAST[spell.id], m = effectiveMain(character);
    return C.damage * (prof.power / Math.max(0.01, spell.power)) * Math.sqrt(fireSkill() / 100) * Math.sqrt(Math.max(10, m.mind) / 100);
  }
  const burnDps = burn => burn.dps * (1 + 0.15 * fr('searing'));                    // Searing
  const burnSecs = burn => burn.seconds + fr('lingering');                          // Lingering flame
  const radiusOf = C => C.radius * (1 + 0.15 * fr('blastRadius'));                  // Wide blast
  function setBurning(t, burn, scale) {
    if (!burn || !t.alive) return;
    const b = burning.get(t), dps = burnDps(burn) * scale, secs = burnSecs(burn), maxStacks = fh('conflagration') ? 3 : 1;
    if (!b) burning.set(t, { dps, t: secs, tick: 0, acc: 0, stacks: 1 });
    else { b.t = Math.max(b.t, secs); if (b.stacks < maxStacks) { b.stacks++; b.dps += dps; } else b.dps = Math.max(b.dps, dps * b.stacks); }   // Conflagration: burns add up
  }
  function hitTarget(t, dmg, from, kind = 'fire') {
    if (kind === 'fire' && from && burning.has(t)) dmg *= 1 + 0.1 * fr('volatile');           // Volatile: more against the burning
    t.hit(dmg, { dmg, stagger: dmg * 0.04, from, kind, charged: 0 });
  }
  const fields = [];                                                                // Inferno: burning ground

  function aim() {
    // straight out from the eyes along the view
    const cp = Math.cos(st.pitch), d = { x: -Math.sin(st.yaw) * cp, y: Math.sin(st.pitch), z: -Math.cos(st.yaw) * cp };
    return d;
  }
  function launch(spell, prof, mode) {
    const C = SPELL_CAST[spell.id], b = body();
    const hand = b ? b.combat.handPos(casting?.hand || b.combat.castHand) : null, d = aim();
    const eye = { x: st.pos.x, y: st.pos.y + player.height * (1 - 0.35 * st.crouch) * 0.93, z: st.pos.z };
    // start from the hand, but aim at what the eyes are looking at (20 m out), so it goes where you look
    const from = hand ? { x: hand.x, y: hand.y, z: hand.z } : { x: eye.x, y: eye.y - 0.3, z: eye.z };
    const far = { x: eye.x + d.x * 20, y: eye.y + d.y * 20, z: eye.z + d.z * 20 };
    const L = Math.hypot(far.x - from.x, far.y - from.y, far.z - from.z), dir = { x: (far.x - from.x) / L, y: (far.y - from.y) / L, z: (far.z - from.z) / L };
    const twin = C.kind === 'bolt' && fh('twinBolt'), pierce = C.kind === 'bolt' && fh('piercingBolt');
    const spreads = twin ? [-0.03, 0.03] : [0];                                     // Twin bolt: two, a little apart
    for (const a of spreads) {
      const c = Math.cos(a), sn = Math.sin(a), dx = dir.x * c - dir.z * sn, dz = dir.x * sn + dir.z * c;
      const v = { x: dx * C.speed, y: dir.y * C.speed, z: dz * C.speed };
      const core = glowSprite(C.size * 3), light = new THREE.PointLight(C.color, twin ? 1.4 : 2.2, C.kind === 'ball' ? 9 : 6);
      core.position.set(from.x, from.y, from.z); light.position.copy(core.position); scene.add(light);
      bolts.push({ spell, C, p: { ...from }, v, life: 3, core, light, dmg: damageOf(spell, prof) * (twin ? 0.75 : 1) * (casting?.power || 1), scale: prof.power / spell.power * (casting?.power || 1),
        pierce: pierce ? 3 : 0, hits: new Set(), spoken: casting?.mode === 'incantation' });
    }
    audio.fireLaunch?.(C.kind === 'ball');
    // loud to anything listening (not to you): a spoken spell carries furthest; voiceless is quieter
    onNoise?.({ x: st.pos.x, y: st.pos.y, z: st.pos.z }, (C.kind === 'ball' ? 30 : 24) * (mode === 'voiceless' ? 0.6 : 1), 'spell');
  }
  function burst(at, C0, dmg, scale, hitDirect, spoken = false) {
    onNoise?.({ x: at.x, y: at.y, z: at.z }, 20, 'blast');                           // where it bursts, loudly
    // a fireball's burst: everything within the radius burns, less at the edge; walls shelter
    const C = { ...C0, radius: radiusOf(C0) };
    const flash = glowSprite(0.5, 1); flash.position.set(at.x, at.y, at.z);
    const light = new THREE.PointLight('#ff7a20', 4, C.radius * 4); light.position.copy(flash.position); scene.add(light);
    bursts.push({ flash, light, t: 0, r: C.radius });
    for (let i = 0; i < 18; i++) ember(at, C.radius * 0.8, 0.9);
    if (spoken && fh('inferno')) {                                                  // Inferno: the ground stays ablaze
      const disc = new THREE.Mesh(new THREE.CircleGeometry(C.radius * 0.8, 24), new THREE.MeshBasicMaterial({ color: '#ff5a10', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(at.x, Math.max(0.03, at.y - 1.2) , at.z); scene.add(disc);
      fields.push({ at: { x: at.x, y: disc.position.y, z: at.z }, r: C.radius * 0.8, t: 6, disc, burn: C.burn, scale });
    }
    audio.fireBurst?.();
    return (targets) => {
      for (const t of targets) {
        if (!t.alive) continue;
        const c = { x: t.pos.x, y: t.pos.y + (t.height || 1.8) * 0.5, z: t.pos.z };
        const d = Math.max(0, Math.hypot(c.x - at.x, c.y - at.y, c.z - at.z) - (t.radius || 0.3));
        if (d > C.radius) continue;
        if (t !== hitDirect && lineBlocked(shapes, at, c)) continue;
        const k = t === hitDirect ? 1 : 1 - 0.6 * d / C.radius;
        hitTarget(t, dmg * k, { x: at.x, z: at.z }); setBurning(t, C.burn, scale * k);
      }
      // the caster too, if they're inside it
      const pc = { x: st.pos.x, y: st.pos.y + 1, z: st.pos.z }, pd = Math.hypot(pc.x - at.x, pc.y - at.y, pc.z - at.z);
      if (pd < C.radius && !lineBlocked(shapes, at, pc) && !fh('fireward')) hurtPlayer(0.06 * (1 - pd / C.radius) * scale, 'Caught in your own fireball');   // (Fireward: not you)
    };
  }

  function backfire(spell, prof) {
    const C = SPELL_CAST[spell.id], b = body(), hand = b ? b.combat.handPos(casting?.hand || b.combat.castHand) : st.pos;
    const flash = glowSprite(0.4, 1); flash.position.copy(hand); bursts.push({ flash, light: null, t: 0, r: 1 });
    for (let i = 0; i < 10; i++) ember(hand, 0.4, 0.7);
    audio.fireBurst?.();
    onNoise?.({ x: st.pos.x, y: st.pos.y, z: st.pos.z }, 48, 'backfire');           // a failed spell: heard from far off
    hurtPlayer(Math.min(0.4, 0.04 * spell.power) * (spell.school === 'fire' && fh('fireward') ? 0.5 : 1), spell.backfire?.text || 'The spell backfires');
    toast?.(`Backfire! ${spell.backfire?.text || ''}`);
  }

  function finishCast() {
    const spell = SPELLS[casting.id], prof = casting.prof, b = body();
    // Overcast: held past ready, more power for more mana (as much as you can pay for)
    let over = casting.over ? Math.min(1, casting.over / 1) : 0;
    if (over > 0) over = Math.min(over, Math.max(0, (vitals.mp / prof.mana - 1) / 0.8));
    const mana = prof.mana * (1 + 0.8 * over);
    casting.power = 1 + 0.6 * over;
    if (vitals.mp < mana) { toast?.('Not enough mana.'); b?.combat.cancelCast(); casting = null; return; }
    vitals.mp -= mana;
    const failed = Math.random() < prof.backfire;
    b?.combat.throwCast();
    if (failed) backfire(spell, prof); else launch(spell, prof, casting.mode);
    trainCast(character, spell, { mode: casting.mode, focus: casting.focus }, failed);
    casting = null;
  }

  return {
    get readied() { return readied; },
    set readied(id) { readied = id; },
    // cast a prepared spell straight away (from the hotbar), spoken, for as long as `key` is held
    request(id, key) { if (!casting) request = { id, key }; },
    get casting() { return casting; },
    layout,
    known,
    burning,
    get debug() { return { bolts: bolts.length, fields: fields.length, balls: bolts.filter(o => o.C.kind === 'ball').length }; },
    update(dt, input, targets, locked) {
      const b = body();
      if (!readied || !known().includes(readied)) readied = known()[0] || null;
      const free = !st.hang && !st.climb && !st.trav && !st.swimming && !st.move && !st.roll && st.sit < 0.05;
      if (locked && input.pressed('nextSpell')) {
        const k = known(); if (k.length) { readied = k[(k.indexOf(readied) + 1) % k.length]; toast?.(`Readied: ${SPELLS[readied].name}`); }
      }
      // start: the mouse buttons, by how the hands are set (layout()), or holding a hotbar number
      const req = request; request = null;
      const L = layout(), drawn = !!b?.combat.drawn, ready = L && (!L.drawn || drawn);
      const btnOf = side => side === 'L' ? 'attack' : 'block';
      // the first click with a focus put away takes it in hand
      if (locked && free && L && L.drawn && !drawn && b && !b.combat.busy && ((L.L && input.pressed('attack')) || (L.R && input.pressed('block')))) b.combat.draw();
      if (!locked || !free || casting) press = null;
      // Detonate: with a fireball of yours in flight, a cast button bursts it where it is (instead of casting)
      let detonated = false;
      if (locked && !casting && fh('detonate') && L && ((L.L && input.pressed('attack')) || (L.R && input.pressed('block')))) {
        const ball = bolts.find(o => o.C.kind === 'ball');
        if (ball) { detonate.push(ball); press = null; detonated = true; }
      }
      if (locked && free && !casting && !detonated && b && !b.combat.busy && readied) {
        let id = null, mode = null, key = null, auto = false, failOnRelease = false, hand = null;
        if (req) {
          if (!L) toast?.('You need a focus to cast: a wand, staff, orb, spellbook or focus bracelet.');
          else { id = req.id; mode = 'incantation'; key = req.key; hand = L.handL || L.handR; }
        } else if (ready) {
          for (const side of ['L', 'R']) {
            const role = L[side], btn = btnOf(side); if (!role || id || press?.btn && press.btn !== btn) continue;
            if (role === 'quick' && input.pressed(btn)) { id = readied; mode = 'voiceless'; auto = true; hand = L['hand' + side]; }
            else if (role === 'long' && input.pressed(btn)) { id = readied; mode = 'incantation'; key = btn; hand = L['hand' + side]; }
            else if (role === 'dual') {
              if (input.pressed(btn) && !press) press = { btn, t: 0, hand: L['hand' + side] };
              if (press && press.btn === btn) {
                press.t += dt;
                if (!input.held(btn)) { id = readied; mode = 'voiceless'; auto = true; hand = press.hand; press = null; }                              // a tap: quick cast
                else if (press.t >= CAST_HOLD) { id = readied; mode = 'incantation'; key = btn; failOnRelease = true; hand = press.hand; press = null; }   // a hold: long cast
              }
            }
          }
        } else if (!L && (input.pressed('attack') || input.pressed('block')) && !b.gear.equipped().mainHand && !b.gear.equipped().offHand) toast?.('You need a focus to cast: a wand, staff, orb, spellbook or focus bracelet.');
        if (id && !SPELL_CAST[id]) { toast?.(`${SPELLS[id]?.name ?? id} can't be cast in the field yet.`); id = null; }
        else if (id && !preparedOf(character).includes(id)) { toast?.(`${SPELLS[id].name} isn't prepared (Magic page).`); id = null; }
        if (id) {
          const focus = !!b.gear.stats().focus, prof = castProfile(character, SPELLS[id], { mode, focus });
          if (vitals.mp < prof.mana) toast?.(`Not enough mana for ${SPELLS[id].name} (${Math.ceil(prof.mana)}).`);
          else if (b.combat.cast({ hand })) { casting = { id, mode, focus, prof, t: 0, key, auto, failOnRelease, hand: hand || b.combat.castHand }; audio.chant?.(mode === 'incantation', prof.castTime); }
        }
      }
      if (casting) {
        casting.t += dt;
        if (!free || !locked) { b?.combat.cancelCast(); casting = null; }
        else if (!casting.auto && !input.held(casting.key)) {
          audio.chantStop?.();
          if (casting.ready) finishCast();                                      // Overcast: let go to throw it
          else if (casting.failOnRelease && !(SPELLS[casting.id].school === 'fire' && fh('unbroken'))) {   // let go of a long cast midway: it backfires, whatever your skill
            const spell = SPELLS[casting.id], prof = casting.prof;
            vitals.mp = Math.max(0, vitals.mp - prof.mana * Math.min(1, casting.t / prof.castTime));
            b?.combat.cancelCast(); backfire(spell, prof); trainCast(character, spell, { mode: casting.mode, focus: casting.focus, full: false }, true); casting = null;
          } else if (casting.failOnRelease) {                                    // Unbroken chant: it unravels, the mana spent so far lost
            vitals.mp = Math.max(0, vitals.mp - casting.prof.mana * Math.min(1, casting.t / casting.prof.castTime)); b?.combat.cancelCast(); casting = null; toast?.('The chant unravels.');
          } else { b?.combat.cancelCast(); casting = null; }                     // otherwise the spell unravels (no mana spent)
        }
        else if (casting.t >= casting.prof.castTime) {
          // Overcast (fire, spoken, held): keep pouring in for up to a second more, then it goes by itself
          if (!casting.auto && casting.mode === 'incantation' && SPELLS[casting.id].school === 'fire' && fh('overcast')) {
            casting.ready = true; casting.over = casting.t - casting.prof.castTime;
            if (casting.over >= 1) finishCast();
          } else finishCast();
        }
      }
      st.castSlow = casting ? (casting.mode === 'incantation' ? 0.55 : 0.8) : 1;
      // Inferno: burning ground keeps whatever stands in it alight
      for (let i = fields.length - 1; i >= 0; i--) {
        const f = fields[i]; f.t -= dt; f.disc.material.opacity = 0.45 * Math.min(1, f.t) * (0.8 + 0.2 * Math.sin(performance.now() / 90 + i));
        for (const t of targets) if (t.alive && Math.hypot(t.pos.x - f.at.x, t.pos.z - f.at.z) < f.r + (t.radius || 0.3) && Math.abs(t.pos.y - f.at.y) < 1.5) { const bn = burning.get(t); if (!bn || bn.t < 1) setBurning(t, f.burn, f.scale * 0.6); }
        if (Math.random() < dt * 25) ember({ x: f.at.x + (Math.random() - 0.5) * f.r * 1.6, y: f.at.y + 0.1, z: f.at.z + (Math.random() - 0.5) * f.r * 1.6 }, 0.1, 0.7);
        if (f.t <= 0) { scene.remove(f.disc); f.disc.geometry.dispose(); f.disc.material.dispose(); fields.splice(i, 1); }
      }
      // the hand glows brighter as the spell gathers
      const k = casting ? Math.min(1, casting.t / casting.prof.castTime) : 0;
      if (b && (casting || handGlow.material.opacity > 0.01)) {
        const hp = b.combat.handPos(casting?.hand || b.combat.castHand); handGlow.position.copy(hp); handLight.position.copy(hp);
        handGlow.material.opacity += ((casting ? 0.35 + 0.65 * k : 0) - handGlow.material.opacity) * Math.min(1, dt * 12);
        handGlow.scale.setScalar(0.18 + 0.25 * k + 0.03 * Math.sin(performance.now() / 60));
        handLight.intensity = handGlow.material.opacity * 1.6;
        if (casting && Math.random() < dt * 20) ember(hp, 0.1, 0.4);
      }
      // bolts in flight
      const pending = [];
      for (const ball of detonate.splice(0)) {                                     // Detonate: burst a fireball mid-flight
        const i = bolts.indexOf(ball); if (i < 0) continue;
        pending.push(burst(ball.p, ball.C, ball.dmg, ball.scale, null, ball.spoken));
        scene.remove(ball.core); scene.remove(ball.light); ball.core.material.dispose(); bolts.splice(i, 1);
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const o = bolts[i]; o.life -= dt;
        const n = { x: o.p.x + o.v.x * dt, y: o.p.y + o.v.y * dt, z: o.p.z + o.v.z * dt };
        let hit = null, stop = false;
        for (const t of targets) {                           // the closest point of this step's path to each target's axis
          if (!t.alive || o.hits.has(t)) continue;
          const sx = n.x - o.p.x, sz = n.z - o.p.z, L2 = sx * sx + sz * sz || 1e-9, u = Math.max(0, Math.min(1, ((t.pos.x - o.p.x) * sx + (t.pos.z - o.p.z) * sz) / L2));
          const qx = o.p.x + sx * u, qy = o.p.y + (n.y - o.p.y) * u, qz = o.p.z + sz * u;
          if (Math.hypot(qx - t.pos.x, qz - t.pos.z) < (t.radius || 0.3) + o.C.size && qy > t.pos.y - 0.1 && qy < t.pos.y + (t.height || 1.8)) { hit = t; n.x = qx; n.y = qy; n.z = qz; break; }
        }
        if (!hit && (lineBlocked(shapes, o.p, n) || n.y < 0.02 || o.life <= 0)) stop = true;
        if (hit && o.pierce > 1) {                                                   // Piercing bolt: through it and on, weaker each time
          hitTarget(hit, o.dmg, { x: o.p.x, z: o.p.z }); setBurning(hit, o.C.burn, o.scale); for (let j = 0; j < 6; j++) ember(n, 0.2, 0.5); audio.fireHit?.();
          o.hits.add(hit); o.pierce--; o.dmg *= 0.75; o.p = n; o.core.position.set(n.x, n.y, n.z); o.light.position.copy(o.core.position); continue;
        }
        if (hit || stop) {
          if (o.C.kind === 'ball') pending.push(burst(n, o.C, o.dmg, o.scale, hit, o.spoken));
          else if (hit) { hitTarget(hit, o.dmg, { x: o.p.x, z: o.p.z }); setBurning(hit, o.C.burn, o.scale); for (let j = 0; j < 6; j++) ember(n, 0.2, 0.5); audio.fireHit?.(); }
          else for (let j = 0; j < 4; j++) ember(n, 0.15, 0.4);
          scene.remove(o.core); scene.remove(o.light); o.core.material.dispose(); bolts.splice(i, 1); continue;
        }
        o.p = n; o.core.position.set(n.x, n.y, n.z); o.light.position.copy(o.core.position);
        o.core.scale.setScalar(o.C.size * 3 * (0.9 + 0.2 * Math.random()));
        if (Math.random() < dt * (o.C.kind === 'ball' ? 40 : 25)) ember(n, o.C.size, 0.35);
      }
      for (const f of pending) f(targets);
      // bursts fade
      for (let i = bursts.length - 1; i >= 0; i--) {
        const x = bursts[i]; x.t += dt; const u = x.t / 0.5;
        x.flash.scale.setScalar(0.5 + x.r * 2.2 * Math.min(1, u * 2)); x.flash.material.opacity = Math.max(0, 1 - u);
        if (x.light) x.light.intensity = Math.max(0, 4 * (1 - u));
        if (u >= 1) { scene.remove(x.flash); x.flash.material.dispose(); if (x.light) scene.remove(x.light); bursts.splice(i, 1); }
      }
      // burning: damage once a second, embers rising off whatever's alight
      for (const [t, bn] of burning) {
        bn.t -= dt; bn.acc += bn.dps * dt; bn.tick += dt;
        if (bn.tick >= 1) {
          bn.tick -= 1; hitTarget(t, bn.acc, null, 'fire'); bn.acc = 0;
          if (fh('wildfire')) for (const o of targets) {                            // Wildfire: it catches on whatever's close
            if (o === t || !o.alive || burning.has(o) || Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) > 2) continue;
            burning.set(o, { dps: bn.dps / bn.stacks * 0.5, t: Math.min(bn.t, 3), tick: 0, acc: 0, stacks: 1 });
          }
        }
        if (Math.random() < dt * 12) ember({ x: t.pos.x, y: t.pos.y + (t.height || 1.8) * (0.3 + Math.random() * 0.6), z: t.pos.z }, (t.radius || 0.3) * 1.5, 0.6);
        if (bn.t <= 0 || !t.alive) burning.delete(t);
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.t += dt; e.s.position.y += e.vy * dt; e.s.material.opacity = Math.max(0, 0.9 * (1 - e.t / e.life));
        if (e.t >= e.life) { scene.remove(e.s); e.s.material.dispose(); embers.splice(i, 1); }
      }
      return casting ? { name: SPELLS[casting.id].name + (casting.ready ? ` · overcast ${Math.round(Math.min(1, casting.over) * 60)}%` : ''), k, mode: casting.mode } : null;
    },
  };
}
