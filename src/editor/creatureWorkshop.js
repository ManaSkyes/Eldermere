import { LEVEL_STATS, defaultLevels, levelValue } from '../data/monsters.js';
// src/editor/creatureWorkshop.js — the Creature workshop (in monster-lab.html): make your own monsters from the
// creature builder's parts, without code.
//
// You start from a monster (a copy of its body) and change it: move any joint, make limbs thicker or thinner, give a
// chain an aura (the smoky would-be flesh), add new limbs (horns, extra legs, tails, spines — mirrored or not), add
// parts (eyes, glows, spikes, orbs), change colours and smoke, set its health / speed / sight. It keeps the base
// monster's behaviour, moves and voice (a bat-like flyer, or an Umbrafiend-like prowler), so the base's own limbs
// can be reshaped but not removed; new limbs can. Save, and it appears in the creator's Enemies tab under its base's
// group (Swarm / Pack). Export / Import pass creatures between browsers as .json files.
//
//   const W = createWorkshop({ THREE, el, scene, camera, canvas, MONSTERS, monsterSpec, loadCustom, saveCustom, lab })
//   lab: { get id(), get vals(), get C(), setSpec(spec | null), select(id) }   (monster-lab.html)
const CLASSES = {"Essence Tiers": ["Primeval Essence", "Mystic Essence", "Spectral Essence", "Wild Essence"], "Celestial Hierarchy": ["Stellar Dominions", "Solar Regents", "Lunar Sentinels", "Terrestrial Guardians"], "Elemental Circles": ["Corefire", "Deepsea", "Stormwind", "Stoneheart"], "Arcane Orders": ["Archmagi Beasts", "Sorcerer Fiends", "Witchkin Spirits", "Runebound Minions"], "Mythic Classes": ["Titanic Overlords", "Draconic Majesties", "Beastly Sovereigns"]};
const HAZARDS = ['Safe', 'Nuisance', 'Menace', 'Dread', 'Tempest', 'Cataclysmic'], RANKS = ['Wood', 'Bronze', 'Silver', 'Gold', 'Crystal'];
const ACTIVITY = ['Active', 'Controlled', 'Solar', 'Lunar', 'Hibernation', 'Ephemeral Flare', 'Ancient Slumber'];
const GROUPS = [['swarm', 'Swarm (20–30)'], ['pack', 'Pack (5–10)'], ['pair', 'Pair (2–4)'], ['solo', 'Solo'], ['boss', 'Boss']];
const TYPES = ['slash', 'pierce', 'blunt', 'crush', 'fire', 'frost', 'storm', 'earth', 'light', 'lunar', 'dark', 'arcane', 'poison', 'bleed'];
const BASE_IDS = ['nocturianBat', 'umbrafiend'];
export function createWorkshop({ THREE, el, elR = null, scene, camera, canvas, MONSTERS, monsterSpec, loadCustom, saveCustom, lab, GENERA = {}, ROLES = [], makeMonster = null }) {
  let ed = null;          // { id, name, base, spec, stats } while editing
  let ci = 0, ji = 0, pi = -1, lvL = 1, lvShow = 'hp';
  const $ = s => el.querySelector(s) || elR?.querySelector(s);   // (two panels: the body on the left, its data on the right)
  const clone = o => JSON.parse(JSON.stringify(o));
  const baseOf = id => MONSTERS[id]?.base || id;
  // ---- joint markers: dots on the chosen chain's joints, the chosen one bright; click one to choose it ----
  const dotGeo = new THREE.SphereGeometry(0.025, 10, 8), dots = new THREE.Group(); dots.renderOrder = 10; scene.add(dots);
  const matA = new THREE.MeshBasicMaterial({ color: '#ffd23a', depthTest: false, transparent: true }), matB = new THREE.MeshBasicMaterial({ color: '#7fd0ff', depthTest: false, transparent: true, opacity: 0.8 });
  function markers() {
    dots.clear(); const C = lab.C; if (!ed || !C) return;
    const c = ed.spec.chains[ci]; if (!c) return;
    const names = c.mirror ? [`${c.name}.L`, `${c.name}.R`] : [c.name];
    for (const n of names) C.chain(n).forEach((b, j) => { const m = new THREE.Mesh(dotGeo, j === ji ? matA : matB); m.userData = { ci, j }; b.getWorldPosition(m.position); dots.add(m); });
  }
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  canvas.addEventListener('click', e => {
    if (!ed || !lab.C) return; const r = canvas.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    // any joint of any chain: nearest bone to the click ray
    let best = null, bd = 0.06; const p = new THREE.Vector3();
    ed.spec.chains.forEach((c, k) => { for (const n of c.mirror ? [`${c.name}.L`, `${c.name}.R`] : [c.name]) lab.C.chain(n).forEach((b, j) => { b.getWorldPosition(p); const d = ray.ray.distanceToPoint(p); if (d < bd) { bd = d; best = [k, j]; } }); });
    if (best) { [ci, ji] = best; render(); markers(); }
  });
  // ---- editing ----
  // inPlace: edit this very monster — saving writes back to it (a built-in or one of the game's own monsters is saved
  // as an override in this browser, which takes its place everywhere; Revert drops it). Otherwise a copy to save as new.
  function start(id, inPlace = false) {
    const M = MONSTERS[id], own = loadCustom()[id], lib = !own && M?.source ? clone(M.source) : null;
    const rec = own ? clone(own) : lib || { name: M.name, base: baseOf(id), spec: clone(monsterSpec(id, lab.vals).spec), stats: {} };
    ed = { ...rec, id: inPlace ? id : null, name: inPlace ? rec.name : `${rec.name} (mine)` };
    if (ed.scratch) { ed.meta ||= {}; ed.resist ||= {}; }
    ci = 0; ji = 0; pi = -1; past.length = 0; future.length = 0; apply(); render();
    if (inPlace && !own && (lib || !M.custom)) flash('Editing the game’s own monster: Save keeps your version in this browser (Revert to undo it); Export it to make it permanent.');
  }
  // a monster from scratch: a genus silhouette (src/data/genera.js), its own identity, stats and resistances
  function startScratch(g) {
    const G = GENERA[g]; if (!G) return;
    ed = { id: null, scratch: true, genus: g, name: G.name.split(' (')[0], spec: G.spec(), locomotion: G.locomotion, hover: G.hover || 0,
      meta: { group: G.locomotion === 'fly' ? 'swarm' : 'pack', plan: G.plan, classification: ['Essence Tiers', 'Wild Essence'], hazard: 'Menace', rank: ['Bronze', 'Bronze'], activity: 'Active', voice: G.locomotion === 'fly' ? 'flyer' : 'beast', lore: '' },
      resist: {}, stats: { hp: 40, speed: G.locomotion === 'fly' ? 4.5 : 4, aggro: 14 } };
    ci = 0; ji = 0; pi = -1; apply(); render();
  }
  function apply() { let M2 = null; if (ed?.scratch && makeMonster) { try { M2 = makeMonster(ed); } catch (e) { flash('Body problem: ' + e.message); } } lab.setSpec(ed ? ed.spec : null, M2); setTimeout(markers, 30); }
  const bones = () => { const out = []; for (const c of ed.spec.chains) for (const n of c.mirror ? [`${c.name}.L`] : [c.name]) c.pts.forEach((_, j) => out.push(`${c.mirror ? c.name : n}:${j}`)); return out; };
  function addChain() {
    const parent = $('[data-k=newParent]').value, mirror = $('[data-k=newMirror]').checked, n = Math.max(2, Math.min(8, +$('[data-k=newJoints]').value || 3));
    const [pn, pj] = parent.split(':'), pc = ed.spec.chains.find(c => c.name === pn), at = pc ? pc.pts[+pj] : [0, 1, 0];
    let k = 1; while (ed.spec.chains.some(c => c.name === `limb${k}`)) k++;
    const sx = mirror ? 1 : 0, pts = Array.from({ length: n }, (_, i) => [at[0] + sx * (0.08 + 0.12 * i), at[1] - 0.12 * i, at[2]]);
    ed.spec.chains.push({ name: `limb${k}`, role: $('[data-k=newRole]')?.value || 'other', label: `new ${$('[data-k=newRole]')?.value || 'limb'}`, parent: pc ? (pc.mirror && !mirror ? `${pn}.L:${pj}` : `${pn}:${pj}`) : null, mirror, added: true, pts, r: pts.map((_, i) => { const v = 0.04 * (1 - 0.6 * i / n); return [v, v]; }), color: pc?.color || '#1a1424', sides: 8, seg: 3 });
    ci = ed.spec.chains.length - 1; ji = 0; apply(); render();
  }
  function addPart() {
    const kind = $('[data-k=partKind]').value, bone = $('[data-k=partBone]').value, [bn, bj] = bone.split(':'), c = ed.spec.chains.find(x => x.name === bn), at = c ? c.pts[+bj] : [0, 1, 0];
    const P = { bone, kind, at: [...at], r: kind === 'glow' ? 0.08 : 0.03, mirror: !!c?.mirror };
    if (kind === 'cone') Object.assign(P, { len: 0.15, dir: [0, 1, 0], color: '#2a2030' });
    if (kind === 'sphere') Object.assign(P, { color: '#2a2030' });
    if (kind === 'glow') Object.assign(P, { color: '#8040ff', opacity: 0.6 });
    (ed.spec.parts ||= []).push(P); pi = ed.spec.parts.length - 1; apply(); render();
  }
  function save() {
    const all = loadCustom(); let id = ed.id;
    if (!id) { const slug = (ed.name || 'creature').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'creature'; id = 'my_' + slug; let k = 2; while (all[id] || MONSTERS[id] && !MONSTERS[id].custom) id = `my_${slug}${k++}`; }
    all[id] = ed.scratch ? { scratch: true, genus: ed.genus, name: ed.name, spec: ed.spec, meta: ed.meta, resist: ed.resist, stats: ed.stats, locomotion: ed.locomotion, hover: ed.hover, levels: ed.levels || null, variants: ed.variants || null } : { name: ed.name, base: ed.base, spec: ed.spec, stats: ed.stats, lore: ed.lore || '', levels: ed.levels || null };
    ed.id = id; const ok = saveCustom(all); render(); if (ok && (BASE_IDS.includes(id) || MONSTERS[id]?.builtin || MONSTERS[id]?.overrides)) { flash(`Saved over “${ed.name}” in this browser (reload to see it everywhere). Export it to make it permanent in the game.`); return; } flash(ok ? `Saved as “${ed.name}”. Reload the lab or the creator to find it in the lists (Enemies tab: ${(ed.scratch ? ed.meta.group : MONSTERS[ed.base].group) === 'swarm' ? 'Swarm' : 'Pack'}).` : 'Couldn’t save (browser storage is full or blocked) — use Export.');
  }
  function del() { if (!ed?.id || !confirmDel) { confirmDel = true; flash('Click Delete again to remove it for good.'); return; } const all = loadCustom(); delete all[ed.id]; saveCustom(all); ed = null; confirmDel = false; apply(); render(); flash('Deleted. Reload to clear it from the lists.'); }
  let confirmDel = false;
  function exportJson() { const { id: _i, ...rest } = ed; const blob = new Blob([JSON.stringify(rest, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(ed.name || 'creature').replace(/[^\w-]+/g, '_')}.json`; a.click(); }
  function importJson(file) { file.text().then(t => { try { const o = JSON.parse(t); if (!o.spec || (!o.scratch && !MONSTERS[o.base])) throw 0; ed = { ...o, id: null, name: o.name || 'Imported', stats: o.stats || {} }; if (ed.scratch) { ed.meta ||= {}; ed.resist ||= {}; } ci = 0; ji = 0; apply(); render(); flash('Imported — Save to keep it.'); } catch { flash('That file isn’t a creature.'); } }); }
  let flashT = 0; function flash(m) { const f = $('.ws-flash'); if (f) { f.textContent = m; clearTimeout(flashT); flashT = setTimeout(() => f.textContent = '', 6000); } }
  // ---- the panel ----
  const row = (label, k, v, lo, hi, step = 0.01) => `<div class="row"><span>${label}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${v}"><b>${(+v).toFixed(step < 1 ? 2 : 0)}</b></div>`;
  const colorRow = (label, k, v) => `<label>${label} <input type="color" data-k="${k}" value="${v || '#000000'}"></label>`;
  function render() {
    if (!ed) {
      el.innerHTML = `<p class="ws-help">Make your own monster from this one's body: move joints, thicken limbs, add horns, legs, tails, eyes and glows, change its colours. It keeps this monster's behaviour and attacks.</p>
        <div class="row2"><b>New monster</b> from a silhouette: <select data-k="genus">${Object.entries(GENERA).map(([k, g]) => `<option value="${k}">${g.name}</option>`).join('')}</select> <button data-a="scratch">Start</button></div>
        <p class="ws-help">…or reshape an existing one:</p><button data-a="edit">Edit this monster</button> <button data-a="start">Edit a copy</button>${loadCustom()[lab.id] && (MONSTERS[lab.id]?.builtin === false || BASE_IDS.includes(lab.id) || MONSTERS[lab.id]?.overrides) ? ' <button data-a="revert">Revert to the original</button>' : ''} <label class="ws-imp">Import… <input type="file" accept=".json" data-a="import" hidden></label><div class="ws-flash"></div>`;
      if (elR) { elR.innerHTML = ''; elR.style.display = 'none'; } wire(); return;
    }
    const S = ed.spec, c = S.chains[ci], L = S.look || (S.look = {}), j = Math.min(ji, c.pts.length - 1), p = c.pts[j], r = c.r[j], au = c.aura?.[j], P = S.parts?.[pi];
    const st = ed.scratch ? { hp: 40, speed: 4, aggro: 14, ...ed.stats } : { ...MONSTERS[ed.base].stats, ...ed.stats };
    el.innerHTML = `
      <div class="row2"><input data-k="name" value="${(ed.name || '').replace(/"/g, '&quot;')}" placeholder="Name"> <small>${ed.scratch ? `from: ${GENERA[ed.genus]?.name || ed.genus}` : `behaves like: ${MONSTERS[ed.base].name}`}</small></div>
      <div class="ed-btns"><button data-a="save">Save</button><button data-a="export">Export</button><label class="ws-imp">Import <input type="file" accept=".json" data-a="import" hidden></label>${ed.id ? '<button data-a="del">Delete</button>' : ''}<button data-a="close">Close</button></div>
      <div class="ed-btns"><button data-a="undo" title="Ctrl+Z">Undo</button><button data-a="redo" title="Ctrl+Y">Redo</button><button data-a="bbig">Whole body bigger</button><button data-a="bsmall">smaller</button><button data-a="brief" title="A plain-text description of this creature — every limb, label, joint and setting — copied for pasting to Claude or a teammate">Copy creature brief</button></div>
      <div class="ws-flash"></div>
      <h2>Limb (click a joint on the body)</h2>
      <select data-k="chain">${S.chains.map((x, k) => `<option value="${k}" ${k === ci ? 'selected' : ''}>${x.name}${x.mirror ? ' (both sides)' : ''}${x.added ? ' ★' : ''}</option>`).join('')}</select>
      <div class="row2">Joint <button data-a="jprev">‹</button> <b>${j + 1} / ${c.pts.length}</b> <button data-a="jnext">›</button>
        ${c.added || ed.scratch ? '<button data-a="jadd">+ joint</button><button data-a="jdel">− joint</button><button data-a="cdel">Remove limb</button>' : ''}</div>
      <div class="row2">Label <input data-k="clabel" value="${(c.label || '').replace(/"/g, '&quot;')}" placeholder="what this limb is" style="flex:1"> <select data-k="crole">${ROLES.map(r => `<option ${r === (c.role || 'other') ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="row2">Joint name <input data-k="jname" value="${(c.joints?.[j] || '').replace(/"/g, '&quot;')}" placeholder="e.g. knee, claw tip" style="flex:1"></div>
      <div class="ed-btns" title="Whole-limb tools (the limbs growing from it come along)">
        <button data-a="lthick">Thicker</button><button data-a="lthin">Thinner</button><button data-a="llong">Longer</button><button data-a="lshort">Shorter</button>
        <button data-a="lx-">← </button><button data-a="lx+">→</button><button data-a="ly+">↑</button><button data-a="ly-">↓</button><button data-a="lz+">fwd</button><button data-a="lz-">back</button>
        <button data-a="ldup">Duplicate</button><label><input type="checkbox" data-k="lmir" ${c.mirror ? 'checked' : ''}> both sides</label></div>
      ${row('Across (x)', 'px', p[0], -3, 3)}${row('Up (y)', 'py', p[1], -1, 4)}${row('Forward (z)', 'pz', p[2], -4, 4)}
      ${row('Width', 'rw', r[0], 0.002, 0.6, 0.002)}${row('Height', 'rh', r[1], 0.002, 0.6, 0.002)}
      ${au ? row('Aura width', 'aw', au[0], 0, 1.5) + row('Aura height', 'ah', au[1], 0, 1.5) + '<button data-a="anone">Remove aura</button>' : (S.look.shade ? '<button data-a="aadd">Give it an aura (smoky flesh)</button>' : '')}
      <label>Smoke tip (fades out from…) <input type="range" data-k="fade" min="0" max="1.01" step="0.01" value="${c.fade ? c.fade[0] : 1.01}"></label>
      ${colorRow('Colour', 'ccol', c.color)} ${colorRow('Underside', 'cbelly', c.belly || c.color)} <label>Facets <input type="range" data-k="csides" min="4" max="18" step="1" value="${c.sides || 10}"></label>
      <h2>Add a limb</h2>
      <div class="row2">from <select data-k="newParent">${bones().map(b => `<option ${b === `${c.name}:${j}` ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="row2">is a <select data-k="newRole">${ROLES.map(r => `<option>${r}</option>`).join('')}</select> <label><input type="checkbox" data-k="newMirror" checked> both sides</label> joints <input type="number" data-k="newJoints" value="3" min="2" max="8" style="width:46px"> <button data-a="cadd">Add</button></div>
      <h2>Parts (eyes, horns, glows)</h2>
      <select data-k="part"><option value="-1">—</option>${(S.parts || []).map((x, k) => `<option value="${k}" ${k === pi ? 'selected' : ''}>${k + 1}. ${x.kind} on ${x.bone}</option>`).join('')}</select>
      ${P ? row('Across', 'qx', P.at[0], -3, 3) + row('Up', 'qy', P.at[1], -1, 4) + row('Forward', 'qz', P.at[2], -4, 4) + row('Size', 'qr', P.r, 0.005, 0.8, 0.005) + (P.kind === 'cone' ? row('Length', 'ql', P.len, 0.02, 1.5) + row('Point x', 'dx', P.dir?.[0] ?? 0, -1, 1) + row('Point y', 'dy', P.dir?.[1] ?? 1, -1, 1) + row('Point z', 'dz', P.dir?.[2] ?? 0, -1, 1) : '') + colorRow('Colour', 'qcol', P.color || P.emissive) + (P.kind === 'glow' ? row('Glow', 'qo', P.opacity ?? 0.6, 0, 1) + `<label><input type="checkbox" data-k="qdark" ${P.dark ? 'checked' : ''}> dark glow (void eyes)</label>` : '') + `<label><input type="checkbox" data-k="qmir" ${P.mirror ? 'checked' : ''}> both sides</label><button data-a="pdel">Remove part</button>` : ''}
      <div class="row2"><select data-k="partKind"><option value="sphere">sphere</option><option value="cone">horn / spike</option><option value="glow">glow</option></select> on <select data-k="partBone">${bones().map(b => `<option ${b === `${c.name}:${j}` ? 'selected' : ''}>${b}</option>`).join('')}</select> <button data-a="padd">Add</button></div>
      <h2>Look</h2>
      <label><input type="checkbox" data-k="lshade" ${L.shade ? 'checked' : ''}> shade body (darkness and smoke)</label> ${!L.shade ? row('Roughness', 'lrough', L.rough ?? 0.85, 0, 1) + colorRow('Glow (webs)', 'lwglow', L.webGlow || '#000000') + `<label><input type="checkbox" data-k="lfur" ${L.fur ? 'checked' : ''}> fur</label>` + (L.fur ? row('Fur length', 'flen', L.fur.length ?? 0.025, 0.004, 0.12, 0.002) + row('Fur density', 'fden', L.fur.density ?? 140, 30, 400, 5) + row('Fur layers', 'fsh', L.fur.shells ?? 5, 2, 8, 1) + colorRow('Fur tips', 'ftip', L.fur.tip || '#ffffff') + row('Tip lightening', 'ftk', L.fur.tipMix ?? 0.35, 0, 1) : '') : ''}
      ${L.shade ? row('Smoke', 'smoke', L.smoke ?? 0.6, 0, 1.5) + colorRow('Body', 'lbody', L.body) + colorRow('Rim', 'lrim', L.rim) + colorRow('Smoke', 'lsmoke', L.smokeColor) + colorRow('Aura', 'laura', L.aura) + colorRow('Aura glow', 'lglow', L.auraGlow) : '<small>(this body isn’t a shade: colours are per limb)</small>'}
      ${ed.scratch ? `<h2>Identity</h2>
      <div class="row2">Comes as <select data-k="mgroup">${GROUPS.map(([k, n]) => `<option value="${k}" ${k === ed.meta.group ? 'selected' : ''}>${n}</option>`).join('')}</select> moves by <select data-k="mloc">${['walk', 'fly', 'float', 'slither', 'swim'].map(k => `<option ${k === ed.locomotion ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="row2">Type <select data-k="mtype">${Object.keys(CLASSES).map(k => `<option ${k === ed.meta.classification?.[0] ? 'selected' : ''}>${k}</option>`).join('')}</select> order <select data-k="morder">${(CLASSES[ed.meta.classification?.[0]] || []).map(k => `<option ${k === ed.meta.classification?.[1] ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="row2">Hazard <select data-k="mhaz">${HAZARDS.map(k => `<option ${k === ed.meta.hazard ? 'selected' : ''}>${k}</option>`).join('')}</select> rank <select data-k="mrank0">${RANKS.map(k => `<option ${k === ed.meta.rank?.[0] ? 'selected' : ''}>${k}</option>`).join('')}</select>–<select data-k="mrank1">${RANKS.map(k => `<option ${k === ed.meta.rank?.[1] ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="row2">Activity <select data-k="mact">${ACTIVITY.map(k => `<option ${k === ed.meta.activity ? 'selected' : ''}>${k}</option>`).join('')}</select> sounds <select data-k="mvoice">${[['beast', 'beast'], ['chirper', 'chirper (nyluth)'], ['flyer', 'flyer'], ['none', 'silent']].map(([k, n]) => `<option value="${k}" ${k === ed.meta.voice ? 'selected' : ''}>${n}</option>`).join('')}</select> ${ed.locomotion !== 'walk' ? `hovers at <input type="number" step="0.1" data-k="mhover" value="${ed.hover || 0}" style="width:46px"> m` : ''}</div>
      <textarea data-k="mlore" rows="2" placeholder="Lore / notes (what it is, how it fights — for the guild book, and for Claude)" style="width:100%;font:inherit;background:#23264a;color:#e8e8f0;border:1px solid #3a3e70;border-radius:6px">${(ed.meta.lore || '').replace(/</g, '&lt;')}</textarea>
      <h2>Resistances (× damage taken; 0 immune, 2 weak; blank = normal)</h2>
      <div class="row2" style="gap:3px">${TYPES.map(t => `<label style="width:30%;margin:1px 0">${t} <input type="number" step="0.05" min="0" data-k="res_${t}" value="${ed.resist?.[t] ?? ''}" style="width:44px"></label>`).join('')}</div>` : ''}
      <h2>Stats</h2>
      <div class="row2" data-split-end>Health <input type="number" data-k="hp" value="${st.hp}" style="width:60px"> Speed <input type="number" step="0.1" data-k="speed" value="${st.speed}" style="width:52px"> Sight <input type="number" data-k="aggro" value="${st.aggro}" style="width:48px"></div>
      <h2>Level chart</h2>
      ${!ed.levels ? '<button data-a="lvon">Use a level chart (its stats at levels 1–100)</button><p class="ws-help">A placed monster then takes its health, damage, speed, poise, sight and armour from its level (the creator\'s Level field).</p>' : (() => { const lv = ed.levels, L = lvL; levelValue(lv, 'exp', 1); return `
        <canvas id="lvChart" width="290" height="120" style="width:100%;background:#151830;border-radius:6px;cursor:crosshair" title="Click to pick a level"></canvas>
        <div class="row2">Show <select data-k="lvshow">${LEVEL_STATS.map(([k, n]) => `<option value="${k}" ${k === lvShow ? 'selected' : ''}>${n}</option>`).join('')}</select> curve <select data-k="lvcurve"><option value="exp" ${lv.curve !== 'linear' ? 'selected' : ''}>growing (×% a level)</option><option value="linear" ${lv.curve === 'linear' ? 'selected' : ''}>steady (+% a level)</option></select></div>
        <div class="row2">Level <input type="range" data-k="lvL" min="1" max="100" step="1" value="${L}" style="flex:1"> <b>${L}</b></div>
        <table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="color:#9a9ac0"><td></td><td>level 1</td><td>growth %</td><td>at level ${L}</td></tr>
        ${LEVEL_STATS.map(([k, n]) => { const own = lv.set?.[L]?.[k] != null; return `<tr><td>${n}</td><td><input type="number" step="any" data-k="lvb_${k}" value="${+(+lv.base[k]).toFixed(3)}" style="width:58px"></td><td><input type="number" step="0.1" data-k="lvg_${k}" value="${+((lv.growth[k] || 0) * 100).toFixed(2)}" style="width:50px"></td><td><input type="number" step="any" data-k="lvv_${k}" value="${+levelValue(lv, k, L).toFixed(k === 'damage' || k === 'speed' ? 2 : 0)}" style="width:62px;${own ? 'border-color:#ffd23a' : ''}" title="${own ? 'set by hand at this level' : 'from the curve — type a number to set it by hand'}"></td></tr>`; }).join('')}</table>
        <div class="ws-help">Hand-set: ${Object.keys(lv.set || {}).length ? Object.keys(lv.set).sort((a, b) => a - b).map(l => `<button data-a="lvdel:${l}" title="clear level ${l}'s hand-set values">${l} ✕</button>`).join(' ') : 'none — type in the “at level” column to set a level by hand; the curve bends to pass through it'}</div>
        <div class="ed-btns"><button data-a="lvclear">Clear hand-set values</button><button data-a="lvoff">Remove level chart</button></div>`; })()}</div>`;
    if (elR) {   // physical (limbs, parts, look) left; data (name and saving, identity, resistances, stats) right
      const h = el.innerHTML, a = h.indexOf('<h2>Limb'), b = h.search(/<h2>(Identity|Stats)/);
      if (a > 0 && b > a) { elR.innerHTML = '<h1>Monster data</h1>' + h.slice(0, a) + h.slice(b); el.innerHTML = '<h1>Body</h1>' + h.slice(a, b); elR.style.display = ''; }
    }
    wire(); drawChart();
  }
  // the chart: the chosen stat over levels 1–100, hand-set levels as dots, the current level marked
  function drawChart() {
    const cv = elR?.querySelector('#lvChart') || el.querySelector('#lvChart'); if (!cv || !ed?.levels) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, lv = ed.levels, vals = Array.from({ length: 100 }, (_, i) => levelValue(lv, lvShow, i + 1)), mx = Math.max(1e-6, ...vals);
    const X = l => 6 + (l - 1) / 99 * (W - 12), Y = v => H - 14 - v / mx * (H - 26), dp = lvShow === 'damage' || lvShow === 'speed' ? 2 : 0;
    g.clearRect(0, 0, W, H); g.strokeStyle = '#2a2e58'; g.lineWidth = 1; g.font = '9px sans-serif';
    for (const l of [1, 25, 50, 75, 100]) { g.beginPath(); g.moveTo(X(l), 4); g.lineTo(X(l), H - 14); g.stroke(); g.fillStyle = '#7a7aa0'; g.fillText(l, X(l) - 4, H - 3); }
    g.strokeStyle = '#a04ad8'; g.lineWidth = 2; g.beginPath(); vals.forEach((v, i) => i ? g.lineTo(X(i + 1), Y(v)) : g.moveTo(X(1), Y(v))); g.stroke();
    g.fillStyle = '#ffd23a'; for (const l of Object.keys(lv.set || {}).map(Number)) if (lv.set[l][lvShow] != null) { g.beginPath(); g.arc(X(l), Y(lv.set[l][lvShow]), 3.5, 0, 7); g.fill(); }
    g.strokeStyle = '#7fd0ff'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(lvL), 4); g.lineTo(X(lvL), H - 14); g.stroke();
    g.fillStyle = '#e8e8f0'; g.font = '10px sans-serif'; g.fillText(`${LEVEL_STATS.find(x => x[0] === lvShow)[1]}: ${vals[lvL - 1].toFixed(dp)} at level ${lvL} · level 100: ${vals[99].toFixed(dp)}`, 8, 12);
    cv.onclick = e => { const r = cv.getBoundingClientRect(); lvL = Math.max(1, Math.min(100, Math.round(1 + ((e.clientX - r.left) / r.width * W - 6) / (W - 12) * 99))); render(); };
  }
  function wire() {
    [el, elR].filter(Boolean).forEach(root => root.querySelectorAll('[data-a]').forEach(b => { const a = b.dataset.a; if (a === 'import') { b.onchange = () => b.files[0] && importJson(b.files[0]); return; } b.onclick = () => act(a); }));
    [el, elR].filter(Boolean).forEach(root => root.querySelectorAll('[data-k]').forEach(i => { i.oninput = () => set(i.dataset.k, i.type === 'checkbox' ? i.checked : i.type === 'range' || i.type === 'number' ? +i.value : i.value, i); }));
  }
  // ---- undo / redo: a snapshot before every change (sliders: one per drag, not per step) ----
  const past = [], future = []; let lastSnap = 0;
  function snap(force) { if (!ed) return; const now = performance.now(); if (!force && now - lastSnap < 600) { lastSnap = now; return; } lastSnap = now; past.push(JSON.stringify(ed)); if (past.length > 80) past.shift(); future.length = 0; }
  function undo(redo) { const from = redo ? future : past, to = redo ? past : future; if (!from.length) return flash(redo ? 'Nothing to redo.' : 'Nothing to undo.'); to.push(JSON.stringify(ed)); ed = JSON.parse(from.pop()); ci = Math.min(ci, ed.spec.chains.length - 1); apply(); render(); }
  addEventListener('keydown', e => { if (!ed || !(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range') return; if (e.code === 'KeyZ') { e.preventDefault(); undo(e.shiftKey); } else if (e.code === 'KeyY') { e.preventDefault(); undo(true); } });
  // ---- whole-limb tools: a limb and everything growing from it (limbs and parts) ----
  function family(name) { const out = [name]; for (let k = 0; k < out.length; k++) for (const c of ed.spec.chains) if (c.parent && c.parent.split(':')[0].replace(/\.(L|R)$/, '') === out[k] && !out.includes(c.name)) out.push(c.name); return out; }
  function moveLimb(c, d) { const fam = family(c.name); for (const x of ed.spec.chains) if (fam.includes(x.name)) x.pts.forEach(q => { q[0] += d[0]; q[1] += d[1]; q[2] += d[2]; }); for (const P of ed.spec.parts || []) if (fam.includes(P.bone.split(':')[0].replace(/\.(L|R)$/, ''))) { P.at[0] += d[0]; P.at[1] += d[1]; P.at[2] += d[2]; } }
  function stretch(c, k) {   // longer / shorter from its first joint; what grows off it moves with the joint it grows from
    const o = c.pts[0], old = c.pts.map(q => [...q]);
    c.pts.forEach(q => { for (let i = 0; i < 3; i++) q[i] = o[i] + (q[i] - o[i]) * k; });
    for (const x of ed.spec.chains) if (x !== c && x.parent && x.parent.split(':')[0].replace(/\.(L|R)$/, '') === c.name) { const j = +x.parent.split(':')[1], dlt = [0, 1, 2].map(i => c.pts[j][i] - old[j][i]); moveLimb(x, dlt); }
  }
  function scaleBody(k) {
    for (const c of ed.spec.chains) { c.pts.forEach(q => { q[0] *= k; q[1] *= k; q[2] *= k; }); c.r.forEach(r => { r[0] *= k; r[1] *= k; }); c.aura?.forEach(r => { r[0] *= k; r[1] *= k; }); }
    for (const P of ed.spec.parts || []) { P.at = P.at.map(v => v * k); P.r *= k; if (P.len) P.len *= k; }
    if (ed.hover) ed.hover *= k;
  }
  // ---- the creature brief: everything about it in plain words (for Claude, a teammate, or notes) ----
  function brief() {
    const S = ed.spec, m = ed.meta || {}, out = [];
    out.push(`CREATURE: ${ed.name}${ed.scratch ? ` (from the ${GENERA[ed.genus]?.name || ed.genus} silhouette)` : ` (body edited from ${MONSTERS[ed.base]?.name}; behaves like it)`}`);
    if (ed.scratch) {
      out.push(`Comes as: ${m.group} · moves by: ${ed.locomotion}${ed.hover ? ` (hovers ${(+ed.hover).toFixed(2)} m)` : ''} · sounds: ${m.voice}`);
      out.push(`Classification: ${(m.classification || []).join(' / ')} · hazard ${m.hazard} · rank ${(m.rank || []).join('–')} · activity ${m.activity}`);
      const r = Object.entries(ed.resist || {}); out.push(`Resistances (× damage): ${r.length ? r.map(([t, v]) => `${t} ${v}`).join(', ') : 'none (all ×1)'}`);
      if (m.lore) out.push(`Notes: ${m.lore}`);
    }
    const st = ed.stats || {}; out.push(`Stats: health ${st.hp ?? '-'}, speed ${st.speed ?? '-'} m/s, sight ${st.aggro ?? '-'} m`);
    const L = S.look || {}; out.push(`Look: ${L.shade ? `shade body (smoke ${L.smoke ?? 0.6}; body ${L.body}, rim ${L.rim}, smoke ${L.smokeColor}, aura ${L.aura || '-'}, aura glow ${L.auraGlow || '-'})` : `solid (roughness ${L.rough ?? 0.85})`}`);
    out.push('', 'LIMBS (bone names are <limb>:<joint>, both-sided limbs <limb>.L / <limb>.R; metres, y up, +z forward, ground at 0):');
    for (const c of S.chains) {
      out.push(`- ${c.name}${c.mirror ? ' (both sides)' : ''} — ${c.role || 'other'}: ${c.label || '(no label)'}${c.parent ? ` · grows from ${c.parent}` : ' · root'} · colour ${c.color}${c.aura ? ' · has an aura' : ''}${c.fade ? ` · smoky from ${Math.round(c.fade[0] * 100)}%` : ''}`);
      c.pts.forEach((q, j) => out.push(`    ${j}${c.joints?.[j] ? ` "${c.joints[j]}"` : ''}: at (${q.map(v => v.toFixed(2)).join(', ')}), size ${c.r[j].map(v => v.toFixed(3)).join(' × ')}`));
    }
    if (S.parts?.length) { out.push('', 'PARTS:'); S.parts.forEach((P, k) => out.push(`- ${k + 1}. ${P.kind} on ${P.bone}${P.mirror ? ' (both sides)' : ''} at (${P.at.map(v => v.toFixed(2)).join(', ')}), size ${(+P.r).toFixed(3)}${P.len ? `, length ${P.len.toFixed(2)}` : ''}, ${P.color || P.emissive || ''}${P.dark ? ' (dark glow)' : ''}`)); }
    if (S.webs?.length) out.push('', `MEMBRANES: ${S.webs.length} (between ${S.webs.map(w => `${w.a[0][0]}↔${w.b[0][0]}`).join(', ')})`);
    return out.join('\n');
  }
  function act(a) {
    if (a !== 'undo' && a !== 'redo' && a !== 'brief' && ed) snap(true);
    if (a === 'undo') return undo(false); if (a === 'redo') return undo(true);
    if (a === 'brief') { const t = brief(); navigator.clipboard?.writeText(t).then(() => flash('Creature brief copied — paste it to Claude to work on this creature.'), () => { const w = open('', '_blank'); w?.document.write('<pre>' + t.replace(/</g, '&lt;') + '</pre>'); }); return; }
    { const c0 = ed?.spec.chains[ci];
      if (a === 'bbig' || a === 'bsmall') { scaleBody(a === 'bbig' ? 1.1 : 1 / 1.1); apply(); render(); return; }
      if (c0 && (a === 'lthick' || a === 'lthin')) { const k = a === 'lthick' ? 1.15 : 1 / 1.15; c0.r.forEach(r => { r[0] *= k; r[1] *= k; }); c0.aura?.forEach(r => { r[0] *= k; r[1] *= k; }); apply(); render(); return; }
      if (c0 && (a === 'llong' || a === 'lshort')) { stretch(c0, a === 'llong' ? 1.12 : 1 / 1.12); apply(); render(); return; }
      if (c0 && /^l[xyz][+-]$/.test(a)) { const d = [0, 0, 0]; d['xyz'.indexOf(a[1])] = a[2] === '+' ? 0.03 : -0.03; moveLimb(c0, d); apply(); render(); return; }
      if (c0 && a === 'ldup') { let k = 1; while (ed.spec.chains.some(x => x.name === `${c0.name}${k}`)) k++; const n = JSON.parse(JSON.stringify(c0)); n.name = `${c0.name}${k}`; n.added = true; n.label = `${c0.label || c0.name} (copy)`; n.pts.forEach(q => { q[2] -= 0.12; }); ed.spec.chains.push(n); ci = ed.spec.chains.length - 1; flash('Duplicated (a little behind the original) — move it into place.'); apply(); render(); return; }
    }
    const c = ed?.spec.chains[ci];
    if (a === 'start') return start(lab.id);
    if (a === 'scratch') return startScratch($('[data-k=genus]').value);
    if (a === 'lvon') { ed.levels = defaultLevels({ ...(ed.scratch ? {} : MONSTERS[ed.base]?.stats), ...ed.stats }); render(); return; }
    if (a === 'lvoff') { delete ed.levels; render(); return; }
    if (a === 'lvclear') { ed.levels.set = {}; render(); return; }
    if (a.startsWith('lvdel:')) { delete ed.levels.set[a.slice(6)]; render(); return; }
    if (a === 'edit') return start(lab.id, true);
    if (a === 'revert') { const all = loadCustom(); delete all[lab.id]; saveCustom(all); flash('Reverted — reload to see the original again.'); render(); return; }
    if (a === 'close') { ed = null; apply(); render(); return; }
    if (a === 'save') return save(); if (a === 'export') return exportJson(); if (a === 'del') return del();
    if (a === 'jprev') ji = Math.max(0, ji - 1); if (a === 'jnext') ji = Math.min(c.pts.length - 1, ji + 1);
    if (a === 'jadd') { const l = c.pts[c.pts.length - 1], q = c.pts[c.pts.length - 2] || [l[0], l[1] + 0.1, l[2]]; c.pts.push([2 * l[0] - q[0], 2 * l[1] - q[1], 2 * l[2] - q[2]]); c.r.push([...c.r[c.r.length - 1]]); if (c.aura) c.aura.push([...c.aura[c.aura.length - 1]]); ji = c.pts.length - 1; }
    if (a === 'jdel' && c.pts.length > 2) { c.pts.pop(); c.r.pop(); c.aura?.pop(); ji = Math.min(ji, c.pts.length - 1); }
    if (a === 'cdel' && (c.added || ed.scratch)) { if (ed.spec.chains.length < 2) { flash('A body needs at least one limb.'); return; } const nm = c.name; if (ed.spec.chains.some(x => x.parent?.startsWith(nm + ':'))) { flash('Remove the limbs growing from this one first.'); return; } ed.spec.chains.splice(ci, 1); ed.spec.parts = (ed.spec.parts || []).filter(x => !x.bone.startsWith(nm + ':')); ed.spec.webs = (ed.spec.webs || []).filter(w => ![...w.a, ...w.b].some(q => q[0] === nm)); ci = 0; ji = 0; }
    if (a === 'cadd') return addChain(); if (a === 'padd') return addPart();
    if (a === 'pdel') { ed.spec.parts.splice(pi, 1); pi = -1; }
    if (a === 'aadd') c.aura = c.r.map(([w, h]) => [w * 3.5 + 0.04, h * 3.5 + 0.04]);
    if (a === 'anone') delete c.aura;
    apply(); render();
  }
  let rebuildT = 0, lvT = 0;
  // (the chart and the 'at level' column update as you type; nothing re-drawn under the cursor)
  function refreshLv() { drawChart(); for (const [k] of LEVEL_STATS) { const i = (elR || el).querySelector(`[data-k=lvv_${k}]`); if (i && i !== document.activeElement) { i.value = +levelValue(ed.levels, k, lvL).toFixed(k === 'damage' || k === 'speed' ? 2 : 0); i.style.borderColor = ed.levels.set?.[lvL]?.[k] != null ? '#ffd23a' : ''; } } }
  function set(k, v, input) {
    if (ed && !['lvL', 'lvshow', 'chain', 'part', 'genus', 'newParent', 'newMirror', 'newJoints', 'partKind', 'partBone', 'newRole'].includes(k)) snap(false);
    if (k === 'lmir') { const c = ed.spec.chains[ci]; if (ed.spec.chains.some(x => x.parent?.split(':')[0].replace(/\.(L|R)$/, '') === c.name)) { flash('Limbs grow from this one — change those first.'); render(); return; } c.mirror = v; if (c.parent) { const [pn, pj] = c.parent.split(':'), base = pn.replace(/\.(L|R)$/, ''), pc = ed.spec.chains.find(x => x.name === base); if (pc?.mirror) c.parent = v ? `${base}:${pj}` : `${base}.L:${pj}`; } if (v) c.pts.forEach(q => { q[0] = Math.abs(q[0]) || 0.05; }); for (const P of ed.spec.parts || []) if (P.bone.split(':')[0] === c.name) P.mirror = v; apply(); render(); return; }
    if (input?.nextElementSibling?.tagName === 'B') input.nextElementSibling.textContent = (+v).toFixed(input.step && +input.step < 1 ? 2 : 0);
    if (k === 'name') { ed.name = v; return; }
    if (k === 'chain') { ci = v; ji = 0; render(); markers(); return; }
    if (k === 'part') { pi = v; render(); return; }
    if (['newParent', 'newMirror', 'newJoints', 'partKind', 'partBone', 'newRole', 'genus'].includes(k)) return;
    const S = ed.spec, c = S.chains[ci], j = Math.min(ji, c.pts.length - 1), P = S.parts?.[pi], L = S.look;
    if (k === 'px' || k === 'py' || k === 'pz') c.pts[j]['xyz'.indexOf(k[1])] = v;
    if (k === 'rw') c.r[j][0] = v; if (k === 'rh') c.r[j][1] = v;
    if (k === 'aw') c.aura[j][0] = v; if (k === 'ah') c.aura[j][1] = v;
    if (k === 'fade') { if (v > 1) delete c.fade; else c.fade = [v, 1]; }
    if (k === 'ccol') c.color = v; if (k === 'cbelly') c.belly = v; if (k === 'csides') c.sides = v;
    if (k === 'clabel') { c.label = v; return; } if (k === 'crole') { c.role = v; apply(); return; } if (k === 'jname') { (c.joints ||= [])[j] = v; return; }
    if (k === 'lshade') { L.shade = v; if (v) Object.assign(L, { body: L.body || '#08060c', rim: L.rim || '#2a1250', smokeColor: L.smokeColor || '#100a1a', smoke: L.smoke ?? 0.6 }); apply(); render(); return; }
    if (k === 'lfur') { L.fur = v ? { length: 0.025, density: 140, shells: 5, tip: '#c8bca8', tipMix: 0.35 } : undefined; apply(); render(); return; }
    if (L.fur && k === 'flen') L.fur.length = v; if (L.fur && k === 'fden') L.fur.density = v; if (L.fur && k === 'fsh') L.fur.shells = v; if (L.fur && k === 'ftip') L.fur.tip = v; if (L.fur && k === 'ftk') L.fur.tipMix = v;
    if (k === 'lrough') L.rough = v; if (k === 'lwglow') L.webGlow = v;
    if (ed.scratch) {
      const m = ed.meta;
      if (k === 'mgroup') { m.group = v; apply(); return; } if (k === 'mloc') { ed.locomotion = v; apply(); render(); return; }
      if (k === 'mtype') { m.classification = [v, CLASSES[v][0]]; render(); return; } if (k === 'morder') { m.classification = [m.classification[0], v]; return; }
      if (k === 'mhaz') { m.hazard = v; return; } if (k === 'mrank0') { m.rank = [v, m.rank?.[1] || v]; return; } if (k === 'mrank1') { m.rank = [m.rank?.[0] || v, v]; return; }
      if (k === 'mact') { m.activity = v; return; } if (k === 'mvoice') { m.voice = v; return; } if (k === 'mlore') { m.lore = v; return; }
      if (k === 'mhover') { ed.hover = v; apply(); return; }
      if (k.startsWith('res_')) { const t = k.slice(4); if (input.value === '') delete ed.resist[t]; else ed.resist[t] = v; return; }
    }
    if (P) {
      if (k === 'qx' || k === 'qy' || k === 'qz') P.at['xyz'.indexOf(k[1])] = v;
      if (k === 'qr') P.r = v; if (k === 'ql') P.len = v; if (k === 'qo') P.opacity = v; if (k === 'qdark') P.dark = v; if (k === 'qmir') P.mirror = v;
      if (k === 'dx' || k === 'dy' || k === 'dz') { P.dir ||= [0, 1, 0]; P.dir['xyz'.indexOf(k[1])] = v; }
      if (k === 'qcol') { if (P.emissive) P.emissive = v; else P.color = v; }
    }
    if (k === 'smoke') L.smoke = v; if (k === 'lbody') L.body = v; if (k === 'lrim') L.rim = v; if (k === 'lsmoke') L.smokeColor = v; if (k === 'laura') L.aura = v; if (k === 'lglow') L.auraGlow = v;
    if (k === 'hp' || k === 'speed' || k === 'aggro') { ed.stats[k] = v; return; }
    if (ed.levels) {
      const lv = ed.levels;
      if (k === 'lvL') { lvL = v; render(); return; } if (k === 'lvshow') { lvShow = v; drawChart(); return; } if (k === 'lvcurve') { lv.curve = v; render(); return; }
      if (k.startsWith('lvb_')) { lv.base[k.slice(4)] = v; refreshLv(); return; }
      if (k.startsWith('lvg_')) { lv.growth[k.slice(4)] = v / 100; refreshLv(); return; }
      if (k.startsWith('lvv_')) { if (input.value === '') { delete lv.set[lvL]?.[k.slice(4)]; } else (lv.set[lvL] ||= {})[k.slice(4)] = v; refreshLv(); return; }
    }
    clearTimeout(rebuildT); rebuildT = setTimeout(apply, 40);   // (sliders: rebuilt a moment after they stop moving)
  }
  render();
  return { render, get editing() { return !!ed; }, onSelect() { if (!ed) render(); }, markers };
}
