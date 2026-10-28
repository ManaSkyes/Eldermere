// src/editor/dungeonEditor.js — the dungeon creator: paint a dungeon onto a grid of 10 m cells, layer by
// layer. The data model is src/data/dungeon.js.
//
// Mouse: left paints (or erases / picks, by the tool) · right erases · Alt+click picks up a cell's piece ·
// wheel zooms · middle-drag or Space+drag pans.
// Keys: V select (click a piece to change it in place, drag to move it) · B paint · X erase · I pick · Q / E lower /
// raise (town pieces) · R rotate · 1–4 height · [ / ] layer down / up · Ctrl+Z / Ctrl+Y undo /
// redo · Ctrl+S save · M switch Layout / Objects mode.
//
// Two modes:
//   Layout   paint the pieces (the grid of 10 m cells)
//   Objects  place enemies, traps, loot, furniture and markers inside them (src/data/objects.js): click empty
//            floor to place, click an object to select and drag it, right-click deletes, R turns, Del removes,
//            Ctrl flips snapping, Shift+click places on top of another object. Wall things (torches, dart
//            launchers; spikes and fire jets near a wall) snap onto the nearest wall face. Selecting an enemy,
//            container, trap or light puts its properties in the right panel (instead of the layers); an
//            enemy's patrol route is drawn there too. The rooms' own torches, braziers and chests can be
//            moved and removed like anything else (saved in d.presets).
//   Paths    draw roads as smooth curves over the map, free of the grid (src/data/paths.js): click to add
//            points, Enter / double-click / right-click to finish; points snap onto other roads' points and
//            centre lines to connect. Hotkeys (N new, A add points, C continue, F flip, Del point, Shift+Del road,
//            Tab, arrows, = / −, L) are listed in the panel. P switches to it.
// Cells are drawn big (160 px by default) with their true footprint, built by the same code the game uses
// (src/game/dungeonBuild.js): floors, walls, pillars, steps, rubble, torches, so objects go where you can walk.
import { ELEV_THEMES, THEME_GROUPS, groupOfTheme, PARTS, SIDES, HEIGHT_COLORS, HEIGHT_NAMES, LOW_COLOR, isLow, heightName, MAX_HEIGHT, CELL, codeOf, createDungeon, themesOf, coverAt, withCoverCache, canPlace, place, erase, eachPiece, layerRange, countOn, resize, sidesAt, openSides, stairsArriving, stairsBelow, variantName, variantsOf, FOOT_PARTS, MAX_FOOT, pieceFoot } from '../data/dungeon.js';
import { OBJECTS, OBJECT_CATS, OBJECT_TABS, catsOnTab, objectsIn, snapTo, corners, hitObject, sizeOf, panelOf, ENEMY_TYPES, ENEMY_STATS, ENEMY_VARIANTS, statsOf, baseStatsOf, variantKeyOf, rotOfNormal, trapTrigger, SOUND_SUGGESTIONS, migrateEnemies } from '../data/objects.js';
import { buildDungeonShapes, COLORS as BUILD_COLORS } from '../game/dungeonBuild.js';
import { GLOBAL_SECTIONS, DEFAULT_GLOBALS, GLOBAL_PRESETS, MAP_PRESETS, globalsOf } from '../data/globals.js';
import { FILL_KINDS, FILL_COLORS, fillOf, paintFill } from '../data/fill.js';
import { GROUND_MATS, MAT_COLORS, FOLIAGE, FOL_COLORS, groundOf, groundAt as gLayerAt, paintGround, flowsOf } from '../data/ground.js';
import { terrainOf, createTerrain, sculpt, terrainAt, TERRAIN_MIN, TERRAIN_MAX } from '../data/terrain.js';
import { carvedFn } from '../data/water.js';
import { PATH_KINDS, ROAD, MAX_Y, MAX_GRADE, heightProfile, profileOf, groundFor, normalizeRoad, pathsOf, newPath, samplePath, pathField, splitAt, freeTangents, reversePoints, ROAD_MATS, BRIDGE_STYLES, paintRoad, outerHalfOf, setRoadsLive } from '../data/paths.js';

const STORE = 'eldermere.dungeons';
const root = document.getElementById('editor');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let d = createDungeon();
let layer = 0, tool = 'paint';
const brush = { part: 'C', theme: 'D', variant: 1, height: 1, rot: 0, elev: 0, fw: 1, fd: 1 };
const view = { cell: 160, ox: 40, oy: 40 };               // pixels per cell, pan offset
let mode = 'layout';
let themeGroup = 'interior';                               // which group of themes the Theme dropdown shows                                       // 'layout' | 'objects'
let objBrush = 'swarm', objRot = 0, selected = null, hoverM = null, drag = null, patrolEdit = null, objTab = 'enemy';
let bind = null;
let bulk = false, bulkSrc = null;                          // Bind mode (Traps tab): click a trap, then triggers (or the other way round) to bind them                                           // binding traps and triggers: { from: id, kind: 'trap' | 'trigger', type: a trigger type to place }
let migratedFor = null;   // (old maps' enemy archetypes → the monster groups, once per map opened)
const objs = () => { const L = (d.objects ||= []); if (migratedFor !== d) { migratedFor = d; migrateEnemies(L); } return L; };
const newId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const history = [], future = [];
let hover = null, dirty = false;

// ---- saving: every dungeon by name in the browser, and to/from files ----
const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const saveAll = all => { try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; } };
function saveLast() { try { localStorage.setItem(STORE + '.last', d.name); } catch { /* storage unavailable */ } }
function save() { const all = loadAll(); all[d.name] = d; if (saveAll(all)) { dirty = false; saveLast(); flash(`Saved “${d.name}”.`); renderTop(); } else flash('The browser would not save. Export to a file instead.'); }

// ---- layout ----
root.innerHTML = `
  <header class="ed-top"></header>
  <aside class="ed-side"></aside>
  <section class="ed-main"><canvas></canvas><div class="ed-flash"></div></section>
  <aside class="ed-layers"></aside>
  <footer class="ed-status"></footer>`;
const top = root.querySelector('.ed-top'), side = root.querySelector('.ed-side'), layersEl = root.querySelector('.ed-layers'), status = root.querySelector('.ed-status');
const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d'), mainEl = root.querySelector('.ed-main'), flashEl = root.querySelector('.ed-flash');
let flashT = 0;
function flash(msg) { flashEl.textContent = msg; flashEl.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => flashEl.classList.remove('on'), 2200); }

const layerName = l => l === 0 ? 'Ground (layer 0)' : l > 0 ? `Layer ${l} (+${l * CELL} m)` : `Layer ${l} (${l * CELL} m)`;

function renderTop() {
  const saved = Object.keys(loadAll());
  top.innerHTML = `
    <h1>Dungeon creator</h1>
    <span class="ed-modes"><button data-mode="layout" class="${mode === 'layout' ? 'on' : ''}" title="Paint the pieces (M)">Layout</button><button data-mode="objects" class="${mode === 'objects' ? 'on' : ''}" title="Place enemies, traps, loot, furniture (M)">Objects</button><button data-mode="paths" class="${mode === 'paths' ? 'on' : ''}" title="Draw curved roads over the map (P)">Paths</button><button data-mode="terrain" class="${mode === 'terrain' ? 'on' : ''}" title="The ground: sculpt the terrain (hills, slopes) and paint filler into the dead space (T)">Ground</button><button data-mode="global" class="${mode === 'global' ? 'on' : ''}" title="Sky, fog, light, weather and rules for the whole map (G)">Global</button></span>
    <label>Name <input class="ed-name" value="${esc(d.name)}"></label>
    <label>Size <input class="ed-w" type="number" min="4" max="128" value="${d.w}"> × <input class="ed-h" type="number" min="4" max="128" value="${d.h}"> cells</label>
    <span class="ed-sp"></span>
    <button data-a="new">New</button>
    <button data-a="save" class="${dirty ? 'hot' : ''}">Save${dirty ? ' •' : ''}</button>
    <select class="ed-load"><option value="">Load…</option>${saved.map(n => `<option>${esc(n)}</option>`).join('')}</select>
    <button data-a="export">Export</button>
    <button data-a="import">Import</button>
    <button data-a="play" class="play" title="Walk through it in the game, with your latest character (opens a new tab)">▶ Play test</button>
    <a class="ed-back" href="monster-lab.html" target="_blank" title="Make your own monsters (opens in a new tab; reload the creator after saving one)">Creature workshop</a> <a class="ed-back" href="index.html">Back to the game</a>`;
  top.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  top.querySelector('.ed-name').onchange = e => { d.name = e.target.value.trim() || 'Unnamed'; dirty = true; renderTop(); };
  const sz = () => { snapshot(); resize(d, clampI(top.querySelector('.ed-w').value, 4, 128), clampI(top.querySelector('.ed-h').value, 4, 128)); dirty = true; draw(); renderLayers(); };
  top.querySelector('.ed-w').onchange = sz; top.querySelector('.ed-h').onchange = sz;
  top.querySelector('[data-a=new]').onclick = () => { if (dirty && !confirmLose()) return; newMapDialog(); };
  top.querySelector('[data-a=save]').onclick = save;
  top.querySelector('.ed-load').onchange = e => { const n = e.target.value; if (!n) return; if (dirty && !confirmLose()) { e.target.value = ''; return; } d = loadAll()[n]; layer = 0; selected = null; history.length = future.length = 0; dirty = false; renderAll(); centerView(); flash(`Loaded “${n}”.`); };
  top.querySelector('[data-a=export]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `${d.name.replace(/[^\w-]+/g, '_')}.dungeon.json`; a.click(); URL.revokeObjectURL(a.href); };
  top.querySelector('[data-a=play]').onclick = () => {
    save();                                                    // play-testing always saves the dungeon first
    try { localStorage.setItem('eldermere.playtest', JSON.stringify(d)); } catch { return flash('The browser would not hand the dungeon over.'); }
    if (!Object.values(d.cells).some(p => p.part === 'E')) flash('No entrance (E): you\'ll start at the first piece.');
    window.open('index.html?playtest', '_blank');
  };
  top.querySelector('[data-a=import]').onclick = () => {
    const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = async () => { try { const x = JSON.parse(await f.files[0].text()); if (!x.cells || !x.w) throw 0; d = x; layer = 0; selected = null; history.length = future.length = 0; dirty = true; renderAll(); centerView(); flash(`Imported “${d.name}”.`); } catch { flash('That file is not a dungeon.'); } };
    f.click();
  };
}
// New: pick what kind of map, then its flavour; that sets its global settings, the theme to paint with, a name
function newMapDialog() {
  const box = document.createElement('div'); box.className = 'ed-modal';
  let cat = 'overworld';
  const render = () => {
    const C = MAP_PRESETS[cat];
    box.innerHTML = `<div class="ed-dialog"><h2>New map</h2>
      <div class="ed-cats">${Object.entries(MAP_PRESETS).map(([k, c]) => `<button class="${k === cat ? 'on' : ''}" data-cat="${k}"><b>${esc(c.name)}</b><small>${esc(c.text)}</small></button>`).join('')}</div>
      <h3>${esc(C.name)}</h3>
      <div class="ed-subs">${Object.entries(C.subs).map(([k, s2]) => `<button data-sub="${k}"><i style="background:${s2.globals.background}"></i><b>${esc(s2.name)}</b><small>theme: ${esc(themesOf(d)[s2.theme]?.name || s2.theme)}</small></button>`).join('')}</div>
      <div class="ed-row" style="justify-content:space-between;margin-top:10px"><button data-blank>Blank map (defaults)</button><button data-cancel>Cancel</button></div></div>`;
    box.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; render(); });
    box.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { const S = C.subs[b.dataset.sub]; start(`New ${S.name.split(' (')[0].toLowerCase()}`, S.theme, S.globals, cat); });
    box.querySelector('[data-blank]').onclick = () => start('New dungeon', 'D', {}, 'inside');
    box.querySelector('[data-cancel]').onclick = () => box.remove();
  };
  const start = (name, theme, g, kind) => {
    d = createDungeon(name); d.kind = kind; d.globals = {};
    for (const [k, v] of Object.entries(g)) if (v !== DEFAULT_GLOBALS[k]) d.globals[k] = v;
    brush.theme = theme; themeGroup = groupOfTheme(d, theme);
    layer = 0; selected = null; history.length = future.length = 0; dirty = true; box.remove(); renderAll(); centerView(); flash(`${name}: its sky, light and fog are set (Global tab to change).`);
  };
  box.onclick = e => { if (e.target === box) box.remove(); };
  render(); document.body.appendChild(box);
}
const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v) || a));
const confirmLose = () => window.confirm('Discard unsaved changes?');

