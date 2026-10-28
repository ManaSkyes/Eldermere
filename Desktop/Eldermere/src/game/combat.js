// src/game/combat.js — melee combat for the player: drawing and sheathing, attacks, blocking, and hits on
// targets. The body (src/rpg/humanViewer.js, body.combat) plays the animations and reports how far through
// the current attack it is; this file decides what that attack does.
//
// Controls: R draw / sheathe · left mouse: tap a light attack, hold a heavy one (a mace with Overhead smash charges it) ·
// press again during a swing to carry the combo on (src/rpg/combos.js: light, heavy and mixed chains, longer with skill).
// Perfect combos: a press in the window around the swing's end (the reticle's ring closing on the target ring) adds
// +20–50% damage (tighter window, bigger bonus: daggers 50%, great weapons 20%); earlier carries on without it; later ends
// the chain · right mouse block.
//
// Guard counter: block a blow (on the shield, or on the weapon itself) and attack while the guard is still up — a riposte
// or a shield bash and cut straight out of the guard. Limited three ways: only in a short window after the block (wider
// for a perfect block: the guard raised just before the blow), it costs stamina, and it has a cooldown.
// What you block with matters: a shield's `block` stops that share of the blow's damage and its `stability` absorbs that
// share of the stamina cost; a weapon guards less well (GUARD below). A perfect block stops everything at half the cost.
//
// A target: { pos: {x, y, z}, radius, height, alive, hit(dmg, info) } (see src/game/dummies.js)
import { ITEMS } from '../rpg/equipment.js';
import { train, effectiveMain } from '../rpg/stats.js';
import { hasNode, nodeRank } from '../data/skillTrees.js';
import { comboLength, heavyLength, comboStep, counterMove, comboTiming } from '../rpg/combos.js';
import { SWORD_MOVES, SWORD_SPECIALS, SWORD_COUNTERS, SWORD_CLIPS, moveAtRank } from '../rpg/swordArts.js';
// weapons whose tree swaps specials into the combo (src/data/skillTrees.js: the shortsword) → their specials and counters
const ARTS = { shortsword: { moves: SWORD_MOVES, specials: SWORD_SPECIALS, counters: SWORD_COUNTERS } };
// how many foes one swing can reach, by weapon class (a move can say otherwise: a thrust 1, the whirling cut 5...)
const CLASS_TARGETS = { light: 1, one: 2, pole: 2, great: 4, heavy: 3 };
// a weapon's own damage type, for moves that don't say (docs/WEAPONS.md)
const WEAPON_TYPE = { mace: 'blunt', club: 'blunt', staff: 'blunt', warhammer: 'crush', greataxe: 'slash', axe: 'slash', spear: 'pierce', glaive: 'slash', dagger: 'pierce', offdagger: 'pierce', throwdagger: 'pierce', rapier: 'pierce', pickaxe: 'pierce', whip: 'slash' };
import { COMBO_CLASS } from '../rpg/combos.js';

// costs and feel; damage is the weapon's own (src/rpg/equipment.js) scaled by skill, strength and nodes
export const MELEE = {
  lightCost: 8, heavyCost: 14, chargeCost: 20,     // stamina per swing (charged: the Overhead smash node's 20)
  chargeAfter: 0.28,                               // hold attack this long to start charging instead of a light swing
  chargeFull: 1.0,                                 // seconds to a full charge
  arc: 1.1,                                        // half-angle of a swing's reach in front of you (rad)
  bodyReach: 0.75,                                 // arm and shoulder, before the weapon's own reach (m)
  blockCost: 10,                                   // stamina per blocked blow (Guarded grip: −10% per rank)
  blockArc: 1.2,                                   // blocks blows from within this half-angle of where you look
  attackSlow: 0.45, blockSlow: 0.6,                // movement speed while swinging / guarding
  perfectBlock: 0.25,                              // guard raised this long or less before the blow: a perfect block
  counterWindow: 0.6, counterWindowPerfect: 1.0,   // seconds after a block in which an attack is a counter
  counterCost: 12, counterCool: 2.0,               // stamina, and seconds before the next counter
  counterFactor: 1.6, counterFactorPerfect: 2.0,   // damage (and stagger) of the counter's blow
  // skill gained: a perfect hit (or perfect block) is worth the full amount, an ordinary one half; training dummies 10%
  xpHit: 0.05, xpBlock: 0.02, xpNormal: 0.5, xpDummy: 0.1,
};
// guarding with the weapon itself, by how it's held: share of damage stopped, share of the stamina cost absorbed
const GUARD = { one: { block: 0.6, stability: 0.2 }, dagger: { block: 0.45, stability: 0.1 }, two: { block: 0.75, stability: 0.35 }, spear: { block: 0.6, stability: 0.25 }, staff: { block: 0.7, stability: 0.3 } };

