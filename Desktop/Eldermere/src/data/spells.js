// src/data/spells.js — spell definitions. Spells are designed one at a time as the game needs them;
// the three below are generic examples for testing the system, not lore.
//
// id, name, school (a magic skill in stats.js), difficulty 0..100, power 0..100,
// mana (base cost), castTime (seconds, spoken incantation at Incantation 100), description,
// backfire: what goes wrong, in the spell's own terms (a fireball explodes in the caster's face;
// a body-shaping spell shapes the wrong thing). Severity scales with power.
//
// Mana guide: difficulty 0 costs 0-50; difficulty 10 costs 10,000 or more. Mages are meant to cast
// mastered spells as constantly as a warrior swings a sword, so MP is meant to grow huge.
const spell = (id, name, school, difficulty, power, mana, castTime, description, backfire) =>
  ({ id, name, school, difficulty, power, mana, castTime, description, backfire });

export const SPELLS = {
  exampleLight: spell('exampleLight', 'Light (example)', 'light', 0, 0, 2, 1.5,
    'A small floating light. Safe enough to teach children.',
    { kind: 'fizzle', text: 'A harmless flash that leaves spots in your eyes.' }),
  // ---- fire: the first combat school. SPELL_CAST below says how the game throws each one
  // (src/game/spellcast.js): kind 'bolt' (fast and straight) or 'ball' (slower, bursts on impact); speed (m/s); damage (at
  //   power 1, full mastery, Fire 100, Mind 100); radius (a burst's reach, m); burn (damage a second while
  //   burning, and for how long); size and color of the flame
  fireBolt: spell('fireBolt', 'Fire bolt', 'fire', 1, 2, 8, 1.4,
    'A quick dart of flame thrown from the palm. It sets what it hits burning.',
    { kind: 'explode', text: 'The bolt bursts in your hand.' }),
  fireball: spell('fireball', 'Fireball', 'fire', 3, 4, 26, 2.6,
    'A roiling ball of fire that bursts on impact, burning everything near it.',
    { kind: 'explode', text: 'The fireball bursts before it leaves your hands.' }),
  exampleStoneWall: spell('exampleStoneWall', 'Stone wall (example)', 'earth', 4, 4, 30, 4,
    'Raises a wall of earth and stone.',
    { kind: 'misshape', text: 'The ground heaves under your own feet instead.' }),
};

// how each combat spell behaves when thrown (see src/game/spellcast.js)
export const SPELL_CAST = {
  fireBolt: { kind: 'bolt', speed: 26, damage: 7, burn: { dps: 1.5, seconds: 3 }, size: 0.12, color: '#ff8a2a' },
  fireball: { kind: 'ball', speed: 15, damage: 9, radius: 2.6, burn: { dps: 2.5, seconds: 4 }, size: 0.28, color: '#ff6a1a' },
};
