// src/data/creation.js — character creation choices.
// Every choice carries a modifier on top of the 100 baseline: { main: {...}, skills: {...} }.
// Balance rule: main stat changes in each choice sum to roughly zero, so a big strength
// in one area is paid for elsewhere. Skill gains in a specialty come with skill losses
// in areas the character never had time for.
//
// Reference character (all 100): Human / Common, male, average build,
// middle-class worker, no education, no class.

const opt = (id, name, blurb, main = {}, skills = {}, extra = {}) =>
  ({ id, name, blurb, mods: { main, skills }, ...extra });

// ---------- Races & subraces ----------
// `face` hints are used by the portrait renderer.

export const RACES = [
  opt('human', 'Human',
    'The most common folk on the continent, and the measure everyone else is compared to.',
    {}, {},
    { face: { w: 1, h: 1, ears: 'round', skin: 'skin' }, subs: [
      opt('common', 'Common', 'An ordinary human. No natural gifts, no natural flaws.'),
      opt('stout', 'Stout', 'Broad-framed hill and farm stock. Strong and tireless, but slow and heavy-handed.',
        { strength: 10, endurance: 10, speed: -10, finesse: -10 }, { athletics: 10 },
        { face: { w: 1.08, h: 0.96 } }),
      opt('halfElf', 'Half-elf', 'Human with elven blood. Quicker and sharper of mind, but lighter built.',
        { finesse: 10, mind: 5, speed: 5, strength: -10, endurance: -10 }, { awareness: 10 },
        { face: { w: 0.96, h: 1.02, ears: 'halfPointed' } }),
      opt('halfSolcaste', 'Half-Solcaste', 'Human with Solcaste blood. Stocky and strong, with a craftsman\'s instinct.',
        { strength: 10, endurance: 10, speed: -10, spirit: -5, finesse: -5 }, { smithing: 15 },
        { face: { w: 1.1, h: 0.95 } }),
    ] }),

  opt('elf', 'Elf',
    'Long-lived, quick and sharp-minded, with frames that break more easily than human ones. A century is young for an elf.',
    { finesse: 15, speed: 10, mind: 10, strength: -20, endurance: -15 }, { awareness: 10 },
    { face: { w: 0.92, h: 1.05, ears: 'pointed', skin: 'skin' }, subs: [
      opt('nature', 'Nature elf', 'Forest elves who live alongside the wild. Keen hunters and herbalists, wary of cities.',
        { dexterity: 10, spirit: 10, intelligence: -10, charisma: -10 },
        { herbalism: 30, bow: 20, survival: 20, earth: 15, wind: 15 }),
      opt('soul', 'Soul elf', 'Elves born deeply attuned to mana. They feel magic the way others feel weather.',
        { spirit: 15, mind: 10, strength: -15, endurance: -10 },
        { manaSense: 40, light: 20, life: 20, attunement: 20 }, { defaultSkin: 'porcelain' }),
      opt('dark', 'Dark elf', 'Dark-skinned elves from a people famous for their assassins. Quiet by habit and at home at night.',
        { finesse: 10, speed: 10, charisma: -10, spirit: -10 },
        { sneak: 40, dagger: 20, awareness: 20, dark: 20 }, { defaultSkin: 'deep' }),
    ] }),

  opt('solcaste', 'Solcaste',
    'Short, broad and very hard to knock down. Their eyes burn amber or sapphire, and their hands are known for craftwork.',
    { strength: 25, endurance: 25, speed: -20, finesse: -15, spirit: -15 }, {},
    { face: { w: 1.14, h: 0.92, ears: 'round', skin: 'skin', shoulders: 1.15 }, subs: [
      opt('coastal', 'Coastal Solcaste', 'Shipwrights and fishers of the southern shores. Steadier on a deck than in a mine.',
        { dexterity: 10, endurance: 5, strength: -10, intelligence: -5 },
        { fishing: 30, athletics: 20, water: 15, woodworking: 15 }),
      opt('dunes', 'Dunes Solcaste', 'Sun-hardened nomads of the desert. They travel far and need little.',
        { endurance: 10, speed: 5, strength: -5, charisma: -10 },
        { survival: 30, fire: 15, earth: 15, crystalHarvesting: 15 }, { defaultSkin: 'tan' }),
      opt('deep', 'Deep Solcaste', 'Tunnel-dwellers who rarely see the sun. Unmatched miners and smiths.',
        { strength: 10, mind: 5, speed: -10, charisma: -5 },
        { mining: 40, smithing: 30, gemcutting: 20, earth: 15 }, { defaultSkin: 'ashen' }),
    ] }),

  opt('draconian', 'Draconian',
    'Scaled, heavy and proud, with the blood of dragons a long way back. Powerful, but stiff, and other races find them intimidating.',
    { strength: 20, endurance: 20, spirit: 10, speed: -10, finesse: -20, charisma: -20 }, {},
    { face: { w: 1.05, h: 1.04, ears: 'none', skin: 'scales', horns: true }, subs: [
      opt('sunScale', 'Sun scale', 'Gold and amber scales that drink in sunlight. Often drawn to temples and light magic.',
        { spirit: 10, charisma: 10, intelligence: -10, luck: -10 },
        { fire: 30, light: 20, holy: 10 }, { defaultSkin: 'gold' }),
      opt('ashScale', 'Ash scale', 'Grey-black scales from volcanic highlands. The heaviest and hardest of the draconians.',
        { strength: 10, endurance: 10, speed: -10, charisma: -10 },
        { fire: 20, dark: 20, warhammer: 15 }, { defaultSkin: 'charcoal' }),
      opt('seaScale', 'Sea scale', 'Blue-green scales and webbed fingers. Lighter and quicker than their kin.',
        { speed: 10, dexterity: 5, strength: -10, endurance: -5 },
        { water: 30, lightning: 15, spear: 20, athletics: 20 }, { defaultSkin: 'sea' }),
    ] }),

  opt('therian', 'Therian',
    'Beast-blooded folk with the instincts of their animal side. Fast and perceptive; cities and books come harder.',
    { speed: 15, dexterity: 10, strength: 5, intelligence: -15, charisma: -10, luck: -5 },
    { awareness: 20, unarmed: 20 },
    { face: { w: 1, h: 1, ears: 'beast', skin: 'fur' }, subs: [
      opt('feline', 'Feline', 'Cat-blooded. Silent, balanced and quick to strike, but not built for long fights.',
        { finesse: 15, speed: 10, endurance: -15, strength: -10 },
        { sneak: 30, athletics: 20 }, { face: { ears: 'cat' }, defaultSkin: 'tawny' }),
      opt('boar', 'Boar', 'Boar-blooded. Massive, stubborn and nearly impossible to stop once charging.',
        { strength: 20, endurance: 15, speed: -15, finesse: -15, charisma: -5 },
        { unarmed: 20, club: 15, survival: 20 }, { face: { ears: 'boar', w: 1.15, tusks: true }, defaultSkin: 'brown' }),
      opt('avian', 'Avian', 'Bird-blooded. Hollow-boned and sharp-eyed. They cannot fly, but they see everything.',
        { speed: 15, dexterity: 10, strength: -15, endurance: -10 },
        { awareness: 30, bow: 20, wind: 20 }, { face: { ears: 'feathers', skin: 'feathers' }, defaultSkin: 'brown' }),
    ] }),

  opt('piscine', 'Piscine',
    'Gilled folk who live as easily in water as out of it. Calm-minded and spiritually sensitive, slow on land.',
    { endurance: 10, mind: 10, spirit: 5, speed: -10, strength: -5, charisma: -10 },
    { water: 30, athletics: 20 },
    { face: { w: 0.98, h: 1.02, ears: 'fins', skin: 'scales' }, subs: [
      opt('deepWater', 'Deep water', 'From the lightless depths. They see in the dark and feel void magic more than most.',
        { mind: 10, endurance: 10, speed: -10, charisma: -10 },
        { water: 20, void: 20, awareness: 10 }, { defaultSkin: 'abyss' }),
      opt('coastal', 'Coastal', 'Shore-dwellers who trade with every port. The most used to other races.',
        { charisma: 10, dexterity: 5, endurance: -5, mind: -10 },
        { bartering: 20, fishing: 30, spear: 15 }, { defaultSkin: 'coral' }),
      opt('river', 'River', 'Quick, slender folk of inland rivers and lakes.',
        { finesse: 10, speed: 5, strength: -10, endurance: -5 },
        { fishing: 20, herbalism: 20, water: 10, sneak: 10 }, { defaultSkin: 'kelp' }),
    ] }),
];

