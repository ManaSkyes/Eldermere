// src/data/skillTrees.js — a skill tree for every skill.
//
// A node is bought with a point once its skill gate is reached (and its prerequisites are met).
// Points come from using the skill: one per 50 skill gained up to 1000, then one per 500 beyond.
// Node kinds: 'active' (a technique with its own input), 'passive' (always on).
// How trees are laid out (from the Fire tree on): actives are core techniques everyone on the path gets;
// passives sit on the two sides and are what you choose between. Two actives that would use the same
// input, or that change the same thing in different big ways, are a one-or-the-other pair (oneOf).
// Branches: two sides per tree. Each side node has an opposite on the other side (the one in the same
// rank tier and row); buying one locks only its opposite. A reset refunds every point in a tree. Effects are data for the systems to read later.
//
//   gate:     minimum skill (ranks: 201 Apprentice, 501 Journeyman, 1001 Expert, 5001 Master)
//   ranks:    how many times it can be bought (one point each)
//   needs:    [nodeId, ...] all required;  needsAny: [nodeId, ...] any one required
//   also:     { otherSkill: level } — a hybrid technique that needs another skill too
//   oneOf:    nodeId — a pair: buying one locks the other (like side opposites)
//   pair:     false — a side node that has no counterpart and locks nothing
//
// The mace and shortsword trees are written by hand. Every other skill gets a generic tree from its group's template
// (marked `generic`), to be replaced one by one as the skills are designed.
import { SKILLS } from '../rpg/stats.js';

export const POINTS = { per: 50, until: 1000, perAfter: 500, from: 100 };
export function skillPoints(skill) {
  const v = Math.floor(skill);
  const early = Math.floor((Math.min(v, POINTS.until) - POINTS.from) / POINTS.per);
  const late = v > POINTS.until ? Math.floor((v - POINTS.until) / POINTS.perAfter) : 0;
  return Math.max(0, early) + late;
}

const node = (id, name, kind, gate, text, extra = {}) => ({ id, name, kind, gate, text, ranks: 1, ...extra });

