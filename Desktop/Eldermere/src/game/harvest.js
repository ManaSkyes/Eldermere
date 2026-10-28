// src/game/harvest.js — harvesting a body (an animal's: MONSTERS[id].harvest), in stages: skin it, then butcher it.
// harvest: { creature, stages: [{ id, verb, skill, tool: 'skin'|'butcher', yields: { part: [min, max] }, time }] }
// (an old { yields, time } record is one skinning stage). Each stage done moves the body on to the next; after the
// last it's gone. Every stage plays the same skill-check minigame with its own knife and its own skill.
//
// Walk up to a body that's lying there: "E: skin it · hold E: let your hands work".
//   Manual — a skinning knife in your hand, sawing at the hide, and a run of skill checks (like Dead by Daylight's):
//     a needle sweeps round a ring; press Space (jump is locked while you work) while it's in the marked arc (its bright core is a great hit). They keep
//     coming until the job's done. Low skill: checks come often, the needle is quick, the arc is thin. High skill:
//     fewer, slower, wider. Your hit-to-miss ratio sets the quality and how much you get; miss every one and you get nothing.
//   Auto — no checks; a little slower, and the result rests on your Skinning skill alone (with some luck).
// Walking away or drawing back cancels it. What it gives goes into the inventory as materials ('yuribor.hide',
// 'yuribor.meat': src/data/materials.js), their quality hidden until appraised (src/rpg/quality.js), and Skinning
// trains with every unit.
import { MATERIALS, TIER_RANK } from '../data/materials.js';
import { effectiveMain, train } from '../rpg/stats.js';
import { learnStage } from '../rpg/bestiary.js';
import { gatherQuality } from '../rpg/quality.js';
import { addMaterial } from '../rpg/inventory.js';
import { RANKS, rankOf } from '../data/professions.js';

