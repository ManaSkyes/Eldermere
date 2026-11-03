// src/game/input.js — actions, rebindable keys and mouse look.
//
// Game code asks about actions ('forward', 'jump'), never keys, so every binding can be changed.
// Bindings save in the browser. Codes are KeyboardEvent.code values ('KeyW', 'Space', 'ShiftLeft')
// or mouse buttons ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right).
// Escape always releases the mouse in a browser; it opens the pause menu and can't be rebound.
//
// Browser shortcuts (Ctrl+W closes the tab, Ctrl+T, Ctrl+N...) can't be blocked by an ordinary page.
// In fullscreen, Chrome and Edge let a game claim those keys with the Keyboard Lock API, so playing
// goes fullscreen by default (the Fullscreen setting). Outside fullscreen the game blocks every
// shortcut the browser allows it to (Ctrl+S, Ctrl+D, Alt menus...), and play.js asks before the page
// closes, so a stray Ctrl+W asks "Leave site?" instead of losing the game.

export const ACTIONS = {
  forward:  { name: 'Move forward',  keys: ['KeyW', 'ArrowUp'] },
  back:     { name: 'Move back',     keys: ['KeyS', 'ArrowDown'] },
  left:     { name: 'Strafe left',   keys: ['KeyA', 'ArrowLeft'] },
  right:    { name: 'Strafe right',  keys: ['KeyD', 'ArrowRight'] },
  jump:     { name: 'Jump',          keys: ['Space'] },
  sprint:   { name: 'Sprint',        keys: ['ShiftLeft'] },
  crouch:   { name: 'Crouch',        keys: ['ControlLeft', 'KeyC'] },
  walk:     { name: 'Walk (hold)',   keys: ['CapsLock'] },
  attack:   { name: 'Attack',        keys: ['Mouse0'] },
  block:    { name: 'Block / aim',   keys: ['Mouse2'] },
  interact: { name: 'Interact',      keys: ['KeyE'] },
  draw:     { name: 'Draw / sheathe', keys: ['KeyR'] },
  sit:      { name: 'Sit / stand',   keys: ['KeyX'] },
  dodge:    { name: 'Dodge roll',    keys: ['AltLeft'] },
  view:     { name: 'Third-person view', keys: ['KeyM'] },
  vanish:   { name: 'Vanish (Sneak, crouched)', keys: ['KeyV'] },
  checkpoint: { name: 'Back to checkpoint', keys: ['KeyT'] },
  resetPose: { name: 'Reset your pose (if the body gets twisted)', keys: ['KeyK'] },
  spellWheel: { name: 'Spell wheel (hold, move the mouse to pick)', keys: ['KeyQ'] },
  nextSpell:{ name: 'Ready the next spell', keys: ['KeyZ'] },
  inventory:{ name: 'Inventory',     keys: ['Tab', 'KeyI'] },
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`hotbar${i + 1}`, { name: `Hotbar slot ${i + 1}`, keys: [`Digit${i + 1}`] }])),
};
const STORE = 'eldermere.keys';
export const SETTINGS_STORE = 'eldermere.settings';
export const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, fov: 75, toggleCrouch: false, toggleSprint: false, renderScale: 1, shadows: true, headBob: 1, fullscreen: true, reflections: 'planar' };
// keys claimed from the browser in fullscreen: every letter, digit, modifier and punctuation key (never Escape)
const LOCK_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => 'Key' + c).concat([...'0123456789'].map(d => 'Digit' + d),
  ['Tab', 'Space', 'Enter', 'CapsLock', 'Backspace', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
   'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F3', 'F6', 'F7']);

export function loadBindings() {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { /* storage unavailable */ }
  return Object.fromEntries(Object.entries(ACTIONS).map(([a, d]) => [a, saved?.[a] ?? [...d.keys]]));
}
export function saveBindings(b) { try { localStorage.setItem(STORE, JSON.stringify(b)); } catch { /* storage unavailable */ } }
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_STORE)) || {}) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_STORE, JSON.stringify(s)); } catch { /* storage unavailable */ } }