// Gender is identity: pronouns, and the body you start with. Stats come from the body itself
// (see src/rpg/morphStats.js), so a later transformation changes stats but never identity.
// body: the starting masc/fem slider (0 masculine .. 1 feminine), freely adjusted in Appearance.
export const GENDERS = [
  { id: 'man', name: 'Man', pronouns: 'he/him', body: 0, blurb: 'Starts from a masculine body. Shape it freely under Appearance; the body, not this choice, sets stats.' },
  { id: 'woman', name: 'Woman', pronouns: 'she/her', body: 1, blurb: 'Starts from a feminine body. Shape it freely under Appearance; the body, not this choice, sets stats.' },
  { id: 'nonbinary', name: 'Nonbinary', pronouns: 'they/them', body: 0.5, blurb: 'Starts from an androgynous body. Shape it freely under Appearance; the body, not this choice, sets stats.' },
].map(g => ({ ...g, mods: { main: {}, skills: {} } }));

export const BUILDS = [
  { ...opt('slender', 'Slender', '', { finesse: 10, strength: -10 }), width: 0.86 },
  { ...opt('average', 'Average', ''), width: 1 },
  { ...opt('sturdy', 'Sturdy', '', { strength: 10, finesse: -10 }), width: 1.12 },
  { ...opt('heavyset', 'Heavyset', '', { endurance: 10, speed: -10 }), width: 1.24 },
];

// ---------- Appearance (cosmetic only) ----------