export function createHarvest({ THREE, scene, monsters, character, inv, input, promptEl, toast, keyName, audio }) {
  // ---- the knives: a skinner (short curved blade) and a butcher's (broad, heavy) — held in the right hand while you work ----
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.8 }), steel = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.3, metalness: 0.8 });
  function makeKnife(shape, w) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.11, 8), wood));
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), steel); blade.position.set(-w / 2, 0.055, -0.002); g.add(blade);
    g.scale.setScalar(13); g.visible = false; return g;   // (the body works in decimetres; a touch large so it reads)
  }
  const skinShape = new THREE.Shape(); skinShape.moveTo(0, 0); skinShape.lineTo(0.024, 0); skinShape.quadraticCurveTo(0.034, 0.09, 0.004, 0.14); skinShape.quadraticCurveTo(0.006, 0.06, 0, 0);   // (the belly of a skinner's blade)
  const butchShape = new THREE.Shape(); butchShape.moveTo(0, 0); butchShape.lineTo(0.06, 0); butchShape.lineTo(0.06, 0.15); butchShape.quadraticCurveTo(0.03, 0.17, 0, 0.16); butchShape.lineTo(0, 0);   // (a cleaver-like slab)
  const KNIVES = { skin: makeKnife(skinShape, 0.024), butcher: makeKnife(butchShape, 0.06) };
  let knife = KNIVES.skin;
  const stagesOf = H => H.stages || [{ id: 'skin', verb: 'skin', skill: 'skinning', tool: 'skin', yields: H.yields, time: H.time }];
  const stageOf = c => stagesOf(c.A.M.harvest)[c.A.corpse?.stage || 0];
  const skill = () => character.skills?.[job?.S?.skill || 'skinning'] ?? 0;
  const k01 = () => { const i = RANKS.indexOf(rankOf(skill())); return Math.max(0, Math.min(1, i / Math.max(1, RANKS.length - 1))); };
  // ---- the skill-check ring (HUD) ----
  const hud = document.createElement('div'); hud.className = 'harvest-hud';
  hud.style.cssText = 'position:fixed;left:50%;top:58%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:30;font:13px system-ui,sans-serif;color:#f0ece4;text-shadow:0 1px 2px #000;display:none';   // (shown only while working: display, not [hidden], which the flex would override)
  hud.innerHTML = '<canvas width="150" height="150"></canvas><div class="hv-bar" style="width:180px;height:6px;background:rgba(0,0,0,.5);border-radius:3px;overflow:hidden"><div style="height:100%;width:0;background:#c8a060"></div></div><div class="hv-text"></div>';
  document.body.appendChild(hud);
  const cv = hud.querySelector('canvas'), g2 = cv.getContext('2d'), barEl = hud.querySelector('.hv-bar > div'), textEl = hud.querySelector('.hv-text');
  let job = null, holdT = 0, near = null, tap = false;
  function start(corpse, mode) {
    const M = corpse.A.M, H = M.harvest, S = stageOf(corpse);
    job = { corpse, mode, H, S, M, t: 0, hits: 0, great: 0, misses: 0, check: null, nextCheck: 0.8, saw: 0, from: { ...corpse } };
    job.need = S.time * (mode === 'auto' ? 1.3 : 1) * (1.5 - 0.7 * k01());
    knife = KNIVES[S.tool] || KNIVES.skin; knife.visible = true; hud.style.display = 'flex'; cv.style.display = mode === 'manual' ? '' : 'none'; barEl.style.width = '0';
    const what = `${S.verb[0].toUpperCase()}${S.verb.slice(1).replace(/e$/, '')}ing the ${M.name}`;
    textEl.textContent = mode === 'manual' ? `${what}… press ${keyName(input.bindings.jump[0])} in the marked arc` : `${what} (by habit)…`;
  }
  function stop(msg) { job = null; for (const k of Object.values(KNIVES)) { k.visible = false; k.parent?.remove(k); } hud.style.display = 'none'; g2.clearRect(0, 0, 150, 150); if (msg) toast(msg); }
  function newCheck() {   // a check: where the arc is, how wide, how fast the needle — by skill
    const k = k01(), w = (25 + 45 * k) * Math.PI / 180;
    return { a: 0, period: 0.8 + 0.8 * k, at: Math.PI * (0.7 + Math.random() * 1.0), w, great: w / 3, done: false };
  }
  function finish() {
    const j = job, H = j.H, S = j.S, n = j.hits + j.misses, K = j.corpse.A.corpse, all = stagesOf(H);
    const next = () => { K.stage = (K.stage || 0) + 1; if (K.stage >= all.length) monsters.harvested(j.corpse.A); };   // on to the next stage, or the body's done
    const verb = S.verb[0].toUpperCase() + S.verb.slice(1).replace(/e$/, '') + 'ed';
    if (j.mode === 'manual' && n > 0 && j.hits === 0) { learnStage(character, j.corpse.A.id, S.id); next(); stop(`Every cut went wrong — the ${S.id === 'skin' ? 'hide' : 'carcass'} is ruined. Nothing worth keeping.`); return; }   // a total failure
    // How well it went (0..1), then what that gives — by importance: your skill, perks, Finesse, Luck.
    //   manual: your hit ratio (great hits count full, good ones 0.6) is the heart of it; skill adds a little on top
    //   auto:   your hands alone — poor at low skill (about a fifth of the way at Unskilled), better as you rise
    const m = effectiveMain(character), k = k01(), perk = (character.perks?.[S.skill] || 0) / 100;   // (perks: points from skill-tree nodes, when they exist)
    const base = j.mode === 'manual' ? (n ? (j.great + 0.6 * (j.hits - j.great)) / n : 0.5) : 0.1 + 0.4 * k + Math.random() * 0.1;
    const score = Math.max(0, Math.min(1, base + 0.12 * k + perk + 0.08 * (m.finesse - 100) / 100 + 0.03 * (m.luck - 100) / 100));
    const sround = x => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);   // (1.6 is 2 sixty percent of the time)
    const got = [];
    for (const [part, [lo, hi]] of Object.entries(S.yields)) {
      const id = `${H.creature}.${part}`; if (!MATERIALS[id]) continue;
      let count = Math.min(hi, sround(lo + (hi - lo) * score));
      if (j.mode === 'auto' && hi > 0) count = Math.max(1, count);   // auto always gets something
      for (let u = 0; u < count; u++) addMaterial(inv, id, gatherQuality(character, id, { bonus: (score - 0.55) * 40 + perk * 20, train: false }), 1, true);   // (your own work: you know its quality)
      if (count) got.push(`${count} ${MATERIALS[id].name || part}`);
    }
    // the skill trains by the checks you hit: a good hit 0.03, a great one 0.05 (misses teach nothing); auto counts as
    // three good hits. A little Finesse comes with it.
    const amt = j.mode === 'manual' ? 0.03 * (j.hits - j.great) + 0.05 * j.great : 0.09;
    if (amt > 0) train(character, S.skill, amt, { taskRank: TIER_RANK[MATERIALS[`${H.creature}.${Object.keys(S.yields)[0]}`]?.tier ?? 0], stats: ['finesse'], statScale: 0.5 });
    learnStage(character, j.corpse.A.id, S.id);   // (the bestiary: what this stage can give is now known)
    next();
    const more = all[K.stage] ? ` It can still be ${all[K.stage].verb.replace(/e$/, '')}ed.` : '';
    stop(got.length ? `${verb}: ${got.join(', ')}${j.mode === 'manual' ? ` — ${j.hits}/${n} checks hit (${j.great} great)` : ''}.${more}` : `Nothing worth keeping.${more}`);
  }
  // the hand at work: a sawing stroke on the right forearm (after the body is posed each frame)
  function sawArm(body, dt) {
    const fa = body?.rig?.byName?.['lowerarm01.R'], w = body?.rig?.byName?.['wrist.R']; if (!fa || !w) return;
    if (knife.parent !== w) { w.add(knife); knife.position.set(0, -0.6, 0.3); knife.rotation.set(Math.PI / 2, 0, 0); }
    job.saw += dt * (job.mode === 'auto' ? 7 : 9); const s = Math.sin(job.saw);
    fa.rotateX(0.35 + 0.35 * s); w.rotateZ(0.25 * s);
  }
  function draw(c) {
    const W = 150, R = 58; g2.clearRect(0, 0, W, W);
    g2.lineWidth = 8; g2.strokeStyle = 'rgba(0,0,0,.45)'; g2.beginPath(); g2.arc(75, 75, R, 0, Math.PI * 2); g2.stroke();
    if (!c) return;
    const A0 = c.at - c.w / 2 - Math.PI / 2;
    g2.strokeStyle = 'rgba(240,236,228,.85)'; g2.beginPath(); g2.arc(75, 75, R, A0, A0 + c.w); g2.stroke();
    g2.strokeStyle = '#ffd23a'; g2.beginPath(); g2.arc(75, 75, R, c.at - c.great / 2 - Math.PI / 2, c.at + c.great / 2 - Math.PI / 2); g2.stroke();
    const na = c.a - Math.PI / 2; g2.strokeStyle = '#ff5a3a'; g2.lineWidth = 3; g2.beginPath(); g2.moveTo(75, 75); g2.lineTo(75 + Math.cos(na) * (R + 8), 75 + Math.sin(na) * (R + 8)); g2.stroke();
  }
  function flashRing(col) { cv.style.filter = `drop-shadow(0 0 10px ${col})`; setTimeout(() => cv.style.filter = '', 160); }
  // returns true while it has the interact key (so nothing else takes it)
  function update(dt, st, body) {
    if (job) {
      const j = job;
      if (Math.hypot(st.pos.x - j.from.x, st.pos.z - j.from.z) > j.corpse.reach + 1.5) { stop('You stepped away — skinning stopped.'); return false; }
      sawArm(body, dt);
      j.t += dt;
      if (j.mode === 'manual') {
        if (!j.check && (j.nextCheck -= dt) <= 0) j.check = newCheck();
        const c = j.check;
        if (c) {
          c.a += dt * Math.PI * 2 / c.period;
          const inArc = Math.abs(c.a - c.at) <= c.w / 2, inGreat = Math.abs(c.a - c.at) <= c.great / 2;
          if (tap) { tap = false;
            if (inArc) { j.hits++; if (inGreat) { j.great++; audio?.perfect?.('combo'); flashRing('#ffd23a'); } else flashRing('#f0ece4'); }
            else { j.misses++; flashRing('#ff3a3a'); }
            j.check = null; j.nextCheck = (0.9 + 2.1 * k01()) * (0.8 + Math.random() * 0.4);
          } else if (c.a > c.at + c.w / 2 + 0.05) { j.misses++; flashRing('#ff3a3a'); j.check = null; j.nextCheck = (0.9 + 2.1 * k01()) * (0.8 + Math.random() * 0.4); }
        }
        draw(j.check);
      }
      barEl.style.width = `${Math.min(100, j.t / j.need * 100).toFixed(1)}%`;
      if (j.t >= j.need) finish();
      return true;
    }
    // a body near enough to work on?
    near = null; let best = Infinity;
    for (const c of monsters.corpses()) { const d = Math.hypot(st.pos.x - c.x, st.pos.z - c.z); if (d < c.reach && d < best) { best = d; near = c; } }
    if (!near) { holdT = 0; return false; }
    const key = keyName(input.bindings.interact[0]);
    const S = stageOf(near); promptEl.textContent = `${key}: ${S.verb} the ${near.A.M.name} · hold ${key}: let your hands work`;
    if (input.held('interact')) { holdT += dt; if (holdT > 0.6) { holdT = -99; start(near, 'auto'); } }
    else { if (holdT > 0 && holdT <= 0.6) start(near, 'manual'); holdT = 0; }
    return true;
  }
  return { update, get busy() { return !!job; }, get near() { return near; }, cancel() { if (job) stop(); }, set tap(v) { tap = v; }, _start: start };   // (_start: tests)
}