// ---- hand-written trees ----
const WRITTEN = {
  athletics: {
    name: 'Athletics',
    intro: 'Running, climbing and jumping. Every move here gets faster as Athletics rises. Left: climbing and jumping. Center: the core moves. Right: athletics in a fight.',
    branches: {
      climber: { name: 'Climber', text: 'Climbing, jumping and moving across walls.' },
      fighter: { name: 'Combatant', text: 'Footwork, charges and stamina in a fight.' },
    },
    nodes: [
      // ---- core (center) ----
      node('clamber', 'Clamber', 'active', 100, 'Hold jump at a ledge up to head height to haul yourself up onto it. Slow. 15 stamina.', { innate: true, effect: { reach: 1.0, stamina: 15 } }),
      node('vault', 'Vault', 'active', 100, 'Jump at anything waist high or lower to vault over it (or onto it, if it\'s deep). 6 stamina.', { innate: true, effect: { reach: 0.6, stamina: 6 } }),
      node('conditioning', 'Conditioning', 'passive', 150, 'Sprinting costs 5% less stamina per rank.', { ranks: 3, effect: { sprintCostPct: -5 } }),
      node('dodgeRoll', 'Dodge roll', 'active', 201, 'A quick roll that slips through attacks and keeps your momentum (Q). Roll with crouch held to flow into a slide. 15 stamina.', { effect: { stamina: 15 } }),
      node('wallJump', 'Wall jump', 'active', 300, 'In the air against a wall, jump to kick off it. Chain between walls to climb a shaft. 10 stamina.', { effect: { stamina: 10 } }),
      node('quickClimb', 'Quick climb', 'active', 401, 'Clamber twice as fast, reach a little higher, and grab ledges anywhere in a jump (hold jump).', { needs: ['clamber'], effect: { speed: 2, reach: 1.25 } }),
      node('wallRun', 'Wall run', 'active', 501, 'Sprint and jump alongside a wall to run across it for a moment. Jump to leap off. 10 stamina a second.', { needs: ['wallJump'], effect: { seconds: 1.1, stamina: 10 } }),
      node('stride', 'Long stride', 'passive', 550, 'Sprint speed +3% per rank.', { ranks: 2, effect: { sprintPct: 3 } }),
      node('freeRunner', 'Free runner', 'passive', 1200, 'Vaults and clambers no longer slow you down.', {}),
      // ---- climbing and jumping (left) ----
      node('grip', 'Iron grip', 'passive', 300, 'Climbing and clambering cost 15% less stamina per rank.', { ranks: 2, branch: 'climber', effect: { climbCostPct: -15 } }),
      node('ledgeCatch', 'Cat\'s catch', 'passive', 600, 'Hold jump while falling past a ledge to catch it.', { branch: 'climber', needs: ['grip'] }),
      node('momentum', 'Momentum', 'passive', 600, 'Wall runs last 30% longer per rank.', { ranks: 2, branch: 'climber', effect: { wallRunPct: 30 } }),
      node('featherfall', 'Featherfall', 'passive', 1200, 'Falls hurt less: the first 3 m per rank are free.', { ranks: 2, branch: 'climber', effect: { safeFall: 3 } }),
      node('skywalker', 'Skywalker', 'active', 5001, 'A second jump in mid-air, kicked off nothing at all.', { branch: 'climber', needsAny: ['ledgeCatch', 'momentum'] }),
      // ---- in a fight (right) ----
      node('battleWind', 'Battle wind', 'passive', 300, 'In combat, stamina refills 10% faster per rank.', { ranks: 2, branch: 'fighter', effect: { regenPct: 10 } }),
      node('shoulderCharge', 'Shoulder charge', 'active', 600, 'Sprint into a foe to knock them down. 20 stamina.', { branch: 'fighter', needs: ['dodgeRoll'], effect: { stamina: 20 } }),
      node('lunge', 'Lunge', 'active', 600, 'An attack straight out of a sprint: +30% damage.', { branch: 'fighter', effect: { damagePct: 30 } }),
      node('unshakable', 'Sure-footed', 'passive', 1200, 'While moving, staggers and knockdowns are 25% less likely.', { branch: 'fighter', needsAny: ['shoulderCharge', 'lunge'] }),
      node('unstoppable', 'Unstoppable', 'active', 5001, 'For 6 s, sprint without stamina and shrug off anything that would stop you.', { branch: 'fighter', needs: ['unshakable'] }),
    ],
  },
  sneak: {
    name: 'Sneak',
    intro: 'Moving unseen and unheard, and the thief\'s routes over the rooftops: hugging walls, poles and pipes, tightropes and spires. Routes you can use sparkle when you\'re near them (press E, or hold jump in the air, to take one; press E or jump mid-air within a few metres to twirl onto one). Moving along them is quiet. Some need Athletics as well. Left: shadows and stillness. Right: acrobatics on the routes.',
    branches: {
      shadow: { name: 'Shadow', text: 'Stillness, walls and darkness.' },
      acrobat: { name: 'Acrobat', text: 'Speed and tricks on ropes, poles and spires.' },
    },
    nodes: [
      // ---- core (center) ----
      node('wallHug', 'Wall hug', 'active', 100, 'Press E beside a wall to put your back to it and sidle along, unseen from the side. Also lets you edge along ledges too narrow to walk.', { innate: true }),
      node('softSteps', 'Soft steps', 'passive', 150, 'Crouched movement makes 10% less noise per rank.', { ranks: 3, effect: { crouchNoisePct: -10 } }),
      node('poleRunner', 'Poles and pipes', 'active', 150, 'Climb poles and drainpipes (spin round them, leap off), and hang from horizontal pipes to shimmy along.', { also: { athletics: 150 } }),
      node('tightrope', 'Tightrope', 'active', 201, 'Walk tightropes and wires, arms out for balance.', { also: { athletics: 201 } }),
      node('wireRunner', 'Wire runner', 'active', 401, 'On a tightrope or wire: crouch to move low and silent instead of letting go, and sprint to run along it.', { needs: ['tightrope'], also: { athletics: 401 } }),
      node('spireLanding', 'Spire landing', 'active', 300, 'Land on the tip of a spire, post or pole and perch there. Leap from spire to spire.', { needs: ['poleRunner'], also: { athletics: 300 } }),
      node('cloakedDodge', 'Cloaked dodge', 'passive', 501, 'Anyone who hasn\'t already spotted you can\'t see or hear your dodge roll: roll from cover to cover. (Needs the Dodge roll technique from Athletics to use.)', {}),
      node('ghostWalker', 'Ghost walker', 'passive', 1200, 'Moving along any route (walls, poles, pipes, ropes, spires) makes no sound at all.', {}),
      // ---- shadows (left) ----
      node('stillness', 'Stillness', 'passive', 300, 'Standing still makes you 20% harder to see per rank.', { ranks: 2, branch: 'shadow', effect: { stillVisPct: -20 } }),
      node('wallShadow', 'Wall shadow', 'passive', 600, 'Hugging a wall makes you half as visible again.', { branch: 'shadow', needs: ['stillness'] }),
      node('lightFeet', 'Light feet', 'passive', 600, 'Landings make half the noise.', { branch: 'shadow' }),
      node('unseen', 'Unseen', 'passive', 1200, 'Crouched, you are 30% harder to see.', { branch: 'shadow', needsAny: ['wallShadow', 'lightFeet'] }),
      node('vanish', 'Vanish', 'active', 5001, 'Drop out of sight: for 4 s while crouched, no one can see you. 40 stamina.', { branch: 'shadow', needs: ['unseen'] }),
      // ---- acrobat (right) ----
      node('ropeSlide', 'Wire slide', 'active', 300, 'Crouch on a sloping wire to hang and slide down it, fast.', { branch: 'acrobat', also: { athletics: 300 } }),
      node('poleSwing', 'Pole swing', 'active', 600, 'Leaping off a pole or pipe throws you 50% further.', { branch: 'acrobat', needs: ['ropeSlide'] }),
      node('spireHop', 'Spire hop', 'active', 600, 'Jumps from a spire go 30% higher and further.', { branch: 'acrobat' }),
      node('catBalance', 'Cat\'s balance', 'passive', 1200, 'Move on ropes, pipes and edges at full walking speed.', { branch: 'acrobat', needsAny: ['poleSwing', 'spireHop'] }),
      node('shadowDancer', 'Shadow dancer', 'passive', 5001, 'Snap to any route from twice as far away.', { branch: 'acrobat', needs: ['catBalance'] }),
    ],
  },
  climbing: {
    name: 'Climbing',
    intro: 'Climbing walls, cliffs, vines and ice. Every surface is harder than the last: vines, rough stone, wet stone, ice. Left: holding on to the hard ones. Center: the core of climbing, leaps included. Right: speed, ice and rest.',
    branches: {
      alpinist: { name: 'Alpinist', text: 'Grip on wet rock and ice; never letting go.' },
      freeClimber: { name: 'Free climber', text: 'Speed on the wall, ice, and resting on it.' },
    },
    nodes: [
      // ---- core (center) ----
      node('climb', 'Climb', 'active', 100, 'Jump at a climbable wall (vines, rough stone, wet stone, ice) and hold jump to grab on. Move with the movement keys; crouch lets go; back + jump kicks off.', { innate: true }),
      node('steadyHold', 'Steady hold', 'passive', 150, 'Holding still on a wall costs 20% less stamina per rank.', { ranks: 3, effect: { holdCostPct: -20 } }),
      node('wetGrip', 'Wet grip', 'passive', 201, 'Slipping on wet stone is half as likely.', { effect: { wetSlipPct: -50 } }),
      node('dyno', 'Dyno', 'active', 300, 'Press jump while climbing to lunge about 1.5 m up the wall and catch on. 12 stamina.', { needs: ['climb'], effect: { leap: 1.5, stamina: 12 } }),
      node('wallLeap', 'Side leap', 'active', 501, 'Jump while holding left or right on a wall to leap up to 3 m sideways: onto more wall, across a gap to the next one, or off into the air (hold jump to catch another wall). 10 stamina.', { needs: ['climb'], effect: { leap: 3, stamina: 10 } }),
      node('pushOff', 'Push off', 'active', 550, 'Back + jump on a wall throws you twice as far off it; hold jump to catch a wall you\'re thrown at, like the other side of a chimney.', { needs: ['climb'] }),
      node('spider', 'Spider', 'passive', 1200, 'Climb 30% faster on everything.', { effect: { speedPct: 30 } }),
      // ---- holding on (left) ----
      node('chalk', 'Chalked hands', 'passive', 300, 'Slip 20% less on every surface per rank.', { ranks: 2, branch: 'alpinist', effect: { slipPct: -20 } }),
      node('catchSlip', 'Catch yourself', 'passive', 600, 'A slip costs half the stamina and drops you half as far.', { branch: 'alpinist', needs: ['chalk'] }),
      node('enduring', 'Enduring grip', 'passive', 600, 'Climbing costs 15% less stamina per rank.', { ranks: 2, branch: 'alpinist', effect: { climbCostPct: -15 } }),
      node('overhang', 'Overhang', 'passive', 1200, 'Hard surfaces (wet stone, ice) cost no more stamina than rough stone.', { branch: 'alpinist', needsAny: ['catchSlip', 'enduring'] }),
      node('neverFall', 'Unfalling', 'passive', 5001, 'You never slip, on anything.', { branch: 'alpinist', needs: ['overhang'] }),
      // ---- moving on the wall (right) ----
      node('quickHands', 'Quick hands', 'passive', 300, 'Climb 10% faster per rank.', { ranks: 2, branch: 'freeClimber', effect: { speedPct: 10 } }),
      node('iceClimber', 'Ice climber', 'passive', 600, 'Slipping and sliding on ice are half as bad, and you climb it 30% faster.', { branch: 'freeClimber', needs: ['quickHands'], effect: { iceSlipPct: -50, iceSpeedPct: 30 } }),
      node('restHold', 'Resting hold', 'passive', 600, 'Holding still on vines or rough stone costs no stamina at all.', { branch: 'freeClimber', needs: ['steadyHold'] }),
      node('fluidClimb', 'Fluid climber', 'passive', 1200, 'Pulling up over the top of a climb is instant, and you keep moving.', { branch: 'freeClimber', needsAny: ['iceClimber', 'restHold'] }),
      node('lizard', 'Lizard', 'passive', 5001, 'Climb every surface at the speed of vines.', { branch: 'freeClimber', needs: ['fluidClimb'] }),
    ],
  },
  swimming: {
    name: 'Swimming',
    intro: 'Moving through water. Left: diving, breath and the deep. Center: the core strokes. Right: speed on the surface.',
    branches: {
      diver: { name: 'Diver', text: 'Breath, depth and moving underwater.' },
      racer: { name: 'Racer', text: 'Speed and stamina on the surface.' },
    },
    nodes: [
      // ---- core (center) ----
      node('steadyBreath', 'Steady breath', 'passive', 150, 'Hold your breath 10% longer per rank.', { ranks: 3, effect: { breathPct: 10 } }),
      node('strongStroke', 'Strong stroke', 'passive', 150, 'Swim 5% faster per rank.', { ranks: 2, effect: { speedPct: 5 } }),
      node('surfaceDive', 'Surface dive', 'active', 201, 'Crouch at the surface to plunge straight down.', { effect: { plunge: 3.5 } }),
      node('leapOut', 'Leap out', 'active', 201, 'Climb out of water faster and from lower: +25% reach from the water.', { effect: { reachPct: 25, speed: 1.5 } }),
      node('treadEasy', 'Easy treading', 'passive', 550, 'Treading water refills stamina at the full rate.', {}),
      node('fluid', 'Fluid motion', 'passive', 1200, 'Wading slows you half as much.', { effect: { wadePct: -50 } }),
      // ---- diver (left) ----
      node('deepLungs', 'Deep lungs', 'passive', 300, 'Hold your breath 20% longer per rank.', { ranks: 2, branch: 'diver', effect: { breathPct: 20 } }),
      node('dolphinKick', 'Dolphin kick', 'active', 600, 'Underwater, start a hard swim with a burst: nearly double speed for a moment. 10 stamina.', { branch: 'diver', effect: { burst: 1.8, seconds: 0.6, stamina: 10 } }),
      node('calmHeart', 'Calm heart', 'passive', 600, 'Breath lasts 25% longer while you aren\'t swimming hard.', { branch: 'diver', effect: { calmPct: 25 } }),
      node('lastGasp', 'Last gasp', 'passive', 1200, 'When your breath runs out, 6 more seconds before you start drowning.', { branch: 'diver', effect: { seconds: 6 } }),
      node('deepBreath', 'Breath of the deep', 'passive', 5001, 'Hold your breath three times as long.', { branch: 'diver', needsAny: ['lastGasp'], effect: { breathMul: 3 } }),
      // ---- racer (right) ----
      node('racingStroke', 'Racing stroke', 'passive', 300, 'Hard swimming is 8% faster per rank.', { ranks: 2, branch: 'racer', effect: { sprintPct: 8 } }),
      node('efficientKick', 'Efficient kick', 'passive', 600, 'Hard swimming costs 30% less stamina.', { branch: 'racer', effect: { costPct: -30 } }),
      node('porpoise', 'Porpoise', 'active', 600, 'Swimming hard at the surface, jump to leap forward out of the water. 8 stamina.', { branch: 'racer', effect: { stamina: 8 } }),
      node('waterborne', 'Waterborne', 'passive', 1200, 'Fight in water without the usual slowdown.', { branch: 'racer' }),
      node('torpedo', 'Torpedo', 'active', 5001, 'For 5 s, hard swimming is twice as fast and costs nothing.', { branch: 'racer', needsAny: ['waterborne'] }),
    ],
  },
  shortsword: {
    name: 'Shortsword',
    intro: 'The short blade of the soldier and the duelist — the gladius, the arming sword, the sword-and-buckler of the old fencing books. Close in, cut and thrust, keep your guard. Specials take over the heavy attack (which one depends on how many light attacks came before it), and each special can branch again: a perfect light or perfect heavy right after it flows into its own follow-up. Active techniques have ranks: more ranks, stronger effects. Left: the striker — damage, specials and their follow-ups. Center: the core of the blade, and the timing that grows with every rank. Right: the guardian — perfect blocks, counters and holding the line, with or without a shield. Each side technique locks its counterpart on the other side.',
    branches: {
      striker: { name: 'Striker', text: 'Perfect combos, damage, special attacks and their follow-ups. Offense.' },
      guardian: { name: 'Guardian', text: 'Perfect blocks, counters and turning blows aside — shield or bare blade. Defense.' },
    },
    nodes: [
      // ---- core (center) ----
      node('drills', 'Blade drills', 'passive', 150, 'Shortsword damage +3% per rank.', { ranks: 3, effect: { damagePct: 3 } }),
      node('steady', 'Economy of motion', 'passive', 150, 'Shortsword attacks cost 5% less stamina per rank.', { ranks: 2, effect: { staminaPct: -5 } }),
      node('closingThrust', 'Closing thrust', 'active', 200, 'Special — a heavy attack with no light attack before it: drive forward behind a low lunging thrust that skewers the first foe in its path. 1.6× damage, 18 stamina. Per rank: +10% damage and a longer drive.', { ranks: 3, needs: ['drills'], effect: { at: 0, damage: 1.6, stamina: 18 } }),
      node('timing1', 'Apprentice\'s timing', 'passive', 201, 'The perfect combo window is 5% wider per rank.', { ranks: 3, effect: { windowPct: 5 } }),
      node('footwork', 'Footwork', 'passive', 250, 'Move 6% faster while attacking per rank.', { ranks: 2, effect: { attackMovePct: 6 } }),
      node('timing2', 'Journeyman\'s timing', 'passive', 501, 'The perfect combo window is 5% wider per rank.', { ranks: 3, needs: ['timing1'], effect: { windowPct: 5 } }),
      node('flow', 'Flowing blade', 'passive', 550, 'Shortsword attack speed +3% per rank.', { ranks: 3, effect: { speedPct: 3 } }),
      node('secondBreath', 'Second breath', 'passive', 600, 'Every perfect hit gives back 2 stamina per rank.', { ranks: 2, effect: { perfectStamina: 2 } }),
      node('timing3', 'Expert\'s timing', 'passive', 1001, 'The perfect combo window is 5% wider per rank.', { ranks: 3, needs: ['timing2'], effect: { windowPct: 5 } }),
      node('quickReset', 'Quick reset', 'passive', 1100, 'Recovery after a combo ends or breaks is 15% shorter per rank.', { ranks: 2, effect: { recoveryPct: -15 } }),
      node('timing4', 'Master\'s timing', 'passive', 5001, 'The perfect combo window is 5% wider per rank.', { ranks: 3, needs: ['timing3'], effect: { windowPct: 5 } }),
      // ---- Striker (left) ----
      node('keenEye', 'Keen eye', 'passive', 150, 'The perfect combo window is 10% wider per rank.', { ranks: 3, branch: 'striker', effect: { windowPct: 10 } }),
      node('cleanStrikes', 'Clean strikes', 'passive', 250, 'Perfect combo presses add +5% more damage per rank.', { ranks: 3, branch: 'striker', needs: ['keenEye'], effect: { bonusPct: 5 } }),
      node('pommelStrike', 'Pommel strike', 'active', 300, 'Special — a heavy attack after 1 light: step in and smash the pommel into their face. 0.9× damage, stuns 0.8 s and staggers hard. 14 stamina. Per rank: +0.25 s stun.', { ranks: 3, branch: 'striker', effect: { at: 1, damage: 0.9, stun: 0.8, stamina: 14 } }),
      node('extendedLunge', 'Extended lunge', 'active', 400, 'Follow-up — a perfect light right after Closing thrust (or Tornado jab): push off again into an even longer thrust that ignores 30% of armor (+10% per rank) and +10% damage per rank. 14 stamina.', { ranks: 3, branch: 'striker', pair: false, needs: ['closingThrust'], effect: { pierce: 0.3, stamina: 14 } }),
      node('closingSlash', 'Closing strike slash', 'active', 450, 'Follow-up — a perfect heavy right after Closing thrust (or Tornado jab): leap and bring the blade down in a diving slash. 1.5× damage with a 40% chance to stagger them for 1 s (+15% per rank). 18 stamina.', { ranks: 3, branch: 'striker', pair: false, needs: ['closingThrust'], effect: { staggerChance: 0.4, stamina: 18 } }),
      node('hamstring', 'Hamstring cut', 'active', 600, 'Special — a heavy attack after 2 lights: drop under their guard and cut at the legs. 1.3× damage and they move at half speed for 4 s. 16 stamina. Per rank: +1 s and a deeper slow.', { ranks: 3, branch: 'striker', needs: ['pommelStrike'], effect: { at: 2, damage: 1.3, slow: 0.5, seconds: 4, stamina: 16 } }),
      node('finesse', 'Finesse', 'passive', 700, 'Specials and follow-ups deal +10% damage per rank.', { ranks: 2, branch: 'striker', effect: { specialPct: 10 } }),
      node('risingSlash', 'Rising slash', 'active', 750, 'Follow-up — a perfect light right after Hamstring cut: rise out of the crouch with an upward cut that opens a bleeding wound (3% of the blow each second for 5 s; +1 s per rank). 14 stamina.', { ranks: 3, branch: 'striker', oneOf: 'guardPush', needs: ['hamstring'], effect: { bleed: 0.03, seconds: 5, stamina: 14 } }),
      node('guardPush', 'Guard push', 'active', 750, 'Follow-up — a perfect heavy right after Hamstring cut: drive up through their guard with a two-handed shove. Knocks down anything no heavier than you are (brutes and bosses only stagger) for 1.5 s (+0.3 s per rank). 16 stamina.', { ranks: 3, branch: 'guardian', oneOf: 'risingSlash', needs: ['hamstring'], effect: { knockdown: 1.5, stamina: 16 } }),
      node('whirlingCut', 'Whirling cut', 'active', 1200, 'Special — a heavy attack after 3 lights: wind the whole body round and cut level through everything around your front and sides (up to 5 foes, +1 per rank). 1.4× damage. 22 stamina.', { ranks: 3, branch: 'striker', needs: ['hamstring'], effect: { at: 3, damage: 1.4, stamina: 22 } }),
      node('flowingSteel', 'Flowing steel', 'active', 1500, 'Combo extender — right after a special, a perfect light press flows into your next special (the one for one more light attack) — unless that special has its own light follow-up learned, which comes first.', { branch: 'striker', needsAny: ['pommelStrike', 'hamstring'] }),
      node('tornadoJab', 'Tornado jab', 'active', 1600, 'Follow-up — a perfect light right after Whirling cut: spin out of the turn into a driving forward thrust. 1.3× damage (+10% per rank), and it flows on: a perfect light or heavy after it goes into Extended lunge or Closing strike slash. 14 stamina.', { ranks: 3, branch: 'striker', pair: false, needs: ['whirlingCut'], effect: { stamina: 14 } }),
      node('skyPiercer', 'Sky piercer', 'active', 1800, 'Follow-up — a perfect heavy right after Whirling cut: a huge rising strike that throws them into the air (1.2 s, +0.3 s per rank). 2× damage. Ends the combo. 24 stamina.', { ranks: 3, branch: 'striker', pair: false, needs: ['whirlingCut'], effect: { launch: 1.2, stamina: 24 } }),
      node('thousandCuts', 'Thousand cuts', 'active', 5001, 'Special — a heavy attack after 4 or more lights: keep holding attack to unleash a flurry of slashes that goes on until you let go or run out of stamina (0.6× a cut, 9 stamina a pair; per rank: faster and +10% damage). Ends the combo.', { ranks: 3, branch: 'striker', needs: ['whirlingCut'], effect: { at: 4, damage: 0.6, stamina: 9 } }),
      // ---- Guardian (right) ----
      node('steadyGuard', 'Steady guard', 'passive', 150, 'The perfect block window is 0.04 s longer per rank.', { ranks: 3, branch: 'guardian', effect: { perfectBlock: 0.04 } }),
      node('braced', 'Braced', 'passive', 250, 'Blocks stop 5% more damage and cost 8% less stamina per rank.', { ranks: 3, branch: 'guardian', needs: ['steadyGuard'], effect: { blockPct: 5, blockCostPct: -8 } }),
      node('shieldRush', 'Rush', 'active', 300, 'Guard counter — hold attack (instead of tapping) to counter with a rush: a running shield bash, or with no shield a shoulder barge behind the hilt. Stuns 1.5 s (+0.3 s per rank). Works off any block.', { ranks: 3, branch: 'guardian', effect: { stun: 1.5 } }),
      node('windingThrust', 'Winding thrust', 'active', 600, 'Guard counter — tap attack off any block: keep the bind, turn the hand high and drive the point down past their guard. 2.2× damage (2.6× off a perfect block), +15% per rank.', { ranks: 3, branch: 'guardian', needs: ['steadyGuard'], effect: { damage: 2.2, perfectDamage: 2.6 } }),
      node('quickRecovery', 'Quick recovery', 'passive', 700, 'Guard counters come back 0.4 s sooner and their window lasts 0.1 s longer, per rank.', { ranks: 2, branch: 'guardian', effect: { coolSec: -0.4, windowSec: 0.1 } }),
      node('deflect', 'Deflect', 'active', 1200, 'A perfect block turns a melee blow aside so hard the attacker is staggered for 0.9 s (+0.3 s per rank) — wide open to your counter.', { ranks: 3, branch: 'guardian', needsAny: ['shieldRush', 'windingThrust'], effect: { stun: 0.9 } }),
      node('ironLine', 'Hold the line', 'passive', 1500, 'While your guard is up, blows that get past it hurt 15% less per rank.', { ranks: 2, branch: 'guardian', needs: ['braced'], effect: { throughPct: -15 } }),
      node('counterFlow', 'Unbroken guard', 'active', 5001, 'Combo extender — right after a guard counter, a perfectly timed press flows into your first special.', { branch: 'guardian', needs: ['deflect'] }),
    ],
  },
  mace: {
    name: 'Mace',
    intro: 'Weight and will. The mace breaks what blades glance off.',
    branches: {
      crusher: { name: 'Crusher', text: 'Break armor and bodies. Offense.' },
      warden:  { name: 'Warden', text: 'Guard, turn blows aside, punish. Defense.' },
    },
    nodes: [
      node('heavySwing', 'Heavy swing', 'passive', 150, 'Mace damage +4% per rank.', { ranks: 3, effect: { damagePct: 4 } }),
      node('boneBreaker', 'Bone breaker', 'passive', 150, 'Your hits stagger 10% more per rank.', { ranks: 2, effect: { staggerPct: 10 } }),
      node('overheadSmash', 'Overhead smash', 'active', 200, 'Hold attack to charge an overhead blow: up to 1.8× damage and a heavy stagger. 20 stamina.', { needs: ['heavySwing'], effect: { charge: 1.8, stamina: 20 } }),

      node('armorCrack', 'Armor crack', 'passive', 250, 'Hits crack armor: −5% of the target\'s armor per rank, stacking 3 times for 8 s.', { ranks: 3, branch: 'crusher', effect: { armorShredPct: 5, stacks: 3, seconds: 8 } }),
      node('groundSlam', 'Ground slam', 'active', 400, 'Slam the ground: damage and knockdown in a 3 m circle. 35 stamina.', { branch: 'crusher', needs: ['armorCrack'], effect: { radius: 3, stamina: 35 } }),
      node('guardedGrip', 'Guarded grip', 'passive', 250, 'Blocking with a mace (or mace and shield) costs 10% less stamina per rank.', { ranks: 3, branch: 'warden', effect: { blockCostPct: -10 } }),
      node('counterBash', 'Counter bash', 'active', 400, 'Right after a well-timed block, a stunning counterstrike.', { branch: 'warden', needs: ['guardedGrip'], effect: { stunSeconds: 1.5 } }),

      node('momentum', 'Momentum', 'passive', 550, 'Each hit within 2 s of the last: attack speed +4% per rank, up to 3 stacks.', { ranks: 3, effect: { speedPct: 4, stacks: 3 } }),
      node('concussiveBlow', 'Concussive blow', 'active', 700, 'A blow to the head that dazes for 2 s. Large foes and bosses resist.', { needs: ['overheadSmash'], effect: { dazeSeconds: 2 } }),

      node('shatter', 'Shatter', 'active', 1200, 'Break a raised shield, or armor already cracked, outright.', { branch: 'crusher', needs: ['groundSlam'] }),
      node('bulwark', 'Bulwark', 'passive', 1200, 'While your guard is up, allies within 4 m take 10% less damage.', { branch: 'warden', needs: ['counterBash'], effect: { allyReductionPct: 10, radius: 4 } }),
      node('ironWill', 'Iron will', 'passive', 1500, 'Stagger resistance +15% per rank while holding a mace.', { ranks: 2, effect: { staggerResistPct: 15 } }),

      node('earthshaker', 'Earthshaker', 'active', 5001, 'A leaping smash that splits the ground in a line, knocking down all it touches.', { needsAny: ['shatter', 'bulwark'] }),
    ],
  },
  fire: {
    name: 'Fire',
    intro: 'Heat that wants to spread. Fire rewards pressing the attack and punishes a careless chant.',
    branches: {
      pyro:   { name: 'Pyromancer', text: 'Burns that bite deeper, last longer and spread. Offense.' },
      keeper: { name: 'Flamekeeper', text: 'A steady chant: safer, quicker, cheaper fire. Control.' },
    },
    nodes: [
      // ---- core: the actives ----
      node('overcast', 'Overcast', 'active', 200, 'Keep holding a spoken fire spell after it\'s ready to pour more into it: up to +60% power over 1 s, for up to +80% mana.', { effect: { power: 0.6, mana: 0.8, seconds: 1 } }),
      node('detonate', 'Detonate', 'active', 400, 'While your fireball is in flight, press the cast button again to burst it where it is.'),
      node('twinBolt', 'Twin bolt', 'active', 700, 'Fire bolts leave your hand as two, a little apart: each 75% damage, for 50% more mana.', { oneOf: 'piercingBolt', effect: { each: 0.75, mana: 1.5 } }),
      node('piercingBolt', 'Piercing bolt', 'active', 700, 'Fire bolts burn straight through: up to 3 targets, 25% less damage after each.', { oneOf: 'twinBolt', effect: { targets: 3, falloff: 0.25 } }),
      node('inferno', 'Inferno', 'active', 5001, 'A fireball spoken in full leaves the ground ablaze where it bursts for 6 s: anything in it keeps burning.', { needsAny: ['conflagration', 'quickfire'], effect: { seconds: 6 } }),
      // ---- Pyromancer (left) ----
      node('searing', 'Searing', 'passive', 150, 'Burns deal 15% more damage per rank.', { ranks: 3, branch: 'pyro', effect: { burnPct: 15 } }),
      node('lingering', 'Lingering flame', 'passive', 250, 'Burns last 1 s longer per rank.', { ranks: 2, branch: 'pyro', effect: { seconds: 1 } }),
      node('blastRadius', 'Wide blast', 'passive', 300, 'Fireballs burst 15% wider per rank.', { ranks: 2, branch: 'pyro', effect: { radiusPct: 15 } }),
      node('wildfire', 'Wildfire', 'passive', 600, 'Burning foes set others within 2 m alight (at half strength).', { branch: 'pyro', effect: { radius: 2, share: 0.5 } }),
      node('volatile', 'Volatile', 'passive', 800, 'Fire spells deal 10% more damage per rank to anything already burning.', { ranks: 2, branch: 'pyro', effect: { damagePct: 10 } }),
      node('conflagration', 'Conflagration', 'passive', 1500, 'Burns stack: each new one adds to the last, up to 3.', { branch: 'pyro', effect: { stacks: 3 } }),
      // ---- Flamekeeper (right) ----
      node('steadyFlame', 'Steady flame', 'passive', 150, 'Fire backfires 10% less often per rank.', { ranks: 3, branch: 'keeper', effect: { backfirePct: -10 } }),
      node('fluentChant', 'Fluent chant', 'passive', 250, 'Spoken fire spells cast 8% faster per rank.', { ranks: 2, branch: 'keeper', effect: { timePct: -8 } }),
      node('emberThrift', 'Ember thrift', 'passive', 300, 'Fire spells cost 8% less mana per rank.', { ranks: 2, branch: 'keeper', effect: { manaPct: -8 } }),
      node('unbroken', 'Unbroken chant', 'passive', 600, 'Letting go of a long fire cast early no longer backfires: the spell just unravels (the mana spent so far is lost).', { branch: 'keeper' }),
      node('fireward', 'Fireward', 'passive', 800, 'Your own fire can\'t hurt you, and fire backfires hurt half as much.', { branch: 'keeper' }),
      node('quickfire', 'Quickfire', 'passive', 1500, 'Quick (voiceless) fire casts are 15% faster per rank.', { ranks: 2, branch: 'keeper', effect: { timePct: -15 } }),
    ],
  },
};