export const SKIN_TONES = [
  { id: 'porcelain', name: 'Porcelain', color: '#f1dccd' },
  { id: 'fair',      name: 'Fair',      color: '#e6c3a6' },
  { id: 'olive',     name: 'Olive',     color: '#c9a37c' },
  { id: 'tan',       name: 'Tan',       color: '#b07f58' },
  { id: 'brown',     name: 'Brown',     color: '#8a5a3c' },
  { id: 'deep',      name: 'Deep',      color: '#5b3a28' },
  { id: 'ashen',     name: 'Ashen',     color: '#8d8a95' },
];
export const DRACONIAN_SCALES = [
  { id: 'gold',     name: 'Gold',     color: '#d9a441' },
  { id: 'amber',    name: 'Amber',    color: '#c27a2c' },
  { id: 'crimson',  name: 'Crimson',  color: '#9c3b2e' },
  { id: 'ash',      name: 'Ash',      color: '#6a666c' },
  { id: 'charcoal', name: 'Charcoal', color: '#3b3940' },
  { id: 'sea',      name: 'Sea blue', color: '#2f7f8f' },
  { id: 'jade',     name: 'Jade',     color: '#3f8f6a' },
  { id: 'cobalt',   name: 'Cobalt',   color: '#3a56a6' },
];
export const FUR_COLORS = [
  { id: 'tawny',  name: 'Tawny',  color: '#c9934e' },
  { id: 'ginger', name: 'Ginger', color: '#c8642a' },
  { id: 'brown',  name: 'Brown',  color: '#6e4a30' },
  { id: 'black',  name: 'Black',  color: '#2e2a2c' },
  { id: 'grey',   name: 'Grey',   color: '#8a8a90' },
  { id: 'cream',  name: 'Cream',  color: '#d8c5a0' },
  { id: 'white',  name: 'White',  color: '#ebe7df' },
];
export const FEATHER_COLORS = [
  { id: 'slate',   name: 'Slate',    color: '#5f6676' },
  { id: 'brown',   name: 'Hawk brown', color: '#7a5a3c' },
  { id: 'white',   name: 'White',    color: '#e8e6e0' },
  { id: 'black',   name: 'Raven',    color: '#2a2a32' },
  { id: 'crimson', name: 'Crimson',  color: '#a3342e' },
  { id: 'jay',     name: 'Jay blue', color: '#3c64b4' },
  { id: 'gold',    name: 'Gold',     color: '#c9a23a' },
];
export const PISCINE_SCALES = [
  { id: 'silver', name: 'Silver',  color: '#b6c3cf' },
  { id: 'pearl',  name: 'Pearl',   color: '#e6dfe8' },
  { id: 'teal',   name: 'Teal',    color: '#3f9a9a' },
  { id: 'coral',  name: 'Coral',   color: '#e0806a' },
  { id: 'kelp',   name: 'Kelp',    color: '#5f8a4e' },
  { id: 'indigo', name: 'Indigo',  color: '#454b8c' },
  { id: 'abyss',  name: 'Abyss',   color: '#2a3654' },
];
export const HAIR_COLORS = [
  { id: 'silver', name: 'Moonlight silver', color: '#dfe1ec' },
  { id: 'black',  name: 'Black',            color: '#1d1b22' },
  { id: 'brown',  name: 'Brown',            color: '#5a3b26' },
  { id: 'auburn', name: 'Auburn',           color: '#8c3a24' },
  { id: 'blonde', name: 'Blonde',           color: '#d8b26a' },
  { id: 'grey',   name: 'Grey',             color: '#8f8f97' },
  { id: 'night',  name: 'Night blue',       color: '#2b3566' },
  { id: 'sea',    name: 'Sea green',        color: '#2f6f66' },
];
export const EYE_COLORS = [
  { id: 'purple',   name: 'Deep purple', color: '#a77cf2' },
  { id: 'emerald',  name: 'Emerald',     color: '#3fcf8a' },
  { id: 'amber',    name: 'Amber',       color: '#f0a33c' },
  { id: 'sapphire', name: 'Sapphire',    color: '#4a8cf0' },
  { id: 'brown',    name: 'Brown',       color: '#7a4e2e' },
  { id: 'grey',     name: 'Grey',        color: '#9aa3ad' },
  { id: 'gold',     name: 'Gold',        color: '#e8c34a' },
  { id: 'red',      name: 'Ember red',   color: '#e0533c' },
];
export const HAIR_STYLES = [
  { id: 'short',  name: 'Short' },
  { id: 'messy',  name: 'Messy' },
  { id: 'long',   name: 'Long' },
  { id: 'tied',   name: 'Tied back' },
  { id: 'braid',  name: 'Braid' },
  { id: 'shaved', name: 'Shaved' },
];
export const HORN_STYLES = [
  { id: 'swept', name: 'Swept back' },
  { id: 'ram',   name: 'Curled' },
  { id: 'crown', name: 'Crown' },
];
export const CREST_STYLES = [
  { id: 'crest', name: 'Crest' },
  { id: 'plume', name: 'Plume' },
  { id: 'swept', name: 'Swept' },
];
export const FACIAL_HAIR = [
  { id: 'none',   name: 'None' },
  { id: 'stubble', name: 'Stubble' },
  { id: 'goatee', name: 'Goatee' },
  { id: 'beard',  name: 'Full beard' },
];
export const MARKINGS = [
  { id: 'none',     name: 'None' },
  { id: 'freckles', name: 'Freckles' },
  { id: 'scar',     name: 'Scar' },
  { id: 'crescent', name: 'Crescent mark' },
  { id: 'paint',    name: 'War paint' },
];

// Which appearance controls a race shows, and with which palettes.
export function appearanceFor(raceId, subId, gender) {
  const base = {
    skinLabel: 'Skin', skins: SKIN_TONES,
    hairLabel: 'Hair style', hairStyles: HAIR_STYLES, hairColorLabel: 'Hair color', hairColors: HAIR_COLORS,
    facial: gender === 'male', markings: MARKINGS,
  };
  switch (raceId) {
    case 'draconian':
      return { ...base, skinLabel: 'Scales', skins: DRACONIAN_SCALES, hairLabel: 'Horns', hairStyles: HORN_STYLES,
        hairColorLabel: null, facial: false };
    case 'therian':
      if (subId === 'avian') {
        return { ...base, skinLabel: 'Feathers', skins: FEATHER_COLORS, hairLabel: 'Crest', hairStyles: CREST_STYLES,
          hairColorLabel: 'Crest color', hairColors: FEATHER_COLORS, facial: false };
      }
      return { ...base, skinLabel: 'Fur', skins: FUR_COLORS };
    case 'piscine':
      return { ...base, skinLabel: 'Scales', skins: PISCINE_SCALES, facial: false };
    default:
      return base;
  }
}

