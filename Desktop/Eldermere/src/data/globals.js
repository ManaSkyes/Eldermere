// src/data/globals.js — a map's global settings (the creator's Global tab): its sky, fog, light, torches,
// weather and a few core rules. Saved in the map as `globals` (only what differs from the defaults is kept).
//
// `live` fields already change the game in the play test; the rest are stored for when their systems exist.
// Outdoors, the sky, sun, ambient light and fog come from the time of day (src/gfx/sky.js); the 'Sky and fog' and
// 'Area lighting' fields are for maps underground or indoors (fixed light).

export const GLOBAL_SECTIONS = [
  { name: 'Setting', fields: [
    { key: 'kind', name: 'Kind of place', type: 'select', options: [['underground', 'Underground'], ['indoor', 'Indoors (a building)'], ['outdoor', 'Outdoors']], live: true },
  ] },
  { name: 'Sky and fog', fields: [
    { key: 'background', name: 'Background', type: 'color', live: true },
    { key: 'fogColor', name: 'Fog colour', type: 'color', live: true },
    { key: 'fogNear', name: 'Fog starts (m)', type: 'number', min: 0, max: 500, step: 1, live: true },
    { key: 'fogFar', name: 'Fog ends (m)', type: 'number', min: 1, max: 1000, step: 1, live: true },
    { key: 'view', name: 'View distance (m)', type: 'number', min: 10, max: 1000, step: 5, live: true, help: 'Nothing past this is drawn: keep it a little past the fog for speed.' },
  ] },
  { name: 'Time of day (outdoors)', fields: [
    { key: 'hour', name: 'Hour (start)', type: 'number', min: 0, max: 24, step: 0.5, live: true, when: g => g.kind === 'outdoor', help: 'The day has eight looks: night, before dawn (4:30), dawn (6), morning (8:30), noon (11:30), afternoon (15), dusk (18), evening (20). Lamps burn from dusk to dawn.' },
    { key: 'timeCycle', name: 'Time passes', type: 'check', live: true, when: g => g.kind === 'outdoor' },
    { key: 'dayMinutes', name: 'A day lasts (real minutes)', type: 'number', min: 1, max: 600, step: 1, live: true, when: g => g.kind === 'outdoor' && g.timeCycle },
    { key: 'phaseBlend', name: 'Change between looks (s)', type: 'number', min: 0, max: 300, step: 1, live: true, when: g => g.kind === 'outdoor', help: 'How long the light takes to ease from one look of the day to the next.' },
  ] },
  { name: 'Area lighting', fields: [
    { key: 'ambient', name: 'Ambient light', type: 'color', live: true },
    { key: 'ambientGround', name: 'Light from below', type: 'color', live: true },
    { key: 'ambientStrength', name: 'Ambient strength', type: 'number', min: 0, max: 2, step: 0.005, live: true, help: 'How much unlit stone shows. 0.035: near black; 0.3: dim; 0.55: daylight.' },
    { key: 'sun', name: 'Sun or moon', type: 'check', live: true },
    { key: 'sunColor', name: 'Its colour', type: 'color', live: true, when: g => g.sun },
    { key: 'sunStrength', name: 'Its strength', type: 'number', min: 0, max: 4, step: 0.05, live: true, when: g => g.sun },
    { key: 'hour', name: 'Time of day (h)', type: 'number', min: 0, max: 24, step: 0.5, live: true, when: g => g.sun && g.kind !== 'outdoor', help: 'Where the sun sits: 6 sunrise, 12 overhead, 18 sunset.' },
    { key: 'shadows', name: 'Sun shadows', type: 'check', live: true, when: g => g.sun },
  ] },
  { name: 'Look', fields: [
    { key: 'bloom', name: 'Glow strength', type: 'number', min: 0, max: 3, step: 0.05, live: true, help: 'How much fires, crystals and bright light bloom. 0: none.' },
    { key: 'grade', name: 'Colour grade', type: 'select', options: [['warm', 'Warm'], ['neutral', 'Neutral'], ['cool', 'Cool'], ['dusk', 'Dusk'], ['none', 'None']], live: true },
  ] },
  { name: 'Torches', fields: [
    { key: 'torchColor', name: 'Torch light colour', type: 'color', live: true },
    { key: 'torchBright', name: 'Brightness ×', type: 'number', min: 0, max: 5, step: 0.05, live: true },
    { key: 'torchRange', name: 'Reach ×', type: 'number', min: 0.2, max: 4, step: 0.05, live: true },
    { key: 'lights', name: 'Real lights at once', type: 'number', min: 2, max: 24, step: 1, live: true, help: 'How many torches near you actually light. More looks richer and costs frame rate.' },
  ] },
  { name: 'Clouds and weather', fields: [
    { key: 'weather', name: 'Weather', type: 'select', live: true, when: g => g.kind === 'outdoor', options: [['clear', 'Clear'], ['cloudy', 'Cloudy'], ['drizzle', 'Drizzle'], ['rain', 'Rain'], ['downpour', 'Downpour'], ['storm', 'Thunderstorm'], ['flurries', 'Snow flurries'], ['snow', 'Snow'], ['heavysnow', 'Heavy snow'], ['blizzard', 'Blizzard'], ['sleet', 'Sleet'], ['fog', 'Fog'], ['sandstorm', 'Sandstorm'], ['duststorm', 'Dust storm'], ['windstorm', 'Windstorm'], ['magic_low', 'Magic flare-up (low)'], ['magic_medium', 'Magic flare-up (medium)'], ['magic_high', 'Magic flare-up (high)'], ['magic', 'Magic flare-up (strength below)']], help: 'What the map starts with. Each brings its own clouds, wind and fog unless you set them below (src/gfx/weather.js; try them in sky-lab.html).' },
    { key: 'clouds', name: 'Clouds', type: 'select', live: true, when: g => g.kind === 'outdoor', options: [['auto', 'With the weather'], ['clear', 'Clear'], ['cirrus', 'High streaks'], ['scattered', 'Scattered'], ['cumulus', 'Big heaps'], ['broken', 'Broken'], ['overcast', 'Overcast'], ['stratus', 'Low grey sheet'], ['storm', 'Storm clouds'], ['magic', 'Magic']] },
    { key: 'cloudCover', name: 'Cloud cover (%)', type: 'number', min: 0, max: 100, step: 1, live: true, when: g => g.kind === 'outdoor' && g.clouds && g.clouds !== 'auto' },
    { key: 'windAuto', name: 'Wind with the weather', type: 'check', live: true, when: g => g.kind === 'outdoor' },
    { key: 'windStrength', name: 'Wind strength (%)', type: 'number', min: 0, max: 200, step: 1, live: true, when: g => g.kind === 'outdoor' && g.windAuto === false, help: '25 a breeze; 50 windy; 100 a gale; 200 a storm.' },
    { key: 'fogLevel', name: 'Fog', type: 'select', live: true, when: g => g.kind === 'outdoor', options: [['auto', 'With the weather'], ['thin', 'Thin'], ['normal', 'Normal'], ['thick', 'Thick (right round you)'], ['custom', 'Custom thickness']] },
    { key: 'aurora', name: 'Aurora', type: 'select', live: true, when: g => g.kind === 'outdoor', options: [['auto', 'With the weather'], ['off', 'Never'], ['on', 'Every night']], help: 'With the weather: in a magic flare-up of medium strength or more, and some snowy nights.' },
    { key: 'fogThickness', name: 'Fog thickness (%)', type: 'number', min: 10, max: 400, step: 5, live: true, when: g => g.kind === 'outdoor' && g.fogLevel === 'custom', help: '50 is the map\'s own fog; 25 thin; 200 thick; 400 very thick.' },
    { key: 'weatherStrength', name: 'Strength (%)', type: 'number', min: 0, max: 150, step: 1, live: true, when: g => g.kind === 'outdoor' && g.weather !== 'clear' && !String(g.weather).startsWith('magic_'), help: '50 is normal; 100 heavy; 150 extreme. A magic flare-up: 25 low (motes), 50 medium (and auroras, arcs), 75+ high (and floating rocks; spells grow crystals).' },
    { key: 'tempAuto', name: 'Temperature with the weather', type: 'check', live: true, when: g => g.kind === 'outdoor', help: 'Rain about 10°C, snow below freezing, a clear day 17°C, a sandstorm 33°C.' },
    { key: 'temperature', name: 'Temperature (°C)', type: 'number', min: -30, max: 50, step: 1, live: true, when: g => g.kind === 'outdoor' && g.tempAuto === false, help: 'How fast rain dries and snow melts (and whether snow can lie at all: below about 2°C). Warm and sunny dries a street in a minute or two; near freezing it stays wet for ages; snow never melts below 0.' },
    { key: 'windDir', name: 'Wind from (°)', type: 'number', min: 0, max: 359, step: 5, live: true, when: g => g.kind === 'outdoor', help: '0 north, 90 east… (how hard it blows comes with the weather)' },
  ] },
  { name: 'Rules', fields: [
    { key: 'gravity', name: 'Gravity ×', type: 'number', min: 0.1, max: 3, step: 0.05, live: true },
    { key: 'respawn', name: 'When you fall', type: 'select', options: [['checkpoint', 'Back to the last checkpoint'], ['start', 'Back to the start']], live: true },
    { key: 'music', name: 'Default music', type: 'text', help: 'Plays where no music area does (a name for now).' },
    { key: 'ambience', name: 'Default ambience', type: 'text' },
  ] },
];