// ---- generic templates, by skill group ----
// Each: two branches, then nodes in the same shape as the mace tree. {S} is the skill's name.
const TEMPLATES = {
  weapon: {
    intro: 'A placeholder tree for {S}, to be designed.',
    branches: { a: { name: 'Aggressor', text: 'Press the attack. Offense.' }, b: { name: 'Duelist', text: 'Guard, read, counter. Technique.' } },
    nodes: [
      ['drills', '{S} drills', 'passive', 150, '{S} damage +3% per rank.', 3],
      ['steady', 'Steady hands', 'passive', 150, 'Attacks with {S} cost 5% less stamina per rank.', 2],
      ['power', 'Power strike', 'active', 200, 'A charged blow: up to 1.6× damage. 20 stamina.', 1, { needs: ['drills'] }],
      ['relentless', 'Relentless', 'passive', 250, '+4% damage per rank against staggered foes.', 3, { branch: 'a' }],
      ['sweep', 'Sweeping arc', 'active', 400, 'A wide attack that hits everything in front of you. 30 stamina.', 1, { branch: 'a', needs: ['relentless'] }],
      ['guard', 'Measured guard', 'passive', 250, 'Blocks and parries with {S} are 5% easier to time per rank.', 3, { branch: 'b' }],
      ['riposte', 'Riposte', 'active', 400, 'A counterattack right after a successful block or parry.', 1, { branch: 'b', needs: ['guard'] }],
      ['flow', 'Flow', 'passive', 550, 'Attack speed with {S} +3% per rank.', 3],
      ['cripple', 'Crippling blow', 'active', 700, 'A blow that slows the target for 4 s.', 1, { needs: ['power'] }],
      ['execute', 'Executioner', 'active', 1200, 'A finishing blow against a badly wounded foe.', 1, { branch: 'a', needs: ['sweep'] }],
      ['unbroken', 'Unbroken', 'passive', 1200, 'Take 10% less damage while your guard is up.', 1, { branch: 'b', needs: ['riposte'] }],
      ['mastery', '{S} mastery', 'passive', 1500, 'Critical chance with {S} +5% per rank.', 2],
      ['legend', 'Legend of the {s}', 'active', 5001, 'A masterwork technique, the signature of a true master.', 1, { needsAny: ['execute', 'unbroken'] }],
    ],
  },
  combat: {
    intro: 'A placeholder tree for {S}, to be designed.',
    branches: { a: { name: 'Stalwart', text: 'Endure and hold. Toughness.' }, b: { name: 'Nimble', text: 'Move and avoid. Agility.' } },
    nodes: [
      ['basics', 'Trained {s}', 'passive', 150, '{S} is 4% more effective per rank.', 3],
      ['breath', 'Second wind', 'passive', 150, 'Recover 5% more stamina per rank after using {S}.', 2],
      ['brace', 'Brace', 'active', 200, 'For 2 s, {S} works at double strength. 25 stamina.', 1, { needs: ['basics'] }],
      ['ironHide', 'Iron hide', 'passive', 250, 'Damage taken −3% per rank.', 3, { branch: 'a' }],
      ['standFirm', 'Stand firm', 'active', 400, 'Ignore staggers and knockback for 4 s.', 1, { branch: 'a', needs: ['ironHide'] }],
      ['light', 'Light on your feet', 'passive', 250, 'Movement speed +3% per rank in combat.', 3, { branch: 'b' }],
      ['slip', 'Slip away', 'active', 400, 'A quick sidestep that leaves attackers off balance.', 1, { branch: 'b', needs: ['light'] }],
      ['composure', 'Composure', 'passive', 550, 'Stagger resistance +5% per rank.', 3],
      ['punish', 'Punish', 'active', 700, 'After {S} succeeds, your next attack within 2 s deals +30% damage.', 1, { needs: ['brace'] }],
      ['bastion', 'Bastion', 'passive', 1200, 'Below half health, take 15% less damage.', 1, { branch: 'a', needs: ['standFirm'] }],
      ['ghost', 'Ghost', 'passive', 1200, 'A chance to avoid any hit entirely.', 1, { branch: 'b', needs: ['slip'] }],
      ['veteran', 'Veteran', 'passive', 1500, '{S} costs 10% less stamina per rank.', 2],
      ['legend', 'Unyielding', 'active', 5001, 'For a few seconds, nothing can bring you down.', 1, { needsAny: ['bastion', 'ghost'] }],
    ],
  },
  profession: {
    intro: 'A placeholder tree for {S}, to be designed.',
    branches: { a: { name: 'Artisan', text: 'Fewer, finer results. Quality.' }, b: { name: 'Industrious', text: 'More, faster. Quantity.' } },
    nodes: [
      ['practiced', 'Practiced hand', 'passive', 150, '{S} quality +2% per rank.', 3],
      ['efficient', 'Efficient', 'passive', 150, '{S} uses or wastes 5% less material per rank.', 2],
      ['focus', 'Focused work', 'active', 200, 'One careful attempt at +10% quality, taking twice as long.', 1, { needs: ['practiced'] }],
      ['eye', 'Keen eye', 'passive', 250, 'Higher chance of a top grade: +3% per rank.', 3, { branch: 'a' }],
      ['masterwork', 'Masterwork', 'active', 400, 'Once a day, a work that can exceed your usual quality cap.', 1, { branch: 'a', needs: ['eye'] }],
      ['quick', 'Quick hands', 'passive', 250, '{S} is 5% faster per rank.', 3, { branch: 'b' }],
      ['batch', 'Batch work', 'active', 400, 'Work several at once at a small quality cost.', 1, { branch: 'b', needs: ['quick'] }],
      ['tools', 'Tool care', 'passive', 550, 'Tools wear 8% slower per rank.', 3],
      ['improvise', 'Improvise', 'active', 700, 'Work away from a proper station at a smaller penalty.', 1, { needs: ['focus'] }],
      ['signature', 'Signature', 'passive', 1200, 'Your finest works carry your mark and sell for more.', 1, { branch: 'a', needs: ['masterwork'] }],
      ['bounty', 'Bounty', 'passive', 1200, 'A chance of a bonus result each time.', 1, { branch: 'b', needs: ['batch'] }],
      ['lore', 'Trade secrets', 'passive', 1500, 'Learn recipes and techniques 10% faster per rank.', 2],
      ['legend', 'Grandmaster\'s touch', 'active', 5001, 'A work spoken of for generations.', 1, { needsAny: ['signature', 'bounty'] }],
    ],
  },
  general: {
    intro: 'A placeholder tree for {S}, to be designed.',
    branches: { a: { name: 'Specialist', text: 'Deep and sharp. Power.' }, b: { name: 'Practical', text: 'Reliable and cheap. Consistency.' } },
    nodes: [
      ['practice', 'Practice', 'passive', 150, '{S} +3% effectiveness per rank.', 3],
      ['ease', 'Ease', 'passive', 150, '{S} costs 5% less effort per rank.', 2],
      ['knack', 'Knack', 'active', 200, 'Once in a while, a sure success at {s}.', 1, { needs: ['practice'] }],
      ['depth', 'Depth', 'passive', 250, 'Hard uses of {s} succeed 4% more often per rank.', 3, { branch: 'a' }],
      ['flair', 'Flair', 'active', 400, 'A bold use of {s} with a bigger payoff and bigger risk.', 1, { branch: 'a', needs: ['depth'] }],
      ['habit', 'Habit', 'passive', 250, 'Routine uses of {s} never fail; +3% speed per rank.', 3, { branch: 'b' }],
      ['steady', 'Steady', 'active', 400, 'Take your time: a guaranteed ordinary result.', 1, { branch: 'b', needs: ['habit'] }],
      ['insight', 'Insight', 'passive', 550, '{S} grows 5% faster per rank.', 3],
      ['instinct', 'Instinct', 'active', 700, 'Use {s} without thinking, even under pressure.', 1, { needs: ['knack'] }],
      ['virtuoso', 'Virtuoso', 'passive', 1200, 'Your best results with {s} are even better.', 1, { branch: 'a', needs: ['flair'] }],
      ['reliable', 'Reliable', 'passive', 1200, 'Your worst results with {s} are never bad.', 1, { branch: 'b', needs: ['steady'] }],
      ['second', 'Second nature', 'passive', 1500, '{S} limit raised slightly per rank.', 2],
      ['legend', 'Peerless', 'active', 5001, 'A feat of {s} few would believe.', 1, { needsAny: ['virtuoso', 'reliable'] }],
    ],
  },
  magic: {
    intro: 'A placeholder tree for {S}, to be designed.',
    branches: { a: { name: 'Potency', text: 'Stronger spells. Power.' }, b: { name: 'Control', text: 'Cheaper, safer, quicker spells. Precision.' } },
    nodes: [
      ['attune', '{S} attunement', 'passive', 150, '{S} spells +3% power per rank.', 3],
      ['thrift', 'Mana thrift', 'passive', 150, '{S} spells cost 4% less mana per rank.', 2],
      ['overcast', 'Overcast', 'active', 200, 'Pour extra mana into a {s} spell: +40% power for +80% mana.', 1, { needs: ['attune'] }],
      ['amplify', 'Amplify', 'passive', 250, '{S} spells +4% power per rank.', 3, { branch: 'a' }],
      ['surge', 'Surge', 'active', 400, 'For 6 s, {s} spells are 25% stronger.', 1, { branch: 'a', needs: ['amplify'] }],
      ['precision', 'Precision', 'passive', 250, 'Backfire chance with {s} spells −5% per rank.', 3, { branch: 'b' }],
      ['quicken', 'Quicken', 'active', 400, 'Your next {s} spell casts instantly.', 1, { branch: 'b', needs: ['precision'] }],
      ['channel', 'Channeling', 'passive', 550, '{S} spells cast 4% faster per rank.', 3],
      ['linger', 'Lingering', 'active', 700, 'Make a {s} effect last twice as long.', 1, { needs: ['overcast'] }],
      ['cataclysm', 'Unleash', 'active', 1200, 'Release your stored {s} power in one blast.', 1, { branch: 'a', needs: ['surge'] }],
      ['harmony', 'Harmony', 'passive', 1200, '{S} spells sometimes cost no mana.', 1, { branch: 'b', needs: ['quicken'] }],
      ['depth', 'Deep study', 'passive', 1500, '{S} spells are mastered 10% faster per rank.', 2],
      ['legend', 'Archmage of {S}', 'active', 5001, 'A working of {s} beyond any spellbook.', 1, { needsAny: ['cataclysm', 'harmony'] }],
    ],
  },
};
const CASTING = ['attunement', 'incantation', 'voiceless', 'manaControl', 'manaSense'];
const titleOf = id => { const s = { throwing: 'Throwing', void: 'Void', runicScript: 'Runic script', firstAid: 'First aid', trapHandling: 'Trap handling', monsterLore: 'Monster lore', crystalHarvesting: 'Crystal harvesting', manaControl: 'Mana control', manaSense: 'Mana sense', heavyArmor: 'Heavy armor', lightArmor: 'Light armor', voiceless: 'Voiceless casting' }[id]; return s || id[0].toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase(); };
function genericTree(id) {
  const g = SKILLS[id]?.group, T = TEMPLATES[g === 'general' && CASTING.includes(id) ? 'magic' : g]; if (!T) return null;
  const S = titleOf(id), sub = t => t.replaceAll('{S}', S).replaceAll('{s}', S.toLowerCase());
  return {
    name: S, generic: true, intro: sub(T.intro), branches: T.branches,
    nodes: T.nodes.map(([nid, name, kind, gate, text, ranks, extra]) => ({ id: nid, name: sub(name), kind, gate, text: sub(text), ranks, ...(extra || {}) })),
  };
}