// ---------- Backgrounds ----------

export const BACKGROUNDS = [
  opt('worker', 'Middle-class worker',
    'A steady job, a roof, and nothing remarkable. You start as the average citizen of Eldermere.'),
  opt('farmhand', 'Farmhand',
    'Raised on an outlying farm like the ones around Faldale. Long days built your back; books never came into it.',
    { strength: 15, endurance: 15, intelligence: -15, charisma: -5, speed: -10 },
    { herbalism: 40, survival: 30, cooking: 20, club: 10, farming: 40, literacy: -30, bartering: -10 }),
  opt('smith', "Smith's apprentice",
    'Years at the forge working someone else\'s orders. Strong arms, slow feet, little time for anything else.',
    { strength: 20, endurance: 10, finesse: -10, speed: -10, charisma: -10 },
    { smithing: 80, mining: 30, warhammer: 20, mace: 20, literacy: -20, sneak: -20 }),
  opt('acolyte', 'Temple acolyte',
    'You grew up in a small temple town, helping the priests, tending the sick, and keeping the night creatures away.',
    { spirit: 20, mind: 10, strength: -15, speed: -5, luck: -10 },
    { lunar: 50, holy: 30, quarterstaff: 20, literacy: 30, firstAid: 30, attunement: 40, voiceless: 20,
      bartering: -30, sneak: -20, lockpicking: -20 }),
  opt('urchin', 'Street urchin',
    'The alleys of Eldermere raised you. Fast, quiet and lucky, but underfed and never schooled.',
    { finesse: 20, speed: 15, luck: 10, strength: -10, endurance: -10, charisma: -10, intelligence: -15 },
    { sneak: 50, lockpicking: 50, dagger: 20, awareness: 30, literacy: -50, calligraphy: -40 }),
  opt('merchant', "Merchant's child",
    'You grew up behind a market stall, counting coin and reading people. You never had to fend for yourself.',
    { charisma: 20, intelligence: 10, strength: -10, endurance: -10, speed: -10 },
    { bartering: 60, appraisal: 50, trading: 30, literacy: 30, survival: -30, athletics: -20 }),
  opt('noble', 'Minor noble',
    'Tutors, fencing lessons and servants for everything else. Educated and well spoken, and completely soft.',
    { charisma: 20, intelligence: 15, luck: 5, endurance: -15, strength: -15, finesse: -10 },
    { literacy: 50, rapier: 40, calligraphy: 30, survival: -40, cooking: -30, athletics: -20, sneak: -20 }),
  opt('hunter', "Hunter's child",
    'You learned to track and wait in the hills, and to know which beasts to leave alone. Town life is foreign to you.',
    { dexterity: 15, finesse: 10, endurance: 5, charisma: -15, intelligence: -10, luck: -5 },
    { bow: 50, skinning: 50, survival: 40, monsterLore: 30, sneak: 20, literacy: -30, bartering: -20 }),
  opt('caravan', 'Caravan born',
    'You grew up on the trade roads riding behind the Yuribor. Tough and sociable, with little formal learning.',
    { endurance: 10, charisma: 10, luck: 10, intelligence: -15, mind: -5, spirit: -10 },
    { survival: 30, bartering: 30, trading: 30, athletics: 20, monsterLore: 20, taming: 20, literacy: -10, calligraphy: -20 }),
  opt('fisher', 'Fisherfolk',
    'Nets, boats and cold water before dawn. Strong swimmers and patient workers.',
    { endurance: 15, dexterity: 10, strength: 5, intelligence: -10, charisma: -10, spirit: -10 },
    { fishing: 70, athletics: 40, spear: 20, cooking: 20, literacy: -30, lockpicking: -10 }),
  opt('miner', 'Tunnel miner',
    'You worked the deep seams and crystal veins. Iron lungs and arms, little sun and little company.',
    { strength: 20, endurance: 20, speed: -15, charisma: -15, luck: -10 },
    { mining: 80, crystalHarvesting: 30, club: 20, literacy: -30, bartering: -20, survival: -10 }),
  opt('nomad', 'Desert nomad',
    'You crossed the dunes with your clan, reading stars and sand. Hardy, but untouched by city learning.',
    { endurance: 20, speed: 5, luck: 5, charisma: -10, intelligence: -10, strength: -10 },
    { survival: 60, athletics: 20, spear: 20, monsterLore: 20, taming: 20, literacy: -30, smithing: -20 }),
  opt('forest', 'Forest dweller',
    'Raised deep in the woods, among trees older than cities. At home with plants and quiet, lost among crowds.',
    { dexterity: 10, spirit: 15, finesse: 5, intelligence: -10, charisma: -10, strength: -10 },
    { herbalism: 50, bow: 30, survival: 40, logging: 20, literacy: -20, bartering: -30, smithing: -20 }),
  opt('dockworker', 'Dockworker',
    'Hauling crates and settling arguments on the river docks. Strong, rough, and short on patience for study.',
    { strength: 20, endurance: 15, finesse: -10, intelligence: -10, mind: -15 },
    { athletics: 40, club: 20, unarmed: 20, bartering: 10, literacy: -20, calligraphy: -30 }),
  opt('campFollower', 'Camp follower',
    'You grew up trailing an army camp: cooking, mending and patching wounds. You know soldiers better than schools.',
    { endurance: 15, strength: 10, luck: -5, charisma: -10, intelligence: -10 },
    { shortsword: 20, spear: 20, cooking: 30, firstAid: 30, survival: 20, literacy: -20 }),
  opt('guildBrat', 'Raised in the guild',
    'Your parents were adventurers and the guild hall was your nursery. You grew up on monster stories and bar food.',
    { luck: 10, charisma: 10, dexterity: 10, intelligence: -10, mind: -10, spirit: -10 },
    { monsterLore: 40, awareness: 20, cooking: 20, shortsword: 20, throwing: 20, literacy: -10, calligraphy: -20 }),
  opt('herbalist', "Apothecary's apprentice",
    'You sorted herbs and ground powders in a shop much like the Cauldron and Moonlight. Clever hands, weak back.',
    { intelligence: 15, finesse: 10, spirit: 5, strength: -15, endurance: -15 },
    { herbalism: 60, alchemy: 50, firstAid: 20, literacy: 20, athletics: -30, survival: -10 }),
  opt('clerk', 'Archive clerk',
    'Years copying records in a city archive. You read everything and lifted nothing heavier than a ledger.',
    { intelligence: 20, mind: 10, endurance: -10, strength: -15, speed: -5 },
    { literacy: 70, calligraphy: 50, runicScript: 30, scribing: 30, appraisal: 20, athletics: -40, survival: -40 }),
  opt('pitFighter', 'Pit fighter',
    'You fought for coin in the underground rings. Hard as nails and quick with your fists, and not much else.',
    { strength: 20, endurance: 15, speed: 5, intelligence: -15, charisma: -10, mind: -15 },
    { unarmed: 50, club: 30, shield: 20, athletics: 30, literacy: -40, calligraphy: -40, bartering: -20 }),
  opt('servant', 'Household servant',
    'Trained by the Butlers\' Association to serve a great house. Polished, observant and quiet; never built for labor.',
    { finesse: 10, charisma: 15, mind: 5, strength: -15, endurance: -5, luck: -10 },
    { cooking: 50, tailoring: 40, sneak: 20, appraisal: 20, survival: -30, athletics: -20 }),
  opt('performer', 'Street performer',
    'Juggling, dancing and talking for coins in the market squares. Charming and nimble, with no staying power.',
    { charisma: 25, finesse: 10, speed: 5, strength: -15, endurance: -15, intelligence: -10 },
    { bartering: 20, throwing: 20, awareness: 20, athletics: 20, survival: -20, smithing: -20 }),
  opt('sailor', 'Sailor',
    'You worked the trade ships along the coast. Tough, steady on your feet, and luckier than most.',
    { endurance: 15, dexterity: 10, luck: 5, intelligence: -10, charisma: -10, mind: -10 },
    { athletics: 40, fishing: 30, shortsword: 20, woodworking: 20, literacy: -20 }),
  // cooking backgrounds
  opt('tavernCook', 'Tavern cook',
    'You grew up in the kitchen of a busy inn, feeding guild crews at every hour. Quick hands and a thick skin; little schooling.',
    { finesse: 10, endurance: 10, charisma: 5, intelligence: -10, mind: -5, spirit: -10 },
    { cooking: 70, herbalism: 10, dagger: 10, bartering: 20, literacy: -20, survival: -10 }),
  opt('streetVendor', 'Street food vendor',
    'You sold skewers and buns from a cart in the market, shouting over everyone else. Cheap, fast and always busy.',
    { charisma: 10, speed: 5, finesse: 5, strength: -10, intelligence: -5, spirit: -5 },
    { cooking: 50, bartering: 40, trading: 10, awareness: 10, literacy: -20, survival: -20 }),
];

