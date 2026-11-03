// src/rpg/save.js — save slots, versioning and migration, and save files.
//
// Saves live in the browser (localStorage) as numbered slots, plus an index for the load screen.
// Browser storage can be cleared, so any save can also be exported to a .json file and imported back.
// Every save carries a version; loading runs each migration in order, so old saves keep working as
// the game changes.
import { upgradeCharacter } from './stats.js';

export const SAVE_VERSION = 3;
const PREFIX = 'eldermere.slot.';
const INDEX = 'eldermere.slots';
const LEGACY = 'eldermere.save';                  // the single save from before slots (version 2)

const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const remove = k => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } };

// ---------- Migrations: version n -> n + 1 ----------
const MIGRATIONS = {
  // 1 and 2: the creator's original saves. 3: limits, effects, levels, spells, new skills.
  1: s => ({ ...s, version: 2 }),
  2: s => ({ ...s, version: 3 }),
};
export function migrate(save) {
  if (!save || typeof save !== 'object' || !save.stats) throw new Error('This is not an Eldermere save.');
  let s = { ...save, version: save.version ?? 1 };
  if (s.version > SAVE_VERSION) throw new Error('This save is from a newer version of the game.');
  while (s.version < SAVE_VERSION) s = MIGRATIONS[s.version](s);
  upgradeCharacter(s.stats);                      // always: adds anything new since the save was made
  return s;
}

// ---------- Slots ----------
function index() { return read(INDEX) || []; }
function meta(save) {
  return { id: save.id, name: save.name, summary: save.summary || '', updated: save.updated, level: save.stats?.level ?? 1 };
}

export function listSaves() {
  adoptLegacy();
  return index().sort((a, b) => b.updated - a.updated);
}

export function loadSave(id) {
  const s = read(PREFIX + id);
  return s ? migrate(s) : null;
}

export function latestSave() {
  const top = listSaves()[0];
  return top ? loadSave(top.id) : null;
}

// Writes the save into its slot (a new slot if it has none). Returns the saved copy, or null if the
// browser refused (storage full or disabled).
export function writeSave(save, summary) {
  const now = Date.now();
  const s = { ...save, version: SAVE_VERSION, id: save.id || `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    created: save.created || now, updated: now, summary: summary ?? save.summary };
  if (!write(PREFIX + s.id, s)) return null;
  write(INDEX, [...index().filter(m => m.id !== s.id), meta(s)]);
  return s;
}

export function deleteSave(id) {
  remove(PREFIX + id);
  write(INDEX, index().filter(m => m.id !== id));
}

// the single pre-slot save becomes the first slot, once
function adoptLegacy() {
  const old = read(LEGACY);
  if (!old) return;
  try { writeSave(migrate(old)); remove(LEGACY); } catch { /* unreadable: leave it alone */ }
}

// ---------- Files ----------
export function exportSave(save) {
  const blob = new Blob([JSON.stringify({ ...save, version: SAVE_VERSION }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eldermere-${(save.name || 'character').replace(/[^\w-]+/g, '_')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Reads a save file and stores it in a new slot (an imported save never overwrites an existing one).
export async function importSave(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not a save file.'); }
  const s = migrate(data);
  delete s.id; delete s.created;
  const saved = writeSave(s);
  if (!saved) throw new Error('The browser would not store the save (storage may be full or disabled).');
  return saved;
}