function setMode(m) { if (mode === 'paths' && m !== 'paths') finishPath(); mode = m; selected = null; drag = null; patrolEdit = null; bind = null; bulk = false; bulkSrc = null; renderTop(); renderSide(); renderLayers(); draw(); updateStatus(); }
function renderObjectSide() {
  const sel = selectedObj(), t = sel && OBJECTS[sel.type], b = OBJECTS[objBrush];
  side.innerHTML = `
    <div class="ed-brush"><span class="code obj-glyph" style="color:${OBJECT_CATS[b.cat].color}">${esc(b.glyph || '▭')}</span><small>${esc(b.name)} · ${b.w} × ${b.d} m<br>${b.snap ? `snaps to ${b.snap} m` : 'free placement'} · turns ${b.turn}°${b.mount === 'wall' ? ' · on walls' : b.mount === 'both' ? ' · on the floor, or a wall when placed near one' : ` · facing ${objRot}°`}</small></div>
    <div class="ed-tabs">${OBJECT_TABS.map(c => `<button class="${objTab === c ? 'on' : ''}" data-tab="${c}" style="--c:${OBJECT_CATS[c].color}">${esc(OBJECT_CATS[c].name)}</button>`).join('')}</div>
    ${objTab === 'trap' ? `<div class="ed-row" style="margin-top:6px"><button class="bindbtn ${bulk ? 'on' : ''}" data-bulk title="B">🔗 Bind mode${bulk ? ': on' : ''}</button></div>${bulk ? `<p class="ed-help" style="margin:4px 0 0">${bulkSrc ? `<b>${esc(OBJECTS[objs().find(q => q.id === bulkSrc)?.type]?.name || '')}</b> chosen: click ${OBJECTS[objs().find(q => q.id === bulkSrc)?.type]?.cat === 'trap' ? 'triggers' : 'traps'} to bind or unbind them. Click another trap or trigger to switch; empty floor to let go.` : 'Click a trap (or a trigger), then click the triggers (or traps) to bind it to. Clicking a bound pair again unbinds it.'} B or Esc to leave.</p>` : ''}` : ''}
    ${catsOnTab(objTab).map((c, i, all) => `${all.length > 1 ? `<h3>${esc(OBJECT_CATS[c].name)}</h3>` : ''}<div class="ed-objs">${objectsIn(c).map(k => `<button class="${objBrush === k ? 'on' : ''}" data-obj="${k}" title="${esc(OBJECTS[k].name)}"><i style="color:${OBJECT_CATS[c].color}">${esc(OBJECTS[k].glyph || '—')}</i>${esc(OBJECTS[k].name)}</button>`).join('')}</div>`).join('')}
    <h3>Selected</h3>${sel ? `<p class="ed-help" style="margin-top:0"><b>${esc(t.name)}</b>${sel.preset ? ' (part of the room)' : ''}<br>x ${sel.x.toFixed(2)} m, z ${sel.z.toFixed(2)} m · ${layerName(sel.layer)} · ${sel.mount === 'wall' ? `on the wall, ${(sel.h ?? t.wallH ?? 0).toFixed(1)} m up · ` : ''}facing ${sel.rot || 0}°</p><div class="ed-row"><button data-sa="turnL">⟲ Turn</button><button data-sa="turnR">Turn ⟳</button><button data-sa="del">${sel.preset ? 'Remove' : 'Delete'}</button></div>` : '<p class="ed-help" style="margin-top:0">Nothing selected. Click an object to select it.</p>'}
    <p class="ed-help">Click floor: place · Click an object: select, drag to move · Middle-click an object: copy it (settings, not its route) to place more · Shift+click: place on top · Right-click: delete · R / Shift+R: turn · Del: remove · Ctrl: flip snapping · Esc: deselect · M: Layout mode</p>`;
  side.querySelectorAll('[data-obj]').forEach(el => el.onclick = () => { objBrush = el.dataset.obj; objRot = 0; stamp = null; renderSide(); draw(); });
  side.querySelector('[data-bulk]')?.addEventListener('click', () => toggleBulk());
  side.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { objTab = el.dataset.tab; const first = catsOnTab(objTab).flatMap(objectsIn)[0]; if (OBJECTS[objBrush].cat !== objTab && OBJECT_CATS[OBJECTS[objBrush].cat].tab !== objTab) { objBrush = first; objRot = 0; } renderSide(); draw(); });
  side.querySelectorAll('[data-sa]').forEach(el => el.onclick = () => { const a = el.dataset.sa; if (a === 'del') deleteSelected(); else turnSelected(a === 'turnL' ? -1 : 1); });
}
function toggleBulk(on = !bulk) { bulk = on; bulkSrc = null; bind = null; patrolEdit = null; if (bulk) { objTab = 'trap'; selected = null; } renderSide(); renderLayers(); draw(); }
function turnSelected(dir) {
  const o = selectedObj();
  if (o && o.mount === 'wall') { flash('Wall things face out of their wall: drag it to another wall to turn it.'); return; }
  if (o) {
    snapshot(); const r = ((o.rot || 0) + dir * OBJECTS[o.type].turn + 360) % 360;
    if (OBJECTS[o.type].span) { const sp = spanAt(o.x, o.z, r); if (!sp) { history.pop(); flash('No walls to stretch between that way.'); return; } Object.assign(o, sp); }
    else setPlace(o, { x: o.x, z: o.z, rot: r });
    dirty = true; renderTop();
  }
  else objRot = (objRot + dir * OBJECTS[objBrush].turn + 360) % 360;
  renderSide(); renderLayers(); draw();
}
function deleteSelected() {
  const o = selectedObj(); if (!o) return; snapshot();
  if (o.preset) (d.presets ||= {})[o.id] = { removed: true }; else d.objects = objs().filter(x => x.id !== o.id);
  for (const t of objs()) if (t.triggers) t.triggers = t.triggers.filter(id => id !== o.id);   // a trigger that's gone sets nothing off
  selected = null; patrolEdit = null; bind = null; dirty = true; renderTop(); renderSide(); renderLayers(); draw();
}
// ---- Ground mode: the terrain's shape (src/data/terrain.js), its paint layers (src/data/ground.js) and the
// dynamic filler (src/data/fill.js), all painted with one round brush. Tabs: Shape · Surface · Filler · Climate ·
// Water · Foliage. The map shows the active tab's layer over the terrain's colours (drawn once into an offscreen
// picture and reused until something changes, so big maps stay quick).
const terr = { tab: 'shape', op: 'raise', r: 8, s: 1, target: 0, base: 0, kind: 'a', mat: 'g', clim: 'moist', climV: 2, waterLv: 0, folT: 'g', folD: 6, clutD: 5, waterMode: 'paint', waterFixed: false, flowSpeed: 1.5, flowDraw: null };
const TERR_OPS = [['raise', 'Raise', '1'], ['lower', 'Lower', '2'], ['smooth', 'Smooth', '3'], ['flatten', 'Flatten', '4']];
const G_TABS = [['shape', 'Shape'], ['surface', 'Surface'], ['fill', 'Filler'], ['climate', 'Climate'], ['water', 'Water'], ['foliage', 'Foliage'], ['clutter', 'Clutter']];
let gVer = 0, gVerD = null;                                                               // bumped whenever the ground changes (the overlay pictures are rebuilt)
const gBump = () => { gVer++; };
const swatch = c => `<i style="display:inline-block;width:10px;height:10px;margin-right:6px;background:${c}"></i>`;
function renderTerrainSide() {
  const t = terrainOf(d);
  if (!t && terr.tab === 'shape') terr.tab = 'fill';
  let lo = Infinity, hi = -Infinity; if (t) for (const h of t.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const tabHtml = {
    shape: t ? `<div class="ed-row">${TERR_OPS.map(([id, n, k]) => `<button class="${terr.op === id ? 'on' : ''}" data-top="${id}" title="${n} (${k})">${n}</button>`).join('')}</div>
      <h3>Strength</h3><div class="ed-row"><input class="ed-ts" type="range" min="0.05" max="2" step="0.05" value="${terr.s}"><span style="align-self:center;min-width:34px">${terr.s}</span></div>
      ${terr.op === 'flatten' ? `<h3>Flatten to</h3><div class="ed-row"><input class="ed-tt" type="number" step="0.25" min="${TERRAIN_MIN}" max="${TERRAIN_MAX}" value="${terr.target}"><span style="align-self:center">m</span></div><p class="ed-help">Alt+click: take the height under the mouse.</p>` : ''}
      <p class="ed-help">Right-click: the opposite (raise ↔ lower).</p>` : '',
    surface: `<div class="ed-vars">${Object.entries(GROUND_MATS).map(([k, n]) => `<button class="${terr.mat === k ? 'on' : ''}" data-gm="${k}">${swatch(MAT_COLORS[k])}${esc(n)}</button>`).join('')}</div>
      <p class="ed-help">What the ground is made of, a 1 m square at a time. Auto: grass, rock where steep, and what the climate makes of it (snow when cold, dry and sandy when very dry). Painted filler colours auto ground too. Right-click: back to auto.</p>`,
    fill: `<h3>Filler <small style="font-weight:400">(on ${layerName(layer)})</small></h3><div class="ed-vars">${Object.entries(FILL_KINDS).map(([k, n]) => `<button class="${terr.kind === k ? 'on' : ''}" data-fk="${k}">${swatch(FILL_COLORS[k])}${esc(n)}</button>`).join('')}</div>
      <p class="ed-help">Dead space, filled with scenery (1 m squares); right-click erases. It keeps out of pieces and roads by itself. Auto takes after the nearest tiles, blending where different ones meet. Yards get a fence where they meet open space.</p>`,
    climate: `<div class="ed-row"><button class="${terr.clim === 'moist' ? 'on' : ''}" data-gc="moist">Moisture</button><button class="${terr.clim === 'temp' ? 'on' : ''}" data-gc="temp">Temperature</button></div>
      <h3>${terr.clim === 'moist' ? 'Moisture' : 'Temperature'}: ${terr.climV}</h3><div class="ed-row"><span style="align-self:center;font-size:11px">${terr.clim === 'moist' ? 'dry' : 'cold'}</span><input class="ed-gcv" type="range" min="0" max="9" step="1" value="${terr.climV}"><span style="align-self:center;font-size:11px">${terr.clim === 'moist' ? 'wet' : 'hot'}</span></div>
      <p class="ed-help">5 is normal. Moisture: dry ground goes yellow, then sandy; wet ground deep green. Temperature: cold brings frost, then snow on the flat. Right-click: back to normal. Foliage will follow these later.</p>`,
    water: `<div class="ed-row"><button class="${terr.waterMode === 'paint' ? 'on' : ''}" data-gwm="paint">Paint water</button><button class="${terr.waterMode === 'flow' ? 'on' : ''}" data-gwm="flow">Draw flow</button></div>
      ${terr.waterMode === 'paint' ? `<label class="pp-row" style="margin-top:6px"><span>Fixed level</span><input type="checkbox" class="ed-gwf" ${terr.waterFixed ? 'checked' : ''}></label>
      ${terr.waterFixed ? `<div class="ed-row"><input class="ed-gw" type="number" step="0.25" min="-40" max="39.75" value="${terr.waterLv}"><span style="align-self:center">m</span></div>` : ''}
      <p class="ed-help">Paint rivers, ponds and lakes (2 m squares); right-click dries them out. Each connected body of water lies at one level: by default the lowest ground anywhere under it, so a long river is level end to end and carves its channel down through higher ground, with banks sloping to the water. Fixed level: you choose it (Alt+click takes the ground's height).</p>`
      : `<h3>Speed: ${terr.flowSpeed} m/s</h3><div class="ed-row"><input class="ed-gfs" type="range" min="0.25" max="5" step="0.25" value="${terr.flowSpeed}"></div>
      <p class="ed-help">Draw the way the water runs: click along the river to lay a line (Enter, double-click or Esc to finish). Every square of the water it crosses runs along the nearest part of it, fading out past its ends (so a lake at the end lies still) and far to the side. Right-click a line to delete it.${terr.flowDraw ? ' <b>Drawing</b>: click to add points.' : ''}</p>`}`,
    foliage: `<div class="ed-vars">${Object.entries(FOLIAGE).map(([k, n]) => `<button class="${terr.folT === k ? 'on' : ''}" data-gf="${k}">${swatch(FOL_COLORS[k])}${esc(n)}</button>`).join('')}</div>
      <h3>Density: ${terr.folD}</h3><div class="ed-row"><span style="align-self:center;font-size:11px">sparse</span><input class="ed-gfd" type="range" min="1" max="9" step="1" value="${terr.folD}"><span style="align-self:center;font-size:11px">dense</span></div>
      <label class="pp-row" style="margin-top:6px" title="Plants grow by themselves where nothing's painted: reeds, cattails and lily pads in still water (with stones and old logs along the edge), reeds and tall grass on slow banks, and grass, flowers, bushes and patches of woods in open country at least a block from any building"><span>Grow on their own</span><input type="checkbox" class="ed-gpas" ${groundOf(d)?.passive !== false ? 'checked' : ''}></label>
      <p class="ed-help">Where plants grow, what and how thick (2 m squares); right-click clears. Painted plants always grow. Where nothing's painted (and "Grow on their own" is on), plants grow by themselves: thick reeds, cattails and lily pads in still water with stones and old logs along its edge; reeds and tall grass along slow banks; grass, wildflowers, bushes and patches of woods (pines where it's cold) in open country at least a block (10 m) from any building. Never on roads, pieces, filler, cliffs or cobbles.</p>`,
    clutter: `<h3>Density: ${terr.clutD}</h3><div class="ed-row"><span style="align-self:center;font-size:11px">sparse</span><input class="ed-gcd" type="range" min="1" max="9" step="1" value="${terr.clutD}"><span style="align-self:center;font-size:11px">dense</span></div>
      <p class="ed-help">Rocks and debris, picked by where you paint (2 m squares). In water: stones and driftwood along the edges and shallows; big boulders out in deep water, with the water foaming round them (they're solid, and climbable). On land, by the surface: scree on rock and cliffs, pebbles and shells on sand, pale rocks on snow, stones and sticks on dirt and grass (now and then a fallen log). Right-click clears.</p>`,
  };
  side.innerHTML = `<div class="ed-row" style="flex-wrap:wrap">${G_TABS.map(([id, n], i) => `<button class="${terr.tab === id ? 'on' : ''}" data-gt="${id}" title="${n} (${i + 1 === 1 ? '1–4' : ''}${['', '5', '6', '7', '8', '9', '0'][i]})">${n}</button>`).join('')}</div>
    <h3>Size <small style="font-weight:400">(radius, m)</small></h3><div class="ed-row"><input class="ed-tr" type="range" min="1" max="40" step="1" value="${terr.r}"><span style="align-self:center;min-width:34px">${terr.r} m</span></div>
    ${tabHtml[terr.tab]}
    <h3>Terrain</h3>
    ${t ? `<div style="display:flex;height:12px;border-radius:3px;overflow:hidden;margin:4px 0 2px">${Array.from({ length: 80 }, (_, i) => `<i style="flex:1;background:rgb(${tColor(-40 + i)})"></i>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;font-size:11px;opacity:.8"><span>−40</span><span>−20</span><span>0</span><span>20</span><span>40 m</span></div>
    <p class="ed-help">Heights now: ${lo.toFixed(2)} m to ${hi.toFixed(2)} m (above layer 0's floor). Lines every metre, bold (and numbered) every 5 m. The height under the mouse is in the status bar.</p>
    <div class="ed-row"><button data-tdel title="Take the terrain away (Ctrl+Z brings it back)">Remove terrain</button></div>`
    : `<p class="ed-help">The ground's shape under and around the map: hills, slopes, the mountain the town is built on. The ground bends to meet the tiles and roads on it.</p>
    <div class="ed-row"><span style="align-self:center;font-size:12px">Start at</span><input class="ed-tbase" type="number" step="0.25" min="${TERRAIN_MIN}" max="${TERRAIN_MAX}" value="${terr.base}"><span style="align-self:center">m</span><button data-tadd>Add terrain</button></div>`}
    <p class="ed-help" style="margin-top:10px">Left: brush · Right: the opposite / erase · Alt+click: pick a height · 1–4 shape brushes, 5–9 the other tabs · [ ] size · PgUp / PgDn layer · Wheel: zoom · Ctrl+Z undo</p>`;
  const on = (sel, ev, fn) => side.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  on('[data-gt]', 'click', e => { terr.tab = e.currentTarget.dataset.gt; renderSide(); draw(); });
  on('[data-top]', 'click', e => { terr.op = e.currentTarget.dataset.top; renderSide(); draw(); });
  on('[data-fk]', 'click', e => { terr.kind = e.currentTarget.dataset.fk; renderSide(); });
  on('[data-gm]', 'click', e => { terr.mat = e.currentTarget.dataset.gm; renderSide(); });
  on('[data-gc]', 'click', e => { terr.clim = e.currentTarget.dataset.gc; renderSide(); draw(); });
  on('[data-gf]', 'click', e => { terr.folT = e.currentTarget.dataset.gf; renderSide(); });
  on('.ed-gpas', 'change', e => { snapshot(); const g = groundOf(d, true); if (e.target.checked) delete g.passive; else g.passive = false; dirty = true; renderTop(); });
  on('.ed-gcd', 'input', e => { terr.clutD = +e.target.value; renderSide(); });
  on('.ed-gcv', 'input', e => { terr.climV = +e.target.value; renderSide(); });
  on('.ed-gfd', 'input', e => { terr.folD = +e.target.value; renderSide(); });
  on('.ed-gw', 'change', e => { terr.waterLv = Math.round(Math.max(-40, Math.min(39.75, +e.target.value || 0)) * 4) / 4; });
  on('[data-gwm]', 'click', e => { terr.waterMode = e.currentTarget.dataset.gwm; terr.flowDraw = null; renderSide(); draw(); });
  on('.ed-gwf', 'change', e => { terr.waterFixed = e.target.checked; renderSide(); });
  on('.ed-gfs', 'input', e => { terr.flowSpeed = +e.target.value; const fl = flowsOf(d).find(q => q.id === terr.flowDraw); if (fl) fl.speed = terr.flowSpeed; renderSide(); });
  side.querySelector('.ed-tr').oninput = e => { terr.r = +e.target.value; e.target.nextElementSibling.textContent = `${terr.r} m`; draw(); };
  on('.ed-ts', 'input', e => { terr.s = +e.target.value; e.target.nextElementSibling.textContent = terr.s; });
  on('.ed-tt', 'change', e => { terr.target = Math.max(TERRAIN_MIN, Math.min(TERRAIN_MAX, +e.target.value || 0)); });
  on('[data-tdel]', 'click', () => { snapshot(); delete d.terrain; terr.tab = 'fill'; gBump(); dirty = true; renderTop(); renderSide(); draw(); });
  on('.ed-tbase', 'change', e => { terr.base = +e.target.value || 0; });
  on('[data-tadd]', 'click', () => { snapshot(); createTerrain(d, terr.base); terr.target = terr.base; terr.tab = 'shape'; terr.op = 'raise'; resettleGround(); gBump(); dirty = true; renderTop(); renderSide(); draw(); });
}
// one dab of the brush at m (metres), per tab; `flip`: the right button (the opposite, or erase)
let terrStroke = null;
function terrainDab(m, flip) {
  let ch = false;
  if (terr.tab === 'fill') ch = paintFill(d, layer, m.x, m.z, terr.r, flip ? '.' : terr.kind);
  else if (terr.tab === 'surface') ch = paintGround(d, 'mat', m.x, m.z, terr.r, flip ? null : terr.mat);
  else if (terr.tab === 'climate') ch = paintGround(d, terr.clim, m.x, m.z, terr.r, flip ? null : String(terr.climV));
  else if (terr.tab === 'water') ch = paintGround(d, 'water', m.x, m.z, terr.r, flip ? null : terr.waterFixed ? terr.waterLv : 'a');
  else if (terr.tab === 'clutter') ch = paintGround(d, 'clut', m.x, m.z, terr.r, flip ? null : String(terr.clutD));
  else if (terr.tab === 'foliage') { const a = paintGround(d, 'fol', m.x, m.z, terr.r, flip ? null : String(terr.folD)), b = paintGround(d, 'folT', m.x, m.z, terr.r, flip ? null : terr.folT); ch = a || b; }
  else {
    const t = terrainOf(d); if (!t) return false;
    const op = flip ? ({ raise: 'lower', lower: 'raise' }[terr.op] || terr.op) : terr.op;
    ch = sculpt(t, op, m.x, m.z, terr.r, op === 'raise' || op === 'lower' ? terr.s * 0.25 : terr.s * 0.35, terr.target, layer !== 0 ? layer * CELL : null);   // (on another layer: straight to its floor first)
  }
  if (ch) gBump();
  return ch;
}
// ---- the overlay pictures: each drawn once at a few pixels per metre and reused until the ground changes ----
const ovCache = new Map();
function overlay(key, W, H, ppm, paint) {
  if (gVerD !== d) { gVerD = d; gVer++; }
  const k = `${key}|${gVer}|${W}x${H}`, hit = ovCache.get(key); if (hit && hit.k === k) return hit;
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W * ppm)); cv.height = Math.max(1, Math.round(H * ppm));
  const g = cv.getContext('2d'), extra = paint(g, ppm) || {}; const o = { k, cv, ...extra }; ovCache.set(key, o); return o;
}
const PPM = () => Math.max(1, Math.min(4, Math.floor(1600 / Math.max(d.w, d.h) / CELL)));   // pixels per metre of the pictures (1–4)
function blitOverlay(o, x0, y0, s, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false; ctx.drawImage(o.cv, x0, y0, d.w * s, d.h * s); ctx.restore(); }
// the painted filler on this layer
function drawFill(x0, y0, s, strong) {
  const f = fillOf(d), str = f?.layers[layer]; if (!str) return;
  const o = overlay('fill' + layer, f.w, f.h, PPM(), (g, p) => {
    for (let j = 0; j < f.h; j++) { let i = 0; while (i < f.w) { const c = str[j * f.w + i]; if (c === '.') { i++; continue; } let e = i + 1; while (e < f.w && str[j * f.w + e] === c) e++; g.fillStyle = FILL_COLORS[c] || '#888'; g.fillRect(i * p, j * p, (e - i) * p, p); i = e; } }
  });
  blitOverlay(o, x0, y0, s, strong ? (terr.tab === 'fill' ? 0.75 : 0.25) : 0.4);
}
// the active tab's paint layer (Ground mode): surface, climate, water, foliage
// the painted water as a picture (auto bodies plain blue; fixed levels darker where deeper): shown in every mode
function waterOverlay() {
  const g = groundOf(d), W = d.w * CELL, H = d.h * CELL, t = terrainOf(d);
  return overlay('water', W, H, PPM(), (c, p) => { for (const [key, lv] of Object.entries(g.water)) { const [i, j] = key.split(',').map(Number), R2 = 2;
    if (lv === 'a') c.fillStyle = 'rgba(30,110,220,0.65)'; else { const gh = t ? terrainAt(t, (i + 0.5) * R2, (j + 0.5) * R2) : 0, dep = lv - gh; c.fillStyle = dep > 0 ? `rgba(20,70,190,${Math.min(0.9, 0.4 + dep / 4)})` : 'rgba(20,70,190,0.3)'; }
    c.fillRect(i * R2 * p, j * R2 * p, R2 * p, R2 * p); } });
}
function drawGroundLayer(x0, y0, s) {
  const g = groundOf(d), W = d.w * CELL, H = d.h * CELL, t = terrainOf(d), tab = terr.tab;
  if (tab === 'surface' && g?.mat) blitOverlay(overlay('mat', W, H, PPM(), (c, p) => { for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = g.mat[j * W + i]; if (k === '.' || !k) continue; c.fillStyle = MAT_COLORS[k]; c.fillRect(i * p, j * p, p, p); } }), x0, y0, s, 0.8);
  if (tab === 'climate') blitOverlay(overlay('clim' + terr.clim, W, H, PPM(), (c, p) => { const key = terr.clim; for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const v = +gLayerAt(g, key, i, j); if (v === 5) continue; const k = (v - 5) / 4; c.fillStyle = key === 'moist' ? (k > 0 ? `rgba(40,110,220,${k * 0.8})` : `rgba(200,160,60,${-k * 0.8})`) : (k > 0 ? `rgba(220,80,40,${k * 0.8})` : `rgba(120,190,255,${-k * 0.9})`); c.fillRect(i * p, j * p, 2 * p, 2 * p); } }), x0, y0, s, 1);
  if (tab === 'clutter' && g?.clut) blitOverlay(overlay('clut', W, H, PPM(), (c, p) => { for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const v = +gLayerAt(g, 'clut', i, j); if (!v) continue; c.globalAlpha = 0.25 + v / 9 * 0.7; c.fillStyle = '#8a7a66'; c.fillRect(i * p, j * p, 2 * p, 2 * p); c.fillStyle = '#4a4038'; c.fillRect((i + 0.6) * p, (j + 0.6) * p, 0.8 * p, 0.8 * p); } c.globalAlpha = 1; }), x0, y0, s, 1);
  if (tab === 'foliage' && g?.fol) blitOverlay(overlay('fol', W, H, PPM(), (c, p) => { for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const v = +gLayerAt(g, 'fol', i, j); if (!v) continue; c.globalAlpha = 0.25 + v / 9 * 0.7; c.fillStyle = FOL_COLORS[gLayerAt(g, 'folT', i, j)] || '#5a9a40'; c.fillRect(i * p, j * p, 2 * p, 2 * p); } c.globalAlpha = 1; }), x0, y0, s, 1);
  if (g?.water) blitOverlay(waterOverlay(), x0, y0, s, tab === 'water' ? 1 : 0.6);
  // flow lines: the way the water runs, with arrows
  const fls = flowsOf(d); if (fls.length) {
    const m = s / CELL; ctx.save(); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (const fl of fls) {
      const S = samplePath({ points: fl.points }, 1); if (!S.length) continue;
      ctx.strokeStyle = fl.id === terr.flowDraw ? '#ffffff' : '#bfe6ff'; ctx.beginPath(); S.forEach((q, n) => n ? ctx.lineTo(x0 + q.x * m, y0 + q.z * m) : ctx.moveTo(x0 + q.x * m, y0 + q.z * m)); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; const step = Math.max(4, Math.round(40 / Math.max(0.5, m)));
      for (let n = step; n < S.length - 1; n += step) { const a2 = S[n - 1], b2 = S[n + 1], ang = Math.atan2(b2.z - a2.z, b2.x - a2.x), px = x0 + S[n].x * m, py = y0 + S[n].z * m; ctx.beginPath(); ctx.moveTo(px + Math.cos(ang) * 8, py + Math.sin(ang) * 8); ctx.lineTo(px + Math.cos(ang + 2.5) * 7, py + Math.sin(ang + 2.5) * 7); ctx.lineTo(px + Math.cos(ang - 2.5) * 7, py + Math.sin(ang - 2.5) * 7); ctx.fill(); }
      for (const q of fl.points) { ctx.beginPath(); ctx.arc(x0 + q.x * m, y0 + q.z * m, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
}
// the terrain under the map: a colour ramp by height (blue below 0, greens, yellows, browns, white at the top),
// hill-shaded, with contour lines every metre (bold and numbered every 5 m)
const T_RAMP = [[-40, [12, 20, 52]], [-30, [20, 32, 78]], [-20, [30, 50, 104]], [-10, [43, 76, 126]], [0, [63, 143, 107]], [5, [127, 178, 74]], [10, [217, 198, 90]], [20, [208, 138, 58]], [30, [150, 82, 45]], [40, [242, 242, 242]]];
const tColor = h => { let i = 0; while (i < T_RAMP.length - 2 && h > T_RAMP[i + 1][0]) i++; const [h0, c0] = T_RAMP[i], [h1, c1] = T_RAMP[i + 1], k = Math.max(0, Math.min(1, (h - h0) / (h1 - h0))); return c0.map((v, n) => Math.round(v + (c1[n] - v) * k)); };
function drawTerrain(x0, y0, s, strong) {
  const t = terrainOf(d);
  if (t) {
    const W = d.w * CELL, H = d.h * CELL, R = t.res, Hs = (i, j) => t.h[j * t.nx + i];
    const o = overlay('terrain', W, H, Math.max(PPM(), 2), (g, p) => {
      for (let j = 0; j < t.nz - 1; j++) for (let i = 0; i < t.nx - 1; i++) {
        const h = (Hs(i, j) + Hs(i + 1, j) + Hs(i, j + 1) + Hs(i + 1, j + 1)) / 4, c = tColor(h), sh = 1 + Math.max(-0.25, Math.min(0.25, (Hs(i, j) - Hs(i + 1, j + 1)) * 0.12));
        g.fillStyle = `rgb(${Math.min(255, c[0] * sh) | 0},${Math.min(255, c[1] * sh) | 0},${Math.min(255, c[2] * sh) | 0})`; g.fillRect(i * R * p, j * R * p, R * p + 0.5, R * p + 0.5);
      }
      let lo = Infinity, hi = -Infinity; for (const h of t.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
      const labels = [];
      for (let lv = Math.ceil(lo); lv <= Math.floor(hi); lv++) {
        if (lv === lo) continue; const bold = lv % 5 === 0;
        g.strokeStyle = bold ? 'rgba(20,20,30,0.75)' : 'rgba(20,20,30,0.3)'; g.lineWidth = bold ? 1.6 : 0.8; g.beginPath();
        for (let j = 0; j < t.nz - 1; j++) for (let i = 0; i < t.nx - 1; i++) {
          const c = [Hs(i, j), Hs(i + 1, j), Hs(i + 1, j + 1), Hs(i, j + 1)], pts = [];
          for (const [a, b2, pa, pb] of [[0, 1, [0, 0], [1, 0]], [1, 2, [1, 0], [1, 1]], [2, 3, [1, 1], [0, 1]], [3, 0, [0, 1], [0, 0]]]) { const ha = c[a], hb = c[b2]; if ((ha < lv) !== (hb < lv)) { const k = (lv - ha) / (hb - ha); pts.push([i + pa[0] + (pb[0] - pa[0]) * k, j + pa[1] + (pb[1] - pa[1]) * k]); } }
          for (let n = 0; n + 1 < pts.length; n += 2) { g.moveTo(pts[n][0] * R * p, pts[n][1] * R * p); g.lineTo(pts[n + 1][0] * R * p, pts[n + 1][1] * R * p); }
        }
        g.stroke();
        if (bold) for (let j = 0; j < t.nz - 1; j += 6) for (let i = 0; i < t.nx - 1; i += 6) { const a = Hs(i, j), b2 = Hs(i + 1, j); if ((a < lv) !== (b2 < lv) && labels.length < 200) labels.push([(i + 0.5) * R, j * R, lv]); }
      }
      return { labels };
    });
    blitOverlay(o, x0, y0, s, strong ? (terr.tab === 'shape' ? 0.95 : 0.6) : 0.4);
    if (strong && s / CELL >= 1.5) { ctx.save(); ctx.fillStyle = 'rgba(20,20,30,0.85)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const [lx, lz, lv] of o.labels) ctx.fillText(`${lv}`, x0 + lx * s / CELL, y0 + lz * s / CELL); ctx.restore(); }
  }
  if (strong) drawGroundLayer(x0, y0, s);
  else if (groundOf(d)?.water) blitOverlay(waterOverlay(), x0, y0, s, 0.55);   // the water in every mode, so features can be judged against it
  drawFill(x0, y0, s, strong);
}
// ---- Global: the whole map's sky, fog, light, torches, weather and rules (src/data/globals.js) ----
function renderGlobalSide() {
  const g = globalsOf(d), changedKeys = new Set(Object.keys(d.globals || {}));
  const field = f => {
    const v = g[f.key], tag = f.live ? '' : '<em class="gl-later" title="Saved now; works once that part of the game exists">later</em>', cls = changedKeys.has(f.key) ? 'chg' : '';
    const input = f.type === 'color' ? `<input type="color" data-g="${f.key}" value="${esc(v)}">`
      : f.type === 'check' ? `<input type="checkbox" data-g="${f.key}" ${v ? 'checked' : ''}>`
      : f.type === 'select' ? `<select data-g="${f.key}">${f.options.map(([o, n]) => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
      : f.type === 'text' ? `<input type="text" data-g="${f.key}" value="${esc(v)}" placeholder="(none)">`
      : `<input type="number" data-g="${f.key}" value="${v}" min="${f.min}" max="${f.max}" step="${f.step}">`;
    return `<label class="pp-row ${cls} ${f.type === 'select' || f.type === 'text' ? 'wide' : ''}" ${f.help ? `title="${esc(f.help)}"` : ''}><span>${esc(f.name)}${tag}</span>${input}</label>`;
  };
  side.innerHTML = `
    <h3>Presets</h3><div class="ed-objs">${Object.keys(GLOBAL_PRESETS).map(n => `<button data-gp="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="pp gl">${GLOBAL_SECTIONS.map(sec => `<h4>${esc(sec.name)}</h4>${sec.fields.filter(f => !f.when || f.when(g)).map(field).join('')}`).join('')}</div>
    <div class="ed-row" style="margin-top:8px"><button data-greset>Reset all to defaults</button></div>
    <p class="ed-help">Changed settings are in bold. Ones marked <em class="gl-later">later</em> are saved now and work once that part of the game exists. Hover a setting for more.</p>`;
  const set = (k, v) => { snapshot(); d.globals ||= {}; if (v === DEFAULT_GLOBALS[k]) delete d.globals[k]; else d.globals[k] = v; dirty = true; renderTop(); renderSide(); draw(); };
  side.querySelectorAll('[data-g]').forEach(el => el.onchange = () => { const f = GLOBAL_SECTIONS.flatMap(x => x.fields).find(x => x.key === el.dataset.g); set(f.key, f.type === 'check' ? el.checked : f.type === 'number' ? Math.max(f.min, Math.min(f.max, +el.value)) : el.value); });
  side.querySelectorAll('[data-gp]').forEach(el => el.onclick = () => { snapshot(); const p = GLOBAL_PRESETS[el.dataset.gp]; d.globals ||= {}; for (const [k, v] of Object.entries(p)) { if (v === DEFAULT_GLOBALS[k]) delete d.globals[k]; else d.globals[k] = v; } dirty = true; renderTop(); renderSide(); draw(); flash(`${el.dataset.gp} settings applied.`); });
  side.querySelector('[data-greset]').onclick = () => { snapshot(); d.globals = {}; dirty = true; renderTop(); renderSide(); draw(); };
}
function renderSide() {
  if (mode === 'global') return renderGlobalSide();
  if (mode === 'terrain') return renderTerrainSide();
  if (mode === 'objects') return renderObjectSide();
  if (mode === 'paths') return renderPathSide();
  const th = themesOf(d);
  if (tool === 'select') {                                                             // Select: just the tools and the selected piece
    side.innerHTML = `<h3>Tool</h3>
      <div class="ed-row">${[['select', 'Select', 'V'], ['paint', 'Paint', 'B'], ['erase', 'Erase', 'X'], ['pick', 'Pick', 'I']].map(([id, n, k]) => `<button class="${tool === id ? 'on' : ''}" data-tool="${id}" title="${n} (${k})">${n}</button>`).join('')}</div>
      ${snapRow()}
      ${selPieceHtml(th)}`;
    side.querySelector('[data-fine]').onclick = () => { fineSnap = !fineSnap; renderSide(); draw(); }; side.querySelector('[data-rsnap]').onclick = () => { roadSnap = !roadSnap; renderSide(); };
    side.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; renderSide(); draw(); });
    side.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => selPieceAct(b.dataset.sp, b.dataset.v));
    side.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => selPieceAct('size', b.dataset.sz));
    side.querySelector('.ed-selelev')?.addEventListener('change', e => selPieceAct('elev', e.target.value));
    return;
  }
  side.innerHTML = `
    <h3>Theme</h3>
    <select class="ed-tgroup">${Object.entries(THEME_GROUPS).map(([k, n]) => `<option value="${k}" ${themeGroup === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <div class="ed-grid">${Object.entries(th).filter(([k, t]) => (t.group || 'interior') === themeGroup).map(([k, t]) => `<button class="${brush.theme === k ? 'on' : ''}" data-theme="${k}"><i style="background:${t.color}"></i><b>${k}</b>${esc(t.name)}</button>`).join('')}</div>
    <form class="ed-addtheme"><input name="k" maxlength="1" placeholder="Letter"><input name="n" placeholder="New theme"><input name="c" type="color" value="#a07ad0"><button>Add</button></form>
    <h3>Part</h3>
    <div class="ed-grid">${Object.entries(PARTS).map(([k, p]) => `<button class="${brush.part === k ? 'on' : ''}" data-part="${k}" title="${esc(p.text)}"><b>${k}</b>${esc(p.name)}</button>`).join('')}</div>
    <h3>Variant</h3>
    <div class="ed-row"><button data-var="-1">−</button><input class="ed-var" type="number" min="1" max="99" value="${brush.variant}"><button data-var="1">+</button></div>
    <div class="ed-vars">${variantsOf(brush.theme, brush.part).map(n => `<button class="${brush.variant === n ? 'on' : ''}" data-setvar="${n}">${n} · ${esc(variantName({ ...brush, variant: n }))}</button>`).join('')}</div>
    <h3>Height</h3>
    <div class="ed-row"><button class="hbtn ${isLow(brush) ? 'on' : ''}" data-h="low" style="--c:${LOW_COLOR}" title="5 m: one layer, low ceiling (tight spaces; not stairs)">5 m</button>${[1, 2, 3, 4].map(h => `<button class="hbtn ${brush.height === h && !isLow(brush) ? 'on' : ''}" data-h="${h}" style="--c:${HEIGHT_COLORS[h]}" title="${HEIGHT_NAMES[h]} (${h})">${HEIGHT_NAMES[h]}</button>`).join('')}</div>
    ${FOOT_PARTS.includes(brush.part) ? sizeRow(brush.fw || 1, brush.fd || 1, 'bsz') : ''}
    ${ELEV_THEMES.includes(brush.theme) ? `<h3>Raise <small style="font-weight:400">(within the layer)</small></h3>
    <div class="ed-row"><button data-el="-1" title="Q (Shift: 1 m)">−</button><input class="ed-elev" type="number" min="0" max="9.75" step="0.25" value="${brush.elev || 0}"><span style="align-self:center">m</span><button data-el="1" title="E (Shift: 1 m)">+</button></div>` : ''}
    <h3>Tool</h3>
    <div class="ed-row">${[['select', 'Select', 'V'], ['paint', 'Paint', 'B'], ['erase', 'Erase', 'X'], ['pick', 'Pick', 'I']].map(([id, n, k]) => `<button class="${tool === id ? 'on' : ''}" data-tool="${id}" title="${n} (${k})">${n}</button>`).join('')}</div>
    ${snapRow()}
    ${tool === 'select' ? selPieceHtml(th) : ''}
    <div class="ed-brush" style="margin-top:12px;${tool === 'select' ? 'display:none' : ''}"><span class="code">${esc(codeOf(brush))}</span><small>${esc(PARTS[brush.part]?.name ?? brush.part)} · ${esc(th[brush.theme]?.name ?? brush.theme)} · variant ${brush.variant}: ${esc(variantName(brush))}<br>${heightName(brush)} tall · facing ${['north', 'east', 'south', 'west'][brush.rot / 90]} (R turns it)</small><small class="desc">${esc(PARTS[brush.part]?.text ?? '')}</small></div>
    <p class="ed-help">Left: ${tool} · Right: erase · Alt+click: pick · Wheel: zoom · Middle or Space+drag: pan · R / Shift+R turn · 1–4 height · Q / E lower / raise (town pieces; Shift: 1 m) · F: snap to 1 m (Ctrl flips) · H: height from roads · [ ] layer · Ctrl+Z undo</p>`;
  side.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; renderSide(); draw(); });
  side.querySelectorAll('[data-bsz]').forEach(b => b.onclick = () => { const [k, dv] = b.dataset.bsz.split(':'); brush[k] = clampI((brush[k] || 1) + +dv, 1, MAX_FOOT); renderSide(); draw(); });
  side.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => selPieceAct(b.dataset.sp, b.dataset.v));
  side.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => selPieceAct('size', b.dataset.sz));
  side.querySelector('.ed-selelev')?.addEventListener('change', e => selPieceAct('elev', e.target.value));
  side.querySelector('[data-fine]').onclick = () => { fineSnap = !fineSnap; renderSide(); draw(); }; side.querySelector('[data-rsnap]').onclick = () => { roadSnap = !roadSnap; renderSide(); };
  side.querySelectorAll('[data-el]').forEach(b => b.onclick = () => { setElev((brush.elev || 0) + +b.dataset.el * 0.25); });
  side.querySelector('.ed-elev')?.addEventListener('change', e => setElev(+e.target.value || 0));
  side.querySelector('.ed-tgroup').onchange = e => { themeGroup = e.target.value; const first = Object.entries(themesOf(d)).find(([, t]) => (t.group || 'interior') === themeGroup); if (first) brush.theme = first[0]; renderSide(); };
  side.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { brush.part = b.dataset.part; tool = 'paint'; renderSide(); });
  side.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { brush.theme = b.dataset.theme; tool = 'paint'; renderSide(); });
  side.querySelectorAll('[data-var]').forEach(b => b.onclick = () => { brush.variant = clampI(brush.variant + +b.dataset.var, 1, 99); renderSide(); });
  side.querySelectorAll('[data-setvar]').forEach(b => b.onclick = () => { brush.variant = +b.dataset.setvar; renderSide(); });
  side.querySelector('.ed-var').onchange = e => { brush.variant = clampI(e.target.value, 1, 99); renderSide(); };
  side.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { if (b.dataset.h === 'low') { brush.height = 1; brush.low = true; } else { brush.height = +b.dataset.h; brush.low = false; } renderSide(); });
  side.querySelector('.ed-addtheme').onsubmit = e => {
    e.preventDefault(); const f = e.target, k = f.k.value.trim().toUpperCase(), n = f.n.value.trim();
    if (!/^[A-Z]$/.test(k) || !n) return flash('A theme needs one letter and a name.');
    if (themesOf(d)[k]) return flash(`${k} is already ${themesOf(d)[k].name}.`);
    d.themes = { ...(d.themes || {}), [k]: { name: n, color: f.c.value, group: themeGroup } }; brush.theme = k; dirty = true; renderSide(); renderTop();
  };
}

