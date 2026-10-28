// src/main.js — boots the game and switches between screens.
import { startBackground } from './gfx/titleBackground.js';
import { showTitle, showLoad } from './ui/title.js';
import { showCreator } from './ui/creator.js';
import { derived, display, effectiveMain, limitState, MAIN_STATS } from './rpg/stats.js';
import { listSaves, loadSave, latestSave, writeSave, deleteSave, exportSave, importSave } from './rpg/save.js';
import { RACES, CLASSES } from './data/creation.js';
import { escapeHtml, label } from './ui/util.js';
import { startPlay } from './game/play.js';

const app = document.getElementById('app');
const bg = startBackground(document.getElementById('bg'));

// one line for the load screen: "Dark elf · Rogue (Assassin)"
function summaryOf(save) {
  const ch = save.choices || {};
  const r = RACES.find(x => x.id === ch.race), sr = r?.subs.find(x => x.id === ch.subrace);
  const c = CLASSES.find(x => x.id === ch.cls), sc = c?.subs.find(x => x.id === ch.subclass);
  const who = !r ? '' : !sr || sr.id === 'common' ? r.name : sr.name.toLowerCase().includes(r.name.toLowerCase()) ? sr.name : `${sr.name} ${r.name.toLowerCase()}`;
  const role = !c || c.id === 'none' ? 'No class' : sc && c.subs.length > 1 ? `${c.name} (${sc.name})` : c.name;
  return [who, role].filter(Boolean).join(' · ');
}

function goTitle() {
  bg.setMode('title');
  showTitle(app, {
    hasSave: listSaves().length > 0,
    onNew: goCreator,
    onContinue: () => goJourney(latestSave()),
    onLoad: goLoad,
    onImport: async file => goJourney(await importSave(file)),
  });
}

function goLoad() {
  bg.setMode('dim');
  showLoad(app, {
    saves: listSaves(),
    onLoad: id => goJourney(loadSave(id)),
    onEdit: id => goEdit(loadSave(id)),
    onExport: id => exportSave(loadSave(id)),
    onDelete: id => { deleteSave(id); listSaves().length ? goLoad() : goTitle(); },
    onBack: () => goTitle(),
  });
}

function goCreator() {
  bg.setMode('dim');
  showCreator(app, {
    onCancel: () => goTitle(),
    onComplete: save => goJourney(writeSave(save, summaryOf(save)) || save),
  });
}

// editing a saved character's look (for testing the character work: no need to make a new one each time).
// Only the appearance changes; stats, gear and progress stay as they are.
function goEdit(save) {
  if (!save) return goLoad();
  bg.setMode('dim');
  showCreator(app, {
    edit: save,
    onCancel: () => goLoad(),
    onComplete: s => goJourney(writeSave(s, s.summary) || s),
  });
}

// Placeholder until the dungeon (milestone 1) exists.
function goJourney(save) {
  if (!save) return goTitle();
  bg.setMode('dim');
  const c = save.stats, d = derived(c), m = effectiveMain(c);
  app.innerHTML = `
    <section class="journey">
      <h2>${escapeHtml(save.name)} arrives at the gates of Eldermere</h2>
      <p>The golems' emerald eyes follow you through the gate. The guild hall is somewhere ahead.</p>
      <p class="journey-stats">HP ${display(d.maxHp)}, MP ${display(d.maxMp)}, Stamina ${display(d.maxStamina)}</p>
      <ul class="main-stats journey-main">${MAIN_STATS.map(s =>
        `<li><span>${label(s)}</span><b class="limit-${limitState(c, s)}">${display(m[s])}</b><i></i></li>`).join('')}</ul>
      <p class="muted">The dungeon isn't built yet. ${save.id ? 'Your character is saved.' : 'The browser would not save your character; use Save to file.'}</p>
      <div class="btns journey-acts">
        <button class="btn" data-act="play">Enter the test grounds</button>
        <button class="btn ghost" data-act="title">Back to title</button>
        <button class="btn ghost" data-act="export">Save to file</button>
      </div>
    </section>`;
  app.querySelector('[data-act=title]').onclick = () => goTitle();
  app.querySelector('[data-act=export]').onclick = () => exportSave(save);
  app.querySelector('[data-act=play]').onclick = () => goPlay(save);
}

// The 3D game. For now: the movement test grounds.
function goPlay(save) {
  bg.setMode('off');                              // the title background would cost frames behind the game
  startPlay(app, save, { onExit: () => { writeSave(save); goJourney(save); } });
}

// index.html?playtest (from the dungeon creator): straight into the game with your latest character
if (new URLSearchParams(location.search).has('playtest') && latestSave()) goPlay(latestSave());
else goTitle();
