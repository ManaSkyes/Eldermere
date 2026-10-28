// src/ui/creator.js — step-by-step character creator with the 3D character and a live stat sheet.
//
// Stats from the body (species shares, how masculine or feminine it is, build and age) come from the
// 3D body itself via src/rpg/morphStats.js, so creation and later transformations use the same rules.
// Background, education and class add their modifiers on top. Gender is identity (pronouns) and only
// picks the starting body.
import { RACES, GENDERS, BACKGROUNDS, EDUCATION, CLASSES, startingKit } from '../data/creation.js';
import { PROFESSIONS, titleFor } from '../data/professions.js';
import { MAIN_STATS, SKILLS, createCharacter, derived, display, limitState } from '../rpg/stats.js';
import { loadHuman } from '../rpg/human.js';
import { startViewer } from '../rpg/humanViewer.js';
import { RACES as BODY_RACES } from '../rpg/races.js';
import { bodyMods, speciesSkills, ageInfo } from '../rpg/morphStats.js';
import { ITEMS } from '../rpg/equipment.js';
import { escapeHtml, label } from './util.js';

const byId = (list, id) => list.find(x => x.id === id);
// hidden skills (undiscovered, or placeholders for systems not built yet) are tracked but never listed
const shown = id => !SKILLS[id]?.hidden;

const STEPS = [
  { id: 'race',       name: 'Race',       tiered: { list: RACES, key: 'race', subKey: 'subrace', subLabel: 'Lineage' } },
  { id: 'gender',     name: 'Gender',     list: GENDERS },
  { id: 'appearance', name: 'Appearance' },
  { id: 'background', name: 'Background', list: BACKGROUNDS },
  { id: 'education',  name: 'Education',  list: EDUCATION },
  { id: 'cls',        name: 'Class',      tiered: { list: CLASSES, key: 'cls', subKey: 'subclass', subLabel: 'Specialty' } },
  { id: 'name',       name: 'Name' },
];

const STAT_SHORT = {
  strength: 'Strength', endurance: 'Endurance', dexterity: 'Dexterity', finesse: 'Finesse',
  intelligence: 'Intelligence', mind: 'Mind', spirit: 'Spirit', charisma: 'Charisma', speed: 'Speed', luck: 'Luck',
};

let humanCache = null;                                    // the body data loads once per session