// ---------- Education ----------

export const EDUCATION = [
  opt('none', 'None', 'You picked up what you could along the way.'),
  opt('village', 'Village lessons', 'A few winters of letters and sums from whoever in town could teach them.',
    {}, { literacy: 20, calligraphy: 10 }),
  opt('temple', 'Temple schooling', 'Scripture, careful handwriting, and the first rules of channeling mana.',
    { intelligence: 5, spirit: 10, strength: -5, speed: -5, luck: -5 },
    { literacy: 40, calligraphy: 30, runicScript: 20, scribing: 20, attunement: 20, bartering: -20 }),
  opt('guild', 'Guild training', 'Lessons from guild veterans: how monsters think, how traps work, and how to patch a wound in the field.',
    { dexterity: 5, endurance: 5, intelligence: -5, charisma: -5 },
    { monsterLore: 40, trapHandling: 20, survival: 20, firstAid: 20 }),
  opt('military', 'Military drill', 'Years of drills, marching and weapon practice. Discipline over study.',
    { strength: 10, endurance: 10, intelligence: -10, charisma: -5, spirit: -5 },
    { longsword: 20, spear: 20, shield: 20, athletics: 20, firstAid: 10, calligraphy: -20 }),
  opt('craft', 'Craft apprenticeship', 'A long apprenticeship under a master craftsman, learning a little of every trade.',
    { finesse: 10, intelligence: 5, speed: -10, charisma: -5 },
    { smithing: 30, woodworking: 30, leatherworking: 30, tailoring: 30 }),
  opt('kitchen', 'Kitchen apprenticeship', 'Years under a head cook, from scrubbing pots to running a station. Hot, loud and exacting.',
    { finesse: 10, endurance: 5, intelligence: -5, mind: -5, charisma: -5 },
    { cooking: 50, herbalism: 10, skinning: 10, literacy: -10 }),
  opt('academy', 'Eldermere academy', 'Formal study in the capital: runes, incantation theory and a great deal of reading. Little time outdoors.',
    { intelligence: 15, mind: 10, strength: -10, endurance: -10, speed: -5 },
    { literacy: 60, calligraphy: 40, runicScript: 40, attunement: 40, incantation: 30, manaControl: 20,
      survival: -30, athletics: -20 }),
  opt('magesGuild', "Mages' Guild college", 'Study under the Mages\' Guild, focused on channeling and control. Your body was an afterthought.',
    { intelligence: 10, mind: 15, strength: -10, endurance: -15 },
    { attunement: 60, incantation: 40, manaControl: 40, manaSense: 20, runicScript: 20, literacy: 30,
      athletics: -30, survival: -20 }),
  opt('physicians', "Physicians' college", 'Anatomy, medicine and remedies, studied in the city\'s halls of healing.',
    { intelligence: 15, finesse: 10, strength: -10, endurance: -10, speed: -5 },
    { firstAid: 60, alchemy: 40, herbalism: 30, literacy: 40, athletics: -20 }),
  opt('counting', 'Counting house', 'Ledgers, contracts and trade law, learned in a merchant house.',
    { intelligence: 10, charisma: 10, strength: -10, endurance: -10 },
    { bartering: 40, appraisal: 40, trading: 20, literacy: 30, calligraphy: 20, survival: -20 }),
  opt('elders', 'Teaching of the elders', 'The oral traditions of your people: the land, the beasts and the old spirits. Nothing written down.',
    { spirit: 10, mind: 5, intelligence: -10, charisma: -5 },
    { survival: 30, monsterLore: 30, herbalism: 20, voiceless: 20, literacy: -30, calligraphy: -30 }),
  opt('self', 'Self-taught', 'Borrowed books and a stubborn streak. Gaps everywhere, but you learn fast.',
    { intelligence: 10, luck: 5, charisma: -10, mind: -5 },
    { literacy: 30, appraisal: 20 }),
];