// A readable name for a code: 'KeyW' -> 'W', 'ShiftLeft' -> 'Left Shift', 'Mouse2' -> 'Right mouse'
export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const special = { Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Space: 'Space', Tab: 'Tab',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter', Backquote: '`', CapsLock: 'Caps Lock' };
  if (special[code]) return special[code];
  const m = code.match(/^(Shift|Control|Alt|Meta)(Left|Right)$/);
  if (m) return `${m[2]} ${{ Control: 'Ctrl', Meta: 'Win' }[m[1]] || m[1]}`;
  return code;
}

// Live input state for a canvas. Mouse look works while the pointer is locked.
export function createInput(canvas, opts = {}) {
  let bindings = loadBindings();
  const down = new Set(), pressed = new Set();
  const look = { dx: 0, dy: 0 };
  let locked = false, capture = null;
  const listeners = { lock: [], unlock: [] };

  const onKey = (e, isDown) => {
    if (capture && isDown) { e.preventDefault(); if (e.code !== 'Escape') capture(e.code); capture = null; return; }
    if (!locked) return;
    // keep the browser from acting on game keys (Tab focus, Space scroll, Ctrl shortcuts we can block)
    if (isBound(e.code) || e.code === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
    if (isDown) { if (!down.has(e.code)) pressed.add(e.code); down.add(e.code); } else down.delete(e.code);
  };
  const isBound = code => Object.values(bindings).some(list => list.includes(code));
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  const md = e => {
    const code = 'Mouse' + e.button;
    if (capture) { e.preventDefault(); capture(code); capture = null; return; }
    if (!locked) return;
    if (!down.has(code)) pressed.add(code); down.add(code);
  };
  const mu = e => down.delete('Mouse' + e.button);
  const mm = e => { if (locked) { look.dx += e.movementX; look.dy += e.movementY; } };
  const ctx = e => { if (locked) e.preventDefault(); };
  const plc = () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) down.clear();
    (locked ? listeners.lock : listeners.unlock).forEach(f => f());
  };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('mousemove', mm);
  addEventListener('contextmenu', ctx); document.addEventListener('pointerlockchange', plc);
  addEventListener('blur', () => down.clear());

  return {
    held: action => bindings[action]?.some(k => down.has(k)) ?? false,
    pressed: action => bindings[action]?.some(k => pressed.has(k)) ?? false,
    takeLook() { const l = { dx: look.dx, dy: look.dy }; look.dx = look.dy = 0; return l; },
    endFrame() { pressed.clear(); },
    get locked() { return locked; },
    lock() {
      const pointer = () => { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => canvas.requestPointerLock()); };   // raw input where supported
      const host = opts.root || canvas;
      if (opts.fullscreen?.() && !document.fullscreenElement && host.requestFullscreen) {
        host.requestFullscreen({ navigationUI: 'hide' })
          .then(() => navigator.keyboard?.lock?.(LOCK_KEYS)).catch(() => {})
          .finally(pointer);
      } else { if (document.fullscreenElement) navigator.keyboard?.lock?.(LOCK_KEYS)?.catch?.(() => {}); pointer(); }
    },
    // release the mouse (pause, menus); fullscreen stays until leaving the game
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    get keysClaimed() { return !!document.fullscreenElement && !!navigator.keyboard?.lock; },
    on(type, fn) { listeners[type]?.push(fn); },
    get bindings() { return bindings; },
    // rebinding: the next key or mouse button pressed is bound to slot `i` of `action`
    rebind(action, i, done) {
      capture = code => {
        for (const [a, list] of Object.entries(bindings)) bindings[a] = list.map(k => (k === code && !(a === action) ? null : k)).filter(Boolean);   // a key does one thing
        const list = [...(bindings[action] || [])]; list[i] = code; bindings[action] = list.filter(Boolean);
        saveBindings(bindings); done?.(code);
      };
    },
    resetBindings() { bindings = Object.fromEntries(Object.entries(ACTIONS).map(([a, d]) => [a, [...d.keys]])); saveBindings(bindings); },
    dispose() {
      navigator.keyboard?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('mousemove', mm);
      removeEventListener('contextmenu', ctx); document.removeEventListener('pointerlockchange', plc);
    },
  };
}