export function showCreator(root, { onCancel, onComplete, edit = null }) {
  const state = {
    step: 0,
    race: 'human', subrace: 'common', gender: 'man',
    background: 'worker', education: 'none', cls: 'none', subclass: 'none',
    name: '',
  };
  if (edit) { Object.assign(state, edit.choices || {}); state.name = edit.name || state.name; }   // (editing: start from the saved choices)

  root.innerHTML = `
    <section class="creator">
      <header class="creator-head">
        <button class="link-btn" data-act="cancel">${edit ? 'Back to saves' : 'Back to title'}</button>
        <h2>${edit ? 'Change your look' : 'A new face at the guild'}</h2>
      </header>
      <ol class="steps" aria-label="Creation steps"></ol>
      <div class="stage">
          <canvas class="model" aria-label="Your character. Drag to turn."></canvas>
          <p class="stage-note">Loading your character…</p>
          <div class="stage-views btns" role="group" aria-label="View">
            <button data-view="full" aria-pressed="true">Full body</button><button data-view="face" aria-pressed="false">Face</button>
          </div>
        </div>

      <div class="choice-panel" aria-live="polite"></div>
      <aside class="sheet" aria-label="Character sheet">
        <div class="sheet-body"></div>
      </aside>
    </section>`;

  const stepsEl = root.querySelector('.steps');
  const panel = root.querySelector('.choice-panel');
  const sheet = root.querySelector('.sheet-body');
  const canvas = root.querySelector('.model');
  const note = root.querySelector('.stage-note');
  const controls = document.createElement('div'); controls.className = 'viewer-controls';
  let viewer = null, closed = false;
  const close = () => { closed = true; if (viewer) viewer.dispose(); };
  root.querySelector('[data-act=cancel]').addEventListener('click', () => { close(); onCancel(); });
  let stageView = 'full';
  root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    stageView = b.dataset.view; viewer?.setView(stageView);
    root.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));

  const race = () => byId(RACES, state.race);
  const subrace = () => byId(race().subs, state.subrace);
  const subIndex = () => race().subs.findIndex(s => s.id === state.subrace);
  const gender = () => byId(GENDERS, state.gender);
  const cls = () => byId(CLASSES, state.cls);
  const subclass = () => byId(cls().subs, state.subclass);
  const kit = () => startingKit(state.cls, state.subclass);

  // ---- the 3D character ----
  (async () => {
    humanCache = humanCache || await loadHuman('data/human/');
    if (closed) return;
    viewer = startViewer(THREE, humanCache, { canvas, controls, mode: 'creator',
      onError: msg => { note.hidden = !msg; note.textContent = msg ? `Rendering problem: ${msg}` : ''; } });
    viewer.setRace(state.race, subIndex());
    viewer.params.age = 0.3;                              // prime adulthood to start
    viewer.setDefaults({ fem: gender().body, age: 0.3 });
    viewer.setBodySex(gender().body);
    viewer.equip(kit().filter(id => !ITEMS[id]?.carried));
    viewer.onChange(() => renderSheet());
    if (edit?.appearance) { try { viewer.load(edit.appearance); } catch (e) { console.warn('appearance', e); } state.step = STEPS.findIndex(st => st.id === 'appearance'); }
    note.hidden = true;
    render();
  })().catch(err => { console.error(err); note.textContent = 'The 3D character could not load. Stats use your race and choices only.'; });

  // ---- stats: the body first, then history and class ----
  const sumMods = (a = {}, b = {}) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] || 0) + v; return o; };
  function bodyPart() {
    if (!viewer) return { mods: { main: sumMods(race().mods.main, subrace().mods.main), skills: sumMods(race().mods.skills, subrace().mods.skills) }, parts: [] };
    const m = viewer.morph(), b = bodyMods(m, BODY_RACES, RACES);
    return { mods: { main: b.main, skills: speciesSkills(m.totals, BODY_RACES, RACES) }, parts: b.parts };
  }
  const modsInOrder = (body = bodyPart()) => [
    body.mods,
    byId(BACKGROUNDS, state.background).mods,
    byId(EDUCATION, state.education).mods,
    cls().mods,
    subclass().mods,
  ];

  function render() {
    renderSteps();
    renderPanel();
    renderSheet();
  }

  function renderSteps() {
    stepsEl.innerHTML = STEPS.map((s, i) => `
      <li><button class="step ${i === state.step ? 'is-current' : ''}" data-step="${i}"
        ${i === state.step ? 'aria-current="step"' : ''}>
        <span class="step-num">${i + 1}</span>${s.name}
      </button></li>`).join('');
    stepsEl.querySelectorAll('[data-step]').forEach(b =>
      b.addEventListener('click', () => { state.step = +b.dataset.step; render(); }));
  }

  function modLines(mods) {
    const lines = [
      ...Object.entries(mods.main ?? {}).filter(([, v]) => v).map(([k, v]) => [STAT_SHORT[k], v, true]),
      ...Object.entries(mods.skills ?? {}).filter(([k, v]) => v && shown(k)).map(([k, v]) => [label(k), v, false]),
    ];
    if (!lines.length) return '<p class="muted">No change to starting stats.</p>';
    return `<ul class="mods">${lines.map(([n, v, isMain]) =>
      `<li class="${v > 0 ? 'up' : 'down'} ${isMain ? 'main' : ''}">${n} <b>${v > 0 ? '+' : ''}${v}</b></li>`).join('')}</ul>`;
  }

  function renderPanel() {
    const step = STEPS[state.step];
    let body = '';

    if (step.tiered) {
      const t = step.tiered;
      const main = byId(t.list, state[t.key]);
      const sub = byId(main.subs, state[t.subKey]);
      body = `
        <div class="options" role="radiogroup" aria-label="${step.name}" data-key="${t.key}">
          ${t.list.map(o => `<button class="option" role="radio" aria-checked="${o.id === main.id}" data-val="${o.id}">${o.name}</button>`).join('')}
        </div>
        <div class="detail">
          <h3>${main.name}</h3>
          <p>${main.blurb}</p>
          ${modLines(main.mods)}
        </div>
        ${main.subs.length > 1 ? `
          <div class="field sub-field">
            <span class="field-label">${t.subLabel}</span>
            <div class="options small" role="radiogroup" aria-label="${t.subLabel}" data-key="${t.subKey}">
              ${main.subs.map(o => `<button class="option" role="radio" aria-checked="${o.id === sub.id}" data-val="${o.id}">${o.name}</button>`).join('')}
            </div>
          </div>
          <div class="detail sub-detail">
            <h3>${sub.name}</h3>
            <p>${sub.blurb}</p>
            ${modLines(sub.mods)}
          </div>` : ''}
        ${step.id === 'race' ? '<p class="muted">Race modifiers scale with how much of your body is that race, so a later transformation shifts them too.</p>' : ''}
        ${step.id === 'cls' ? `<div class="detail compact"><h3>Starting kit</h3><p>${kit().filter(id => !ITEMS[id]?.carried).map(id => ITEMS[id]?.name || id).join(', ')}</p>${kit().some(id => ITEMS[id]?.carried) ? `<p class="muted">In the pack: ${kit().filter(id => ITEMS[id]?.carried).map(id => ITEMS[id].name).join(', ')}</p>` : ''}</div>` : ''}`;
    } else if (step.list) {
      const current = byId(step.list, state[step.id]);
      body = `
        <div class="options" role="radiogroup" aria-label="${step.name}">
          ${step.list.map(o => `
            <button class="option" role="radio" aria-checked="${o.id === state[step.id]}" data-val="${o.id}">
              ${o.name}
            </button>`).join('')}
        </div>
        <div class="detail">
          <h3>${current.name}${current.pronouns ? ` <span class="muted">(${current.pronouns})</span>` : ''}</h3>
          <p>${current.blurb}</p>
          ${step.id === 'gender' ? '' : modLines(current.mods)}
        </div>`;
    } else if (step.id === 'appearance') {
      body = `
        <p class="muted">Your body sets part of your stats: how masculine or feminine it is, muscle, weight, height, proportions and age. The sheet updates as you shape it.</p>
        <div class="appearance-host">${viewer ? '' : '<p class="muted">Waiting for the 3D character…</p>'}</div>`;
    } else if (step.id === 'name') {
      body = `
        <label class="name-field">
          <span>What do they call you?</span>
          <input type="text" maxlength="24" autocomplete="off" spellcheck="false" value="${escapeHtml(state.name)}">
        </label>
        <div class="detail">
          <p>${summary()}</p>
        </div>
        <p class="error" hidden>Enter a name to begin.</p>`;
    }

    const last = state.step === STEPS.length - 1;
    panel.innerHTML = `
      <h3 class="panel-title">${step.name}</h3>
      ${body}
      <div class="panel-nav">
        <button class="btn ghost" data-act="prev" ${state.step === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn" data-act="next">${last ? 'Begin journey' : 'Next'}</button>
      </div>`;
    if (step.id === 'appearance' && viewer) panel.querySelector('.appearance-host').appendChild(controls);
    else viewer?.setView(stageView);                    // the Face and Skin tabs zoom in; other steps go back to the chosen view

    panel.querySelectorAll('[data-val]').forEach(b => b.addEventListener('click', () => {
      const key = b.closest('[data-key]')?.dataset.key ?? step.id;
      state[key] = b.dataset.val;
      if (key === 'race') state.subrace = race().subs[0].id;
      if (key === 'cls') state.subclass = cls().subs[0].id;
      if (viewer) {
        if (key === 'race' || key === 'subrace') viewer.setRace(state.race, subIndex());
        if (key === 'gender') { viewer.setDefaults({ fem: gender().body }); viewer.setBodySex(gender().body); }
        if (key === 'cls' || key === 'subclass') viewer.equip(kit().filter(id => !ITEMS[id]?.carried));
      }
      render();
      panel.querySelector(`[data-key="${key}"] [data-val="${b.dataset.val}"]`)?.focus();
    }));

    const input = panel.querySelector('input[type=text]');
    if (input) {
      input.addEventListener('input', () => { state.name = input.value; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(); });
      input.focus();
    }

    panel.querySelector('[data-act=prev]').addEventListener('click', () => { state.step--; render(); });
    panel.querySelector('[data-act=next]').addEventListener('click', () => {
      if (last) finish(); else { state.step++; render(); }
    });
  }

  function summary() {
    const r = race(), sr = subrace(), c = cls(), sc = subclass();
    const who = sr.id === 'common' ? r.name : (sr.name.toLowerCase().includes(r.name.toLowerCase()) || sr.id.startsWith('half') ? sr.name : `${sr.name} ${r.name}`);
    const bg = byId(BACKGROUNDS, state.background).name.toLowerCase();
    const edu = byId(EDUCATION, state.education);
    const g = gender().id;
    const role = c.id === 'none' ? null : (c.subs.length > 1 ? `${c.name.toLowerCase()} (${sc.name.toLowerCase()})` : c.name.toLowerCase());
    const age = viewer ? ageInfo(state.race, viewer.params.age) : null;
    const lead = `${age ? `${age.years}-year-old ` : ''}${g === 'nonbinary' ? 'nonbinary ' : ''}${who.toLowerCase()}${g === 'man' ? ' man' : g === 'woman' ? ' woman' : ''}`;
    return `${/^[aeiou8]/i.test(lead) || /^(11|18)\b/.test(lead) ? 'An' : 'A'} ${lead}, raised as ${/^[aeiou]/i.test(bg) ? 'an' : 'a'} ${bg}`
      + (edu.id === 'none' ? ' with no formal education' : `, educated through ${edu.name.toLowerCase()}`)
      + (role ? `, arriving in Eldermere as ${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}.` : ', arriving in Eldermere without a class.');
  }

  let bodyBreakOpen = false;
  function renderSheet() {
    if (closed) return;
    const body = bodyPart();
    const c = createCharacter(modsInOrder(body));
    const d = derived(c);
    const notable = Object.entries(c.skills)
      .filter(([id]) => shown(id))
      .map(([id, v]) => [id, v, v - (SKILLS[id]?.start ?? 100)])
      .filter(([, , delta]) => Math.round(delta) !== 0)
      .sort((a, b) => b[2] - a[2])
      .slice(0, 10);
    const age = viewer ? ageInfo(state.race, viewer.params.age) : null;
    // professions show their trade title once past Unskilled
    const skillName = (id, v) => {
      const t = PROFESSIONS[id] ? titleFor(id, v) : null;
      return t && t !== 'Unskilled' ? `${label(id)} <small class="muted">${t}</small>` : label(id);
    };

    sheet.innerHTML = `
      ${age ? `<p class="age-line">${age.years} years · ${age.stage}</p>` : ''}
      <dl class="derived">
        <div><dt>HP</dt><dd>${display(d.maxHp)}</dd></div>
        <div><dt>MP</dt><dd>${display(d.maxMp)}</dd></div>
        <div><dt>Stamina</dt><dd>${display(d.maxStamina)}</dd></div>
        <div><dt>Carry</dt><dd>${display(d.carryKg)} kg</dd></div>
      </dl>
      <ul class="main-stats">
        ${MAIN_STATS.map(s => {
          const v = c.main[s], delta = Math.round(v - 100);
          return `<li><span>${STAT_SHORT[s]}</span><b class="limit-${limitState(c, s)}">${display(v)}</b>
            <i class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta ? (delta > 0 ? '+' : '') + delta : ''}</i></li>`;
        }).join('')}
      </ul>
      ${body.parts.length ? `<details class="body-break"><summary>From your body</summary>
        ${body.parts.map(p => `<div class="break-row"><span>${p.name}</span>${modLines({ main: p.mods })}</div>`).join('')}
      </details>` : ''}
      <h4>Strongest starting skills</h4>
      ${notable.length
        ? `<ul class="skill-list">${notable.map(([id, v, delta]) =>
            `<li><span>${skillName(id, v)}</span><b>${display(v)}</b><i class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${Math.round(delta)}</i></li>`).join('')}</ul>`
        : '<p class="muted">Every skill sits at the baseline.</p>'}`;
    const br = sheet.querySelector('.body-break');
    if (br) { br.open = bodyBreakOpen; br.addEventListener('toggle', () => { bodyBreakOpen = br.open; }); }
  }

  function finish() {
    const name = state.name.trim();
    if (!name) {
      if (state.step !== STEPS.length - 1) { state.step = STEPS.length - 1; render(); }
      panel.querySelector('.error').hidden = false;
      panel.querySelector('input').focus();
      return;
    }
    const { step, ...choices } = state;
    if (edit) { close(); onComplete({ ...edit, name, appearance: viewer ? viewer.save() : edit.appearance }); return; }   // (editing: only the look and name change)
    const save = {
      version: 2,
      name,
      choices: { ...choices, name, pronouns: gender().pronouns },
      stats: createCharacter(modsInOrder()),
      appearance: viewer ? viewer.save() : null,
      gear: kit(),
    };
    close();
    onComplete(save);
  }

  render();
}