// castLayout(): how the hands are set for magic (src/game/spellcast.js layout()): { L, R } say which mouse
// buttons casting has taken (a focus in the main hand takes the left; a focus in the off hand the right).
export function createCombat({ character, player, body, onHit, onSwing, onPerfect, castLayout = () => null }) {
  const st = player.state;
  let prevU = null, pressT = null, charging = null, pending = null, swingHits = null, lastSwing = null, combo = null, sinceSwing = 9;
  let recoverUntil = 0, wasBusy = false, channel = null, counterPress = null;   // (recovery after a combo ends or breaks)
  let queued = null, now = 0, blockT0 = -9, blockWant = false, counter = null, counterCool = 0;   // (guard counter)

  const weapon = () => {
    const eq = body()?.gear.equipped() || {}, item = eq.mainHand && ITEMS[eq.mainHand];
    return item && item.damage ? item : null;
  };
  const skillOf = w => character.skills[w.skill] ?? 100;
  // ranks of a node in the held weapon's tree (0 when it doesn't have it)
  const R = (id, w = weapon()) => w ? nodeRank(character, w.skill, id) || 0 : 0;
  const art = w => w && ARTS[w.skill];
  // the perfect-combo window and bonus for this weapon, with the tree's passives
  const timingFor = w => { const T = comboTiming(w.weapon), wide = 0.1 * R('keenEye', w) + 0.05 * (R('timing1', w) + R('timing2', w) + R('timing3', w) + R('timing4', w));
    return { win: T.win * (1 + wide), bonus: T.bonus + 0.05 * R('cleanStrikes', w), rec: T.rec * (1 - 0.15 * R('quickReset', w)) }; };
  // the follow-up a perfect light / heavy flows into right after the current special, if learned
  const followUp = (w, kind) => { if (combo?.kind !== 'special' || !combo.move) return null; const m = art(w)?.moves[combo.move], id = m?.[kind]; return id && R(id, w) > 0 ? art(w).moves[id] : null; };
  // the specials this character has learned for the weapon, by how many lights come before them
  const specialAt = (w, p) => art(w)?.specials.find(sp => sp.at === p && R(sp.node, w) > 0) || (p >= 4 ? art(w)?.specials.find(sp => sp.at === 4 && R(sp.node, w) > 0) : null);
  const nextSpecial = (w, p) => art(w)?.specials.filter(sp => sp.at > p && R(sp.node, w) > 0).sort((a, b) => a.at - b.at)[0] || null;
  const firstSpecial = w => nextSpecial(w, -1);
  // damage of one blow: weapon × skill (square root: 400 doubles it) × strength × nodes × the swing's own factor
  function damageOf(w, factor) {
    const sk = Math.sqrt(Math.max(10, skillOf(w)) / 100), str = Math.sqrt(Math.max(10, effectiveMain(character).strength) / 100);
    const nodes = (1 + (w.skill === 'mace' ? 0.04 * (nodeRank(character, 'mace', 'heavySwing') || 0) : 0)) * (1 + 0.03 * R('drills', w));
    return w.damage * sk * str * nodes * factor;
  }
  function staggerOf(w, dmg, factor) {
    const node = 1 + (w.skill === 'mace' ? 0.1 * (nodeRank(character, 'mace', 'boneBreaker') || 0) : 0);
    return dmg * 0.08 * node * (w.weight ? Math.sqrt(w.weight / 3) : 1) * (factor > 1.2 ? 1.6 : 1);
  }
  function pay(n) { if (st.stamina < n * 0.5) return false; st.stamina = Math.max(0, st.stamina - n); st.sinceSpend = 0; return true; }

  // the combo's next step for a light or heavy press: carries the chain on if the last swing ended moments ago
  function nextStep(kind, cont = false) {
    const b = body(), w = weapon(); if (!b || !w) return null;
    const hold = b.combat.hold || 'one', len = comboLength(w.weapon, skillOf(w)), open = cont && combo && combo.w === w;
    let i = 0, branch = false;
    // the light chain is at its end (kept open only for a special): a light press ends the combo → recovery
    if (open && kind === 'light' && combo.kind === 'light' && combo.i + 1 >= len) { combo = null; queued = null; recoverUntil = now + timingFor(w).rec; return null; }
    if (open) {
      if (kind === 'light') {
        if (combo.kind === 'light' && combo.i + 1 < len) i = combo.i + 1;
        else if (combo.kind === 'counter' && len > 1) i = 1;                          // after a guard counter: on from the chain's 2nd attack
        else if (combo.kind === 'heavy' && combo.branch && combo.continues && combo.i + 1 < len) i = combo.i + 1;   // a branch that carries on
      } else if (combo.kind === 'light' && combo.i + 1 < len) { i = combo.i + 1; branch = true; }                 // heavy off the light chain
      else if (combo.kind === 'counter' && len > 1) { i = 1; branch = true; }                                    // (the counter counts as the 1st attack)
      else if (combo.kind === 'heavy' && !combo.branch && combo.i + 1 < heavyLength(len)) i = combo.i + 1;        // the heavy chain
    }
    // a learned special takes over the heavy at this point of the light chain (p: lights before it)
    if (kind === 'heavy') {
      if (open && combo.kind === 'special') { const f = queued?.perfect && followUp(w, 'heavy'); if (f) return specialStep(f, w, len, combo.p); }
      const p = !open ? 0 : combo.kind === 'light' ? combo.i + 1 : combo.kind === 'counter' ? 1 : null, sp = p !== null && specialAt(w, p);
      if (sp) return specialStep(sp, w, len, p);
    }
    // combo extenders: after a special a perfect press flows into the next special (Flowing steel); after a guard counter,
    // into the first one (Unbroken guard)
    if (kind === 'light' && open && queued?.perfect) {
      const f = combo.kind === 'special' && followUp(w, 'light');                 // a learned follow-up comes before Flowing steel
      if (f) return specialStep(f, w, len, combo.p);
      const sp = combo.kind === 'special' && R('flowingSteel', w) ? nextSpecial(w, combo.p) : combo.kind === 'counter' && R('counterFlow', w) ? firstSpecial(w) : null;
      if (sp) return specialStep(sp, w, len, sp.at);
    }
    const S = comboStep(hold, kind, i, kind === 'heavy' && !branch ? heavyLength(len) : len, w.weapon);
    return { ...S, branch, len, w };
  }
  function specialStep(sp, w, len, p) {
    const m = moveAtRank(sp, Math.max(1, R(sp.node, w)));
    return { attack: m.clip, kind: 'special', i: p, p, factor: m.damage * (1 + 0.1 * R('finesse', w)), speed: m.speed, cost: m.stamina / MELEE.heavyCost, last: true, special: m, branch: false, len, w };
  }
  // can the current chain go on after this step? (the timing ring shows only then)
  function chainCanGo() {
    if (!combo) return false;
    const len = combo.len;
    if (combo.kind === 'special') { const m = art(combo.w)?.moves[combo.move]; if (!m || m.ends) return false; return !!(followUp(combo.w, 'light') || followUp(combo.w, 'heavy') || (R('flowingSteel', combo.w) && nextSpecial(combo.w, combo.p))); }
    if (combo.kind === 'counter') return len > 1 || !!specialAt(combo.w, 1) || !!(R('counterFlow', combo.w) && firstSpecial(combo.w));   // (a counter carries on into the chain's 2nd attack)
    return combo.kind === 'light' ? combo.i + 1 < len || !!specialAt(combo.w, combo.i + 1) : combo.branch ? combo.continues && combo.i + 1 < len : combo.i + 1 < heavyLength(len);
  }
  // a press now: where is it against the timing window? → { cont, perfect }
  function judge(C) {
    const w = weapon(); if (!w || !combo || combo.w !== w || !chainCanGo()) return { cont: false, perfect: false };
    const T = timingFor(w), A = C.action;
    const off = A && A.type === 'attack' && !A.hold ? -(1 - A.u) * (A.dur || 0.8) : sinceSwing;   // seconds from the swing's end (− before)
    if (off > T.win) return { cont: false, perfect: false };                    // too late: the chain is over
    return { cont: true, perfect: off >= -T.win, bonus: T.bonus };
  }
  function swingStep(S, hold = false) {
    if (!S) return false;
    const q = queued; queued = null;
    if (q?.perfect) { S = { ...S, factor: S.factor * (1 + q.bonus) }; onPerfect?.('combo'); }
    const ok = startSwing(S.attack, S.factor, (S.kind === 'heavy' ? MELEE.heavyCost : MELEE.lightCost) * S.cost, hold, S.speed);
    if (ok) lastSwing.perfect = !!q?.perfect;
    if (ok) { combo = { kind: S.kind, i: S.i, p: S.p, move: S.special?.node, w: S.w, branch: S.branch, continues: S.continues, len: S.len }; lastSwing.special = S.special || null; channel = S.special?.channel ? S : null; }
    return ok;
  }
  function startSwing(variant, factor, cost, hold = false, speedMul = 1) {
    const b = body(), w = weapon(); if (!b || !w) return false;
    if (!hold && !pay(cost * (1 - 0.05 * R('steady', w)))) return false;
    const speed = speedMul * (w.speed || 1) * (1 + (w.skill === 'mace' ? 0.04 * Math.min(3, momentum.stacks) * (nodeRank(character, 'mace', 'momentum') || 0) : 0)) * (1 + 0.03 * R('flow', w));
    if (!b.combat.attack({ variant, hold, speed })) return false;
    lastSwing = { variant, factor, cost, w, dur: 0.8 }; swingHits = new Set();
    onSwing?.(variant);
    return true;
  }
  const momentum = { stacks: 0, t: 9 };

  // targets in the swing's arc this frame
  function sweep(targets) {
    const w = lastSwing.w, reach = MELEE.bodyReach + (w.reach || 6) * 0.1, clip = SWORD_CLIPS[lastSwing.variant];
    const arc = lastSwing.special?.arc || clip?.arc || MELEE.arc, most = lastSwing.special?.targets || clip?.targets || CLASS_TARGETS[COMBO_CLASS[w.weapon] || 'one'];
    const room = most - swingHits.size; if (room <= 0) return [];
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), out = [];
    for (const t of targets) {
      if (!t.alive || swingHits.has(t)) continue;
      const dx = t.pos.x - st.pos.x, dz = t.pos.z - st.pos.z, d = Math.hypot(dx, dz) - (t.radius || 0.3);
      if (d > reach) continue;
      if (t.pos.y > st.pos.y + 2.2 || t.pos.y + (t.height || 1.8) < st.pos.y + 0.2) continue;   // above or below the swing
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(1e-3, Math.hypot(dx, dz)))));
      if (ang > arc && Math.hypot(dx, dz) > (t.radius || 0.3) + 0.3) continue;
      out.push({ t, score: ang + d * 0.25 });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, room).map(o => o.t);   // the ones nearest the blade's line
  }

  return {
    get drawn() { return !!body()?.combat.drawn; },
    get blocking() { return !!body()?.combat.drawn && (body()?.combat.blockK || 0) > 0.5 && !body()?.combat.action; },   // (a shield with a focus counts)
    get charge() { return charging ? Math.min(1, charging.t / MELEE.chargeFull) : 0; },
    get combo() { return combo ? { kind: combo.kind, step: combo.i + 1, len: combo.kind === 'heavy' && !combo.branch ? heavyLength(combo.len) : combo.len } : null; },
    // a blow coming from direction (dx, dz) (where it comes from, relative to you): blocked? costs stamina
    // the reticle's timing ring: k = how far toward the window's middle (1 = now), win = the window's half-width in k
    get timing() {
      const b = body(), C = b?.combat, w = weapon(); if (!C || !w || !combo || combo.w !== w || !chainCanGo() || pending) return null;
      const A = C.action, T = timingFor(w);
      if (A && A.type === 'attack' && !A.hold) return { k: A.u, win: T.win / (A.dur || 0.8) };
      if (!C.busy && sinceSwing <= T.win) return { k: 1 + sinceSwing / (lastSwing?.dur || 0.8), win: T.win / (lastSwing?.dur || 0.8) };
      return null;
    },
    get recovering() { return now < recoverUntil; },
    // what the current swing deals (for the swing trail's colour): its clip's type, else the weapon's; an enchantment's
    // element when weapons get them (lastSwing.element)
    get swingType() { if (!lastSwing) return null; return lastSwing.element || SWORD_CLIPS[lastSwing.variant]?.type || WEAPON_TYPE[lastSwing.w?.weapon] || 'slash'; },
    // back to standing ready: nothing queued, charging, channelling or countering (the pose-reset key)
    reset() { combo = null; pending = null; pressT = null; queued = null; channel = null; counterPress = null; charging = null; recoverUntil = 0; },
    get counter() { return counter && now < counter.until && counterCool <= 0 ? { by: counter.by, perfect: counter.perfect, left: counter.until - now } : null; },
    // a blow coming from direction (dx, dz) (where it comes from, relative to you): blocked? → { by, through, perfect }
    // (through: the share of the blow's damage that still gets past the guard), or false
    tryBlock(dx, dz, power = 1) {
      if (!this.blocking) return false;
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), l = Math.hypot(dx, dz) || 1;
      if (Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / l))) > MELEE.blockArc) return false;
      const b = body(), w = weapon(), eq = b?.gear.equipped() || {}, sh = eq.offHand && ITEMS[eq.offHand]?.weapon === 'shield' ? ITEMS[eq.offHand] : null;
      const by = sh ? 'shield' : 'weapon', G = sh || GUARD[b?.combat.hold] || GUARD.one;
      const perfect = now - blockT0 <= MELEE.perfectBlock + 0.04 * R('steadyGuard', w);
      const grip = 1 - (w?.skill === 'mace' ? 0.1 * (nodeRank(character, 'mace', 'guardedGrip') || 0) : 0);
      const cost = MELEE.blockCost * power * grip * (1 - (G.stability || 0)) * (perfect ? 0.5 : 1) * (1 - 0.08 * R('braced', w));
      if (st.stamina < cost * 0.3) return false;                                  // guard broken
      st.stamina = Math.max(0, st.stamina - cost); st.sinceSpend = 0;
      const xp = MELEE.xpBlock * (perfect ? 1 : MELEE.xpNormal);
      if (sh) train(character, 'shield', xp); else if (w) train(character, w.skill, xp);
      counter = { until: now + (perfect ? MELEE.counterWindowPerfect : MELEE.counterWindow) + 0.1 * R('quickRecovery', w), by, perfect };
      if (perfect) onPerfect?.('block');
      const stop = Math.min(0.95, (G.block ?? 0.6) + 0.05 * R('braced', w));
      return { by, perfect, deflect: perfect && R('deflect', w) > 0 ? 0.9 + 0.3 * (R('deflect', w) - 1) : 0, through: perfect ? 0 : Math.max(0, 1 - stop) * (1 - 0.15 * R('ironLine', w)) };
    },
    update(dt, input, targets, locked) {
      const b = body(); if (!b) return;
      const C = b.combat, w = weapon();
      momentum.t += dt; if (momentum.t > 2) momentum.stacks = 0;
      const free = !st.hang && !st.climb && !st.trav && !st.swimming && !st.move && !st.roll && st.sit < 0.05;
      if (locked && input.pressed('draw') && free && !C.busy) { if (C.drawn) C.sheathe(); else if (b.gear.equipped().mainHand || b.gear.equipped().offHand) C.draw(); }
      if (!free && !st.roll && C.drawn && !C.busy) C.sheathe();                 // climbing, swimming...: put it away (a dodge roll keeps it out)
      const L = castLayout(), eq = b.gear.equipped(), shield = eq.offHand && ITEMS[eq.offHand]?.weapon === 'shield';
      const drawn = C.drawn && w && !L?.L;                                       // a focus in the main hand: the left button casts
      // block (a shield blocks even with a focus in the main hand; a focus in the off hand takes the right button)
      const want = !!(locked && C.drawn && (w || shield) && !L?.R && input.held('block') && !charging);
      now += dt; counterCool = Math.max(0, counterCool - dt);
      if (want && !blockWant) blockT0 = now; blockWant = want;
      C.block(want);
      // guard counter: an attack while the guard is up (or just after) and a block has just landed
      let pressUsed = false;
      if (locked && drawn && free && input.pressed('attack') && counter && now < counter.until && counterCool <= 0 && !(C.busy && C.action?.type === 'attack')) {
        counterPress = { t: 0, by: counter.by, perfect: counter.perfect }; pressUsed = true;   // tap or hold? decided as it's held
      }
      if (counterPress) {
        if (input.held('attack') && counterPress.t < 0.2) counterPress.t += dt, pressUsed = true;
        else {
          const hold = counterPress.t >= 0.2, cp = counterPress; counterPress = null; pressUsed = true;
          const A2 = art(w), tc = A2 && (hold ? A2.counters.hold : A2.counters.tap), useT = tc && R(tc.node, w) > 0;   // the tree's counter for a tap / hold, if learned
          const m = useT ? moveAtRank(tc, R(tc.node, w)) : null;
          const S = useT ? m.clip : counterMove(w.weapon, C.hold || 'one', cp.by);
          const factor = useT ? (cp.perfect ? tc.perfectDamage : tc.damage) * (1 + (tc.perRank?.damage || 0) * (R(tc.node, w) - 1)) : cp.perfect ? MELEE.counterFactorPerfect : MELEE.counterFactor;
          if (pay(MELEE.counterCost)) {
            C.block(false);
            if (startSwing(S, factor, 0, false, 1.1)) {
              lastSwing.counter = cp.by; lastSwing.special = useT ? m : null; lastSwing.perfect = cp.perfect;
              combo = { kind: 'counter', i: 0, w, len: comboLength(w.weapon, skillOf(w)) }; pressT = null; pending = null; queued = null;
              counterCool = Math.max(0.6, MELEE.counterCool - 0.4 * R('quickRecovery', w)); counter = null;
            }
          }
        }
      }
      // attacks: a tap swings; holding charges an overhead (with Overhead smash) and releasing lets it go
      if (C.busy && C.action?.type === 'attack') sinceSwing = 0; else sinceSwing += dt;
      if (locked && drawn && free) {
        if (input.pressed('attack') && !pressUsed && now >= recoverUntil && !(C.busy && C.action?.type !== 'attack') && !pending && pressT === null) {
          queued = judge(C);
          if (C.busy) pending = { t: 0, held: true };                             // during a swing: the next step, decided when it ends
          else pressT = 0;
        }
        if (pending) { if (pending.held && input.held('attack')) pending.t += dt; else pending.held = false; }
        // a press made during the last swing: tap → the light step; still held → let it become a heavy (or a tap on release)
        if (pending && !C.busy && combo && !queued?.cont) { pending = null; queued = null; combo = null; recoverUntil = now + timingFor(w).rec; }   // pressed during the combo's last move: it ends, recover first
        if (pending && !C.busy) { if (pending.held) pressT = pending.t; else swingStep(nextStep('light', queued?.cont)); pending = null; }
        if (pressT !== null) {
          pressT += dt;
          const neutral = !queued?.cont;
          const canCharge = neutral && (w.skill !== 'mace' || hasNode(character, 'mace', 'overheadSmash'));
          if (!input.held('attack')) {                                           // released early: a light step
            pressT = null; swingStep(nextStep('light', queued?.cont));
          } else if (pressT > MELEE.chargeAfter && canCharge && w.skill === 'mace' && st.stamina > MELEE.chargeCost * 0.5) {
            pressT = null; queued = null; if (startSwing('heavy', 1, 0, true)) { charging = { t: 0 }; combo = { kind: 'heavy', i: 0, w, branch: false, continues: false, len: 2 }; }
          } else if (pressT > MELEE.chargeAfter) {                               // held: a heavy step (a branch off a light chain, or the heavy chain)
            pressT = null; swingStep(nextStep('heavy', queued?.cont));
          }
        }
        if (charging) {
          charging.t += dt;
          if (!input.held('attack')) {
            const k = Math.min(1, charging.t / MELEE.chargeFull);
            pay(MELEE.chargeCost * (0.4 + 0.6 * k)); lastSwing.factor = 1.3 + 0.5 * k; lastSwing.charged = k; C.release(); charging = null;
          }
        }
      } else { pressT = null; pending = null; if (charging) { C.release(); charging = null; } }
      // a channelled special (Thousand cuts) loops while attack is held and there's stamina; letting go ends the combo
      if (channel && !C.busy) {
        if (locked && drawn && input.held('attack') && pay(channel.special.stamina * (1 - 0.05 * R('steady', w)))) { const ch = channel; startSwing(ch.attack, ch.factor, 0, false, ch.speed); lastSwing.special = ch.special; lastSwing.perfect = false; channel = ch; }
        else channel = null;
      }
      // recovery: when a swing ends with nothing to carry the chain on (the combo's end), or the chain lapses (too late),
      // the main hand needs a moment before it can attack again (blocking and the off hand are free)
      const busyAtk = C.busy && C.action?.type === 'attack';
      if (wasBusy && !busyAtk && combo && !pending && pressT === null && !chainCanGo() && w) recoverUntil = now + timingFor(w).rec;
      wasBusy = busyAtk;
      if (combo && !C.busy && !pending && pressT === null && sinceSwing > timingFor(combo.w).win + 0.02) { if (combo.kind !== 'counter') recoverUntil = Math.max(recoverUntil, now + timingFor(combo.w).rec * 0.6); combo = null; }   // too late: the chain lapses
      // hits during the swing's window
      const A = C.action;
      // the swing's window, between this frame and the last (so a slow frame can't skip over it)
      const u0 = A && A.type === 'attack' && !A.hold ? (prevU ?? 0) : null, u1 = A ? A.u : null;
      prevU = A && A.type === 'attack' && !A.hold ? A.u : null;
      if (A && A.type === 'attack' && lastSwing && A.dur) lastSwing.dur = A.dur;
      // a special that drives the body forward (the closing thrust)
      const dash = A && A.type === 'attack' && lastSwing?.special?.dash;
      if (dash && lastSwing.special.jump && A.u >= dash.from && !lastSwing.jumped) { lastSwing.jumped = true; st.vel.y = lastSwing.special.jump; st.onGround = false; }
      if (dash && A.u >= dash.from && A.u <= dash.to) { const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw); st.vel.x = fx * dash.speed; st.vel.z = fz * dash.speed; }
      // several hits in one move (the thousand cuts): each window hits afresh
      if (A && A.type === 'attack' && A.hits && lastSwing) {
        const wi = A.hits.findIndex(h => u1 >= h[0] && u1 <= h[1]);
        if (wi >= 0 && wi !== lastSwing.win) { lastSwing.win = wi; swingHits.clear(); }
      }
      const inHit = A && A.hits ? A.hits.some(h => u1 >= h[0] && u0 <= h[1]) : A && A.hit && u1 >= A.hit[0] && u0 <= A.hit[1];
      if (A && A.type === 'attack' && lastSwing && !A.hold && inHit) {
        for (const t of sweep(targets)) {
          swingHits.add(t);
          const dmg = damageOf(lastSwing.w, lastSwing.factor);
          const sp = lastSwing.special;
          const stagT = sp?.staggerChance && Math.random() < sp.staggerChance ? 1 : 0;
          const clipD = SWORD_CLIPS[lastSwing.variant], fx2 = -Math.sin(st.yaw), fz2 = -Math.cos(st.yaw), reachD = Math.hypot(t.pos.x - st.pos.x, t.pos.z - st.pos.z);
          const type = clipD?.type || WEAPON_TYPE[lastSwing.w.weapon] || 'slash', aim = { x: st.pos.x + fx2 * reachD, y: st.pos.y + (clipD?.aimH ?? 1.1), z: st.pos.z + fz2 * reachD };   // (what it deals, and where it lands)
          const info = { type, aim, perfect: !!lastSwing.perfect, dmg, stun: Math.max(sp?.stun || 0, stagT), slow: sp?.slow || null, bleed: sp?.bleed ? { dps: dmg * sp.bleed.k, t: sp.bleed.t } : null, knockdown: sp?.knockdown || 0, launch: sp?.launch || 0, pierce: sp?.pierce || 0, stagger: staggerOf(lastSwing.w, dmg, lastSwing.factor) * (lastSwing.counter ? 1.5 : 1) * (sp?.stagger || 1), from: { x: st.pos.x, z: st.pos.z }, variant: lastSwing.variant, charged: lastSwing.charged || 0, counter: lastSwing.counter || null };
          t.hit(dmg, info); onHit?.(t, info);
          if (lastSwing.perfect && !lastSwing.refunded && R('secondBreath', lastSwing.w)) { lastSwing.refunded = true; st.stamina += 2 * R('secondBreath', lastSwing.w); }
          train(character, lastSwing.w.skill, MELEE.xpHit * (1 + (lastSwing.charged || 0)) * (lastSwing.perfect ? 1 : MELEE.xpNormal) * (t.kind === 'dummy' ? MELEE.xpDummy : 1));
          momentum.stacks = Math.min(3, momentum.stacks + 1); momentum.t = 0;
        }
      }
      st.combatSlow = A && A.type === 'attack' ? MELEE.attackSlow * (1 + 0.06 * R('footwork', w)) : C.drawn && (C.blockK || 0) > 0.3 ? MELEE.blockSlow : 1;
    },
  };
}