// ---- Off-grid placement: pieces can be nudged 0–9 m off their cell (ox, oz), on the 1 m grid ----
let fineSnap = false, mouseM = null;                                   // F toggles 1 m snapping; Ctrl flips it while held
const fine = () => fineSnap !== ctrlDown;
const offOf = c => c ? [c.piece.ox || 0, c.piece.oz || 0] : [0, 0];
// where a piece's corner goes for the mouse at m (metres): { x, y } cell and { ox, oz } metres
function cornerAt(m) {
  if (!fine()) return { x: Math.floor(m.x / CELL), y: Math.floor(m.z / CELL), ox: 0, oz: 0 };
  const cx = Math.round(m.x - CELL / 2), cz = Math.round(m.z - CELL / 2), x = Math.floor(cx / CELL), y = Math.floor(cz / CELL);
  return { x, y, ox: cx - x * CELL, oz: cz - y * CELL };
}
// the piece whose (possibly moved-over) square holds the point m on this layer
function pieceAtM(m) {
  let best = null;
  for (let y = Math.floor(m.z / CELL) - 1; y <= Math.floor(m.z / CELL); y++) for (let x = Math.floor(m.x / CELL) - 1; x <= Math.floor(m.x / CELL); x++) {
    const c = coverAt(d, x, y, layer); if (!c) continue; const [ox, oz] = offOf(c), [sx, sy] = pieceFoot(c.piece), ax = c.ax, ay = c.ay;
    if (m.x >= ax * CELL + ox && m.x < ax * CELL + ox + sx * CELL && m.z >= ay * CELL + oz && m.z < ay * CELL + oz + sy * CELL) best = { x: ax, y: ay, c };
  }
  return best;
}
// ---- Select tool (V): click a piece to select it without painting over it, then change it in place ----
let pieceSel = null;                                                   // { x, y, l }: the selected piece's base cell
const selPiece = () => pieceSel && d.cells[`${pieceSel.x},${pieceSel.y},${pieceSel.l}`] || null;
// ---- Height from roads: town tiles take the height of a drawn road beside them ----
// Looks just outside each side (the side the tile faces first, then its back, then the others) for a road; the
// first found decides. Streets (and canals) match the road surface, so their road and pavements line up with it;
// plazas, buildings and the rest match the road's pavement (kerb height). A tile follows its road (p.snap) until
// you set its height by hand.
let roadSnap = true;                                                 // H: tiles painted or moved take their height from roads
const ROADLIKE = 'CJXTDEKW';
// returns { abs: the height to stand at, measured from layer 0's floor, side } or null. Roads on any layer count
// (a road can climb past its own layer), so the nearest one in height to the tile's layer wins on a tie.
function roadHeightFor(p, x, y, l) {
  if (!ELEV_THEMES.includes(p.theme)) return null;
  const layers = [...new Set(pathsOf(d).filter(q => q.points.length >= 2).map(q => q.layer))]; if (!layers.length) return null;
  const Fs = layers.map(pl => [pl, pathField(d, pl)]), bx = x * CELL + (p.ox || 0), bz = y * CELL + (p.oz || 0), f0 = SIDES.indexOf(SIDES[(((p.rot || 0) / 90) | 0) % 4]);
  for (const sd of [0, 2, 1, 3].map(k => SIDES[(f0 + k) % 4])) {
    let best = null;
    for (const u of [5, 3, 7, 1.5, 8.5]) {
      const [px, pz] = sd === 'N' ? [bx + u, bz - 0.6] : sd === 'S' ? [bx + u, bz + CELL + 0.6] : sd === 'W' ? [bx - 0.6, bz + u] : [bx + CELL + 0.6, bz + u];
      for (const [pl, F] of Fs) {
        const f = F.at(px, pz); if (!f || f.pd > f.outer) continue;
        const abs = pl * CELL + (f.hq ?? f.h ?? 0) + (ROADLIKE.includes(p.part) || f.pd < 0 ? 0 : ROAD.kerbH);
        if (abs < l * CELL - CELL || abs > l * CELL + 2 * CELL) continue;                  // not a road this tile could meet
        if (!best || f.pd < best.pd - 0.01 || (Math.abs(f.pd - best.pd) <= 0.01 && Math.abs(abs - l * CELL) < Math.abs(best.abs - l * CELL))) best = { pd: f.pd, abs };
      }
    }
    if (best) return { abs: Math.round(best.abs * 4) / 4, side: sd };
  }
  return null;
}
// put a piece at an absolute height: within its layer if it fits (0–9.75 m), otherwise in the layer above or
// below with the rest as its raise (if that cell is free there). Returns its new cell key, or null if it can't.
function placeAtHeight(p, x, y, l, abs) {
  const nl = Math.floor(abs / CELL + 1e-9), e = Math.round((abs - nl * CELL) * 4) / 4;
  if (nl !== l) {
    const key = `${x},${y},${l}`, nkey = `${x},${y},${nl}`; delete d.cells[key];
    const ok = canPlace(d, x, y, nl, p.height, pieceFoot(p)).ok; if (!ok) { d.cells[key] = p; return null; }
    d.cells[nkey] = p;
  }
  if (e) p.elev = e; else delete p.elev;
  return `${x},${y},${nl}`;
}
// ---- Tiles on the terrain: a town tile sits on the ground (the terrain's average height under it, to 0.25 m)
// unless it follows a road (p.snap) or has been taken off the ground (p.free: the toggle, or raising it by hand)
function groundHeightFor(p, x, y) {
  const t = terrainOf(d); if (!t || !ELEV_THEMES.includes(p.theme) || p.free || p.snap) return null;
  const rh = roadHeightFor(p, x, y, Math.floor((terrainAt(t, x * CELL + 5, y * CELL + 5) + 0.01) / CELL)); if (rh) return rh.abs;   // a road beside it (the side it faces first): meet the road
  const [fx, fy] = pieceFoot(p), ox = p.ox || 0, oz = p.oz || 0; let sum = 0, n = 0;
  const G = carvedFn(d);                                                                   // (the ground as rivers carve it)
  for (let a = 0.1; a < 1; a += 0.2) for (let b = 0.1; b < 1; b += 0.2) { sum += G(x * CELL + ox + a * fx * CELL, y * CELL + oz + b * fy * CELL); n++; }
  return Math.round(sum / n * 4) / 4;
}
// put one tile on the ground; returns its (possibly new) cell key, or null if it doesn't sit on the ground / can't move
function groundTile(p, x, y, l) {
  const h = groundHeightFor(p, x, y); if (h == null) return null;
  if (l * CELL + (p.elev || 0) === h) return `${x},${y},${l}`;
  const k = placeAtHeight(p, x, y, l, h);
  if (k && pieceSel && pieceSel.x === x && pieceSel.y === y && pieceSel.l === l) pieceSel.l = +k.split(',')[2];
  return k;
}
// after the terrain changes: every tile that sits on the ground takes its new height
function resettleGround() { for (const [k, p] of Object.entries({ ...d.cells })) { if (d.cells[k] !== p) continue; const [x, y, l] = k.split(',').map(Number); groundTile(p, x, y, l); } }
// give a tile its road height (if it follows roads); returns true if it changed
function snapTile(p, x, y, l) {
  const r = roadHeightFor(p, x, y, l); if (!r) return false;
  const before = l * CELL + (p.elev || 0); p.snap = true;
  const k = placeAtHeight(p, x, y, l, r.abs); if (!k) return false;
  if (pieceSel && pieceSel.x === x && pieceSel.y === y && pieceSel.l === l) pieceSel.l = +k.split(',')[2];
  return before !== r.abs;
}
// after the roads change: every tile that follows roads takes its new height
function resnapTiles() {
  let n = 0;
  for (const [k, p] of Object.entries({ ...d.cells })) { if (!p.snap || d.cells[k] !== p) continue; const [x, y, l] = k.split(',').map(Number); if (snapTile(p, x, y, l)) n++; }
  return n;
}
const snapRow = () => `<div class="ed-row" style="margin-top:6px"><span style="align-self:center;font-size:12px">Snap</span><button class="${fineSnap ? 'on' : ''}" data-fine title="F toggles · Ctrl flips while held">${fineSnap ? '1 m (off-grid)' : 'Whole cells'}</button><button class="${roadSnap ? 'on' : ''}" data-rsnap title="H: tiles take their height from the roads beside them (the side they face first)">Height from roads: ${roadSnap ? 'on' : 'off'}</button></div>`;
// size of a big building (cells wide along its front × deep); `attr` names the buttons' data attribute
const sizeRow = (fw, fd, attr) => `<h3>Size <small style="font-weight:400">(cells: wide × deep)</small></h3><div class="ed-row"><button data-${attr}="fw:-1">−</button><span style="align-self:center;min-width:52px;text-align:center;font-weight:600">${fw} × ${fd}</span><button data-${attr}="fw:1">+</button><span style="align-self:center;font-size:11px">wide</span><button data-${attr}="fd:-1">−</button><button data-${attr}="fd:1">+</button><span style="align-self:center;font-size:11px">deep</span></div>`;
function selPieceHtml(th) {
  const p = selPiece();
  if (!p) return '<p class="ed-help" style="margin-top:10px">Click a piece to select it. Nothing is painted in Select.</p>';
  const town = ELEV_THEMES.includes(p.theme);
  return `<div class="ed-brush" style="margin-top:12px"><span class="code">${esc(codeOf(p))}</span><small>${esc(PARTS[p.part]?.name ?? p.part)} · ${esc(th[p.theme]?.name ?? p.theme)} · cell ${pieceSel.x}, ${pieceSel.y} · ${layerName(pieceSel.l)}<br>${heightName(p)} tall${p.elev ? ` · raised ${p.elev} m` : ''}${p.ox || p.oz ? ` · off the grid by ${p.ox || 0}, ${p.oz || 0} m` : ''} · facing ${['north', 'east', 'south', 'west'][(p.rot || 0) / 90]}</small></div>
    <h3>Variant</h3><div class="ed-vars">${variantsOf(p.theme, p.part).map(n => `<button class="${p.variant === n ? 'on' : ''}" data-sp="variant" data-v="${n}">${n} · ${esc(variantName({ ...p, variant: n }))}</button>`).join('')}</div>
    ${town ? `<h3>Raise</h3><div class="ed-row"><button data-sp="elevBy" data-v="-0.25">−</button><input class="ed-selelev" type="number" min="-10" max="20" step="0.25" value="${p.elev || 0}"><span style="align-self:center">m</span><button data-sp="elevBy" data-v="0.25">+</button></div>` : ''}
    ${town && terrainOf(d) ? `<div class="ed-row"><button class="${!p.free && !p.snap ? 'on' : ''}" data-sp="ground" title="Sit on the terrain (its average height under the piece), and keep following it when the terrain changes">${p.free || p.snap ? 'Sit on the ground' : 'Sits on the ground'}</button></div>` : ''}
    ${town ? `<div class="ed-row"><button class="${p.snap ? 'on' : ''}" data-sp="snap" title="Take the height of the road beside it (the side it faces first), and keep following it">${p.snap ? 'Follows road height' : 'Snap to road height'}</button></div>` : ''}
    ${FOOT_PARTS.includes(p.part) ? sizeRow(p.fw || 1, p.fd || 1, 'sz') : ''}
    <div class="ed-row" style="margin-top:8px"><button data-sp="rot" data-v="-90" title="Shift+R">⟲ Turn</button><button data-sp="rot" data-v="90" title="R">Turn ⟳</button></div>
    <div class="ed-row"><button data-sp="brush" title="Make the brush this piece">Copy to brush</button><button data-sp="del" title="Del">Delete</button></div>
    <p class="ed-help">Drag: move it (with 1 m snapping it can sit off the grid) · Arrows: move one cell (1 m with 1 m snapping) · R / Shift+R turn · Q / E lower / raise (Shift: 1 m) · Del delete · Esc deselect</p>`;
}
// move the selected piece to another cell on its layer (everything about it comes along)
function canMove(x, y) {
  const p = selPiece(); if (!p) return false;
  const key = `${pieceSel.x},${pieceSel.y},${pieceSel.l}`; delete d.cells[key];
  const r = canPlace(d, x, y, pieceSel.l, p.height, pieceFoot(p)); d.cells[key] = p; return r.ok ? true : r.reason;
}
function movePiece(x, y, ox = null, oz = null) {
  const p = selPiece(); if (!p) return;
  if (ox == null) { ox = p.ox || 0; oz = p.oz || 0; }
  if (x === pieceSel.x && y === pieceSel.y && ox === (p.ox || 0) && oz === (p.oz || 0)) return;
  const ok = x === pieceSel.x && y === pieceSel.y ? true : canMove(x, y); if (ok !== true) { flash(ok || 'It doesn\'t fit there.'); return; }
  snapshot(); delete d.cells[`${pieceSel.x},${pieceSel.y},${pieceSel.l}`]; d.cells[`${x},${y},${pieceSel.l}`] = p;
  if (ox || oz) { p.ox = ox; p.oz = oz; } else { delete p.ox; delete p.oz; }
  pieceSel = { x, y, l: pieceSel.l };
  if (p.snap || roadSnap) snapTile(p, x, y, pieceSel.l); else groundTile(p, x, y, pieceSel.l);
  dirty = true; renderTop(); renderSide(); renderLayers(); draw(); updateStatus();
}
function selPieceAct(a, v) {
  const p = selPiece(); if (!p) return;
  if (a === 'brush') { Object.assign(brush, { part: p.part, theme: p.theme, variant: p.variant, height: p.height, rot: p.rot || 0, low: !!p.low, elev: p.elev || 0, fw: p.fw || 1, fd: p.fd || 1 }); tool = 'paint'; themeGroup = groupOfTheme(d, p.theme); renderSide(); draw(); flash(`Brush: ${codeOf(p)}.`); return; }
  snapshot();
  if (a === 'del') { delete d.cells[`${pieceSel.x},${pieceSel.y},${pieceSel.l}`]; pieceSel = null; }
  else if (a === 'variant') p.variant = +v;
  else if (a === 'rot' || a === 'size') {                                            // turning or resizing a big building: only if it still fits
    const was = { rot: p.rot, fw: p.fw, fd: p.fd };
    if (a === 'rot') p.rot = (((p.rot || 0) + +v) % 360 + 360) % 360;
    else { const [k, dv] = v.split(':'); p[k] = clampI((p[k] || 1) + +dv, 1, MAX_FOOT); if (p.fw === 1 && p.fd === 1) { delete p.fw; delete p.fd; } }
    const key = `${pieceSel.x},${pieceSel.y},${pieceSel.l}`; delete d.cells[key];
    const r = canPlace(d, pieceSel.x, pieceSel.y, pieceSel.l, p.height, pieceFoot(p)); d.cells[key] = p;
    if (!r.ok) { Object.assign(p, was); if (!was.fw) delete p.fw; if (!was.fd) delete p.fd; history.pop(); flash(r.reason); renderSide(); return; }
  }
  else if (a === 'ground') { if (!p.free && !p.snap) p.free = true; else { delete p.free; delete p.snap; groundTile(p, pieceSel.x, pieceSel.y, pieceSel.l); } }
  else if (a === 'snap') { if (p.snap) delete p.snap; else if (!snapTile(p, pieceSel.x, pieceSel.y, pieceSel.l) && !p.snap) { history.pop(); flash('No road beside it on this layer.'); return; } }
  else if (a === 'elev' || a === 'elevBy') {                                         // past 9.75 m it goes up a layer (below 0, down one), if the cell there is free
    delete p.snap; if (terrainOf(d)) p.free = true; const want = Math.round((a === 'elev' ? +v || 0 : (p.elev || 0) + +v) * 4) / 4, l0 = pieceSel.l;
    const k = placeAtHeight(p, pieceSel.x, pieceSel.y, l0, l0 * CELL + want);
    if (!k) { history.pop(); flash(`There's something in the way on ${layerName(l0 + (want >= CELL ? 1 : -1))}.`); return; }
    pieceSel.l = +k.split(',')[2]; if (pieceSel.l !== l0) { setLayer(pieceSel.l); flash(`Moved up to ${layerName(pieceSel.l)}, raised ${p.elev || 0} m there.`.replace('up to', pieceSel.l > l0 ? 'up to' : 'down to')); }
  }
  dirty = true; renderTop(); renderSide(); renderLayers(); draw(); updateStatus();
}
function setElev(v) {
  v = Math.round(v * 4) / 4;
  if (v >= CELL) { v -= CELL; setLayer(layer + 1); flash(`Painting on ${layerName(layer)} now, raised ${v} m.`); }        // past 9.75 m: the layer above
  else if (v < 0 && (brush.elev || 0) === 0) { v += CELL; setLayer(layer - 1); flash(`Painting on ${layerName(layer)} now, raised ${v} m.`); }   // below 0: the layer below
  brush.elev = Math.max(0, Math.min(9.75, v)); renderSide(); draw();
}
const roadsOn = l => pathsOf(d).filter(p => p.points.length >= 2 && roadRuns(p).runs.some(r => r.layer === l)).length;
function renderLayers() { withCoverCache(d, renderLayers0); }                            // (counting each layer's pieces asks every cell: indexed once)
function renderLayers0() {
  const sel = mode === 'objects' && selectedObj();
  if (sel && panelOf(sel.type)) return renderProps(sel);
  layersEl.classList.remove('props');
  // every layer something is on (pieces, and the layers roads climb through), two spare above and one below
  let { lo, hi } = layerRange(d);
  for (const p of pathsOf(d)) for (const q of p.points) { const L = absLayer(p, q.y || 0); lo = Math.min(lo, L); hi = Math.max(hi, L); }
  const rows = [];
  for (let l = Math.max(hi + 2, layer); l >= Math.min(lo - 1, layer); l--) rows.push(l);
  layersEl.innerHTML = `<h3>Layers</h3><p class="ed-help">10 m apart. Tall pieces carry up through the layers above them.</p>
    <ul>${rows.map(l => { const n = countOn(d, l); return `<li class="${l === layer ? 'on' : ''}" data-l="${l}"><b>${l >= 0 ? '+' : ''}${l * CELL} m</b><span>${l === 0 ? 'Ground' : `Layer ${l}`}</span><small>${n || ''}${roadsOn(l) ? `${n ? ' · ' : ''}${roadsOn(l)} road${roadsOn(l) > 1 ? 's' : ''}` : ''}</small></li>`; }).join('')}</ul>
    <div class="ed-row"><button data-dl="1">Up ]</button><button data-dl="-1">Down [</button></div>
    <h3>Height colours</h3><ul class="ed-key">${[4, 3, 2, 1].map(h => `<li><i style="background:${HEIGHT_COLORS[h]}"></i>${HEIGHT_NAMES[h]} left above</li>`).join('')}<li><i style="background:${LOW_COLOR}"></i>5 m (low ceiling)</li></ul>
    <p class="ed-help">A 40 m room is blue on its own layer, green one layer up, yellow two up, red three up. Striped: part of a piece that starts below.</p>`;
  layersEl.querySelectorAll('[data-l]').forEach(li => li.onclick = () => setLayer(+li.dataset.l));
  layersEl.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => setLayer(layer + +b.dataset.dl));
}
// ---- the properties panel (right side, in place of the layers) for enemies, containers, traps and lights ----
// Every item the game knows, for container contents: "weapon:sword", "item:tunic", "potion:…", "mat:wheat"
let ITEM_LIST = null, bindType = 'pressurePlate';
async function loadItems() {
  if (ITEM_LIST) return ITEM_LIST;
  const [{ WEAPONS }, { ITEMS }, { POTIONS }, { MATERIALS }] = await Promise.all([import('../rpg/weapons.js'), import('../rpg/equipment.js'), import('../data/potions.js'), import('../data/materials.js')]);
  ITEM_LIST = [
    ...Object.entries(WEAPONS).map(([k, v]) => [`weapon:${k}`, v.name]), ...Object.entries(ITEMS).map(([k, v]) => [`item:${k}`, v.name]),
    ...Object.entries(POTIONS).map(([k, v]) => [`potion:${k}`, v.name]), ...Object.values(MATERIALS).map(v => [`mat:${v.id}`, v.name]),
  ];
  return ITEM_LIST;
}
const itemName = id => ITEM_LIST?.find(x => x[0] === id)?.[1] || id;
// where an object's properties are written: on the object, or for a room's own chest in d.presets
const propsOf = o => o.preset ? (((d.presets ||= {})[o.id] ||= {}).props ||= {}) : o;
function changed() { dirty = true; renderTop(); draw(); }
function renderProps(o) {
  const t = OBJECTS[o.type], kind = panelOf(o.type), P = propsOf(o);
  layersEl.classList.add('props');
  const num = (key, label, val, min, max, step, cls = '') => `<label class="pp-row ${cls}"><span>${label}</span><input type="number" data-k="${key}" value="${val}" min="${min}" max="${max}" step="${step}"></label>`;
  const sel = (key, label, val, opts) => `<label class="pp-row"><span>${label}</span><select data-k="${key}">${opts.map(([v, n]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  let body = '';
  if (kind === 'enemy') {
    const st = statsOf(o), base = baseStatsOf(o), vk = variantKeyOf(o);
    body = `
      ${sel('type', 'Archetype', o.type, Object.keys(ENEMY_TYPES).map(k => [k, OBJECTS[k].name]))}
      ${sel('variant', 'Variant', vk, Object.entries(ENEMY_VARIANTS[o.type] || {}).map(([k, v]) => [k, v.name]))}
      <label class="pp-row"><span>Name</span><input type="text" data-k="label" value="${esc(o.label || '')}" placeholder="(none)"></label>
      ${num('count', 'Number', o.count || 1, 1, 30, 1)}
      <h4>Behaviour</h4>
      ${sel('behaviour', 'When idle', o.behaviour || 'stand', [['stand', 'Stand guard'], ['wander', 'Wander nearby'], ['patrol', 'Patrol a route']])}
      ${o.behaviour === 'patrol' ? `${sel('patrolMode', 'Route', o.patrolMode || 'loop', [['loop', 'Loop round'], ['back', 'There and back']])}
        <p class="ed-help">${(o.patrol || []).length} point${(o.patrol || []).length === 1 ? '' : 's'}. ${patrolEdit === o.id ? '<b>Click the map to add points</b>; drag one to move it, right-click to remove it. Esc or Done when finished.' : 'Edit the route to add points on the map.'}</p>
        <div class="ed-row"><button data-pa="route" class="${patrolEdit === o.id ? 'on' : ''}">${patrolEdit === o.id ? 'Done' : 'Edit route'}</button><button data-pa="clear">Clear route</button></div>` : ''}
      <h4>Stats <small>(${esc(ENEMY_VARIANTS[o.type]?.[vk]?.name || '')}; changed ones in bold)</small></h4>
      ${Object.entries(ENEMY_STATS).map(([k, f]) => num(`stat.${k}`, f.name, st[k], f.min, f.max, f.step, o.stats?.[k] != null && o.stats[k] !== base[k] ? 'chg' : '')).join('')}
      <div class="ed-row"><button data-pa="reset">Reset stats</button></div>`;
  } else if (kind === 'container') {
    const rows = P.contents || [];
    body = `
      <h4>Contents</h4>
      <datalist id="pp-items">${(ITEM_LIST || []).map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</datalist>
      ${rows.length ? rows.map((r, i) => `<div class="pp-item"><input list="pp-items" data-ci="${i}" data-cf="item" value="${esc(r.item)}" placeholder="item id"><input type="number" data-ci="${i}" data-cf="qty" value="${r.qty || 1}" min="1" max="9999"><button data-cdel="${i}" title="Remove">✕</button><small>${esc(itemName(r.item))}</small></div>`).join('') : '<p class="ed-help">Empty.</p>'}
      <div class="ed-row"><button data-pa="addItem">+ Add item</button></div>
      ${num('gold', 'Gold', P.gold || 0, 0, 1000000, 1)}
      <label class="pp-row"><span>Locked</span><input type="checkbox" data-k="locked" ${P.locked ? 'checked' : ''}></label>
      ${P.locked ? num('lock', 'Lock difficulty', P.lock || 20, 1, 100, 1) : ''}`;
    if (!ITEM_LIST) loadItems().then(() => { if (selectedObj()?.id === o.id) renderLayers(); });
  } else if (kind === 'trap') {
    const trig = trapTrigger(o), byId = Object.fromEntries(objs().map(q => [q.id, q])), linked = (o.triggers || []).map(id => byId[id]).filter(Boolean);
    body = `
      ${t.mount === 'both' ? sel('mount', 'Placed', o.mount || 'floor', [['floor', 'On the floor'], ['wall', 'On a wall']]) : ''}
      ${o.mount === 'wall' ? num('h', 'Height up the wall (m)', (o.h ?? t.wallH ?? 1).toFixed(1), 0, 9.5, 0.1) : ''}
      ${num('damage', 'Damage', P.damage ?? t.dmg ?? 10, 0, 5000, 1)}
      <h4>Set off by</h4>
      ${sel('trigger', 'Goes off', trig, [['timer', 'A timer (on its own)'], ['linked', 'Its triggers'], ['near', 'Anyone coming near']])}
      ${trig === 'timer' ? num('interval', 'Every (s)', P.interval ?? 3, 0.2, 120, 0.1) : ''}
      ${trig === 'near' ? num('radius', 'Within (m)', P.radius ?? 3, 0.5, 30, 0.5) + num('interval', 'Resets after (s)', P.interval ?? 3, 0.2, 120, 0.1) : ''}
      ${trig === 'linked' ? `
        ${linked.length ? linked.map(g => `<div class="pp-link"><i style="color:${OBJECT_CATS.trigger.color}">${esc(OBJECTS[g.type].glyph || '—')}</i><span>${esc(OBJECTS[g.type].name)}</span><button data-sel="${g.id}" title="Select it">→</button><button data-unlink="${g.id}" title="Unbind">✕</button></div>`).join('') : '<p class="ed-help">No triggers yet: it will never go off.</p>'}
        ${bind?.from === o.id ? `<p class="ed-help"><b>Click empty floor to place a new trigger, or click an existing one to bind / unbind it.</b> Esc or Done when finished.</p>` : ''}
        <label class="pp-row"><span>New triggers</span><select data-bt>${['zone', 'pressurePlate', 'tripwire'].map(k => `<option value="${k}" ${(bind?.type || 'pressurePlate') === k ? 'selected' : ''}>${esc(OBJECTS[k].name)}</option>`).join('')}</select></label>
        <div class="ed-row"><button data-pa="bind" class="${bind?.from === o.id ? 'on' : ''}">${bind?.from === o.id ? 'Done' : 'Bind triggers'}</button></div>` : ''}`;
  } else if (kind === 'trigger') {
    const traps = objs().filter(q => isTrap(q) && (q.triggers || []).includes(o.id));
    body = `
      ${t.resize ? num('w', 'Width (m)', o.w ?? t.w, 0.5, 40, 0.5) + num('d', 'Depth (m)', o.d ?? t.d, 0.5, 40, 0.5) + num('h', 'Reaches up (m)', o.h ?? 2.5, 0.2, 10, 0.1) : ''}
      ${t.span ? `<p class="ed-help" style="margin-top:0">Stretches ${(o.w || 0).toFixed(1)} m from wall to wall; R turns it, dragging re-stretches it.</p>` : ''}
      ${sel('who', 'Set off by', o.who || 'player', [['player', 'The player'], ['enemies', 'Enemies'], ['anyone', 'Anyone']])}
      ${sel('rearm', 'Works', o.rearm || 'always', [['always', 'Every time'], ['once', 'Once only']])}
      ${(o.rearm || 'always') === 'always' ? `${num('cooldown', 'Cooldown (s)', o.cooldown ?? o.delay ?? 2, 0, 120, 0.1)}<p class="ed-help" style="margin:0 0 4px">${(o.cooldown ?? o.delay ?? 2) === 0 ? 'On the whole time someone is in or on it; off when they leave.' : `Fires when someone steps ${t.span ? 'through' : 'in'}, then every ${o.cooldown ?? o.delay ?? 2} s while they stay. 0 = on the whole time.`}</p>` : ''}
      <h4>Sets off</h4>
      ${traps.length ? traps.map(q => `<div class="pp-link"><i style="color:${OBJECT_CATS.trap.color}">${esc(OBJECTS[q.type].glyph || '—')}</i><span>${esc(OBJECTS[q.type].name)}</span><button data-sel="${q.id}" title="Select it">→</button><button data-unlink="${q.id}" title="Unbind">✕</button></div>`).join('') : '<p class="ed-help">Nothing yet.</p>'}
      ${bind?.from === o.id ? '<p class="ed-help"><b>Click a trap to bind / unbind it.</b> Esc or Done when finished.</p>' : ''}
      <div class="ed-row"><button data-pa="bind" class="${bind?.from === o.id ? 'on' : ''}">${bind?.from === o.id ? 'Done' : 'Bind traps'}</button></div>`;
  } else if (kind === 'sound') {
    body = `
      <datalist id="pp-sounds">${SOUND_SUGGESTIONS.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <label class="pp-row"><span>Sound</span><input type="text" list="pp-sounds" data-k="track" value="${esc(o.track || '')}" placeholder="name or file"></label>
      ${sel('kind', 'Plays as', o.kind || 'ambience', [['ambience', 'Ambience'], ['music', 'Music'], ['effect', 'Sound effect']])}
      ${num('volume', 'Volume (%)', o.volume ?? 70, 0, 100, 1)}
      ${t.resize ? num('w', 'Width (m)', o.w ?? t.w, 1, 200, 0.5) + num('d', 'Depth (m)', o.d ?? t.d, 1, 200, 0.5) + num('fade', 'Fades in over (m)', o.fade ?? 3, 0, 50, 0.5) + ((o.kind || 'ambience') === 'music' ? num('priority', 'Priority (overlaps)', o.priority ?? 1, 0, 99, 1) : '') : num('radius', 'Heard within (m)', o.radius ?? t.radius, 0.5, 100, 0.5)}
      <label class="pp-row"><span>Loops</span><input type="checkbox" data-k="loop" ${o.loop !== false ? 'checked' : ''}></label>
      ${o.loop === false && !t.resize ? num('gap', 'Plays every (s)', o.gap ?? 10, 0.5, 600, 0.5) : ''}`;
  } else if (kind === 'particle') {
    body = `
      ${t.resize ? num('w', 'Width (m)', o.w ?? t.w, 0.5, 200, 0.5) + num('d', 'Depth (m)', o.d ?? t.d, 0.5, 200, 0.5) : num('radius', 'Spreads (m)', o.radius ?? t.radius, 0.1, 30, 0.1)}
      ${num('h', o.type === 'fog' ? 'Fog depth (m)' : o.type === 'smoke' ? 'Rises (m)' : 'Height (m)', o.h ?? 2, 0.1, 30, 0.1)}
      ${num('density', 'Density (%)', o.density ?? 50, 1, 100, 1)}
      <label class="pp-row"><span>Colour</span><input type="color" data-k="color" value="${esc(o.color || '#cccccc')}"></label>`;
  } else if (kind === 'light') {
    body = `
      ${o.mount === 'wall' ? num('h', 'Height up the wall (m)', (o.h ?? t.wallH ?? 2.9).toFixed(1), 0.3, 9.5, 0.1) : ''}
      <label class="pp-row"><span>Lit at the start</span><input type="checkbox" data-k="lit" ${P.lit !== false ? 'checked' : ''}></label>`;
  }
  layersEl.innerHTML = `<h3>${esc(t.name)}${o.preset ? ' <small>(part of the room)</small>' : ''}</h3>
    <p class="ed-help" style="margin-top:0">x ${o.x.toFixed(2)} m, z ${o.z.toFixed(2)} m · ${layerName(o.layer)} · ${o.mount === 'wall' ? 'on a wall' : `facing ${o.rot || 0}°`}</p>
    <div class="pp">${body}</div>
    <div class="ed-row" style="margin-top:10px"><button data-pa="del">${o.preset ? 'Remove' : 'Delete'}</button><button data-pa="close">Close (Esc)</button></div>`;
  // edits
  layersEl.querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
    const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    snapshot();
    if (k === 'type') { o.type = v; o.variant = Object.keys(ENEMY_VARIANTS[v] || {})[0]; o.stats = {}; }
    else if (k === 'variant') { o.variant = v; o.stats = {}; }
    else if (k.startsWith('stat.')) { const sk = k.slice(5), b = baseStatsOf(o)[sk]; o.stats ||= {}; if (v === b) delete o.stats[sk]; else o.stats[sk] = v; }
    else if (k === 'count') o.count = clampI(v, 1, 30);
    else if (k === 'h') { if (o.preset) setPlace(o, { x: o.x, z: o.z, rot: o.rot, h: v }); else o.h = v; }
    else if (k === 'mount') {
      if (v === 'wall') { const w = wallSpot(o.x, o.z, o.type, 3); if (!w) { history.pop(); flash('No wall near enough: move it next to one first.'); renderLayers(); return; } Object.assign(o, { x: w.x, z: w.z, rot: w.rot, mount: 'wall', h: o.h ?? t.wallH }); }
      else { const sx = snapTo(o.type, o.x + Math.sin(o.rot * Math.PI / 180) * (t.d / 2 + 0.1)), sz = snapTo(o.type, o.z - Math.cos(o.rot * Math.PI / 180) * (t.d / 2 + 0.1)); Object.assign(o, { x: sx, z: sz, mount: 'floor' }); }
    }
    else if (k === 'behaviour') { o.behaviour = v; if (v !== 'patrol') patrolEdit = null; }
    else if (k === 'cooldown') { o.cooldown = v; delete o.delay; }
    else if (k === 'w' || k === 'd' || (o.type && (OBJECTS[o.type].cat === 'sound' || OBJECTS[o.type].cat === 'particle'))) o[k] = v;
    else if (k === 'trigger') { o.trigger = v; if (v !== 'linked' && bind?.from === o.id) bind = null; }
    else P[k] = v;
    changed(); renderLayers(); renderSide();
  });
  layersEl.querySelector('[data-bt]')?.addEventListener('change', e => { if (bind?.from === o.id) bind.type = e.target.value; else bindType = e.target.value; });
  layersEl.querySelectorAll('[data-sel]').forEach(el => el.onclick = () => { selected = el.dataset.sel; bind = null; patrolEdit = null; renderSide(); renderLayers(); draw(); });
  layersEl.querySelectorAll('[data-unlink]').forEach(el => el.onclick = () => {
    snapshot(); const other = objs().find(q => q.id === el.dataset.unlink);
    if (isTrap(o)) o.triggers = (o.triggers || []).filter(id => id !== other?.id); else if (other) other.triggers = (other.triggers || []).filter(id => id !== o.id);
    changed(); renderLayers();
  });
  layersEl.querySelectorAll('[data-ci]').forEach(el => el.onchange = () => { snapshot(); const r = P.contents[+el.dataset.ci]; r[el.dataset.cf] = el.dataset.cf === 'qty' ? clampI(el.value, 1, 9999) : el.value.trim(); changed(); renderLayers(); });
  layersEl.querySelectorAll('[data-cdel]').forEach(el => el.onclick = () => { snapshot(); P.contents.splice(+el.dataset.cdel, 1); changed(); renderLayers(); });
  layersEl.querySelectorAll('[data-pa]').forEach(el => el.onclick = () => {
    const a = el.dataset.pa;
    if (a === 'del') return deleteSelected();
    if (a === 'close') { selected = null; patrolEdit = null; renderSide(); renderLayers(); draw(); return; }
    if (a === 'route') { patrolEdit = patrolEdit === o.id ? null : o.id; renderLayers(); draw(); return; }
    if (a === 'bind') { bind = bind?.from === o.id ? null : { from: o.id, kind: isTrap(o) ? 'trap' : 'trigger', type: layersEl.querySelector('[data-bt]')?.value || bindType }; patrolEdit = null; renderLayers(); draw(); return; }
    snapshot();
    if (a === 'clear') o.patrol = [];
    if (a === 'reset') o.stats = {};
    if (a === 'addItem') (P.contents ||= []).push({ item: '', qty: 1 });
    changed(); renderLayers();
    if (a === 'addItem') layersEl.querySelector(`[data-ci="${P.contents.length - 1}"][data-cf=item]`)?.focus();
  });
}
function setLayer(l) { layer = Math.max(-20, Math.min(40, l)); renderLayers(); draw(); updateStatus(); }

function updateStatus() {
  if (mode === 'terrain' && hoverM) { const t = terrainOf(d); status.textContent = `${hoverM.x.toFixed(1)} m, ${hoverM.z.toFixed(1)} m · ${t ? `ground ${terrainAt(t, hoverM.x, hoverM.z).toFixed(2)} m` : 'no terrain yet'} · ${({ shape: terr.op, surface: `surface: ${GROUND_MATS[terr.mat]}`, fill: `filler: ${FILL_KINDS[terr.kind]}`, climate: `${terr.clim === 'moist' ? 'moisture' : 'temperature'} ${terr.climV}`, water: `${terr.waterMode === 'flow' ? 'flow lines' : terr.waterFixed ? `water at ${terr.waterLv} m` : 'water (auto level)'}${(() => { const lv = groundOf(d)?.water?.[`${Math.floor(hoverM.x / 2)},${Math.floor(hoverM.z / 2)}`]; return lv != null ? ` · here: ${lv === 'a' ? 'auto' : lv + ' m'}` : ''; })()}`, foliage: `foliage: ${FOLIAGE[terr.folT]} ${terr.folD}`, clutter: `clutter ${terr.clutD}` })[terr.tab]}, ${terr.r} m · ${layerName(layer)}`; return; }
  if (mode === 'paths' && hoverM) { status.textContent = `${hoverM.x.toFixed(1)} m, ${hoverM.z.toFixed(1)} m · ${layerName(layer)} · ${pathsOf(d).filter(q => q.layer === layer).length} roads on this layer${pathDrawing ? ' · drawing: click to add a point, Enter to finish' : ''}`; return; }
  if (mode === 'objects' && hoverM) {
    const o = objectAt(hoverM.x, hoverM.z), w = walkable(hoverM.x, hoverM.z);
    status.textContent = `${hoverM.x.toFixed(2)} m, ${hoverM.z.toFixed(2)} m · ${layerName(layer)} · ${o ? `${OBJECTS[o.type].name} (facing ${o.rot || 0}°)` : w === 'floor' ? 'floor' : w === 'solid' ? 'wall / solid' : 'no floor'} · ${objs().filter(x => x.layer === layer).length} objects on this layer`;
    return;
  }
  if (!hover) { status.textContent = `${d.name} · ${d.w} × ${d.h} cells (${d.w * CELL} × ${d.h * CELL} m) · ${layerName(layer)} · ${Object.keys(d.cells).length} pieces`; return; }
  const c = coverAt(d, hover.x, hover.y, layer);
  const what = c ? `${codeOf(c.piece)} — ${PARTS[c.piece.part]?.name ?? c.piece.part}, ${themesOf(d)[c.piece.theme]?.name ?? c.piece.theme} (${variantName(c.piece)}), ${heightName(c.piece)} tall${c.piece.elev ? `, raised ${c.piece.elev} m` : ''}${c.base !== layer ? ` (from layer ${c.base})` : ''}, ${HEIGHT_NAMES[c.left]} left above · facing ${['N', 'E', 'S', 'W'][c.piece.rot / 90]}` : 'empty';
  const arr = stairsArriving(d, hover.x, hover.y, layer);
  const up = arr ? ` · stairs ${codeOf(arr.piece)} from layer ${arr.base} arrive here, stepping off ${['N', 'E', 'S', 'W'][(arr.piece.rot || 0) / 90]}${c ? '' : ' (needs a floor)'}` : '';
  const st = c && PARTS[c.piece.part]?.stairs ? ` · climbs to layer ${c.base + c.piece.height}, coming out into the cell ahead` : '';
  status.textContent = `x ${hover.x}, y ${hover.y} · ${layerName(layer)} · ${what}${st}${up}`;
}

// ---- drawing ----
function fit() {
  const r = mainEl.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
}
const stripes = (() => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke(); return c; })();
let stripePat = null;
// the 1 m grid over the cells round the mouse (the creator's two snap modes: whole cells, or 1 m)
function fineGrid(x0, y0, s, hx, hy) {
  const q = s / CELL; if (q < 4) return; ctx.save(); ctx.strokeStyle = 'rgba(42,127,208,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
  const ax = x0 + (hx - 1) * s, ay = y0 + (hy - 1) * s;
  for (let k = 0; k <= 3 * CELL; k++) { ctx.moveTo(ax + k * q, ay); ctx.lineTo(ax + k * q, ay + 3 * s); ctx.moveTo(ax, ay + k * q); ctx.lineTo(ax + 3 * s, ay + k * q); }
  ctx.stroke(); ctx.restore();
}
function draw() { withCoverCache(d, draw0); }                                            // (the map's pieces indexed for the frame: src/data/dungeon.js)
function draw0() {
  const W = canvas.clientWidth, H = canvas.clientHeight, s = view.cell;
  ctx.fillStyle = '#eaf6f8'; ctx.fillRect(0, 0, W, H);
  const x0 = view.ox, y0 = view.oy, mw = d.w * s, mh = d.h * s;
  // the sheet, with 1 m lines when zoomed in and every cell (10 m) bold, like graph paper
  ctx.fillStyle = mode === 'global' ? globalsOf(d).background : '#ffffff'; ctx.fillRect(x0, y0, mw, mh);
  if (s >= 30) { ctx.strokeStyle = '#d4eef3'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= d.w * 10; i++) { if (i % 10) { const x = Math.round(x0 + i * s / 10) + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + mh); } } for (let j = 0; j <= d.h * 10; j++) { if (j % 10) { const y = Math.round(y0 + j * s / 10) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x0 + mw, y); } } ctx.stroke(); }
  ctx.strokeStyle = '#7cc3cf'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= d.w; i++) { const x = Math.round(x0 + i * s) + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + mh); }
  for (let j = 0; j <= d.h; j++) { const y = Math.round(y0 + j * s) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x0 + mw, y); }
  ctx.stroke();
  // the layer below, faintly, to line things up with
  ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(80,90,120,0.35)';
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { const c = coverAt(d, x, y, layer - 1); if (c && !coverAt(d, x, y, layer)) ctx.strokeRect(x0 + x * s + 4.5, y0 + y * s + 4.5, s - 9, s - 9); }
  ctx.setLineDash([]);
  // pieces on every other layer, so the town's buildings are always in view: a soft shaded footprint with its height
  { ctx.save(); ctx.font = `600 ${Math.max(9, Math.min(13, Math.round(s * 0.08)))}px system-ui, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    for (const [k, pc] of Object.entries(d.cells)) { if (!pc?.part) continue; const [x, y, b] = k.split(',').map(Number); if (layer >= b && layer < b + (pc.height || 1)) continue;   // (on this layer: drawn properly below)
      const [fx, fy] = pieceFoot(pc), px = x0 + x * s + (pc.ox || 0) * s / CELL, py = y0 + y * s + (pc.oz || 0) * s / CELL;
      ctx.fillStyle = b > layer ? 'rgba(120,90,170,0.16)' : 'rgba(80,90,120,0.12)'; ctx.fillRect(px + 2, py + 2, fx * s - 4, fy * s - 4);
      ctx.setLineDash([5, 3]); ctx.strokeStyle = b > layer ? 'rgba(120,90,170,0.6)' : 'rgba(80,90,120,0.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 2.5, py + 2.5, fx * s - 5, fy * s - 5); ctx.setLineDash([]);
      if (s >= 34) { ctx.fillStyle = b > layer ? 'rgba(90,60,140,0.85)' : 'rgba(60,70,100,0.75)'; ctx.fillText(`${b >= 0 ? '+' : ''}${b * CELL + (pc.elev || 0)} m`, px + 6, py + 5); } }
    ctx.restore(); }
  drawTerrain(x0, y0, s, mode === 'terrain');
  drawPaths(x0, y0, s);
  // pieces on this layer: big enough, their true footprint; zoomed far out, the plain coloured tiles
  stripePat = stripePat || ctx.createPattern(stripes, 'repeat');
  const th = themesOf(d), own = new Set();
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const c = coverAt(d, x, y, layer); if (!c) continue;
    const sides = sidesAt(d, x, y, layer);
    if (s >= 60 && (c.base === layer || PARTS[c.piece.part]?.stairs)) { own.add(`${x},${y}`); continue; }
    const [ox, oz] = offOf(c), [fx, fy] = pieceFoot(c.piece);
    if (fx > 1 || fy > 1) { if (c.ax === x && c.ay === y) drawBig(x0 + x * s + ox * s / CELL, y0 + y * s + oz * s / CELL, s, c.piece, c.left, c.base !== layer, th, fx, fy); continue; }
    drawTile(x0 + x * s + ox * s / CELL, y0 + y * s + oz * s / CELL, s, c.piece, c.left, c.base !== layer, th, sides);
  }
  if (own.size) drawFootprint(own, x0, y0, s, th);
  drawObjects(x0, y0, s);
  // stairs coming up from below: where they arrive on this layer (an orange dashed box if there's no floor there yet)
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { const a = stairsArriving(d, x, y, layer); if (a) drawArrival(x0 + x * s, y0 + y * s, s, a, !coverAt(d, x, y, layer)); }
  // the headroom above a flight's top: kept clear (red if something's built in it)
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const sb = stairsBelow(d, x, y, layer); if (!sb) continue;
    const px = x0 + x * s, py = y0 + y * s, blocked = !!coverAt(d, x, y, layer);
    ctx.save(); ctx.strokeStyle = blocked ? '#c0392b' : 'rgba(42,111,208,0.6)'; ctx.lineWidth = blocked ? 3 : 1.5; ctx.setLineDash([3, 3]); ctx.strokeRect(px + 3, py + 3, s - 6, s - 6); ctx.setLineDash([]);
    if (s >= 40) { ctx.fillStyle = blocked ? '#c0392b' : 'rgba(42,111,208,0.8)'; ctx.font = `600 ${Math.round(s * 0.12)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(blocked ? 'blocks the stairs!' : 'stair headroom', px + s / 2, py + 6); }
    ctx.restore();
  }
  // the brush under the mouse
  if (mode === 'objects') drawObjectGhost(x0, y0, s);
  else if (mode === 'paths') { drawPathHandles(x0, y0, s); if (rpaint.on && hoverM) { const m = s / CELL; ctx.save(); ctx.strokeStyle = rpaint.mat !== 'keep' ? RMAT_COLORS[rpaint.mat] : RBR_COLORS[rpaint.br] || '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + hoverM.x * m, y0 + hoverM.z * m, rpaint.r * m, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } }
  else if (mode === 'global') { /* nothing to place */ }
  else if (mode === 'terrain') {
    if (hoverM && (terrainOf(d) || terr.tab !== 'shape')) { const m = s / CELL; ctx.save(); ctx.strokeStyle = terr.tab === 'fill' ? FILL_COLORS[terr.kind] : terr.tab === 'surface' ? MAT_COLORS[terr.mat] : terr.tab === 'water' ? '#1e5ac8' : terr.tab === 'foliage' ? FOL_COLORS[terr.folT] : terr.tab === 'clutter' ? '#6a5a48' : terr.tab === 'climate' ? '#8a5ad0' : terr.op === 'lower' ? '#c0392b' : terr.op === 'raise' ? '#2a7fd0' : '#e67e22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + hoverM.x * m, y0 + hoverM.z * m, terr.r * m, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x0 + hoverM.x * m, y0 + hoverM.z * m, terr.r * m * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
  else if (hover && tool === 'paint' && hover.x >= 0 && hover.y >= 0 && hover.x < d.w && hover.y < d.h) {
    if (fine() && mouseM) { const cr = cornerAt(mouseM); hover = { ...hover, x: cr.x, y: cr.y, gox: cr.ox, goz: cr.oz }; } else hover = { ...hover, gox: 0, goz: 0 };
    const bf = pieceFoot(brush), ok = canPlace(d, hover.x, hover.y, layer, brush.height, bf).ok;
    const os = openSides(brush), room = PARTS[brush.part]?.open === 'room', bs = Object.fromEntries(SIDES.map(sd => [sd, room || !os.includes(sd) ? 'wall' : 'loose']));
    const gx = x0 + hover.x * s + hover.gox * s / CELL, gy = y0 + hover.y * s + hover.goz * s / CELL;
    ctx.globalAlpha = 0.55; drawTile(gx, gy, s, brush, brush.height, false, th, bs); ctx.globalAlpha = 1;
    if (bf[0] > 1 || bf[1] > 1) { ctx.save(); ctx.fillStyle = 'rgba(42,127,208,0.12)'; ctx.fillRect(gx, gy, bf[0] * s, bf[1] * s); ctx.strokeStyle = '#2a7fd0'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(gx + 1, gy + 1, bf[0] * s - 2, bf[1] * s - 2); ctx.restore(); drawFront(gx, gy, s, brush); }
    if (!ok) { ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.strokeRect(gx + 1.5, gy + 1.5, bf[0] * s - 3, bf[1] * s - 3); }
  } else if (mode === 'layout' && hover && hover.x >= 0 && hover.y >= 0 && hover.x < d.w && hover.y < d.h) {
    const col = tool === 'erase' ? '#c0392b' : tool === 'select' ? 'rgba(230,126,34,0.7)' : '#2a7fd0';
    if (fine() && mouseM && tool !== 'erase') {                                    // 1 m snapping: the metre under the mouse, on a fine grid round it
      fineGrid(x0, y0, s, hover.x, hover.y);
      const mx = Math.floor(mouseM.x), mz = Math.floor(mouseM.z), q = s / CELL; ctx.fillStyle = 'rgba(230,126,34,0.35)'; ctx.fillRect(x0 + mx * q, y0 + mz * q, q, q);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x0 + mx * q + 0.5, y0 + mz * q + 0.5, q - 1, q - 1);
    } else { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x0 + hover.x * s + 1, y0 + hover.y * s + 1, s - 2, s - 2); }
  }
  if (mode === 'layout' && fine() && tool === 'paint' && hover && hover.x >= 0 && hover.y >= 0 && hover.x < d.w && hover.y < d.h) fineGrid(x0, y0, s, hover.x, hover.y);   // (the ghost already sits off the grid; the metre lines show the mode)
  if (mode === 'layout' && tool === 'select' && selPiece() && pieceSel.l <= layer && pieceSel.l + selPiece().height > layer) {   // the selected piece
    const sp = selPiece(), [fx, fy] = pieceFoot(sp); ctx.save(); ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.setLineDash([8, 4]); ctx.strokeRect(x0 + pieceSel.x * s + (sp.ox || 0) * s / CELL + 3, y0 + pieceSel.y * s + (sp.oz || 0) * s / CELL + 3, fx * s - 6, fy * s - 6); ctx.restore();
  }
  if (mode === 'layout' && stroke?.drag && pieceSel && selPiece()) {                // where a dragged piece would land
    const t = stroke.drag.to, p = selPiece();
    if (t.x !== pieceSel.x || t.y !== pieceSel.y || t.ox !== (p.ox || 0) || t.oz !== (p.oz || 0)) {
      const ok = t.x === pieceSel.x && t.y === pieceSel.y ? true : canMove(t.x, t.y) === true, gx = x0 + t.x * s + t.ox * s / CELL, gy = y0 + t.y * s + t.oz * s / CELL;
      ctx.globalAlpha = 0.55; drawTile(gx, gy, s, p, p.height, false, th, Object.fromEntries(SIDES.map(sd => [sd, 'wall']))); ctx.globalAlpha = 1;
      const [fx, fy] = pieceFoot(p); ctx.strokeStyle = ok ? '#e67e22' : '#c0392b'; ctx.lineWidth = 3; ctx.strokeRect(gx + 1.5, gy + 1.5, fx * s - 3, fy * s - 3);
    }
  }
  // coordinates along the edges
  if (s >= 26) {
    ctx.fillStyle = '#5a8f9a'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let i = 0; i < d.w; i++) ctx.fillText(i, x0 + i * s + s / 2, y0 - 3);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let j = 0; j < d.h; j++) ctx.fillText(j, x0 - 4, y0 + j * s + s / 2);
  }
}
// ---- footprints: the cells as the game builds them, seen from above ----
let fp = { key: '', shapes: [], torches: [], cps: [], presets: [] };
let fpPaths = '';                                           // the roads as of the last finished edit (not every drag frame: a rebuild takes a moment)
const notePaths = () => { fpPaths = JSON.stringify(d.paths || []); };
let fpTimer = 0;
const PROP_CATS = ['furniture', 'street'];
const footprintKey = () => JSON.stringify(d.cells) + JSON.stringify(d.presets || {}) + fpPaths;   // (props and the ground aren't in the footprint: the creator builds it light)
function footprint() {
  const k = footprintKey();
  // Rebuilding the whole map takes a moment, so after an edit the old footprint is shown and the new one is built
  // a beat later (once edits pause), instead of on every key press
  const rebuild = () => { try { const r = buildDungeonShapes(d, { x: 0, y: 0, z: 0 }, { light: true }); fp = { key: k, shapes: r.shapes, torches: r.torches, cps: r.checkpoints || [], presets: r.presets || [] }; } catch (e) { console.error(e); fp = { key: k, shapes: [], torches: [], cps: [], presets: [] }; } };
  if (k !== fp.key) {
    if (!fp.key) rebuild();
    else { clearTimeout(fpTimer); fpTimer = setTimeout(() => { if (footprintKey() !== fp.key) { const k2 = footprintKey(); try { const r = buildDungeonShapes(d, { x: 0, y: 0, z: 0 }, { light: true }); fp = { key: k2, shapes: r.shapes, torches: r.torches, cps: r.checkpoints || [], presets: r.presets || [] }; } catch (e) { console.error(e); } draw(); } }, 120); }
  }
  return fp;
}
const STEP_COLOR = BUILD_COLORS.step;
// what a box is on this layer, seen from above: 'floor' (you stand on it), 'step' (a stair step), 'low' (waist
// high or less: rubble, basins, sarcophagi; you can climb or crouch behind), 'solid' (walls, rock, pillars), or null
function classify(b, Y) {
  const y0 = b.min[1], y1 = b.max[1];
  if (y1 <= Y - 0.7 || y0 >= Y + 2.2) return null;
  if (b.color === STEP_COLOR) return 'step';
  if (y1 <= Y + 0.15) return 'floor';
  if (y1 <= Y + 1.3) return 'low';
  return 'solid';
}
function drawFootprint(own, x0, y0, s, th) {
  const f = footprint(), Y = layer * CELL, m = s / CELL;
  // each piece's square in metres (moved over by its ox / oz if it's off the grid); a shape belongs to the piece whose square holds its middle
  const sq = [...own].map(k => { const [x, y] = k.split(',').map(Number), c = coverAt(d, x, y, layer), [ox, oz] = offOf(c); return [x * CELL + ox, y * CELL + oz]; });
  const sqIdx = new Map(); for (const q of sq) { const k = Math.floor(q[0] / CELL) * 4096 + Math.floor(q[1] / CELL); (sqIdx.get(k) || sqIdx.set(k, []).get(k)).push(q); }
  const inOwn = b => { const mx = (b.min[0] + b.max[0]) / 2, mz = (b.min[2] + b.max[2]) / 2, i = Math.floor(mx / CELL), j = Math.floor(mz / CELL);
    for (let a = i - 1; a <= i; a++) for (let c = j - 1; c <= j; c++) for (const q of sqIdx.get(a * 4096 + c) || []) if (mx >= q[0] && mx < q[0] + CELL && mz >= q[1] && mz < q[1] + CELL) return true; return false; };
  const rect = b => [x0 + b.min[0] * m, y0 + b.min[2] * m, (b.max[0] - b.min[0]) * m, (b.max[2] - b.min[2]) * m];
  // rock first, under everything (pits and anything not built show as rock)
  ctx.fillStyle = '#5d606a';
  for (const [a, c] of sq) ctx.fillRect(x0 + a * m, y0 + c * m, s, s);
  const groups = { floor: [], step: [], low: [], solid: [] };
  for (const b of f.shapes) { if (!inOwn(b)) continue; const c = classify(b, Y); if (c) groups[c].push(b); }
  // floors, tinted with the piece's height colour
  for (const b of groups.floor) {
    const cx = Math.floor((b.min[0] + b.max[0]) / 2 / CELL), cy = Math.floor((b.min[2] + b.max[2]) / 2 / CELL), c = coverAt(d, cx, cy, layer);
    ctx.fillStyle = '#efe8da'; ctx.fillRect(...rect(b));
    if (c) { ctx.globalAlpha = 0.3; ctx.fillStyle = isLow(c.piece) ? LOW_COLOR : HEIGHT_COLORS[Math.max(1, Math.min(MAX_HEIGHT, c.left))]; ctx.fillRect(...rect(b)); ctx.globalAlpha = 1; }
  }
  // steps: lighter the higher they climb, with their edges
  for (const b of groups.step) {
    const up = Math.max(0, Math.min(1, (b.max[1] - Y) / CELL));
    ctx.fillStyle = `rgb(${Math.round(200 + 45 * up)},${Math.round(192 + 45 * up)},${Math.round(178 + 45 * up)})`; ctx.fillRect(...rect(b));
    ctx.strokeStyle = 'rgba(60,50,40,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(...rect(b));
  }
  ctx.fillStyle = '#a99d86'; for (const b of groups.low) ctx.fillRect(...rect(b));
  ctx.strokeStyle = 'rgba(60,50,40,0.5)'; for (const b of groups.low) ctx.strokeRect(...rect(b));
  ctx.fillStyle = '#3f424b'; for (const b of groups.solid) ctx.fillRect(...rect(b));
  // the safeguard's red walls: sides that should join but are at different heights
  { const warn = f.shapes.filter(b => b.color === '#a8261b' && inOwn(b) && b.min[1] < Y + CELL && b.max[1] > Y);
    if (warn.length) { ctx.save(); ctx.fillStyle = '#e03a2a'; ctx.strokeStyle = '#e03a2a'; ctx.lineWidth = Math.max(3, m * 0.35);
      for (const b of warn) { ctx.fillRect(...rect(b)); const [rx, ry, rw, rh] = rect(b); ctx.strokeRect(rx, ry, rw, rh); } ctx.restore(); } }
  // torches (orange) and checkpoints (blue) on this layer
  for (const t of f.torches) { if (t.id || t.y < Y || t.y > Y + CELL || !own.has(`${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`)) continue;   // the rooms' fixed fires (presets are drawn as objects)
    ctx.fillStyle = t.lamp ? (t.color || '#ffe2a0') : t.brazier ? '#ff7a1a' : '#ffb040'; ctx.beginPath(); ctx.arc(x0 + t.x * m, y0 + t.z * m, Math.max(2, m * (t.brazier ? 0.35 : 0.22)), 0, Math.PI * 2); ctx.fill(); }
  for (const c of f.cps) { if (c.y < Y - 0.5 || c.y > Y + CELL - 0.5) continue;
    ctx.strokeStyle = '#4aa0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + c.x * m, y0 + c.z * m, Math.max(3, m * 0.5), 0, Math.PI * 2); ctx.stroke(); }
  // Objects mode: a faint metre grid over the cells (half metres when zoomed in), to place by
  if (mode === 'objects' && m >= 8) {
    const step = m >= 40 ? 0.5 : 1;
    ctx.strokeStyle = 'rgba(40,60,90,0.13)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const k of own) { const [x, y] = k.split(',').map(Number), px = x0 + x * s, py = y0 + y * s;
      for (let i = step; i < CELL; i += step) { const o = Math.round(i * m) + 0.5; ctx.moveTo(px + o, py); ctx.lineTo(px + o, py + s); ctx.moveTo(px, py + o); ctx.lineTo(px + s, py + o); } }
    ctx.stroke();
  }
  // each cell: its height colour round the edge, open sides that lead nowhere, and its code in the corner
  for (const k of own) {
    const [x, y] = k.split(',').map(Number), c = coverAt(d, x, y, layer), [ox, oz] = offOf(c), px = x0 + (x * CELL + ox) * m, py = y0 + (y * CELL + oz) * m, sides = sidesAt(d, x, y, layer);
    const [fx, fy] = pieceFoot(c.piece), big = fx > 1 || fy > 1;
    if (big && (c.ax !== x || c.ay !== y)) continue;                                  // a big building: drawn once, from its anchor
    ctx.strokeStyle = isLow(c.piece) ? LOW_COLOR : HEIGHT_COLORS[Math.max(1, Math.min(MAX_HEIGHT, c.left))]; ctx.lineWidth = 3; ctx.strokeRect(px + 2.5, py + 2.5, fx * s - 5, fy * s - 5);
    if (big) drawFront(px, py, s, c.piece);
    for (const sd of SIDES) if (!big && sides[sd] === 'loose') {
      ctx.save(); ctx.strokeStyle = '#e07a1a'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.beginPath();
      const a = s * 0.3, bb = s * 0.7;
      if (sd === 'N') { ctx.moveTo(px + a, py + 4); ctx.lineTo(px + bb, py + 4); } if (sd === 'S') { ctx.moveTo(px + a, py + s - 4); ctx.lineTo(px + bb, py + s - 4); }
      if (sd === 'W') { ctx.moveTo(px + 4, py + a); ctx.lineTo(px + 4, py + bb); } if (sd === 'E') { ctx.moveTo(px + s - 4, py + a); ctx.lineTo(px + s - 4, py + bb); }
      ctx.stroke(); ctx.restore();
    }
    const fs = Math.max(10, Math.min(16, s * 0.08)), label = `${codeOf(c.piece)}${isLow(c.piece) ? ' · 5 m' : c.piece.height > 1 ? ` · ${c.piece.height * CELL} m` : ''}${c.piece.elev ? ` · +${c.piece.elev} m` : ''}`;
    ctx.font = `600 ${fs}px system-ui, sans-serif`; const tw = ctx.measureText(label).width + 8;
    ctx.globalAlpha = mode === 'objects' ? 0.6 : 0.92; ctx.fillStyle = '#fffaf0'; ctx.fillRect(px + 5, py + 5, tw + fs * 0.8, fs + 6); ctx.globalAlpha = 1;
    ctx.fillStyle = th[c.piece.theme]?.color || '#999'; ctx.fillRect(px + 8, py + 8, fs * 0.6, fs);
    ctx.fillStyle = '#14203a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, px + 8 + fs * 0.8, py + 8);
  }
}
// what's at a point on this layer (metres): 'floor', 'solid' or null (no floor)
function walkable(x, z) {
  const f = footprint(), Y = layer * CELL; let floor = false;
  for (const b of f.shapes) {
    if (b.prop || x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;               // (props themselves don't block placing props)
    const c = classify(b, Y); if (c === 'solid') return 'solid'; if (c === 'floor' || c === 'step' || c === 'low') floor = true;
  }
  if (!floor && (terrainOf(d) || fillOf(d)?.layers[layer]?.[Math.floor(z) * (fillOf(d).w) + Math.floor(x)] > '.')) floor = true;   // the ground (not in the light footprint)
  return floor ? 'floor' : null;
}
// ---- objects ----
// everything placeable on the map: your objects, then the rooms' own torches, braziers and chests (presets)
const allObjs = () => objs().concat(footprint().presets);
const selectedObj = () => selected ? allObjs().find(o => o.id === selected) || null : null;
// what's under the mouse: solid things first, flat ones (rugs, box triggers) only if nothing else is there
const objectAt = (x, z) => {
  const l = allObjs().filter(o => o.layer === layer && hitObject(o, x, z));
  return l.filter(o => !OBJECTS[o.type]?.flat).pop() || l.pop() || null;
};
// move / turn an object; a preset's change is kept in d.presets
function setPlace(o, at) {
  if (o.preset) {
    const ch = ((d.presets ||= {})[o.id] ||= {});
    Object.assign(ch, { x: at.x, z: at.z, rot: at.rot ?? o.rot, layer: o.layer, h: o.mount === 'wall' ? (at.h ?? o.h) : 0 }); delete ch.removed;
  } else { o.x = at.x; o.z = at.z; if (at.rot != null) o.rot = at.rot; if (at.mount) o.mount = at.mount; }
}
// the nearest wall face to a point (within `reach` m), with a free floor in front of it: { x, z, rot } on the face
function wallSpot(x, z, type, reach = 1.2, flip = false) {
  const f = footprint(), Y = layer * CELL; let best = null;
  for (const b of f.shapes) {
    if (classify(b, Y) !== 'solid') continue;
    const cx = Math.max(b.min[0], Math.min(b.max[0], x)), cz = Math.max(b.min[2], Math.min(b.max[2], z));
    const inside = x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2];
    let px, pz, nx, nz;
    if (inside) {                                            // inside the rock: out through the nearest face
      const dl = x - b.min[0], dr = b.max[0] - x, dt = z - b.min[2], db = b.max[2] - z, m = Math.min(dl, dr, dt, db);
      if (m === dl) { px = b.min[0]; pz = z; nx = -1; nz = 0; } else if (m === dr) { px = b.max[0]; pz = z; nx = 1; nz = 0; } else if (m === dt) { px = x; pz = b.min[2]; nx = 0; nz = -1; } else { px = x; pz = b.max[2]; nx = 0; nz = 1; }
    } else {
      const dx = x - cx, dz = z - cz; if (Math.abs(dx) >= Math.abs(dz)) { nx = Math.sign(dx); nz = 0; } else { nx = 0; nz = Math.sign(dz); }
      px = cx; pz = cz;
    }
    const dist = Math.hypot(x - px, z - pz); if (dist > reach || (best && dist >= best.dist)) continue;
    // slide along the face on the type's grid, but stay on it
    if (nx) pz = Math.max(b.min[2] + 0.2, Math.min(b.max[2] - 0.2, snapTo(type, pz, flip))); else px = Math.max(b.min[0] + 0.2, Math.min(b.max[0] - 0.2, snapTo(type, px, flip)));
    if (walkable(px + nx * 0.3, pz + nz * 0.3) !== 'floor') continue;
    best = { x: px, z: pz, rot: rotOfNormal(nx, nz), dist };
  }
  return best;
}
// where an object of this type would go for the mouse at (x, z): { x, z, rot, mount } or null with a reason
// a trip wire: stretched across the passage from wall to wall, through (x, z), across the way it faces
function spanAt(x, z, rot) {
  const a = rot * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
  if (walkable(x, z) !== 'floor') return null;
  const reach = dir => { let t = 0; while (t < 12 && walkable(x + ux * (t + 0.1) * dir, z + uz * (t + 0.1) * dir) === 'floor') t += 0.1; return t < 12 ? t : null; };
  const l = reach(-1), r = reach(1); if (l == null || r == null) return null;
  const mid = (r - l) / 2;
  return { x: Math.round((x + ux * mid) * 100) / 100, z: Math.round((z + uz * mid) * 100) / 100, rot, w: Math.round((l + r) * 100) / 100 };
}
function placement(type, x, z, rot, flip) {
  const t = OBJECTS[type];
  if (t.span) { const sp = spanAt(snapTo(type, x, flip), snapTo(type, z, flip), rot); return sp ? { ...sp, mount: 'floor' } : { why: 'A trip wire needs walls on both sides (within 12 m): turn it with R.' }; }
  if (t.mount === 'wall' || t.mount === 'both') {
    const w = wallSpot(x, z, type, t.mount === 'wall' ? 1.5 : 0.8, flip);
    if (w) return { x: w.x, z: w.z, rot: w.rot, mount: 'wall' };
    if (t.mount === 'wall') return { why: 'This goes on a wall: move nearer one.' };
  }
  const at = { x: snapTo(type, x, flip), z: snapTo(type, z, flip), rot, mount: 'floor' };
  const w = walkable(at.x, at.z);
  if (!w) return { why: 'There\'s no floor there.' };
  if (w === 'solid') return { why: 'That\'s inside a wall.' };
  return at;
}
function drawObject(o, x0, y0, m, alpha = 1, outline = null) {
  const t = OBJECTS[o.type]; if (!t) return;
  const col = OBJECT_CATS[t.cat].color, pts = corners(o).map(([x, z]) => [x0 + x * m, y0 + z * m]), wall = o.mount === 'wall';
  const { w, d: dd } = sizeOf(o), a = (o.rot || 0) * Math.PI / 180;
  const cx = x0 + (o.x + (wall ? Math.sin(a) * dd / 2 : 0)) * m, cy = y0 + (o.z - (wall ? Math.cos(a) * dd / 2 : 0)) * m;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (t.shape === 'round' && !wall) ctx.ellipse(cx, cy, w / 2 * m, dd / 2 * m, a, 0, Math.PI * 2);
  else if (t.shape === 'diamond' && !wall) { const r = w / 2 * m; ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
  else { ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath(); }
  ctx.fillStyle = t.flat ? ({ trigger: 'rgba(142,68,173,0.22)', sound: 'rgba(22,160,133,0.14)', particle: 'rgba(127,140,141,0.2)' }[t.cat] || 'rgba(150,60,50,0.35)') : col; ctx.globalAlpha = alpha * (t.cat === 'furniture' ? 0.85 : 0.92); ctx.fill(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = outline || (o.preset ? 'rgba(255,240,200,0.9)' : 'rgba(20,20,30,0.7)'); ctx.lineWidth = outline ? 2.5 : o.preset ? 1.5 : 1;
  if (o.preset && !outline) ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
  // which way it faces: a tick toward the front
  if (t.cat !== 'furniture' && t.cat !== 'sound' && t.cat !== 'particle' && !wall && !t.flat && !t.span) { const r = Math.max(dd / 2, 0.35) * m;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, m * 0.08); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.stroke(); }
  if (t.glyph && m >= 10) { ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.max(9, Math.min(w, Math.max(dd, 0.6), 1) * m * 0.7)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.glyph, cx, cy); }
  // a group of enemies: how many
  if (t.cat === 'enemy' && (o.count || 1) > 1) { const r = Math.max(7, m * 0.3), bx = cx + w / 2 * m * 0.75, by = cy - dd / 2 * m * 0.75;
    ctx.fillStyle = '#14203a'; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * 1.1)}px system-ui, sans-serif`; ctx.fillText(`${o.count}`, bx, by + 0.5); }
  ctx.restore();
}
// an enemy's patrol route: from where it stands through each point (and back to the start, on a loop)
function drawPatrol(o, x0, y0, m, strong) {
  const pts = o.patrol || []; if (!pts.length || o.behaviour !== 'patrol') return;
  const P = [[o.x, o.z], ...pts.map(p => [p.x, p.z])].map(([x, z]) => [x0 + x * m, y0 + z * m]);
  ctx.save(); ctx.globalAlpha = strong ? 1 : 0.45; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = strong ? 2.5 : 1.5; ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.moveTo(...P[0]); for (const q of P.slice(1)) ctx.lineTo(...q); if (o.patrolMode !== 'back') ctx.lineTo(...P[0]); ctx.stroke(); ctx.setLineDash([]);
  pts.forEach((p, i) => { const [px, py] = P[i + 1], r = Math.max(6, m * 0.28);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.font = `700 ${Math.round(r * 1.1)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${i + 1}`, px, py + 0.5); });
  ctx.restore();
}
function drawObjects(x0, y0, s) {
  const m = s / CELL, sel = selectedObj();
  for (const o of allObjs()) {
    if (o.layer !== layer) continue;
    const dim = bulk && !isTrap(o) && !isTrigger(o);
    drawObject(o, x0, y0, m, mode !== 'objects' ? 0.55 : dim ? 0.35 : 1, bulk && o.id === bulkSrc ? '#8e44ad' : o.id === selected ? '#2a7fd0' : null);
    // a sound source's or particle emitter's reach
    if (mode === 'objects' && o.radius && (OBJECTS[o.type]?.cat === 'sound' || OBJECTS[o.type]?.cat === 'particle')) {
      ctx.save(); ctx.strokeStyle = OBJECT_CATS[OBJECTS[o.type].cat].color; ctx.globalAlpha = o.id === selected ? 0.9 : 0.4; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x0 + o.x * m, y0 + o.z * m, o.radius * m, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }
  if (mode === 'objects') for (const o of objs()) if (o.layer === layer && OBJECTS[o.type]?.cat === 'enemy') drawPatrol(o, x0, y0, m, o === sel);
  // trap ↔ trigger bindings: dotted purple lines (bold for the selected one)
  if (mode === 'objects') {
    const byId = Object.fromEntries(objs().map(o => [o.id, o]));
    for (const t of objs()) {
      if (!isTrap(t) || trapTrigger(t) !== 'linked') continue;
      for (const id of t.triggers || []) { const g = byId[id]; if (!g || (g.layer !== layer && t.layer !== layer)) continue;
        const strong = bulk ? (!bulkSrc || bulkSrc === t.id || bulkSrc === g.id) : sel && (sel.id === t.id || sel.id === g.id);
        ctx.save(); ctx.globalAlpha = strong ? 1 : 0.4; ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = strong ? 2.5 : 1.5; ctx.setLineDash([2, 4]); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0 + g.x * m, y0 + g.z * m); ctx.lineTo(x0 + t.x * m, y0 + t.z * m); ctx.stroke(); ctx.restore(); }
    }
  }
}
let ctrlDown = false;
function drawObjectGhost(x0, y0, s) {
  if (!hoverM || drag || (objectAt(hoverM.x, hoverM.z) && !shiftDown && !bind)) return;
  if (bulk) return;
  if (bind) { if (bind.kind !== 'trap') return; const p = placement(bind.type, hoverM.x, hoverM.z, 0, ctrlDown); if (!p.why) drawObject({ type: bind.type, layer, ...p }, x0, y0, s / CELL, 0.5, '#8e44ad'); return; }
  if (patrolEdit) { const m = s / CELL; ctx.save(); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + snapTo('swarm', hoverM.x, ctrlDown) * m, y0 + snapTo('swarm', hoverM.z, ctrlDown) * m, Math.max(6, m * 0.28), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return; }
  const p = placement(objBrush, hoverM.x, hoverM.z, objRot, ctrlDown);
  if (p.why) { const g = { type: objBrush, x: hoverM.x, z: hoverM.z, rot: objRot, layer }; drawObject(g, x0, y0, s / CELL, 0.35, '#c0392b'); return; }
  drawObject({ type: objBrush, layer, ...p }, x0, y0, s / CELL, 0.55, '#2a7fd0');
}
// can this object stay here? (for dragging) true or a reason
function canPut(o) {
  if (o.mount === 'wall') return true;
  const w = walkable(o.x, o.z);
  if (!w) return 'There\'s no floor there.';
  if (w === 'solid') return 'That\'s inside a wall.';
  return true;
}
let shiftDown = false;
// a flight of steps across the tile, climbing the way it faces
function drawSteps(px, py, s, rot, alpha) {
  const n = 6, a = (rot || 0) / 90, m = s * 0.22;
  ctx.save(); ctx.strokeStyle = `rgba(20,30,50,${alpha})`; ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const t = m + (s - 2 * m) * i / n;
    if (a % 2 === 0) { ctx.moveTo(px + m, py + t); ctx.lineTo(px + s - m, py + t); }      // N or S: steps run across
    else { ctx.moveTo(px + t, py + m); ctx.lineTo(px + t, py + s - m); }
  }
  ctx.stroke(); ctx.restore();
}
function drawArrival(px, py, s, a, noFloor) {
  // a badge in the corner: steps and an arrow the way you step off; with no floor here yet, an orange dashed box
  const pad = s * 0.1, b = s * 0.34, bx = px + s - pad - b - s * 0.06, by = py + s - pad - b - s * 0.08;
  ctx.save();
  if (noFloor) { ctx.strokeStyle = '#e07a1a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(px + pad, py + pad, s - 2 * pad, s - 2 * pad); ctx.setLineDash([]); }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = '#2a6fd0'; ctx.lineWidth = 1.5; ctx.fillRect(bx, by, b, b); ctx.strokeRect(bx + 0.5, by + 0.5, b - 1, b - 1);
  drawSteps(bx, by, b, a.piece.rot, 0.55);
  const cx = bx + b / 2, cy = by + b / 2, ang = (a.piece.rot || 0) * Math.PI / 180, r = b * 0.38, w = b * 0.2;
  ctx.fillStyle = '#2a6fd0'; ctx.beginPath();
  ctx.moveTo(cx + Math.sin(ang) * r, cy - Math.cos(ang) * r);
  ctx.lineTo(cx + Math.cos(ang) * w - Math.sin(ang) * r * 0.3, cy + Math.sin(ang) * w + Math.cos(ang) * r * 0.3);
  ctx.lineTo(cx - Math.cos(ang) * w - Math.sin(ang) * r * 0.3, cy - Math.sin(ang) * w + Math.cos(ang) * r * 0.3); ctx.fill();
  if (noFloor && s >= 40) { ctx.fillStyle = '#b85a10'; ctx.font = `600 ${Math.round(s * 0.13)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('stairs up:', px + pad + 4, py + pad + 4); ctx.fillText('needs a floor', px + pad + 4, py + pad + 4 + s * 0.15); }
  ctx.restore();
}
// a big building, zoomed out: one block over its whole footprint, its label in the anchor cell, its front marked
function drawBig(px, py, s, p, left, fromBelow, th, fx, fy) {
  const pad = Math.max(1, s * 0.04);
  ctx.save(); ctx.fillStyle = HEIGHT_COLORS[Math.max(1, Math.min(MAX_HEIGHT, left))]; ctx.globalAlpha *= fromBelow ? 0.45 : 0.8; ctx.fillRect(px + pad, py + pad, fx * s - 2 * pad, fy * s - 2 * pad); ctx.restore();
  ctx.save(); ctx.strokeStyle = '#8c8f98'; ctx.lineWidth = Math.max(3, s * 0.08); ctx.strokeRect(px + pad * 2, py + pad * 2, fx * s - 4 * pad, fy * s - 4 * pad); ctx.restore();
  drawTile(px, py, s, p, left, fromBelow, th, Object.fromEntries(SIDES.map(sd => [sd, 'none'])));
  drawFront(px, py, s, p);
}
// the front (door side) of a big building: a thick orange line along that edge of its footprint
function drawFront(px, py, s, p) {
  const [fx, fy] = pieceFoot(p), f = SIDES[(((p.rot || 0) / 90) | 0) % 4], t = Math.max(3, s * 0.07);
  ctx.save(); ctx.fillStyle = '#e07a1a';
  if (f === 'N') ctx.fillRect(px + s * 0.2, py + 2, fx * s - s * 0.4, t);
  if (f === 'S') ctx.fillRect(px + s * 0.2, py + fy * s - 2 - t, fx * s - s * 0.4, t);
  if (f === 'W') ctx.fillRect(px + 2, py + s * 0.2, t, fy * s - s * 0.4);
  if (f === 'E') ctx.fillRect(px + fx * s - 2 - t, py + s * 0.2, t, fy * s - s * 0.4);
  ctx.restore();
}
function drawTile(px, py, s, p, left, fromBelow, th, sides) {
  const pad = Math.max(1, s * 0.04);
  ctx.fillStyle = isLow(p) ? LOW_COLOR : HEIGHT_COLORS[Math.max(1, Math.min(MAX_HEIGHT, left))];
  ctx.globalAlpha *= fromBelow ? 0.55 : 0.85; ctx.fillRect(px + pad, py + pad, s - 2 * pad, s - 2 * pad); ctx.globalAlpha /= fromBelow ? 0.55 : 0.85;
  if (fromBelow) { ctx.fillStyle = stripePat; ctx.fillRect(px + pad, py + pad, s - 2 * pad, s - 2 * pad); }
  // walls: grey along each walled side; a side left open with nothing joining it is marked orange
  const wt = Math.max(3, s * 0.11), inner = s - 2 * pad;
  for (const sd of SIDES) {
    const kind = sides?.[sd] || 'wall';
    const r = sd === 'N' ? [px + pad, py + pad, inner, wt] : sd === 'S' ? [px + pad, py + s - pad - wt, inner, wt] : sd === 'W' ? [px + pad, py + pad, wt, inner] : [px + s - pad - wt, py + pad, wt, inner];
    if (kind === 'wall') { ctx.fillStyle = '#8c8f98'; ctx.fillRect(...r); }
    else if (kind === 'loose') {
      ctx.save(); ctx.strokeStyle = '#e07a1a'; ctx.lineWidth = Math.max(2, wt * 0.5); ctx.setLineDash([Math.max(3, s * 0.08), Math.max(2, s * 0.05)]); ctx.beginPath();
      const mid = wt * 0.3;
      if (sd === 'N') { ctx.moveTo(px + pad + wt, py + pad + mid); ctx.lineTo(px + s - pad - wt, py + pad + mid); }
      if (sd === 'S') { ctx.moveTo(px + pad + wt, py + s - pad - mid); ctx.lineTo(px + s - pad - wt, py + s - pad - mid); }
      if (sd === 'W') { ctx.moveTo(px + pad + mid, py + pad + wt); ctx.lineTo(px + pad + mid, py + s - pad - wt); }
      if (sd === 'E') { ctx.moveTo(px + s - pad - mid, py + pad + wt); ctx.lineTo(px + s - pad - mid, py + s - pad - wt); }
      ctx.stroke(); ctx.restore();
    }
  }
  if (PARTS[p.part]?.stairs) drawSteps(px, py, s, p.rot, fromBelow ? 0.25 : 0.4);
  // the theme: a small swatch in the corner
  const sw = Math.max(5, s * 0.16); ctx.fillStyle = th[p.theme]?.color || '#999'; ctx.fillRect(px + pad + wt + 1, py + pad + wt + 1, sw, sw);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(px + pad + wt + 1.5, py + pad + wt + 1.5, sw - 1, sw - 1);
  // facing: a small wedge pointing the way it faces (rooms have no facing)
  const cx = px + s / 2, cy = py + s / 2, a = (p.rot || 0) * Math.PI / 180, r = s * 0.5 - pad - Math.max(3, s * 0.11) - 2, w = s * 0.08;
  ctx.fillStyle = PARTS[p.part]?.open === 'room' ? 'rgba(0,0,0,0)' : 'rgba(20,30,50,0.55)'; ctx.beginPath();
  ctx.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  ctx.lineTo(cx + Math.sin(a) * (r - w) + Math.cos(a) * w, cy - Math.cos(a) * (r - w) + Math.sin(a) * w);
  ctx.lineTo(cx + Math.sin(a) * (r - w) - Math.cos(a) * w, cy - Math.cos(a) * (r - w) - Math.sin(a) * w); ctx.fill();
  // the code
  if (s >= 22) {
    ctx.fillStyle = fromBelow ? 'rgba(20,30,50,0.55)' : '#14203a'; ctx.font = `600 ${Math.round(s * 0.28)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(codeOf(p), cx, cy + s * 0.04 - (fromBelow ? s * 0.06 : 0));
    if (fromBelow && s >= 40) { ctx.font = `${Math.round(s * 0.17)}px system-ui, sans-serif`; ctx.fillText('↑ below', cx, cy + s * 0.2); }
  }
}

// ---- editing ----
const cellAtPx = (mx, my) => ({ x: Math.floor((mx - view.ox) / view.cell), y: Math.floor((my - view.oy) / view.cell) });
function snapshot() { history.push(JSON.stringify(d)); if (history.length > 200) history.shift(); future.length = 0; }
function undo() { if (!history.length) return; gBump(); future.push(JSON.stringify(d)); d = JSON.parse(history.pop()); dirty = true; renderAll(); }
function redo() { if (!future.length) return; gBump(); history.push(JSON.stringify(d)); d = JSON.parse(future.pop()); dirty = true; renderAll(); }
let stroke = null, panning = null, spaceDown = false, lastMsg = '';
function apply(x, y, mode) {
  let off = null;
  if (mode === 'paint' && fine() && mouseM) { const cr = cornerAt(mouseM); x = cr.x; y = cr.y; off = cr; }   // 1 m snapping: the corner under the mouse
  if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
  const dk = off ? `${x * CELL + off.ox},${y * CELL + off.oz}` : `${x},${y}`;
  if (mode !== 'select' && stroke.done.has(dk)) return; stroke.done.add(dk);
  if (mode === 'erase') { const hit = mouseM ? pieceAtM(mouseM) : null; if (hit ? erase(d, hit.x, hit.y, layer) : erase(d, x, y, layer)) stroke.changed = true; return; }
  if (mode === 'select') {
    if (stroke.drag) {                                                              // dragging: where it would land (keeping where you grabbed it)
      const g = stroke.drag, at = mouseM ? cornerAt({ x: mouseM.x - g.gx + CELL / 2, z: mouseM.z - g.gz + CELL / 2 }) : { x, y, ox: 0, oz: 0 };
      if (!fine()) { at.ox = g.ox; at.oz = g.oz; }
      g.to = at; return;
    }
    const hit = mouseM ? pieceAtM(mouseM) : null, c = hit ? hit.c : coverAt(d, x, y, layer);
    if (hit) { x = hit.x; y = hit.y; } else if (c) { x = c.ax; y = c.ay; }
    pieceSel = c ? { x, y, l: c.base } : null;
    if (c) { const [ox, oz] = offOf(c); stroke.drag = { to: { x, y, ox, oz }, ox, oz, gx: mouseM ? mouseM.x - (x * CELL + ox) : 5, gz: mouseM ? mouseM.z - (y * CELL + oz) : 5 }; }
    renderSide(); return;
  }
  if (mode === 'pick') { const c = coverAt(d, x, y, layer); if (c) { Object.assign(brush, { part: c.piece.part, theme: c.piece.theme, variant: c.piece.variant, height: c.piece.height, rot: c.piece.rot || 0, low: !!c.piece.low, elev: c.piece.elev || 0 }); tool = 'paint'; brush.fw = c.piece.fw || 1; brush.fd = c.piece.fd || 1; renderSide(); flash(`Picked ${codeOf(c.piece)}.`); } return; }
  const here0 = coverAt(d, x, y, layer), here = here0 && here0.ax === x && here0.ay === y ? here0 : null;
  if (here && here.base === layer) delete d.cells[`${x},${y},${layer}`];            // painting over a piece (at its anchor) replaces it
  const r = place(d, x, y, layer, { ...brush, elev: ELEV_THEMES.includes(brush.theme) ? brush.elev : 0, ox: off ? off.ox : 0, oz: off ? off.oz : 0 });
  if (r.ok) { stroke.changed = true; const np = d.cells[`${x},${y},${layer}`]; if (np) { if (roadSnap) snapTile(np, x, y, layer); if (!np.snap) groundTile(np, x, y, layer); } }
  else { if (here && here.base === layer) d.cells[`${x},${y},${layer}`] = here.piece; if (r.reason !== lastMsg) { flash(r.reason); lastMsg = r.reason; } }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', () => { if (mode === 'terrain' && terr.flowDraw) { const fl = flowsOf(d).find(q => q.id === terr.flowDraw), P = fl?.points; if (P && P.length > 2 && Math.hypot(P[P.length - 1].x - P[P.length - 2].x, P[P.length - 1].z - P[P.length - 2].z) < 0.6) P.pop(); terr.flowDraw = null; gBump(); renderSide(); draw(); return; } if (mode === 'paths' && pathDrawing) { const p = selPath(); if (p && p.points.length > 2) { const a = p.points[p.points.length - 1], b = p.points[p.points.length - 2]; if (Math.hypot(a.x - b.x, a.z - b.z) < 0.01) p.points.pop(); } finishPath(); } });
const metresAt = (mx, my) => ({ x: (mx - view.ox) / view.cell * CELL, z: (my - view.oy) / view.cell * CELL });
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = { mx, my, ox: view.ox, oy: view.oy, click: e.button === 1 }; return; }   // (a middle click that doesn't drag copies what's under it: see middleCopy)
  if (mode === 'objects') { objectDown(e, metresAt(mx, my)); return; }
  if (mode === 'paths') { pathDown(e, metresAt(mx, my), mx, my); return; }
  if (mode === 'global') return;
  if (mode === 'terrain') {
    const m = metresAt(mx, my), t = terrainOf(d); if (!t && terr.tab === 'shape') return;
    if (terr.tab === 'water' && terr.waterMode === 'flow') {                               // flow lines: click to lay points; right-click deletes the nearest line
      const g = groundOf(d, true); g.flows = g.flows || [];
      if (e.button === 2) { let best = null, bd = 4; for (const fl of g.flows) for (const q of samplePath({ points: fl.points }, 1)) { const dd = Math.hypot(q.x - m.x, q.z - m.z); if (dd < bd) { bd = dd; best = fl; } } if (best) { snapshot(); g.flows.splice(g.flows.indexOf(best), 1); if (!g.flows.length) delete g.flows; if (terr.flowDraw === best.id) terr.flowDraw = null; gBump(); dirty = true; renderTop(); renderSide(); draw(); } return; }
      snapshot(); let fl = g.flows.find(q => q.id === terr.flowDraw);
      if (!fl) { fl = { id: 'f' + Date.now().toString(36), points: [], speed: terr.flowSpeed }; g.flows.push(fl); terr.flowDraw = fl.id; }
      fl.points.push({ x: Math.round(m.x * 10) / 10, z: Math.round(m.z * 10) / 10 }); gBump(); dirty = true; renderTop(); renderSide(); draw(); return;
    }
    if (e.altKey && terr.tab === 'water') { terr.waterLv = Math.round((t ? terrainAt(t, m.x, m.z) : layer * CELL) * 4) / 4; renderSide(); flash(`Water level ${terr.waterLv} m (the ground here): raise it a little to flood the hollow.`); return; }
    if (e.altKey && t) { terr.target = Math.round(terrainAt(t, m.x, m.z) * 4) / 4; renderSide(); flash(`Flatten to ${terr.target} m.`); return; }
    snapshot(); terrStroke = { flip: e.button === 2, last: m, changed: terrainDab(m, e.button === 2) }; draw(); return;
  }
  mouseM = metresAt(mx, my);
  const sm = e.button === 2 ? 'erase' : e.altKey ? 'pick' : tool;
  if (sm !== 'pick' && sm !== 'select') snapshot();
  stroke = { mode: sm, done: new Set(), changed: false }; lastMsg = '';
  const c = cellAtPx(mx, my); apply(c.x, c.y, sm); draw(); renderLayersSoon(); updateStatus();
});
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (panning) { if (Math.hypot(mx - panning.mx, my - panning.my) > 4) panning.click = false; view.ox = panning.ox + mx - panning.mx; view.oy = panning.oy + my - panning.my; draw(); return; }
  if (mode === 'paths') { hoverM = metresAt(mx, my); ctrlDown = e.ctrlKey; setRoadsLive(isLive()); withCoverCache(d, () => { pathMove(hoverM); hover = cellAtPx(mx, my); draw0(); }); updateStatus(); return; }   // (moving a road point doesn't change the pieces: they're indexed once for it)
  if (mode === 'terrain') {
    hoverM = metresAt(mx, my);
    if (terrStroke && Math.hypot(hoverM.x - terrStroke.last.x, hoverM.z - terrStroke.last.z) >= Math.max(terr.tab !== 'shape' ? 0.3 : 0.5, terr.r * 0.2)) { terrStroke.last = hoverM; if (terrainDab(hoverM, terrStroke.flip)) terrStroke.changed = true; }
    draw(); updateStatus(); return;
  }
  if (mode === 'objects') {
    hoverM = metresAt(mx, my); ctrlDown = e.ctrlKey; shiftDown = e.shiftKey;
    if (drag) dragTo(hoverM.x - drag.dx, hoverM.z - drag.dz, e.ctrlKey);
    hover = cellAtPx(mx, my); draw(); updateStatus(); return;
  }
  const c = cellAtPx(mx, my), m2 = metresAt(mx, my), mk = `${Math.round(m2.x)},${Math.round(m2.z)}`;
  const moved = !hover || hover.x !== c.x || hover.y !== c.y || (fine() && mk !== hover.mk) || !!stroke?.drag; hover = { ...c, mk }; mouseM = m2;
  if (stroke && moved) apply(c.x, c.y, stroke.mode);
  if (moved) { draw(); updateStatus(); }
});
canvas.addEventListener('pointerup', e => {
  if (panning?.click) { const r = canvas.getBoundingClientRect(); middleCopy(e.clientX - r.left, e.clientY - r.top); }
  if (terrStroke) { if (terrStroke.changed) { if (terr.tab === 'shape') resettleGround(); dirty = true; renderTop(); renderSide(); renderLayers(); } else history.pop(); terrStroke = null; }
  if (rpStroke) { const ch = rpStroke.changed; rpStroke = null; if (ch) { dirty = true; if (!isLive()) roadsDone(); } else { history.pop(); if (!isLive()) setRoadsLive(false); } }
  if (pathDrag) {
    const pd = pathDrag; pathDrag = null;
    if (pd.branch) { if (!pd.moved) pd.p.points.pop(); else select(pd.p, pd.p.points.length - 1); dirty = true; if (isLive()) { renderSide(); draw(); } else roadsDone(); }   // a branch: keep drawing it
    else if (pd.moved) { dirty = true; if (!isLive()) roadsDone(); } else { history.pop(); if (!isLive()) setRoadsLive(false); }
  }
  if (drag) { if (drag.moved) { dirty = true; renderTop(); renderSide(); renderLayers(); } else history.pop(); drag = null; }
  if (stroke?.drag && pieceSel) { const t = stroke.drag.to; movePiece(t.x, t.y, t.ox, t.oz); }
  if (stroke) { if (stroke.changed) { dirty = true; renderTop(); renderLayers(); } else if (stroke.mode !== 'pick' && stroke.mode !== 'select') history.pop(); }
  stroke = null; panning = null;
});
canvas.addEventListener('pointerleave', () => { hover = null; hoverM = null; draw(); updateStatus(); });
function dragTo(x, z, flip) {
  if (drag.point != null) {                                   // a patrol point
    const o = objs().find(q => q.id === drag.id), p = o?.patrol?.[drag.point]; if (!p) return;
    const nx = snapTo(o.type, x, flip), nz = snapTo(o.type, z, flip);
    if ((nx !== p.x || nz !== p.z) && walkable(nx, nz) === 'floor') { p.x = nx; p.z = nz; drag.moved = true; }
    return;
  }
  const o = allObjs().find(q => q.id === drag.id); if (!o) return;
  const t = OBJECTS[o.type];
  if (o.mount === 'wall') {                                   // slides along walls, hops to another wall
    const w = wallSpot(x, z, o.type, 1.5, flip); if (!w || (w.x === o.x && w.z === o.z && w.rot === o.rot)) return;
    setPlace(o, { x: w.x, z: w.z, rot: w.rot }); drag.moved = true; return;
  }
  const nx = snapTo(o.type, x, flip), nz = snapTo(o.type, z, flip);
  if (t.span) { const sp = spanAt(nx, nz, o.rot || 0); if (sp && (sp.x !== o.x || sp.z !== o.z || sp.w !== o.w)) { Object.assign(o, sp); drag.moved = true; } return; }
  if ((nx !== o.x || nz !== o.z) && canPut({ ...o, x: nx, z: nz }) === true) { setPlace(o, { x: nx, z: nz }); drag.moved = true; }
}
// Middle click (without dragging): copy what's under the mouse to place more of it. On an object: its type, facing
// and all its settings (an enemy's group, count, stats, idle behaviour — not its patrol route) become the brush; on a
// piece in Layout mode: the piece, as the Pick tool does.
let stamp = null;
function middleCopy(mx, my) {
  const at = metresAt(mx, my);
  if (mode === 'objects') {
    const o = objectAt(at.x, at.z); if (!o || o.preset) { flash('Nothing to copy there.'); return; }
    const c = JSON.parse(JSON.stringify(o)); delete c.id; delete c.x; delete c.z; delete c.layer; delete c.triggers; delete c.span;
    if (c.patrol) { c.patrol = []; if (c.behaviour === 'patrol') c.behaviour = 'stand'; }
    stamp = c; objBrush = o.type; objRot = o.rot || 0;
    const cat = OBJECTS[o.type].cat; objTab = OBJECT_CATS[cat].tab || cat;
    selected = null; renderSide(); draw(); flash(`Copied ${OBJECTS[o.type].name}${o.variant ? ` (${ENEMY_VARIANTS[o.type]?.[o.variant]?.name || o.variant})` : ''} — click to place copies.`);
    return;
  }
  if (mode === 'layout') { const c = cellAtPx(mx, my); apply(c.x, c.y, 'pick'); draw(); }
}
// patrol points of the enemy being edited, under the mouse
const patrolPointAt = (o, x, z) => (o.patrol || []).findIndex(p => Math.hypot(p.x - x, p.z - z) < 0.5);
// a new object of this type, with its starting properties
function makeObject(type, p) {
  const t = OBJECTS[type], o = { id: newId(), type, layer, ...p };
  if (p.mount === 'wall') o.h = t.wallH ?? 1;
  if (t.cat === 'enemy') Object.assign(o, { variant: Object.keys(ENEMY_VARIANTS[type] || {})[0], count: type === 'swarm' ? 8 : type === 'pack' ? 3 : 1, behaviour: 'stand', patrol: [], patrolMode: 'loop', stats: {} });
  if (t.container) Object.assign(o, { contents: [], gold: 0, locked: false, lock: 20 });
  if (t.cat === 'trap') Object.assign(o, { damage: t.dmg ?? 10, trigger: 'timer', interval: 3, radius: 3, triggers: [] });
  if (t.cat === 'trigger') Object.assign(o, { who: 'player', rearm: 'always', cooldown: 2, ...(t.resize ? { w: t.w, d: t.d, h: 2.5 } : {}) });
  if (t.cat === 'light') o.lit = true;
  if (t.cat === 'sound') Object.assign(o, { track: '', kind: type === 'music' ? 'music' : type === 'soundPoint' ? 'effect' : 'ambience', volume: 70, loop: true, ...(t.resize ? { w: t.w, d: t.d, fade: 3, priority: 1 } : { radius: t.radius, gap: 0 }) });
  if (stamp && stamp.type === type) { const st = JSON.parse(JSON.stringify(stamp)); delete st.rot; delete st.h; delete st.mount; Object.assign(o, st, { id: o.id, type, layer }); if (stamp.h != null && p.mount !== 'wall') o.h = stamp.h; return o; }   // (a middle-click copy)
  if (t.cat === 'particle') Object.assign(o, { density: 50, color: { fog: '#9aa4ad', dust: '#d8cfa8', smoke: '#5a5a5a', embers: '#ff8a30', steam: '#e8eef2', drips: '#7fb4d8' }[type] || '#cccccc', h: type === 'fog' ? 1.2 : type === 'smoke' ? 4 : 2.5, ...(t.resize ? { w: t.w, d: t.d } : { radius: t.radius }) });
  return o;
}
const isTrap = o => OBJECTS[o?.type]?.cat === 'trap', isTrigger = o => OBJECTS[o?.type]?.cat === 'trigger';
function toggleLink(trap, trig) {
  trap.triggers ||= []; const i = trap.triggers.indexOf(trig.id);
  if (i >= 0) trap.triggers.splice(i, 1); else trap.triggers.push(trig.id);
  trap.trigger = 'linked';
}
function objectDown(e, at) {
  if (bulk) {                                                 // Bind mode: trap then triggers (or trigger then traps)
    if (e.button !== 0) return;
    const hit = objectAt(at.x, at.z), src = objs().find(q => q.id === bulkSrc);
    if (!isTrap(hit) && !isTrigger(hit)) { bulkSrc = null; renderSide(); draw(); return; }
    if (src && isTrap(src) && isTrigger(hit)) { snapshot(); toggleLink(src, hit); changed(); flash(`${(src.triggers || []).includes(hit.id) ? 'Bound' : 'Unbound'}: ${OBJECTS[hit.type].name} → ${OBJECTS[src.type].name}`); return; }
    if (src && isTrigger(src) && isTrap(hit)) { snapshot(); toggleLink(hit, src); changed(); flash(`${(hit.triggers || []).includes(src.id) ? 'Bound' : 'Unbound'}: ${OBJECTS[src.type].name} → ${OBJECTS[hit.type].name}`); return; }
    bulkSrc = hit.id; renderSide(); draw(); return;
  }
  if (bind) {                                                 // binding: click a trigger / trap to link or unlink it, or empty floor to place a new trigger
    const from = objs().find(q => q.id === bind.from); if (!from) { bind = null; return; }
    if (e.button !== 0) return;
    const hit = objectAt(at.x, at.z);
    if (bind.kind === 'trap') {
      if (isTrigger(hit)) { snapshot(); toggleLink(from, hit); changed(); renderLayers(); return; }
      const p = placement(bind.type, at.x, at.z, 0, e.ctrlKey); if (p.why) { flash(p.why); return; }
      snapshot(); const t = makeObject(bind.type, p); objs().push(t); toggleLink(from, t); changed(); renderLayers(); return;
    }
    if (isTrap(hit)) { snapshot(); toggleLink(hit, from); changed(); renderLayers(); return; }
    flash('Click a trap to bind it to this trigger.'); return;
  }
  if (patrolEdit) {                                           // editing a route: click adds a point, drag moves one, right-click removes
    const o = objs().find(q => q.id === patrolEdit); if (!o) { patrolEdit = null; return; }
    const k = patrolPointAt(o, at.x, at.z);
    if (e.button === 2) { if (k >= 0) { snapshot(); o.patrol.splice(k, 1); dirty = true; renderTop(); renderLayers(); draw(); } return; }
    if (e.button !== 0) return;
    if (k >= 0) { snapshot(); drag = { id: o.id, point: k, moved: false }; return; }
    const p = { x: snapTo(o.type, at.x, e.ctrlKey), z: snapTo(o.type, at.z, e.ctrlKey) };
    if (walkable(p.x, p.z) !== 'floor') { flash('Patrol points go on open floor.'); return; }
    snapshot(); (o.patrol ||= []).push(p); dirty = true; renderTop(); renderLayers(); draw(); return;
  }
  const hit = objectAt(at.x, at.z);
  if (e.button === 2) { if (hit) { selected = hit.id; deleteSelected(); } return; }
  if (e.button !== 0) return;
  if (hit && !e.shiftKey) { selected = hit.id; snapshot(); drag = { id: hit.id, dx: hit.mount === 'wall' ? 0 : at.x - hit.x, dz: hit.mount === 'wall' ? 0 : at.z - hit.z, moved: false }; renderSide(); renderLayers(); draw(); return; }
  const p = placement(objBrush, at.x, at.z, objRot, e.ctrlKey); if (p.why) { flash(p.why); return; }
  const o = makeObject(objBrush, p);
  snapshot(); objs().push(o); selected = o.id; dirty = true; renderTop(); renderSide(); renderLayers(); draw();
}
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.exp(-e.deltaY * 0.0015), ns = Math.max(10, Math.min(640, view.cell * k));
  view.ox = mx - (mx - view.ox) * ns / view.cell; view.oy = my - (my - view.oy) * ns / view.cell; view.cell = ns; draw();
}, { passive: false });
let layersT = 0; const renderLayersSoon = () => { clearTimeout(layersT); layersT = setTimeout(renderLayers, 120); };
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') { ctrlDown = true; draw(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { shiftDown = true; draw(); }
  if (e.ctrlKey || e.metaKey) return;
  const k = e.code;
  if (k === 'KeyM') return setMode(mode === 'layout' ? 'objects' : 'layout');
  if (k === 'KeyG') return setMode(mode === 'global' ? 'layout' : 'global');
  if (k === 'KeyP') return setMode(mode === 'paths' ? 'layout' : 'paths');
  if (k === 'KeyT' && mode !== 'paths') return setMode(mode === 'terrain' ? 'layout' : 'terrain');
  if (mode === 'terrain') {
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(k); if (n >= 0 && terrainOf(d)) { terr.tab = 'shape'; terr.op = TERR_OPS[n][0]; renderSide(); draw(); return; }
    if ((k === 'Enter' || k === 'Escape') && terr.flowDraw) { const g = groundOf(d); const fl = g?.flows?.find(q => q.id === terr.flowDraw); if (fl && fl.points.length < 2) { g.flows.splice(g.flows.indexOf(fl), 1); if (!g.flows.length) delete g.flows; } terr.flowDraw = null; gBump(); renderSide(); draw(); return; }
    const tn = ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].indexOf(k); if (tn >= 0) { terr.tab = G_TABS[tn + 1][0]; renderSide(); draw(); return; }
    if (k === 'PageUp' || k === 'PageDown') { setLayer(layer + (k === 'PageUp' ? 1 : -1)); renderSide(); draw(); return; }
    if (k === 'BracketRight' || k === 'BracketLeft') { terr.r = Math.max(2, Math.min(40, terr.r + (k === 'BracketRight' ? 2 : -2))); renderSide(); draw(); return; }
    return;
  }
  if (mode === 'paths') { if (pathKey(e, k)) return; if (!['BracketRight', 'BracketLeft', 'PageUp', 'PageDown'].includes(k)) return; }
  if (mode === 'global' && !['BracketRight', 'BracketLeft', 'PageUp', 'PageDown'].includes(k)) return;
  if (k === 'BracketRight' || k === 'PageUp') return setLayer(layer + 1);
  if (k === 'BracketLeft' || k === 'PageDown') return setLayer(layer - 1);
  if (mode === 'objects') {
    if (k === 'KeyR') turnSelected(e.shiftKey ? -1 : 1);
    else if (k === 'Delete' || k === 'Backspace') deleteSelected();
    else if (k === 'KeyB') toggleBulk();
    else if (k === 'Escape' && bulk) toggleBulk(false);
    else if (k === 'Escape') { if (bind) bind = null; else if (patrolEdit) patrolEdit = null; else selected = null; renderSide(); renderLayers(); draw(); }
    return;
  }
  if (tool === 'select' && selPiece()) {                                         // keys act on the selected piece
    if (k === 'KeyR') return selPieceAct('rot', e.shiftKey ? -90 : 90);
    if (k === 'KeyQ' || k === 'KeyE') return selPieceAct('elevBy', (k === 'KeyE' ? 1 : -1) * (e.shiftKey ? 1 : 0.25));
    if (k.startsWith('Arrow')) {
      e.preventDefault(); const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (!fine()) return movePiece(pieceSel.x + dx, pieceSel.y + dy);
      const p = selPiece(), cx = pieceSel.x * CELL + (p.ox || 0) + dx, cz = pieceSel.y * CELL + (p.oz || 0) + dy, x = Math.floor(cx / CELL), y = Math.floor(cz / CELL);   // 1 m at a time
      return movePiece(x, y, cx - x * CELL, cz - y * CELL);
    }
    if (k === 'Delete' || k === 'Backspace') return selPieceAct('del');
    if (k === 'Escape') { pieceSel = null; renderSide(); draw(); return; }
  }
  if (k === 'KeyH') { roadSnap = !roadSnap; flash(roadSnap ? 'Tiles take their height from roads.' : 'Tiles keep the height you give them.'); renderSide(); return; }
  if (k === 'KeyF') { fineSnap = !fineSnap; flash(fineSnap ? 'Snapping to the 1 m grid (Ctrl: whole cells).' : 'Snapping to whole cells (Ctrl: 1 m).'); renderSide(); draw(); return; }
  if (k === 'KeyV') tool = 'select'; else if (k === 'KeyB') tool = 'paint'; else if (k === 'KeyX') tool = 'erase'; else if (k === 'KeyI') tool = 'pick';
  else if (k === 'KeyR') brush.rot = (brush.rot + (e.shiftKey ? 270 : 90)) % 360;
  else if (/^Digit[1-4]$/.test(k)) { brush.height = +k.slice(5); brush.low = false; }
  else if (k === 'KeyQ' || k === 'KeyE') { setElev((brush.elev || 0) + (k === 'KeyE' ? 1 : -1) * (e.shiftKey ? 1 : 0.25)); return; }
  else if (k === 'BracketRight' || k === 'PageUp') return setLayer(layer + 1);
  else if (k === 'BracketLeft' || k === 'PageDown') return setLayer(layer - 1);
  else return;
  renderSide(); draw();
});
addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; if (e.code.startsWith('Control')) { ctrlDown = false; draw(); } if (e.code.startsWith('Shift')) { shiftDown = false; draw(); } });
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('resize', fit);