export const DEFAULT_GLOBALS = {
  kind: 'underground', background: '#000000', fogColor: '#000000', fogNear: 4, fogFar: 30, view: 45,
  ambient: '#6a6258', ambientGround: '#1a1714', ambientStrength: 0.035, sun: false, sunColor: '#fff1d6', sunStrength: 1.25, hour: 14, shadows: true, timeCycle: true, dayMinutes: 24, phaseBlend: 20,
  torchColor: '#ffaa60', torchBright: 1, torchRange: 1, lights: 12, bloom: 0.8, grade: 'warm',
  weather: 'clear', weatherStrength: 50, windDir: 270, windSpeed: 2, clouds: 'auto', cloudCover: 50, windAuto: true, windStrength: 50, fogAuto: true, fogLevel: 'auto', tempAuto: true, temperature: 15, fogThickness: 50, aurora: 'auto',
  gravity: 1, respawn: 'checkpoint', music: '', ambience: '',
};

// one-click starting points (they set these fields, leaving the rest)
export const GLOBAL_PRESETS = {
  'Dark dungeon': { kind: 'underground', background: '#000000', fogColor: '#000000', fogNear: 4, fogFar: 30, view: 45, ambient: '#6a6258', ambientGround: '#1a1714', ambientStrength: 0.035, sun: false, torchBright: 1, lights: 12, bloom: 0.8, grade: 'warm' },
  'Lit halls': { kind: 'underground', background: '#050403', fogColor: '#0a0806', fogNear: 10, fogFar: 60, view: 70, ambient: '#8a7a68', ambientGround: '#2a241e', ambientStrength: 0.18, sun: false, torchBright: 1.2, lights: 14 },
  'Moody ruins (readable)': { kind: 'underground', background: '#06060e', fogColor: '#0c0c1c', fogNear: 8, fogFar: 45, view: 55, ambient: '#6a6aa8', ambientGround: '#1c1626', ambientStrength: 0.14, sun: false, torchBright: 1.15, bloom: 0.9, grade: 'dusk' },
  'Damp cave': { kind: 'underground', background: '#020405', fogColor: '#0b1214', fogNear: 3, fogFar: 24, view: 35, ambient: '#5a6a6e', ambientGround: '#101618', ambientStrength: 0.05, sun: false, torchColor: '#ffb070', torchBright: 0.9 },
  'Day, outdoors': { kind: 'outdoor', background: '#9fc3e6', fogColor: '#b9d3ea', fogNear: 40, fogFar: 110, view: 300, ambient: '#dbe9ff', ambientGround: '#5d6b4a', ambientStrength: 0.55, sun: true, sunColor: '#fff1d6', sunStrength: 1.25, hour: 14, shadows: true, timeCycle: true, dayMinutes: 24, phaseBlend: 20, clouds: 30 },
  'Night, outdoors': { kind: 'outdoor', background: '#0a0f1e', fogColor: '#0d1324', fogNear: 15, fogFar: 70, view: 120, ambient: '#3a4a70', ambientGround: '#0d1018', ambientStrength: 0.12, sun: true, sunColor: '#9fb4ff', sunStrength: 0.25, hour: 22, shadows: true, clouds: 20 },
};

