// src/rpg/combos.js — weapon combos: every weapon starts with a 2-hit chain that grows with its skill.
//
// Length at full skill (5000): light weapons 10 · one-handers 8 · polearms and staves 6 · the greatsword 5 · great axes
// and warhammers 4. The growth is front-loaded (a square-root-ish curve): the first extra hits come quickly.
// Three kinds of chain:
//   light   tap, tap, tap...: the light moves in order (forehand, backhand, thrust, rising cut, sweep...), slightly faster
//           and harder as the chain goes on; the last hit is a finisher
//   heavy   hold, hold...: the heavy moves (overhead, sweep, rising), about half as long as the light chain
//   mixed   a heavy press during a light chain branches it: step N's own heavy move (a launcher, a sweep, an overhead).
//           Early branches continue the chain (the next tap carries on from step N+1); the last one ends it.
// The moves are the body's keyframed attacks (src/rpg/humanViewer.js ATTACKS), named per hold — or, for weapons that
// have their own art (src/rpg/swordArts.js: the arming sword), per weapon.
import { SWORD_CHAIN } from './swordArts.js';
const BY_WEAPON = { sword: SWORD_CHAIN, shortsword: SWORD_CHAIN };   // (the arming sword is a shortsword: same art)

export const COMBO_CLASS = {
  dagger: 'light', rapier: 'light', whip: 'light', offdagger: 'light', throwdagger: 'light',
  shortsword: 'one', sword: 'one', axe: 'one', mace: 'one', club: 'one',
  spear: 'pole', glaive: 'pole', staff: 'pole',
  greatsword: 'great', greataxe: 'heavy', warhammer: 'heavy', pickaxe: 'heavy',
};
export const COMBO_MAX = { light: 10, one: 8, pole: 6, great: 5, heavy: 4 };

export function comboLength(weapon, skill = 100) {
  const max = COMBO_MAX[COMBO_CLASS[weapon] || 'one'], k = Math.max(0, Math.min(1, (skill - 100) / 4900));
  return Math.max(2, Math.min(max, 2 + Math.floor((max - 2) * Math.pow(k, 0.6) + 1e-6)));
}
// perfect combos: the next press lands in a window around the end of the swing → a damage bonus. Lighter weapons have the
// tighter window and the bigger reward. win: half-width (seconds) either side of the swing's end · bonus: extra damage.
// Earlier than the window: the chain carries on without the bonus. Later: the chain is over.
// rec: recovery (seconds) after a combo ends or breaks — the main hand can't attack again until it passes.
export const COMBO_TIMING = { light: { win: 0.07, bonus: 0.5, rec: 0.25 }, one: { win: 0.1, bonus: 0.4, rec: 0.35 }, pole: { win: 0.12, bonus: 0.32, rec: 0.45 }, great: { win: 0.14, bonus: 0.25, rec: 0.55 }, heavy: { win: 0.16, bonus: 0.2, rec: 0.6 } };
export const comboTiming = weapon => COMBO_TIMING[COMBO_CLASS[weapon] || 'one'];
export const heavyLength = len => Math.max(1, Math.ceil(len / 2));

// per hold (humanViewer holdType: 'one', 'dagger', 'two', 'spear', 'staff'): the light chain and the heavy moves
const CHAINS = {
  one: { light: ['one', 'oneBack', 'oneThrust', 'oneRise', 'oneBack', 'oneSweep', 'one', 'oneThrust', 'oneBack', 'oneOver'], heavy: ['oneOver', 'oneSweep', 'oneRise', 'oneOver', 'oneSweep'] },
  dagger: { light: ['dagger', 'daggerBack', 'dagger', 'daggerRise', 'daggerBack', 'dagger', 'daggerRise', 'daggerBack', 'dagger', 'oneOver'], heavy: ['oneThrust', 'daggerRise', 'oneSweep', 'oneOver', 'oneThrust'] },
  two: { light: ['two', 'twoBack', 'twoRise', 'twoSweep', 'twoOver'], heavy: ['twoOver', 'twoSweep', 'twoRise'] },
  spear: { light: ['spear', 'spear', 'spearSweep', 'spear', 'spearSweep', 'spearOver'], heavy: ['spearOver', 'spearSweep', 'spear'] },
  staff: { light: ['one', 'oneBack', 'oneRise', 'oneSweep', 'oneBack', 'oneOver'], heavy: ['oneOver', 'oneSweep', 'oneRise'] },
};

// step i (0-based) of a chain of `len`: which move, how hard, how fast, what it costs, whether it can continue
export function comboStep(hold, kind, i, len, weapon = null) {
  const C = BY_WEAPON[weapon] || CHAINS[hold] || CHAINS.one, last = i >= len - 1;
  if (kind === 'light') {
    const L = C.light, attack = last && len > 2 ? L[L.length - 1] : L[i % (L.length - 1)];
    return { attack, kind, i, factor: (1 + 0.05 * i) * (last && len > 2 ? 1.35 : 1), speed: 1 + 0.025 * i, cost: last && len > 2 ? 1.3 : 1, last, finisher: last && len > 2 };
  }
  // heavy (from neutral, or a branch off light step i)
  const H = C.heavy, attack = H[i % H.length];
  return { attack, kind: 'heavy', i, factor: 1.45 + 0.08 * i, speed: 0.95, cost: 1.6, last, continues: !last && i % 2 === 0 };
}

// the guard counter's move: after a block, an attack straight out of the guard. by: 'shield' (the blow was taken on the
// shield: a bash and a cut over it) or 'weapon' (turned aside on the blade: a riposte)
export function counterMove(weapon, hold, by) {
  const C = BY_WEAPON[weapon]?.counter;
  if (C) return C[by] || C.weapon;
  return { one: 'oneThrust', dagger: 'dagger', two: 'twoRise', spear: 'spear', staff: 'oneRise' }[hold] || 'oneThrust';
}