// ---- Paths: roads drawn as smooth curves over the map (src/data/paths.js) ----
let pathSel = null, pathPt = null, pathDrawing = false, pathDrag = null, pathKind = 'road', pathAdd = false, pathNew = false;
// road paint: brush a surface and/or a bridge style onto stretches of roads ('keep' leaves that one as it is)
const rpaint = { on: false, mat: 'flag', br: 'keep', r: 4 }; let rpStroke = null;
const RMAT_COLORS = { cobble: '#a89a86', flag: '#cfc6b2', dirt: '#8a6a44', gravel: '#9a948a', planks: '#8a6038' }, RBR_COLORS = { auto: '#9aa0b0', stone: '#6a6a7a', timber: '#7a4a2a', none: '#c0392b' };
function roadDab(m, erase) {
  let ch = false;
  for (const p of pathsOf(d)) {
    if (p.points.length < 2) continue; const S = (rpStroke.S.get(p) || rpStroke.S.set(p, samplePath(p, 0.5)).get(p)), reach = rpaint.r + outerHalfOf(p) * 0.5;
    let s0 = Infinity, s1 = -Infinity; for (const q of S) if (Math.hypot(q.x - m.x, q.z - m.z) <= reach) { s0 = Math.min(s0, q.s); s1 = Math.max(s1, q.s); }
    if (s0 > s1) continue; s0 = Math.max(0, s0 - 0.5); s1 += 0.5;
    if (rpaint.mat !== 'keep' || erase) ch = paintRoad(p, 'mat', s0, s1, erase ? null : rpaint.mat) || ch;
    if (rpaint.br !== 'keep' || erase) ch = paintRoad(p, 'br', s0, s1, erase ? null : rpaint.br) || ch;
  }
  return ch;
}
const selPath = () => pathsOf(d).find(q => q.id === pathSel) || null;
const snapPt = v => ctrlDown ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2;      // 0.5 m, Ctrl: free (10 cm)
const pxR = px => Math.max(0.4, px / view.cell * CELL);                              // a distance on screen, in metres
const select = (p, i = null) => { pathSel = p ? p.id : null; pathPt = i; };
function finishPath() {
  if (!pathDrawing) return;
  pathDrawing = false; const p = selPath();
  if (p && p.points.length < 2) { d.paths = pathsOf(d).filter(q => q !== p); select(null); }
  else if (p) pathPt = p.points.length - 1;
  dirty = true; roadsDone();                                                                // (the road's drawn: now work it all out)
}
// the point under the mouse (skipping one, e.g. the one being dragged)
function pointAt(m, skip = null) {
  const r = pxR(10); let best = null, bd = r;
  for (const p of pathsOf(d)) { p.points.forEach((q, i) => { if ((absLayer(p, q.y || 0) !== layer && p.id !== pathSel && !roadRuns(p).runs.some(r => r.layer === layer)) || (skip && skip.p === p && skip.i === i)) return; const dd = Math.hypot(q.x - m.x, q.z - m.z); if (dd < bd) { bd = dd; best = { p, i }; } }); }
  return best;
}
// the nearest spot on a road's centre line: { p, x, z, seg } (within `r` metres)
// a road's samples, kept until its points change (hovering and drawing ask for them on every mouse move)
const sampCache = new WeakMap();
function samplesOf(p, step) { const k = step + '|' + JSON.stringify(p.points); let e = sampCache.get(p); if (!e) sampCache.set(p, e = {}); const c = e[step]; if (c && c.k === k) return c.S; const S = samplePath(p, step); e[step] = { k, S }; return S; }
function curveAt(m, r = pxR(14), skip = null) {
  let best = null, bd = r;
  for (const p of pathsOf(d)) { if (p === skip || p.points.length < 2) continue; const H = profileOf(d, p); for (const q of samplesOf(p, 0.2)) { if (absLayer(p, H.heightAt(q.s)) !== layer) continue; const dd = Math.hypot(q.x - m.x, q.z - m.z); if (dd < bd) { bd = dd; best = { p, x: q.x, z: q.z, seg: q.seg, t: q.t, s: q.s }; } } }
  return best;
}
// Magnet: a new or moved point lands on an existing point if it's close (to join roads), else on a road's centre
// line (a T junction), else on the 0.5 m grid. Returns { x, z, hit: { p, i } | null }.
// a grid street's mouth: the middle of a side of a town street cell on this layer that opens there, or that
// faces empty ground ({ x, z, nx, nz }: nx, nz point out of the cell)
function mouthAt(m) {
  const r = pxR(14); let best = null, bd = r;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const c = coverAt(d, x, y, layer); if (!c || c.base !== layer || !'TO'.includes(c.piece.theme) || !'CJXTDEKRW'.includes(c.piece.part)) continue;
    const os = PARTS[c.piece.part]?.open === 'room' ? SIDES : openSides(c.piece);
    for (const sd of SIDES) {
      const [nx, nz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[sd];
      if (coverAt(d, x + nx, y + nz, layer)) continue;                                // only edges facing empty ground
      if (!os.includes(sd) && c.piece.part !== 'R') continue;
      const mx = (x + 0.5 + nx * 0.5) * CELL, mz = (y + 0.5 + nz * 0.5) * CELL, dd = Math.hypot(mx - m.x, mz - m.z);
      if (dd < bd) { bd = dd; best = { x: mx, z: mz, nx, nz, abs: layer * CELL + (c.piece.elev || 0) }; }
    }
  }
  return best;
}
function magnet(m, skipPt = null, skipPath = null) {
  const h = pointAt(m, skipPt);
  if (h && h.p !== skipPath) return { x: h.p.points[h.i].x, z: h.p.points[h.i].z, abs: h.p.layer * CELL + (h.p.points[h.i].y || 0), hit: h };
  const mo = mouthAt(m); if (mo) return { x: mo.x, z: mo.z, abs: mo.abs, hit: null, mouth: mo };
  const c = curveAt(m, pxR(8), skipPath || skipPt?.p);
  if (c) return { x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100, abs: c.p.layer * CELL + Math.round(profileOf(d, c.p).heightAt(c.s) * 4) / 4, hit: null, curve: c };
  return { x: snapPt(m.x), z: snapPt(m.z), abs: layer * CELL, hit: null };
}
const rel = (p, abs) => abs - p.layer * CELL;                                        // an absolute height as road p measures it (from its own layer)
const withY = (q, y) => { const v = Math.max(-10, Math.min(MAX_Y, Math.round(y * 4) / 4)); if (v) q.y = v; else delete q.y; return q; };
// after heights change: a road whose points all sit 10 m up moves up a layer (or below its floor, down one); the view follows it
function settleRoad(p) { normalizeRoad(p); }                                           // quietly: every point stays where it is (it's drawn on the layer its height puts it on)
// set a road free of the ground, keeping the shape it had: each point takes the height the ground gave it there
function freeRoad(p) {
  if (!groundFor(d, p)) return false;
  const S = samplePath(p, 0.5), H = profileOf(d, p, S);
  p.points.forEach((q, i) => { const smp = i === p.points.length - 1 ? S[S.length - 1] : S.find(r => r.seg === i); if (smp) withY(q, H.heightAt(smp.s)); });
  p.free = true; flash('Set free of the ground: its points decide its height now (Follows the ground turns it back on).'); return true;
}
function nudgeY(p, i, dy) { snapshot(); freeRoad(p); withY(p.points[i], (p.points[i].y || 0) + dy); settleRoad(p); pChanged(); }
// Roads are drawn first and worked out after: while one is being drawn, dragged or painted ("live"), only the lines
// are redrawn (the heights, bridges, the carved ground and the tiles that follow roads wait); when the edit ends
// everything is worked out once (src/data/paths.js setRoadsLive)
const isLive = () => !!(pathDrawing || pathDrag || rpStroke);
let doneTimer = 0;
const roadsDone = () => {                                                                   // the lines first, then (a moment later) the working-out
  draw(); clearTimeout(doneTimer);
  doneTimer = setTimeout(() => { if (isLive()) return; setRoadsLive(false); resnapTiles(); if (terrainOf(d)) resettleGround(); notePaths(); renderTop(); renderSide(); draw(); }, 40);
};
const pChanged = () => { dirty = true; if (isLive()) { setRoadsLive(true); draw(); return; } roadsDone(); };
// join road `b` onto the end of `a` at b's point j (an end): one road. The caller has taken a's copy of the shared
// point off, so b keeps it
function joinRoads(a, b, j) {
  const B = (j === 0 ? b.points : reversePoints(b.points.slice())).map(q => ({ ...q })), shift = (b.layer - a.layer) * CELL;
  for (const q of B) withY(q, (q.y || 0) + shift);                                    // b's heights, measured from a's layer now
  freeTangents(a.points, a.points.length - 1); a.points.push(...B); d.paths = pathsOf(d).filter(q => q !== b);
  settleRoad(a);
}
function insertPoint(c) {                                                               // on road c.p, between its points c.seg and c.seg + 1: the road keeps its exact shape
  snapshot(); const i = splitAt(c.p, c.seg, Math.min(0.98, Math.max(0.02, c.t ?? 0.5)));
  select(c.p, i); return i;
}
// a new road starting on point i of road p: a branch (the old road isn't touched). With drag, its second point
// follows the mouse until you let go; either way you're then drawing it
function startBranch(p, i, drag = false) {
  const q = p.points[i]; snapshot(); finishPath();
  const b = newPath(p.kind, p.layer); Object.assign(b, { road: p.road, pave: p.pave, lamps: p.lamps });
  b.points.push(withY({ x: q.x, z: q.z }, q.y || 0)); pathsOf(d).push(b); select(b, 0); pathDrawing = true;
  if (drag) { b.points.push(withY({ x: q.x, z: q.z }, q.y || 0)); pathDrag = { p: b, i: 1, moved: false, branch: true }; }
  flash('Branch: drag or click to lay the new road; Enter to finish.'); pChanged();
}
function continueFrom(p, i) {                                                           // keep drawing from an end of the road (from a middle point: a branch)
  if (!p || p.points.length < 1) return;
  if (i === 0 && p.points.length > 1) { snapshot(); reversePoints(p.points); }
  else if (i !== p.points.length - 1) return startBranch(p, i);
  select(p, p.points.length - 1); pathDrawing = true; pathAdd = false; renderSide(); draw();
}
function pathDown(e, m) {
  if (rpaint.on) { snapshot(); rpStroke = { S: new Map(), changed: false, erase: e.button === 2 }; setRoadsLive(true); rpStroke.changed = roadDab(m, rpStroke.erase); draw(); return; }   // road paint
  if (e.button === 2) {                                                              // right: finish drawing, or remove a point
    if (pathDrawing) return finishPath();
    const h = pointAt(m); if (!h) return;
    removePoint(h.p, h.i); return;
  }
  if (pathDrawing) {
    const p = selPath(), L = p.points[p.points.length - 1], g = magnet(m, null, null);
    if (g.hit && g.hit.p === p && g.hit.i === p.points.length - 1) return finishPath();   // clicked the last point again: done
    snapshot(); p.points.push(withY({ x: g.x, z: g.z }, g.hit || g.curve || g.mouth ? rel(p, g.abs) : (L.y || 0)));
    if (g.hit && g.hit.p !== p && (g.hit.i === 0 || g.hit.i === g.hit.p.points.length - 1)) {   // onto another road's end: join them into one
      p.points.pop(); joinRoads(p, g.hit.p, g.hit.i); flash('Joined the two roads.'); pathDrawing = false; select(p, null); pChanged(); return;
    }
    if (g.mouth) { const q = p.points.pop(); p.points.push(withY({ x: q.x + g.mouth.nx * 2.5, z: q.z + g.mouth.nz * 2.5 }, rel(p, g.abs)), q); flash('Joined to the street.'); pathDrawing = false; select(p, null); pChanged(); return; }
    if (g.hit || g.curve) { flash('Connected.'); }
    void L; pChanged(); return;
  }
  if (pathNew) {                                                                     // N: start a road here, even on another road
    pathNew = false; const g = magnet(m); snapshot(); const p = newPath(pathKind, layer); p.points.push(withY({ x: g.x, z: g.z }, rel(p, g.abs))); if (g.mouth) p.points.push(withY({ x: g.x + g.mouth.nx * 2.5, z: g.z + g.mouth.nz * 2.5 }, rel(p, g.abs))); pathsOf(d).push(p);
    select(p, 0); pathDrawing = true; pChanged(); return;
  }
  const h = pointAt(m);
  if (h && !pathAdd && e.shiftKey) { startBranch(h.p, h.i, true); return; }      // Shift+drag a point: pull a new road out of it (a branch)
  if (h && !pathAdd && !e.altKey) { select(h.p, h.i); snapshot(); pathDrag = { p: h.p, i: h.i, moved: false }; setRoadsLive(true); renderSide(); draw(); return; }
  if (pathAdd || e.altKey) {                                                         // add a point on a road's curve, and drag it
    const c = curveAt(m, pxR(14) + 4); if (!c) return flash('Click on a road to add a point to it.');
    const i = insertPoint(c); pathDrag = { p: c.p, i, moved: true, freed: false }; pChanged(); return;
  }
  const f = pathField(d, layer).at(m.x, m.z), fc = !f && curveAt(m, 3);         // a road based here, or one that has climbed onto this layer
  if (f || fc) { select((f || fc).p, null); renderSide(); draw(); return; }
  if (pathSel) { select(null); renderSide(); draw(); return; }                       // click away: let go
  const g = magnet(m); snapshot(); const p = newPath(pathKind, layer); p.points.push(withY({ x: g.x, z: g.z }, rel(p, g.abs))); if (g.mouth) p.points.push(withY({ x: g.x + g.mouth.nx * 2.5, z: g.z + g.mouth.nz * 2.5 }, rel(p, g.abs))); pathsOf(d).push(p);   // empty ground: start a new road (from a street's mouth: straight out of it first)
  select(p, 0); pathDrawing = true; pChanged();
}
function removePoint(p, i) {
  snapshot(); freeTangents(p.points, i); p.points.splice(i, 1);
  if (p.points.length < 2) { d.paths = pathsOf(d).filter(q => q !== p); select(null); flash('Road removed (a road needs two points).'); }
  else select(p, Math.min(i, p.points.length - 1));
  pChanged();
}
function pathMove(m) {
  if (rpStroke) { if (roadDab(m, rpStroke.erase)) rpStroke.changed = true; return; }
  if (!pathDrag) return;
  const P = pathDrag.p.points[pathDrag.i], g = magnet(m, { p: pathDrag.p, i: pathDrag.i }, null);
  if (P.x !== g.x || P.z !== g.z) { P.x = g.x; P.z = g.z; if (g.hit || g.mouth) withY(P, rel(pathDrag.p, g.abs)); if (!pathDrag.freed) { freeTangents(pathDrag.p.points, pathDrag.i); pathDrag.freed = true; } pathDrag.moved = true; }
}
// hotkeys in Paths mode (returns true if it used the key)
function pathKey(e, k) {
  const p = selPath();
  if (k === 'KeyR') { rpaint.on = !rpaint.on; if (rpaint.on && pathDrawing) finishPath(); renderSide(); draw(); return true; }
  if (k === 'Enter') { if (pathDrawing) finishPath(); return true; }
  if (k === 'Escape') { if (pathDrawing) finishPath(); else if (pathAdd || pathNew) { pathAdd = pathNew = false; } else if (pathPt != null) pathPt = null; else select(null); renderSide(); draw(); return true; }
  if (k === 'Delete' || k === 'Backspace') {
    if (!p) return true;
    if (pathPt != null && !e.shiftKey) removePoint(p, pathPt);
    else { snapshot(); d.paths = pathsOf(d).filter(q => q !== p); select(null); pathDrawing = false; pChanged(); }
    return true;
  }
  if (k === 'KeyN') { finishPath(); pathNew = true; pathAdd = false; flash('Click to start a new road (it can start on another road).'); renderSide(); return true; }
  if (k === 'KeyA') { finishPath(); pathAdd = !pathAdd; pathNew = false; flash(pathAdd ? 'Add points: click on a road.' : 'Add points: off.'); renderSide(); draw(); return true; }
  if (k === 'KeyC') { if (p) continueFrom(p, pathPt != null ? pathPt : p.points.length - 1); return true; }
  if (k === 'KeyF') { if (p) { snapshot(); reversePoints(p.points); if (pathPt != null) pathPt = p.points.length - 1 - pathPt; pChanged(); } return true; }
  if (k === 'KeyQ' || k === 'KeyE') { if (p && pathPt != null) nudgeY(p, pathPt, (k === 'KeyE' ? 1 : -1) * (e.shiftKey ? 1 : 0.25)); return true; }
  if (k === 'KeyL') { if (p) { snapshot(); p.lamps = p.lamps === false; pChanged(); flash(`Lamps ${p.lamps ? 'on' : 'off'}.`); } return true; }
  if (k === 'Tab') { e.preventDefault(); if (p && p.points.length) { pathPt = pathPt == null ? 0 : (pathPt + (e.shiftKey ? p.points.length - 1 : 1)) % p.points.length; renderSide(); draw(); } return true; }
  if (k === 'Equal' || k === 'Minus' || k === 'NumpadAdd' || k === 'NumpadSubtract') {
    if (!p) return true; snapshot(); const dv = k === 'Equal' || k === 'NumpadAdd' ? 0.5 : -0.5;
    if (e.shiftKey) p.pave = Math.max(0, Math.min(6, p.pave + dv)); else p.road = Math.max(2, Math.min(24, p.road + dv));
    pChanged(); return true;
  }
  if (k.startsWith('Arrow')) {                                                         // nudge the selected point
    if (!p || pathPt == null) return true; e.preventDefault(); snapshot();
    const st = e.shiftKey ? 0.1 : 0.5, q = p.points[pathPt]; freeTangents(p.points, pathPt);
    if (k === 'ArrowLeft') q.x -= st; if (k === 'ArrowRight') q.x += st; if (k === 'ArrowUp') q.z -= st; if (k === 'ArrowDown') q.z += st;
    q.x = Math.round(q.x * 10) / 10; q.z = Math.round(q.z * 10) / 10; pChanged(); return true;
  }
  return false;
}
// A road can climb past its own layer: each stretch is drawn on the layer its height puts it on (a road on the
// ground that reaches 10 m shows on Layer 1 from there), the layer below faintly.
const absLayer = (p, h) => p.layer + Math.floor((h + 1e-6) / CELL);
const runsCache = new WeakMap();
function roadRuns(p) {
  const S0 = samplesOf(p, 0.5), H0 = profileOf(d, p, S0), hit = runsCache.get(p); if (hit && hit.S === S0 && hit.H === H0) return hit.v;   // (unchanged road, unchanged profile: the same runs)
  const v = roadRuns0(p, S0, H0); runsCache.set(p, { S: S0, H: H0, v }); return v;
}
function roadRuns0(p, S, H) {
  const runs = [];
  let cur = null;
  for (const q of S) {
    const h = H.heightAt(q.s), L = absLayer(p, h), pt = { x: q.x, z: q.z, h, s: q.s, seg: q.seg, t: q.t };
    if (!cur || cur.layer !== L) { if (cur) cur.pts.push(pt); cur = { layer: L, pts: cur ? [cur.pts[cur.pts.length - 1], pt] : [pt] }; runs.push(cur); }   // runs overlap by a sample, so there's no gap where they meet
    else cur.pts.push(pt);
  }
  return { runs, S, H };
}
function drawPaths(x0, y0, s) {
  const m = s / CELL;
  const line = (S, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * m); ctx.beginPath(); S.forEach((q, i) => i ? ctx.lineTo(x0 + q.x * m, y0 + q.z * m) : ctx.moveTo(x0 + q.x * m, y0 + q.z * m)); ctx.stroke(); };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  const all = pathsOf(d).filter(p => p.points.length >= 2).map(p => ({ p, ...roadRuns(p) }));
  for (const other of [true, false]) {                                                // stretches on other layers faintly (a road follows the ground through the layers), then this one
    const list = all.flatMap(o => o.runs.filter(r => other ? r.layer !== layer : r.layer === layer).map(r => ({ p: o.p, S: r.pts }))); if (!list.length) continue;
    ctx.globalAlpha = other ? 0.35 : 1;
    for (const { p, S } of list) line(S, p.road + 2 * (ROAD.kerb + p.pave), '#ddd2bc');
    for (const { p, S } of list) line(S, p.road + 2 * ROAD.kerb, '#f4ecdc');
    for (const { p, S } of list) line(S, p.road, '#a89a86');
    // painted stretches: the surface down the middle, the bridge style along the edges
    if (!other) for (const { p, S } of list) {
      const pm = p.paint || {}, part = (L, fn) => { for (const [a, b, v] of L || []) { const sub = S.filter(q => q.s >= a && q.s <= b); if (sub.length > 1) fn(sub, v); } };
      part(pm.mat, (sub, v) => line(sub, p.road * 0.7, RMAT_COLORS[v] || '#fff'));
      part(pm.br, (sub, v) => { ctx.setLineDash([Math.max(3, 2 * m), Math.max(3, 2 * m)]); line(sub, p.road + 2 * (ROAD.kerb + p.pave) + 1.2, RBR_COLORS[v] || '#888'); ctx.setLineDash([]); line(sub, p.road + 2 * (ROAD.kerb + p.pave) - 0.4, '#ddd2bc'); line(sub, p.road, '#a89a86'); if (pm.mat) part(pm.mat, (s2, v2) => line(s2, p.road * 0.7, RMAT_COLORS[v2])); });
    }
    for (const { p, S } of list) if (p.median) { ctx.setLineDash([Math.max(2, 1.6 * m), Math.max(2, 10.4 * m)]); line(S, 1.6, '#6f9a52'); ctx.setLineDash([]); }   // a boulevard's planters
  }
  ctx.globalAlpha = 1;
  // slope arrows: on each stretch that climbs, an arrow pointing uphill and how steep it is
  // (green gentle · amber moderate · orange steep · red: steps)
  if (s >= 40) for (const { p, S, H } of all) {
    H.segs.forEach((g, i) => {
      const dy = g.y1 - g.y0; if (Math.abs(dy) < 0.05) return;
      const sm = (g.s0 + g.s1) / 2, q = S.reduce((a, b) => Math.abs(b.s - sm) < Math.abs(a.s - sm) ? b : a, S[0]);
      if (absLayer(p, H.heightAt(sm)) !== layer) return;
      const up = Math.sign(dy), tx = q.tx * up, tz = q.tz * up, px = x0 + q.x * m, pz = y0 + q.z * m, len = Math.max(10, Math.min(26, s * 0.12));
      const col = g.steps ? '#c0392b' : g.grade < 0.08 ? '#2e8b57' : g.grade < 0.18 ? '#d4a017' : '#e67e22';
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px - tx * len, pz - tz * len); ctx.lineTo(px + tx * len, pz + tz * len); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + tx * (len + 7), pz + tz * (len + 7)); ctx.lineTo(px + tx * len - tz * 6, pz + tz * len + tx * 6); ctx.lineTo(px + tx * len + tz * 6, pz + tz * len - tx * 6); ctx.closePath(); ctx.fill();
      const label = g.steps ? `steps ${Math.abs(dy).toFixed(1)} m` : `${Math.round(g.grade * 100)}% · ${Math.abs(dy).toFixed(1)} m`;
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lx = px - tz * 16, lz = pz + tx * 16, tw = ctx.measureText(label).width + 8;
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#fffaf0'; ctx.fillRect(lx - tw / 2, lz - 8, tw, 16); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(label, lx, lz);
    });
  }
  ctx.restore();
}
function drawPathHandles(x0, y0, s) {
  const m = s / CELL;
  ctx.save();
  for (const p of pathsOf(d)) {
    const sel = p.id === pathSel;
    if (!sel && !p.points.some(q => absLayer(p, q.y || 0) === layer) && !roadRuns(p).runs.some(r => Math.abs(r.layer - layer) <= 1)) continue;   // (the selected road always shows its points)
    if (sel && p.points.length >= 2) { const S = samplesOf(p, 0.5); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#2a7fd0'; ctx.lineWidth = 2; ctx.beginPath(); S.forEach((q, i) => i ? ctx.lineTo(x0 + q.x * m, y0 + q.z * m) : ctx.moveTo(x0 + q.x * m, y0 + q.z * m)); ctx.stroke(); ctx.setLineDash([]); }
    p.points.forEach((q, i) => {
      const off = absLayer(p, q.y || 0) !== layer; if (off && !sel && !roadRuns(p).runs.some(r => r.layer === layer)) return;   // a point shows on the layer its height puts it on (dimmed elsewhere, so a road drawn from another layer can still be seen and joined)
      ctx.globalAlpha = off ? 0.5 : 1;
      const end = i === 0 || i === p.points.length - 1, on = sel && i === pathPt;
      ctx.fillStyle = on ? '#e67e22' : sel ? (end ? '#2a7fd0' : '#ffffff') : end ? 'rgba(42,127,208,0.55)' : 'rgba(255,255,255,0.7)'; ctx.strokeStyle = on ? '#a04000' : sel ? '#2a7fd0' : '#7a6e60'; ctx.lineWidth = 2;
      if (q.y && view.cell >= 40) { ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#7a3e10'; ctx.fillText(`+${q.y}`, x0 + q.x * m + 7, y0 + q.z * m - 5); }
      ctx.beginPath(); if (end) ctx.rect(x0 + q.x * m - (on ? 7 : sel ? 6 : 4), y0 + q.z * m - (on ? 7 : sel ? 6 : 4), (on ? 14 : sel ? 12 : 8), (on ? 14 : sel ? 12 : 8)); else ctx.arc(x0 + q.x * m, y0 + q.z * m, on ? 7 : sel ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1; });
  }
  const p = selPath();
  if (hoverM && (pathDrawing || pathNew || pathAdd || pathDrag)) {                    // where the point would go; a ring when it connects
    const g = pathAdd ? curveAt(hoverM, pxR(14) + 4) : pathDrag ? null : magnet(hoverM);
    if (pathDrawing && p && p.points.length && g) { const L = p.points[p.points.length - 1]; ctx.setLineDash([4, 4]); ctx.strokeStyle = '#2a7fd0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + L.x * m, y0 + L.z * m); ctx.lineTo(x0 + g.x * m, y0 + g.z * m); ctx.stroke(); ctx.setLineDash([]); }
    if (g) { const link = pathAdd || g.hit || g.curve || g.mouth; ctx.fillStyle = link ? '#27ae60' : '#2a7fd0'; ctx.beginPath(); ctx.arc(x0 + g.x * m, y0 + g.z * m, 4, 0, Math.PI * 2); ctx.fill();
      if (link) { ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + g.x * m, y0 + g.z * m, 10, 0, Math.PI * 2); ctx.stroke(); } }
  }
  ctx.restore();
}
function renderPathSide() {
  const p = selPath(), K = PATH_KINDS;
  side.innerHTML = `
    <h3>Paths</h3>
    <div class="ed-grid">${Object.entries(K).map(([k, t]) => `<button class="${pathKind === k ? 'on' : ''}" data-pk="${k}" title="${esc(t.text)}"><i style="background:${t.color}"></i>${esc(t.name)}</button>`).join('')}</div>
    <h3>Road paint</h3>
    <div class="ed-row"><button class="${rpaint.on ? 'on' : ''}" data-rp="toggle" title="R">${rpaint.on ? 'Painting roads (R)' : 'Paint roads (R)'}</button></div>
    ${rpaint.on ? `<div class="pp"><label class="pp-row"><span>Surface</span><select data-rpm>${[['keep', 'Leave as it is'], ...Object.entries(ROAD_MATS)].map(([v, n]) => `<option value="${v}" ${rpaint.mat === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="pp-row"><span>Bridges</span><select data-rpb>${[['keep', 'Leave as it is'], ...Object.entries(BRIDGE_STYLES)].map(([v, n]) => `<option value="${v}" ${rpaint.br === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="pp-row"><span>Brush (m)</span><input type="range" data-rpr min="1" max="15" step="1" value="${rpaint.r}"><span style="width:2em;text-align:right">${rpaint.r}</span></label></div>
      <p class="ed-help" style="margin-top:4px">Drag along a road to paint that stretch; right-drag puts it back to the road's own. Surface: cobbles, flagstones, a dirt track, gravel or wooden planks. Bridges: the style of any bridge on the stretch (Auto: stone in town and on main roads, timber in the country; None: the road follows the ground). Painted stretches show on the road.</p>` : ''}
    <h3>Selected</h3>
    ${p ? `<div class="pp">
      <label class="pp-row"><span>Road width (m)</span><input type="number" data-pp="road" min="2" max="24" step="0.5" value="${p.road}"></label>
      <label class="pp-row"><span>Pavement (m)</span><input type="number" data-pp="pave" min="0" max="6" step="0.5" value="${p.pave}"></label>
      <label class="pp-row"><span>Lamps</span><input type="checkbox" data-pp="lamps" ${p.lamps !== false ? 'checked' : ''}></label>
      <label class="pp-row" title="Drain grates, manhole covers, worn patches and cracked slabs along the road"><span>Details</span><input type="checkbox" data-pp="details" ${p.details !== false ? 'checked' : ''}></label>
      <label class="pp-row" title="A planted strip down the middle: trees in planters, lamps between (best on wide roads)"><span>Planted middle</span><input type="checkbox" data-pp="median" ${p.median ? 'checked' : ''}></label>
      <label class="pp-row" title="The whole road's surface (paint stretches with Road paint, R)"><span>Surface</span><select data-pp="mat">${Object.entries(ROAD_MATS).map(([v, n]) => `<option value="${v}" ${(p.mat || 'cobble') === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="pp-row" title="Where the road crosses water or a dip, it bridges it from crest to crest. Auto: stone in town and on main roads, timber in the country"><span>Bridges</span><select data-pp="bridgeStyle">${[['auto', 'Auto'], ['stone', 'Stone arches'], ['timber', 'Timber trestle'], ['none', 'None (follow the ground)']].map(([v, n]) => `<option value="${v}" ${(p.bridgeStyle || 'auto') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${terrainOf(d) ? `<label class="pp-row" title="Take its height from the terrain along its length (steps where it's too steep). Off: its points' heights decide."><span>Follows the ground</span><input type="checkbox" data-pfree ${p.free ? '' : 'checked'}></label>` : ''}
    </div>
    ${pathPt != null ? `<div class="pp"><label class="pp-row"><span>Point height (m)</span><input type="number" data-py min="-10" max="39.75" step="0.25" value="${p.points[pathPt].y || 0}"></label></div>` : ''}
    ${(() => { const st = profileOf(d, p).segs.filter(g => g.steps).length; return st ? `<p class="ed-help" style="margin:2px 0 0">${st} stretch${st > 1 ? 'es are' : ' is'} steeper than 1 in ${Math.round(1 / MAX_GRADE)}: built as steps.</p>` : ''; })()}
    <p class="ed-help" style="margin-top:4px">${esc(K[p.kind]?.name || p.kind)} · ${p.points.length} points · ${Math.round(samplePath(p, 1).slice(-1)[0]?.s || 0)} m long${pathPt != null ? ` · point ${pathPt + 1} selected (${p.points[pathPt].x.toFixed(1)}, ${p.points[pathPt].z.toFixed(1)})` : ''}${pathDrawing ? ' · <b>drawing</b>: click to add points' : ''}</p>
    <div class="ed-row">${pathDrawing ? '<button data-pa="done">Finish (Enter)</button>' : '<button data-pa="more" title="C">Continue (C)</button><button data-pa="rev" title="F">Flip (F)</button>'}${pathPt != null && !pathDrawing ? '<button data-pa="delpt" title="Del">Delete point</button>' : ''}<button data-pa="del" title="Shift+Del">Delete road</button></div>`
    : '<p class="ed-help" style="margin-top:0">Nothing selected. Click empty ground to start a road, or click a road to select it.</p>'}
    <div class="ed-row" style="margin-top:8px"><button class="${pathNew ? 'on' : ''}" data-pa="new" title="N">New road (N)</button><button class="${pathAdd ? 'on' : ''}" data-pa="add" title="A">Add points (A)</button></div>
    <table class="ed-keys">${[['Click empty ground', 'start a road; click on to add points'], ['Click a point', 'select it (orange); drag to move'], ['Enter · dbl-click · right-click', 'finish drawing'], ['N', 'new road (can start on another road)'], ['A / Alt+click', 'add a point on a road'], ['Shift+drag a point', 'pull a branch (a new road) out of it'], ['C', 'continue from the selected end; from a middle point, start a branch'], ['F', 'flip the road\'s direction'], ['Del', 'delete the selected point'], ['Shift+Del', 'delete the whole road'], ['Tab / Shift+Tab', 'select next / previous point'], ['Arrows', 'nudge the point 0.5 m (Shift: 0.1)'], ['= / −', 'road wider / narrower (Shift: pavement)'], ['Q / E', 'lower / raise the point 0.25 m (Shift: 1 m)'], ['L', 'lamps on / off'], ['Ctrl', 'place freely (no snapping)'], ['Esc', 'cancel / deselect'], ['P', 'back to Layout']].map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table>
    <p class="ed-help">Connecting: a point dropped on another point snaps to it (a green ring shows it'll connect). Finishing on another road's end joins the two into one road; dropping on a road's middle makes a junction. To branch off a road, Shift+drag one of its points (or select it and press C); dragging without Shift moves the point and bends its road. Roads stop at cells with a piece on this layer.</p>`;
  side.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { pathKind = b.dataset.pk; renderSide(); });
  side.querySelector('[data-rp]')?.addEventListener('click', () => { rpaint.on = !rpaint.on; if (rpaint.on && pathDrawing) finishPath(); renderSide(); draw(); });
  side.querySelector('[data-rpm]')?.addEventListener('change', e => { rpaint.mat = e.target.value; });
  side.querySelector('[data-rpb]')?.addEventListener('change', e => { rpaint.br = e.target.value; });
  side.querySelector('[data-rpr]')?.addEventListener('input', e => { rpaint.r = +e.target.value; e.target.nextElementSibling.textContent = rpaint.r; draw(); });
  side.querySelector('[data-py]')?.addEventListener('change', e => { const q = selPath(); if (q && pathPt != null) { snapshot(); freeRoad(q); withY(q.points[pathPt], +e.target.value || 0); settleRoad(q); pChanged(); } });
  side.querySelector('[data-pfree]')?.addEventListener('change', e => { const q = selPath(); if (!q) return; snapshot(); if (e.target.checked) delete q.free; else freeRoad(q); settleRoad(q); pChanged(); });
  side.querySelectorAll('[data-pp]').forEach(el => el.onchange = () => { const q = selPath(); if (!q) return; snapshot(); const k = el.dataset.pp; q[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Math.max(+el.min, Math.min(+el.max, +el.value || 0)); dirty = true; renderTop(); renderSide(); draw(); });
  side.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => {
    const a = b.dataset.pa, q = selPath();
    if (a === 'new' || a === 'add') return pathKey({ preventDefault() {}, shiftKey: false }, a === 'new' ? 'KeyN' : 'KeyA');
    if (!q) return;
    if (a === 'done') finishPath();
    else if (a === 'more') continueFrom(q, pathPt != null ? pathPt : q.points.length - 1);
    else if (a === 'delpt') { if (pathPt != null) removePoint(q, pathPt); }
    else if (a === 'rev') { snapshot(); reversePoints(q.points); dirty = true; renderSide(); draw(); }
    else if (a === 'del') { snapshot(); d.paths = pathsOf(d).filter(x => x !== q); select(null); pathDrawing = false; pChanged(); }
  });
}

const settledMaps = new WeakSet();
function renderAll() {
  notePaths();
  if (terrainOf(d) && !settledMaps.has(d)) { settledMaps.add(d); const before = JSON.stringify(d.cells); resettleGround(); if (JSON.stringify(d.cells) !== before) dirty = true; }   // a map opened: its tiles settle onto the ground and roads as they are now
  themeGroup = groupOfTheme(d, brush.theme); if (selected && !allObjs().some(o => o.id === selected)) { selected = null; patrolEdit = null; } renderTop(); renderSide(); renderLayers(); fit(); updateStatus(); }
// put the middle of what's built (on this layer, or anywhere) in the middle of the view
function centerView() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  eachPiece(d, (p, x, y, l) => { if (l > layer || l + p.height <= layer) return; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); });
  if (!isFinite(x0)) eachPiece(d, (p, x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); });
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = d.w; y1 = d.h; }
  const r = mainEl.getBoundingClientRect();
  view.ox = r.width / 2 - (x0 + x1) / 2 * view.cell; view.oy = r.height / 2 - (y0 + y1) / 2 * view.cell; draw();
}
// start with the last dungeon worked on, if any
{ const all = loadAll(), last = localStorage.getItem(STORE + '.last'); if (last && all[last]) d = all[last]; }
window.eldermereDungeon = { get dungeon() { return d; }, set dungeon(x) { d = x; renderAll(); }, setLayer, setMode, brush, view, centerView,
  selectPiece(x, y, l) { pieceSel = { x, y, l }; tool = 'select'; renderSide(); draw(); }, pieceAct: (a, v) => selPieceAct(a, v), movePiece: (x, y) => movePiece(x, y), roadsChanged: () => { dirty = true; roadsDone(); } };   // (tests and tools)
renderAll(); centerView();