// Every visible skill's tree: hand-written where it exists, generic otherwise.
export const SKILL_TREES = {};
for (const id of Object.keys(SKILLS)) { if (SKILLS[id].hidden) continue; const t = WRITTEN[id] || genericTree(id); if (t) SKILL_TREES[id] = t; }
// Pair each side node with its opposite: same rank tier, same kind (passive with passive, active with active), same
// order on the other side.
const TIER_STARTS = [0, 201, 501, 1001, 5001];
const tierOf = gate => TIER_STARTS.filter(t => gate >= t).length - 1;
for (const tree of Object.values(SKILL_TREES)) {
  const [A, B] = Object.keys(tree.branches);
  for (let t = 0; t < TIER_STARTS.length; t++) {
    for (const kind of ['passive', 'active']) {                         // a passive only ever locks a passive, an active an active
      const free = n => n.pair !== false && !n.oneOf;                // (pair: false — an extra that never locks; oneOf pairs are their own)
      const left = tree.nodes.filter(n => n.branch === A && n.kind === kind && free(n) && tierOf(n.gate) === t), right = tree.nodes.filter(n => n.branch === B && n.kind === kind && free(n) && tierOf(n.gate) === t);
      for (let i = 0; i < Math.min(left.length, right.length); i++) { left[i].opposite = right[i].id; right[i].opposite = left[i].id; }   // (an extra with no counterpart stays open)
    }
  }
}

