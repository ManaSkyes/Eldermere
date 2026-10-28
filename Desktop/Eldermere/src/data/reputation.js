// src/data/reputation.js — standing with each city and town.
//
// Reputation runs from -1000 to 1000 per place, starting at 0 (Neutral). Deeds there move it: quests,
// trade, crimes. Each tier brings benefits or penalties. Prices stack with Bartering, which is
// the player's own haggling skill.
//   priceMod: what you pay (and the inverse of what you're offered) — 0.9 is 10% cheaper
//   guards:   how the watch treats you;  access: what opens or closes
//
// Places are the ones named in the book and world notes so far (docs/WORLD.md); add more as they're built.

export const REP_RANGE = { min: -1000, max: 1000 };

export const REP_TIERS = [
  { id: 'hated',      name: 'Hated',      min: -1000, priceMod: null, guards: 'attack on sight', perks: 'Shops refuse you. The gates are closed to you.' },
  { id: 'hostile',    name: 'Hostile',    min: -600,  priceMod: 1.4,  guards: 'hostile', perks: 'Prices +40%. Guards confront you; most guilds turn you away.' },
  { id: 'unfriendly', name: 'Unfriendly', min: -300,  priceMod: 1.15, guards: 'watchful', perks: 'Prices +15%. Guards keep an eye on you; fewer quests offered.' },
  { id: 'neutral',    name: 'Neutral',    min: -50,   priceMod: 1,    guards: 'indifferent', perks: 'Ordinary prices and quests.' },
  { id: 'friendly',   name: 'Friendly',   min: 50,    priceMod: 0.95, guards: 'friendly', perks: 'Prices −5%. Locals share rumors and small favors.' },
  { id: 'honored',    name: 'Honored',    min: 300,   priceMod: 0.9,  guards: 'friendly', perks: 'Prices −10%. Guild quests and better stock open up.' },
  { id: 'revered',    name: 'Revered',    min: 600,   priceMod: 0.85, guards: 'respectful', perks: 'Prices −15%. Housing for sale; minor offenses forgiven.' },
  { id: 'exalted',    name: 'Exalted',    min: 900,   priceMod: 0.8,  guards: 'salute you', perks: 'Prices −20%. A citizen\'s rights: rare stock, council favors.' },
];

export const PLACES = {
  eldermere:    { name: 'Eldermere', kind: 'City', note: 'The city at the center of the world, built where a cataclysm struck; the center of trade on the continent.' },
  thalrendor:   { name: 'Thalrendor', kind: 'City', note: "Eldermere's rival capital." },
  athalond:     { name: 'Athalond', kind: 'City', note: 'The shadow elf capital, a mercenary city. Zephyr\'s home.' },
  selunesGrace: { name: "Selune's Grace", kind: 'Town', note: 'A peaceful town devoted to the Moon Goddess, Lyrisia.' },
  faldale:      { name: 'Faldale', kind: 'Town', note: '' },
  crystalCove:  { name: 'Crystal Cove', kind: 'Town', note: 'A small town where piscine and other races live peacefully.' },
};

export function repTier(value = 0) {
  let t = REP_TIERS[0];
  for (const x of REP_TIERS) if (value >= x.min) t = x;
  return t;
}
// progress through the current tier, 0..1
export function repProgress(value = 0) {
  const i = REP_TIERS.indexOf(repTier(value)), lo = REP_TIERS[i].min, hi = REP_TIERS[i + 1]?.min ?? REP_RANGE.max;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}
export function changeRep(c, place, delta) {
  c.reputation ??= {};
  c.reputation[place] = Math.max(REP_RANGE.min, Math.min(REP_RANGE.max, (c.reputation[place] ?? 0) + delta));
  return c.reputation[place];
}