// ---------- Classes & subclasses ----------
// A class is a starting kit, never a restriction. The subclass adds a specialty on top.

export const CLASSES = [
  opt('none', 'No class',
    'Start with nothing but your history. Every skill is still open to you; you just have no head start.',
    {}, {}, { subs: [opt('none', 'None', 'No specialty.')] }),

  opt('soldier', 'Soldier',
    'Trained to hold a line in formation. Strong and steady, with no patience for subtlety or spellwork.',
    { strength: 15, endurance: 15, finesse: -10, intelligence: -10, mind: -10 },
    { longsword: 30, shield: 30, spear: 20, athletics: 20, firstAid: 10, sneak: -20 },
    { subs: [
      opt('swordsman', 'Swordsman', 'Sword and shield, the backbone of any army.', {}, { longsword: 50, shortsword: 20 }),
      opt('spearman', 'Spearman', 'Reach and formation fighting.', {}, { spear: 50, glaive: 20 }),
      opt('shieldbearer', 'Shieldbearer', 'The wall the enemy breaks against.', { endurance: 5, speed: -5 }, { shield: 50, mace: 30 }),
      opt('crossbowman', 'Crossbowman', 'Heavy bolts from behind the line.', {}, { crossbow: 60, awareness: 20 }),
    ] }),

  opt('barbarian', 'Barbarian',
    'Raw strength and fury. You hit harder than anyone and think about it afterwards.',
    { strength: 25, endurance: 15, speed: 5, intelligence: -20, mind: -15, charisma: -10 },
    { athletics: 30, unarmed: 20, survival: 20, literacy: -30, calligraphy: -30, incantation: -20 },
    { subs: [
      opt('berserker', 'Berserker', 'Great axes and no retreat.', {}, { greataxe: 60 }),
      opt('brute', 'Brute', 'Hammers and clubs that break bone and armor alike.', {}, { warhammer: 50, club: 30 }),
      opt('wildborn', 'Wildborn', 'Bare hands and the instincts of the wild.', {}, { unarmed: 50, survival: 20, monsterLore: 20 }),
    ] }),

  opt('scout', 'Scout',
    'Eyes ahead of the party. Light on your feet and hard to spot, but you avoid a straight fight.',
    { dexterity: 15, finesse: 10, speed: 10, strength: -15, endurance: -10, charisma: -10 },
    { awareness: 40, sneak: 30, survival: 30, bow: 20, shield: -20 },
    { subs: [
      opt('ranger', 'Ranger', 'The bow, at range, before they see you.', {}, { bow: 60, shortsword: 20 }),
      opt('pathfinder', 'Pathfinder', 'Finds the way through, and knows what lives there.', {}, { survival: 40, monsterLore: 30, spear: 20 }),
      opt('skirmisher', 'Skirmisher', 'Hit, move, throw, hit again.', {}, { throwing: 50, shortsword: 40 }),
    ] }),

  opt('rogue', 'Rogue',
    'Locks, shadows and weak points. Fragile in a fair fight, so you make sure it isn\'t one.',
    { finesse: 25, speed: 15, luck: 10, strength: -15, endurance: -15, spirit: -20 },
    { sneak: 40, lockpicking: 40, trapHandling: 30, dagger: 30 },
    { subs: [
      opt('thief', 'Thief', 'In and out, with whatever was worth taking.', {}, { lockpicking: 40, sneak: 30, appraisal: 20 }),
      opt('assassin', 'Assassin', 'One clean strike to a weak point.', {}, { dagger: 50, throwing: 30, awareness: 20 }),
      opt('duelist', 'Duelist', 'Rapier work and footwork.', {}, { rapier: 60, athletics: 10 }),
    ] }),

  opt('mage', 'Mage',
    'Spoken incantations and a deep mana pool, in a body that breaks easily.',
    { intelligence: 15, mind: 25, strength: -20, endurance: -20 },
    { attunement: 110, incantation: 50, manaControl: 40, literacy: 30, runicScript: 20, athletics: -20 },
    { subs: [
      opt('pyromancer', 'Pyromancer', 'Fire, the most destructive of the elements.', {}, { fire: 70 }),
      opt('hydromancer', 'Hydromancer', 'Water, to drown, cut and douse.', {}, { water: 70 }),
      opt('geomancer', 'Geomancer', 'Earth and stone, walls and pits.', {}, { earth: 70 }),
      opt('aeromancer', 'Aeromancer', 'Wind, for speed, distance and force.', {}, { wind: 70 }),
      opt('stormcaller', 'Stormcaller', 'Lightning, carried on the wind.', {}, { lightning: 70, wind: 20 }),
    ] }),

  opt('cleric', 'Cleric',
    'A servant of the gods who fights with faith and prayer. Spiritually strong, slower and weaker in body.',
    { spirit: 25, mind: 10, charisma: 5, strength: -15, speed: -10, finesse: -15 },
    { attunement: 80, holy: 30, voiceless: 30, firstAid: 20 },
    { subs: [
      opt('moonAcolyte', 'Moon acolyte', 'A fighting priest of the Moon Goddess. Quarterstaff and lunar light cast by feel.',
        {}, { lunar: 60, quarterstaff: 50 }),
      opt('templar', 'Templar', 'Armored faith: mace, shield and holy power.',
        { strength: 5, endurance: 5, spirit: -10 }, { holy: 40, mace: 40, shield: 30 }),
      opt('lightbearer', 'Lightbearer', 'Bringer of light and mender of the wounded.', {}, { light: 60, life: 30 }),
    ] }),

  opt('spellblade', 'Spellblade',
    'Steel strengthened with magic. You fight in close and cast as you strike.',
    { strength: 10, dexterity: 15, mind: 10, intelligence: -10, spirit: -10, charisma: -15 },
    { attunement: 60, enhancement: 50, incantation: 20 },
    { subs: [
      opt('vanguard', 'Vanguard', 'Fortarus and a greatsword.', {}, { greatsword: 50, enhancement: 20 }),
      opt('windblade', 'Windblade', 'Wind-quickened blade work.', {}, { wind: 40, shortsword: 40 }),
      opt('flameblade', 'Flameblade', 'A burning edge.', {}, { fire: 40, longsword: 40 }),
    ] }),

  opt('medic', 'Medic',
    'Keeps the party alive in the field. Steady hands and endurance, at the cost of luck and strength.',
    { finesse: 10, endurance: 10, spirit: 5, strength: -10, charisma: -5, luck: -10 },
    { firstAid: 60, herbalism: 30, survival: 20 },
    { subs: [
      opt('fieldMedic', 'Field medic', 'Reaching the wounded under fire.', {}, { firstAid: 30, shield: 20, athletics: 20 }),
      opt('herbalist', 'Herbalist', 'Salves and remedies from what grows nearby.', {}, { herbalism: 40, alchemy: 40 }),
      opt('combatMedic', 'Combat medic', 'Patches people up and cracks heads in between.', {}, { mace: 40, firstAid: 20 }),
    ] }),

  opt('doctor', 'Doctor',
    'A learned healer with years of study behind them. Brilliant, and badly out of shape.',
    { intelligence: 20, finesse: 10, mind: 5, strength: -15, endurance: -10, speed: -10 },
    { firstAid: 50, alchemy: 40, literacy: 50, herbalism: 20, attunement: 30, athletics: -30, survival: -20 },
    { subs: [
      opt('physician', 'Physician', 'Medicine by knowledge and steady hands.', {}, { firstAid: 40, appraisal: 20 }),
      opt('healer', 'Healer', 'Medicine by life magic.', {}, { life: 70, attunement: 40 }),
      opt('apothecary', 'Apothecary', 'Medicine by potion.', {}, { alchemy: 60, herbalism: 30 }),
    ] }),

  opt('hunter', 'Hunter',
    'Hunts beasts and monsters for a living. Patient and well-read in monster lore, ill at ease in town.',
    { dexterity: 15, endurance: 10, finesse: 5, charisma: -15, intelligence: -10, mind: -5 },
    { bow: 30, skinning: 40, survival: 40, monsterLore: 40, trapHandling: 20 },
    { subs: [
      opt('trapper', 'Trapper', 'Snares, pits and patience.', {}, { trapHandling: 50, skinning: 20 }),
      opt('beastHunter', 'Beast hunter', 'Spear in hand against the big ones.', {}, { monsterLore: 40, spear: 40 }),
      opt('tracker', 'Tracker', 'Follows anything, anywhere, unseen.', {}, { awareness: 40, sneak: 30, bow: 20 }),
    ] }),

  opt('artisan', 'Artisan',
    'A trained craftsman. Skilled hands and a good eye for quality; slow and unpracticed in a fight.',
    { finesse: 15, intelligence: 10, strength: 5, speed: -10, charisma: -10, luck: -10 },
    { appraisal: 30 },
    { subs: [
      opt('blacksmith', 'Blacksmith', 'Weapons, armor and tools.', { strength: 5, finesse: -5 }, { smithing: 80, warhammer: 20 }),
      opt('leatherworker', 'Leatherworker', 'Light armor, packs and straps.', {}, { leatherworking: 80, skinning: 30 }),
      opt('gemcutter', 'Gemcutter', 'Gems, crystals and crystal dust.', {}, { gemcutting: 80, crystalHarvesting: 30 }),
      opt('carpenter', 'Carpenter', 'Bows, staffs, shields and buildings.', {}, { woodworking: 80, logging: 30 }),
      opt('cook', 'Cook', 'Meals that keep a party on its feet, from a campfire or a kitchen.', {}, { cooking: 80, herbalism: 20, fishing: 10 }),
    ] }),

  opt('merchantClass', 'Merchant',
    'Trade is your weapon. Persuasive, lucky and shrewd, and useless in a brawl.',
    { charisma: 25, intelligence: 10, luck: 10, strength: -15, endurance: -15, speed: -15 },
    { bartering: 60, appraisal: 50, trading: 40, literacy: 30, athletics: -30 },
    { subs: [
      opt('trader', 'Trader', 'Buy low, sell high, everywhere.', {}, { bartering: 40, trading: 40 }),
      opt('appraiser', 'Appraiser', 'Knows what anything is worth, including magic.', {}, { appraisal: 50, manaSense: 20 }),
      opt('smuggler', 'Smuggler', 'Goods that don\'t pass through the gate checks.', {}, { sneak: 40, lockpicking: 20, dagger: 20 }),
    ] }),

  opt('scholar', 'Scholar',
    'A lifetime of books and ruins. Knowledge few others have, and almost no physical conditioning.',
    { intelligence: 25, mind: 15, strength: -15, endurance: -15, speed: -10 },
    { literacy: 70, calligraphy: 40, runicScript: 40, monsterLore: 20, athletics: -40, survival: -20 },
    { subs: [
      opt('runologist', 'Runologist', 'Studies modern and ancient runes.', {}, { runicScript: 50, calligraphy: 30, manaSense: 20 }),
      opt('historian', 'Historian', 'Old wars, old monsters, old treasures.', {}, { literacy: 30, monsterLore: 40, appraisal: 30 }),
      opt('arcanist', 'Arcanist', 'The theory of mana itself.', {}, { attunement: 60, manaControl: 40, manaSense: 40 }),
      opt('scribe', 'Scribe', 'Copies, records and the first simple spell scrolls.', {}, { scribing: 60, calligraphy: 30 }),
    ] }),
];