// core one-or-the-other pairs
for (const tree of Object.values(SKILL_TREES)) for (const n of tree.nodes) if (n.oneOf) { n.opposite = n.oneOf; const o = tree.nodes.find(x => x.id === n.oneOf); if (o) o.opposite = n.id; }

// ---- state on the character: c.skillTrees[skill] = { nodes: { id: rank }, branch } ----
function trees(c) { if (!c.skillTrees) { c.skillTrees = c.weaponTrees || {}; delete c.weaponTrees; } return c.skillTrees; }   // older saves called it weaponTrees
export const treeState = (c, skill) => (trees(c)[skill] ??= { nodes: {}, branch: null });
export function pointsSpent(c, skill) { return Object.values(trees(c)[skill]?.nodes || {}).reduce((t, n) => t + n, 0); }
export function pointsFree(c, skill) { return skillPoints(c.skills[skill] ?? 100) - pointsSpent(c, skill); }
// refund every point in a tree and reopen both paths
export function resetTree(c, skill) { const n = pointsSpent(c, skill); delete trees(c)[skill]; return n; }

// Whether a node can be bought now, and if not, why: { ok, reason }
export function canBuy(c, skill, nodeId) {
  const tree = SKILL_TREES[skill], n = tree?.nodes.find(x => x.id === nodeId); if (!n) return { ok: false, reason: 'Unknown technique.' };
  const st = trees(c)[skill] || { nodes: {}, branch: null }, have = st.nodes[nodeId] ?? 0;
  if (n.innate) return { ok: false, reason: 'Known from the start.' };
  if (have >= n.ranks) return { ok: false, reason: 'Fully learned.' };
  if ((c.skills[skill] ?? 0) < n.gate) return { ok: false, reason: `Needs ${tree.name} ${n.gate}.` };
  // hybrid techniques also need another skill (also: { athletics: 300 })
  for (const [sk, lv] of Object.entries(n.also || {})) if ((c.skills[sk] ?? 0) < lv) return { ok: false, reason: `Also needs ${SKILL_TREES[sk]?.name ?? sk} ${lv}.` };
  if (n.opposite && (st.nodes[n.opposite] ?? 0) > 0) return { ok: false, reason: `Locked: you chose ${tree.nodes.find(x => x.id === n.opposite).name} instead.` };
  // a requirement on a side node is also met by its opposite, so a lockout never spreads further down the tree
  const met = id => hasNode(c, skill, id) || (() => { const o = tree.nodes.find(x => x.id === id)?.opposite; return !!o && hasNode(c, skill, o); })();
  if (n.needs && !n.needs.every(met)) return { ok: false, reason: `Needs ${n.needs.map(id => tree.nodes.find(x => x.id === id).name).join(' and ')}.` };
  if (n.needsAny && !n.needsAny.some(met)) return { ok: false, reason: `Needs ${n.needsAny.map(id => tree.nodes.find(x => x.id === id).name).join(' or ')}.` };
  if (pointsFree(c, skill) <= 0) return { ok: false, reason: 'No points. Use the skill to earn more.' };
  return { ok: true };
}
// Does the character have this node (bought, or known from the start)?
export function hasNode(c, skill, nodeId) {
  const n = SKILL_TREES[skill]?.nodes.find(x => x.id === nodeId);
  return !!n && (n.innate || (c.skillTrees?.[skill]?.nodes?.[nodeId] ?? c.weaponTrees?.[skill]?.nodes?.[nodeId] ?? 0) > 0);
}
// How many ranks of a node the character has (0 if none; innate nodes count as 1).
export function nodeRank(c, skill, nodeId) {
  const n = SKILL_TREES[skill]?.nodes.find(x => x.id === nodeId); if (!n) return 0;
  return c.skillTrees?.[skill]?.nodes?.[nodeId] ?? c.weaponTrees?.[skill]?.nodes?.[nodeId] ?? (n.innate ? 1 : 0);
}
export function buyNode(c, skill, nodeId) {
  const r = canBuy(c, skill, nodeId); if (!r.ok) return r;
  const n = SKILL_TREES[skill].nodes.find(x => x.id === nodeId), st = treeState(c, skill);
  st.nodes[nodeId] = (st.nodes[nodeId] ?? 0) + 1;
  return { ok: true };
}