export const globalsOf = d => ({ ...DEFAULT_GLOBALS, ...(d?.globals || {}) });
// where the sun is for an hour of the day (a unit-ish vector from the ground toward it)
export function sunDirection(hour) {
  const a = (hour - 6) / 12 * Math.PI, up = Math.sin(a);
  return { x: Math.cos(a) * 0.8, y: Math.max(0.08, up), z: 0.35 };
}

// What a new map starts as (the creator's New dialog): a kind of place, then a flavour. Each sets the map's
// global settings (on top of the defaults), the theme to paint with, and a name.
const G = (o) => o;
export const MAP_PRESETS = {
  overworld: { name: 'Overworld', text: 'The hub: the land outside, the town, its streets.', theme: 'O', subs: {
    day: { name: 'Outer area, day', theme: 'O', globals: G({ kind: 'outdoor', background: '#9fc3e6', fogColor: '#c4d8ea', fogNear: 60, fogFar: 220, view: 300, ambient: '#dbe9ff', ambientGround: '#5d6b4a', ambientStrength: 0.55, sun: true, sunColor: '#fff1d6', sunStrength: 1.25, hour: 13, shadows: true, clouds: 35, bloom: 0.45, grade: 'warm' }) },
    dusk: { name: 'Outer area, dusk', theme: 'O', globals: G({ kind: 'outdoor', background: '#e0a080', fogColor: '#c89080', fogNear: 40, fogFar: 160, view: 250, ambient: '#d0a0b0', ambientGround: '#4a3a3a', ambientStrength: 0.35, sun: true, sunColor: '#ffb070', sunStrength: 0.9, hour: 18.5, shadows: true, clouds: 45, bloom: 0.7, grade: 'dusk' }) },
    night: { name: 'Outer area, night', theme: 'O', globals: G({ kind: 'outdoor', background: '#0a0f1e', fogColor: '#0d1324', fogNear: 15, fogFar: 80, view: 140, ambient: '#3a4a70', ambientGround: '#0d1018', ambientStrength: 0.12, sun: true, sunColor: '#9fb4ff', sunStrength: 0.25, hour: 22, shadows: true, clouds: 20, bloom: 0.8, grade: 'cool' }) },
    town: { name: 'Town, day', theme: 'T', globals: G({ kind: 'outdoor', background: '#a8c8e6', fogColor: '#d0dde8', fogNear: 50, fogFar: 180, view: 260, ambient: '#e8ecff', ambientGround: '#6a5a48', ambientStrength: 0.55, sun: true, sunColor: '#fff0d0', sunStrength: 1.2, hour: 11, shadows: true, clouds: 25, bloom: 0.45, grade: 'warm' }) },
    townEvening: { name: 'Town, evening (lamps lit)', theme: 'T', globals: G({ kind: 'outdoor', background: '#2a2440', fogColor: '#3a3048', fogNear: 25, fogFar: 110, view: 160, ambient: '#7a6a9a', ambientGround: '#2a2020', ambientStrength: 0.2, sun: true, sunColor: '#c0a0ff', sunStrength: 0.35, hour: 20, shadows: true, torchBright: 1.3, lights: 16, bloom: 0.9, grade: 'dusk' }) },
  } },
  interior: { name: 'Interior', text: 'Inside a building: houses, shops, the tavern.', theme: 'H', subs: {
    house: { name: 'House, daytime', theme: 'H', globals: G({ kind: 'indoor', background: '#1a140e', fogColor: '#2a2018', fogNear: 20, fogFar: 60, view: 70, ambient: '#d8c0a0', ambientGround: '#4a3a2a', ambientStrength: 0.35, sun: false, torchBright: 1, lights: 10, bloom: 0.6, grade: 'warm' }) },
    tavern: { name: 'Tavern (firelit)', theme: 'H', globals: G({ kind: 'indoor', background: '#120a06', fogColor: '#1e140c', fogNear: 14, fogFar: 50, view: 60, ambient: '#a07850', ambientGround: '#2a1a10', ambientStrength: 0.18, sun: false, torchColor: '#ffa050', torchBright: 1.3, lights: 14, bloom: 1.0, grade: 'warm' }) },
    cellar: { name: 'Cellar / storeroom', theme: 'H', globals: G({ kind: 'indoor', background: '#050403', fogColor: '#0a0806', fogNear: 6, fogFar: 32, view: 45, ambient: '#6a6258', ambientGround: '#1a1714', ambientStrength: 0.06, sun: false, torchBright: 1, lights: 10, bloom: 0.8, grade: 'warm' }) },
  } },
  inside: { name: 'Inside dungeon', text: 'Underground: crypts, caves, ruins, frozen and burning depths.', theme: 'D', subs: {
    dark: { name: 'Dark dungeon (the deepest places)', theme: 'D', globals: G(GLOBAL_PRESETS['Dark dungeon']) },
    moody: { name: 'Moody ruins (readable)', theme: 'R', globals: G(GLOBAL_PRESETS['Moody ruins (readable)']) },
    halls: { name: 'Lit halls', theme: 'D', globals: G(GLOBAL_PRESETS['Lit halls']) },
    cave: { name: 'Damp cave', theme: 'C', globals: G(GLOBAL_PRESETS['Damp cave']) },
    ice: { name: 'Ice cavern', theme: 'I', globals: G({ kind: 'underground', background: '#04080e', fogColor: '#0e1a26', fogNear: 6, fogFar: 40, view: 50, ambient: '#7aa0c8', ambientGround: '#1a2a3a', ambientStrength: 0.12, sun: false, torchColor: '#c0e0ff', torchBright: 1, bloom: 1.0, grade: 'cool' }) },
    fire: { name: 'Fire depths', theme: 'F', globals: G({ kind: 'underground', background: '#0e0402', fogColor: '#2a0e06', fogNear: 6, fogFar: 40, view: 50, ambient: '#c0603a', ambientGround: '#3a1008', ambientStrength: 0.14, sun: false, torchColor: '#ff8030', torchBright: 1.2, bloom: 1.2, grade: 'warm' }) },
  } },
  outside: { name: 'Outside dungeon', text: 'Dungeons under the sky: overgrown jungle temples, swamps, canyons.', theme: 'J', subs: {
    jungle: { name: 'Jungle, day', theme: 'J', globals: G({ kind: 'outdoor', background: '#a8c8b0', fogColor: '#9ab8a0', fogNear: 20, fogFar: 90, view: 140, ambient: '#c8e0b0', ambientGround: '#3a4a2a', ambientStrength: 0.45, sun: true, sunColor: '#fff0c0', sunStrength: 1.1, hour: 12, shadows: true, clouds: 40, bloom: 0.6, grade: 'warm' }) },
    swamp: { name: 'Swamp, dusk', theme: 'S', globals: G({ kind: 'outdoor', background: '#6a7060', fogColor: '#5a6450', fogNear: 8, fogFar: 55, view: 80, ambient: '#9aa080', ambientGround: '#2a2a1a', ambientStrength: 0.28, sun: true, sunColor: '#ffc080', sunStrength: 0.6, hour: 18, shadows: true, clouds: 70, weather: 'rain', weatherStrength: 30, bloom: 0.7, grade: 'dusk' }) },
    canyon: { name: 'Canyon, afternoon', theme: 'K', globals: G({ kind: 'outdoor', background: '#e8c8a0', fogColor: '#e0b890', fogNear: 60, fogFar: 240, view: 300, ambient: '#ffe0c0', ambientGround: '#7a4a2a', ambientStrength: 0.5, sun: true, sunColor: '#ffe0b0', sunStrength: 1.4, hour: 15.5, shadows: true, clouds: 10, weather: 'dust', weatherStrength: 20, bloom: 0.5, grade: 'warm' }) },
  } },
};