// ---------- Starting kits ----------
// What each class (and specialty) arrives wearing, holding and carrying. Item ids are from
// src/rpg/equipment.js; carried items (tools, kits) go in the pack. Full starting kits get refined in
// the class pass.
const KIT_BASE = {
  none: ['trousers', 'tunic', 'shoes'],
  soldier: ['trousers', 'tunic', 'jerkin', 'boots'],
  barbarian: ['trousers', 'boots'],
  scout: ['trousers', 'tunic', 'jerkin', 'boots', 'hood', 'longcape', 'campKit'],
  rogue: ['trousers', 'tunic', 'gloves', 'boots', 'hood', 'lockpicks'],
  mage: ['robe', 'shoes', 'longcape'],
  cleric: ['vestments', 'shoes', 'cape'],
  spellblade: ['trousers', 'tunic', 'jerkin', 'gauntlets', 'boots'],
  medic: ['trousers', 'tunic', 'gloves', 'boots', 'healerKit'],
  doctor: ['trousers', 'tunic', 'shoes', 'longcape', 'healerKit'],
  hunter: ['trousers', 'tunic', 'jerkin', 'boots', 'hood', 'skinningKnife', 'campKit'],
  artisan: ['trousers', 'tunic', 'gloves', 'boots', 'repairKit'],
  merchantClass: ['trousers', 'tunic', 'shoes', 'cape'],
  scholar: ['scholarRobe', 'shoes', 'writingKit'],
};
const KIT_SUB = {
  swordsman: ['sword', 'shield'], spearman: ['spear', 'helmet'], shieldbearer: ['mace', 'shield', 'helmet'], crossbowman: ['crossbow'],
  berserker: ['greataxe'], brute: ['warhammer'], wildborn: [],
  ranger: ['bow'], pathfinder: ['spear'], skirmisher: ['shortsword', 'throwingKnives'],
  thief: ['dagger'], assassin: ['dagger', 'offdagger'], duelist: ['rapier', 'offdagger'],
  pyromancer: ['staff'], hydromancer: ['staff'], geomancer: ['staff'], aeromancer: ['staff'], stormcaller: ['staff'],
  moonAcolyte: ['staff'], templar: ['breastplate', 'mace', 'shield'], lightbearer: ['staff'],
  vanguard: ['greatsword'], windblade: ['shortsword'], flameblade: ['sword'],
  fieldMedic: ['dagger', 'shield'], herbalist: ['sickle', 'alchemyKit'], combatMedic: ['mace'],
  physician: ['dagger'], healer: ['staff'], apothecary: ['dagger', 'alchemyKit'],
  trapper: ['axe', 'trapTools'], beastHunter: ['spear'], tracker: ['bow'],
  blacksmith: ['club', 'smithTools'], leatherworker: ['skinningKnife', 'leatherTools'], gemcutter: ['crystalChisel', 'lapidaryTools'],
  carpenter: ['woodaxe', 'woodTools'], cook: ['dagger', 'cookware', 'campKit'],
  trader: ['dagger'], appraiser: ['dagger', 'lapidaryTools'], smuggler: ['dagger', 'offdagger', 'lockpicks'],
  runologist: ['spellbook'], historian: ['spellbook'], arcanist: ['staff'], scribe: ['quill'],
};
export function startingKit(clsId, subId) {
  return [...(KIT_BASE[clsId] || KIT_BASE.none), ...(KIT_SUB[subId] || [])];
}
