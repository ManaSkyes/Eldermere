// src/ui/book.js — the character book (Tab / I): a leather-bound journal with ribbon tabs.
//
//   1 Character   equipment slots, the player's figure (rendered live by play.js into the box), the pack
//   2 Body        what the body is made of: lineages, masculine/feminine, each part
//   3 Attributes  main stats, derived stats, general skills
//   3 Life skills professions with rank, title and progress
//   4 Combat      combat level, weapon and combat skills
//   6 Runes       runic-script proficiency and the future runic codex
//   7 Magic       mana, casting skills, schools, known spells
//
// The figure box is see-through: play.js renders the character into that part of the game canvas
// (portraitRect), so the book never builds a second 3D view.
import { escapeHtml, label } from './util.js';
import { MAIN_STATS, SKILLS, effectiveMain, derived, limitState, display, xpToNext, assignPoints } from '../rpg/stats.js';
import { RANKS, rankOf, rankProgress, titleFor, PROFESSIONS } from '../data/professions.js';
import { SLOTS, ITEMS } from '../rpg/equipment.js';
import { MATERIALS, PLANTS } from '../data/materials.js';
import { HERBARUM_PAGES, classifyPlant, knownPlantIds } from '../rpg/herbarum.js';
import { SPELLS } from '../data/spells.js';
import { MASTERY, preparedMax, preparedOf, togglePrepared, castProfile, masteryOf, schoolsOf, spellEvolutionOf } from '../rpg/magic.js';
import { POTIONS } from '../data/potions.js';
import { countOf, stackSummary } from '../rpg/inventory.js';
import { MONSTERS } from '../data/monsters.js';
import { knownIds } from '../rpg/bestiary.js';
import { capacity, loadOf } from '../rpg/carry.js';
import { PLACES, repTier, repProgress } from '../data/reputation.js';
import { SKILL_TREES, treeState, pointsFree, skillPoints, canBuy, buyNode, resetTree } from '../data/skillTrees.js';
import { comboLength, heavyLength } from '../rpg/combos.js';
import { BODY_PARTS, HUMAN } from '../rpg/bodyState.js';
import { RACES as BODY_RACES } from '../rpg/races.js';

export const TOP_TABS = [['character', 'Character'], ['body', 'Body'], ['attributes', 'Attributes'], ['tools', 'Tools']];
export const LEFT_TABS = [['combat', 'Combat'], ['runes', 'Runes'], ['magic', 'Magic'], ['spells', 'Spells']];
export const RIGHT_TABS = [['life', 'Life skills'], ['crafting', 'Crafting'], ['bestiary', 'Bestiary'], ['herbarum', 'Herbarum'], ['lore', 'Lore']];
export const TABS = [...TOP_TABS, ...LEFT_TABS, ...RIGHT_TABS];
// equipment slots as laid out down the left of the page, head to toe, then hands
const SLOT_ORDER = ['head', 'back', 'chest', 'top', 'arms', 'hands', 'wrist', 'legs', 'bottom', 'feet', 'mainHand', 'offHand'];
const CASTING = ['attunement', 'incantation', 'voiceless', 'manaControl', 'manaSense', 'chainCasting'];
const CATEGORY_NAMES = { gathering: 'Gathering', crafting: 'Crafting', trade: 'Trade', processing: 'Processing' };
const MAGIC_GROUPS = { Spirit: ['holy', 'light', 'dark', 'lunar', 'life'], Mind: ['void', 'fire', 'water', 'earth', 'wind', 'lightning', 'enhancement', 'spatial'] };

const BEAST_CLASSIFICATIONS = {
  'Essence Tiers': {
    description: 'What a creature is at its essence.',
    orders: {
      'Primeval Essence': 'Ancient, almost god-like, and integral to mythology.',
      'Mystic Essence': 'Alters its environment through magic or sheer presence; the stuff of legends.',
      'Spectral Essence': 'Ghostly and between planes, bound to places or artifacts.',
      'Wild Essence': 'Common but formidable beasts of the wilds, of any size.'
    }
  },
  'Celestial Hierarchy': {
    description: 'Creatures whose nature is bound to the heavens.',
    orders: {
      'Stellar Dominions': 'Cosmic beings shaped by the energies of stars and the void.',
      'Solar Regents': 'Radiant creatures whose strength comes from sunlight.',
      'Lunar Sentinels': 'Stealthy night creatures empowered by the moon.',
      'Terrestrial Guardians': 'Earth-bound protectors of sacred or cursed places.'
    }
  },
  'Elemental Circles': {
    description: 'Creatures defined by a primal element.',
    orders: {
      Corefire: 'Fire, lava and heat; volatile and aggressive.',
      Deepsea: 'The depths: leviathans, sirens and other sea-born powers.',
      Stormwind: 'Wind and storm; harbingers of tempests.',
      Stoneheart: 'Earth and stone, from golems to subterranean horrors.'
    }
  },
  'Arcane Orders': {
    description: 'Creatures shaped by the practice or influence of magic.',
    orders: {
      'Archmagi Beasts': 'Intelligent masters of several magics.',
      'Sorcerer Fiends': 'Specialists in magic used to deceive or overpower.',
      'Witchkin Spirits': 'Tricksters wielding dark or forbidden magic.',
      'Runebound Minions': 'Lesser beings made or controlled by runes and spells.'
    }
  },
  'Mythic Classes': {
    description: 'Rare legendary bloodlines and powers.',
    orders: {
      'Titanic Overlords': 'The rarest beings, pivotal in world events.',
      'Draconic Majesties': 'Dragons and dragon-kin.',
      'Beastly Sovereigns': 'Alphas that lead packs and hordes.'
    }
  }
};
const BEAST_CLASSIFICATION_ORDER = Object.keys(BEAST_CLASSIFICATIONS);


// ctx: { character, inv, body: () => viewer|null, hotbar, onUse(id), onChange(), onClose() }
export function createBook(root, ctx) {
  const el = document.createElement('div');
  el.className = 'book-wrap'; el.hidden = true;
  root.appendChild(el);
  let tab = 'character', prepMode = false, treeView = false, treeReturnTab = 'combat';
  const c = ctx.character;

  const bar = (f, cls = '') => `<span class="meter ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>`;
  // progress meter: the fill is how far to the next point; the thin line under it is progress through the rank
  const nextMeter = (v, rankF, tip) => { const fr = v - Math.floor(v);
    return `<span class="meter two" title="${escapeHtml(tip)}"><i style="width:${(fr * 100).toFixed(1)}%"></i>${rankF === null ? '' : `<b style="width:${(Math.max(0, Math.min(1, rankF)) * 100).toFixed(1)}%"></b>`}</span>`; };
  const skillMeter = v => { const r = rankOf(v), i = RANKS.indexOf(r), nx = RANKS[i + 1];
    return nextMeter(v, rankProgress(v), `${Math.floor((v - Math.floor(v)) * 100)}% to ${Math.floor(v) + 1}${nx ? ` · ${nx.min - Math.floor(v)} more to ${nx.name}` : ''}`); };
  const skillRow = (id, extra = '') => {
    const v = c.skills[id] ?? 0, r = rankOf(v);
    return `<tr><th${SKILL_TREES[id] ? ` class="treelink" data-tree="${id}" title="Open the ${escapeHtml(label(id))} tree"` : ''}>${escapeHtml(label(id))}</th><td class="num">${display(v)}</td><td class="rank r-${r.id}">${r.name}</td><td>${skillMeter(v)}</td>${extra}</tr>`;
  };
  const visible = group => Object.keys(SKILLS).filter(id => SKILLS[id].group === group && !SKILLS[id].hidden);

  // ---- what can be worn or carried ----
  const itemName = id => ITEMS[id]?.name ?? MATERIALS[id]?.name ?? POTIONS[id]?.name ?? id;
  const glyph = id => {
    const it = ITEMS[id]; if (!it) return MATERIALS[id] ? '◆' : '•';
    if (it.damage) return '⚔'; if (it.focus) return '✦'; if (it.tool) return '⚒'; if (it.carried) return '▣'; if (it.armor) return '⛨'; return '◇';
  };
  function packEntries() {
    // unique items one per slot, then material stacks one per slot (potions live in the tester's case)
    const out = ctx.inv.items.map(it => ({ kind: 'item', uid: it.uid, id: it.id }));
    for (const id of Object.keys(ctx.inv.stacks)) if (!POTIONS[id]) { const n = countOf(ctx.inv, id) + ctx.inv.stacks[id].unknown.length; if (n) out.push({ kind: 'stack', id, n }); }
    return out;
  }

  // ---- the material card: name, kind, then each quality held (0–100 by tens) and how many ----
  const card = document.createElement('div'); card.className = 'mat-card'; card.hidden = true; document.body.appendChild(card);
  function matCard(li) {
    const S = stackSummary(ctx.inv, li.dataset.id), M = MATERIALS[li.dataset.id] || {};
    const rows = S.grades.map(g => `<tr><td class="q q${g.grade}">${g.grade}</td><td>${escapeHtml(g.name)}</td><td class="num">×${g.count}</td></tr>`).join('');
    card.innerHTML = `<b>${escapeHtml(S.name)}</b><small>${escapeHtml([M.kind, M.tier ? `tier ${M.tier}` : ''].filter(Boolean).join(' · '))} · ${S.total} held</small>` +
      (rows ? `<table><tr><th>Quality</th><th></th><th></th></tr>${rows}</table>` : '') +
      (S.unappraised ? `<p>${S.unappraised} not yet appraised</p>` : '');
    card.hidden = false;
  }
  function placeCard(ev) { card.style.left = `${Math.min(innerWidth - card.offsetWidth - 8, ev.clientX + 16)}px`; card.style.top = `${Math.min(innerHeight - card.offsetHeight - 8, ev.clientY + 12)}px`; }

  // ---- pages ----
  function pageCharacter() {
    const body = ctx.body(), worn = body ? body.gear.equipped() : {};
    const cap = capacity(c), load = loadOf(ctx.inv, worn);
    const entries = packEntries(), cells = Math.max(cap.slots, entries.length);
    const slots = SLOT_ORDER.map(s => {
      const id = worn[s];
      return `<li class="eq ${id ? 'full' : ''}" data-slot="${s}" title="${id ? `${escapeHtml(itemName(id))} — click to take off` : SLOTS[s].name}">
        <span class="eq-slot">${SLOTS[s].name}</span><span class="eq-item">${id ? `<i>${glyph(id)}</i>${escapeHtml(itemName(id))}` : '—'}</span></li>`;
    }).join('');
    const grid = Array.from({ length: cells }, (_, i) => {
      const e = entries[i], over = i >= cap.slots ? ' over' : '';
      if (!e) return `<li class="cell empty${over}"></li>`;
      const it = ITEMS[e.id], tip = e.kind === 'stack' ? '' : `${itemName(e.id)}${it?.weight ? ` · ${it.weight} kg` : ''}${it && !it.carried && it.slot ? ' — click to wear' : ''}`;   // (materials get a quality card instead)
      return `<li class="cell${over}" data-kind="${e.kind}" data-id="${e.id}" ${e.uid ? `data-uid="${e.uid}"` : ''} title="${escapeHtml(tip)}"><i>${glyph(e.id)}</i><span>${escapeHtml(itemName(e.id))}</span>${e.n ? `<b>${e.n}</b>` : ''}</li>`;
    }).join('');
    const potions = Object.keys(POTIONS).filter(id => countOf(ctx.inv, id));
    const heavy = load.kg > cap.kg;
    return `
      <div class="pg pg-top">
        <section class="cell-p equip"><h3>Equipment</h3><ul class="eq-list">${slots}</ul></section>
        <section class="figure" aria-label="Your character"><span class="figure-hint">Drag to turn</span></section>
      </div>
      <section class="cell-p pack">
        <header><h3>Pack</h3>
          <span class="load ${entries.length > cap.slots ? 'bad' : ''}">${entries.length} / ${cap.slots} slots</span>
          <span class="load ${heavy ? 'bad' : ''}">${load.kg.toFixed(1)} / ${cap.kg.toFixed(1)} kg${heavy ? ' · overloaded: you move slower' : ''}</span></header>
        <ul class="grid">${grid}</ul>
        <p class="hint">Slots and carrying weight come from Strength, Endurance and Athletics.</p>
        ${potions.length ? `<h3>Tester's case <span class="hint">(test grounds only: weightless, takes no slots) · click to drink, drag to the hotbar</span></h3>
        <ul class="case">${potions.map(id => `<li draggable="true" data-potion="${id}" title="${escapeHtml(POTIONS[id].text)}"><i class="flask" style="--c:${POTIONS[id].color}"></i><span>${escapeHtml(POTIONS[id].name)}</span><b>×${countOf(ctx.inv, id)}</b></li>`).join('')}</ul>` : ''}
      </section>`;
  }

  function pageAttributes() {
    const m = effectiveMain(c), d = derived(c), cap = capacity(c);
    const rows = MAIN_STATS.map(s => `<tr><th>${label(s)}</th><td class="num limit-${limitState(c, s)}">${display(m[s])}</td>
      <td>${nextMeter(c.main[s], null, `${Math.floor((c.main[s] - Math.floor(c.main[s])) * 100)}% to the next point (grows with use)`)}</td>
      <td class="muted">${c.levelPoints?.[s] ? `+${c.levelPoints[s]} from levels` : ''}</td>
      <td>${c.unspentPoints > 0 ? `<button class="plus" data-assign="${s}" title="Assign a level point">+</button>` : ''}</td></tr>`).join('');
    const rate = (v, r) => `${v} <span class="regen">(+${r < 1 ? r.toFixed(2) : r.toFixed(1)}/s)</span>`;   // maximum, then what it refills a second
    const sub = [['Health', rate(display(d.maxHp), d.hpRegen)], ['Mana', rate(display(d.maxMp), d.mpRegen)], ['Stamina', rate(display(d.maxStamina), d.staminaRegen)],
      ['Carrying capacity', `${cap.kg.toFixed(1)} kg`], ['Pack slots', cap.slots], ['Defense', d.defense.toFixed(1)], ['Magic tolerance', d.magicTol.toFixed(1)],
      ['Light and dark tolerance', d.lightDarkTol.toFixed(1)], ['Mental load', display(d.mentalLoadCap)], ['Action speed', `×${d.actionSpeed.toFixed(2)}`]]
      .map(([k, v]) => `<tr><th>${k}</th><td class="num">${v}</td></tr>`).join('');
    const general = visible('general').filter(id => !CASTING.includes(id) && id !== 'bartering').map(id => skillRow(id)).join('');   // Bartering lives under Trade and reputation
    return `<div class="pg two">
      <section class="cell-p"><h3>Main stats</h3>
        ${c.unspentPoints > 0 ? `<p class="note">${c.unspentPoints} level point${c.unspentPoints > 1 ? 's' : ''} to assign. Once assigned, they're yours for good.</p>` : ''}
        <table class="bsheet">${rows}</table>
        <p class="hint">A yellow number is nearing what your body allows; red is at its limit.</p>
        <h3>Sub stats</h3><table class="bsheet">${sub}</table></section>
      <section class="cell-p"><h3>General skills</h3><table class="bsheet skills">${general}</table></section></div>`;
  }

  function pageLife() {
    const groups = {};
    for (const id of visible('profession')) (groups[PROFESSIONS[id]?.category || 'crafting'] ||= []).push(id);
    const sec = Object.entries(groups).map(([g, ids]) => `<h3>${CATEGORY_NAMES[g] || label(g)}</h3><table class="bsheet skills">${ids.map(id => {
      const v = c.skills[id] ?? 0, r = rankOf(v);
      return `<tr><th class="treelink" data-tree="${id}" title="Open the ${escapeHtml(label(id))} tree">${escapeHtml(label(id))}</th><td class="num">${display(v)}</td><td class="rank r-${r.id}">${escapeHtml(titleFor(id, v))}</td><td>${skillMeter(v)}</td></tr>`;
    }).join('')}</table>`);
    // Trade and reputation: haggling skill, then standing with each place (src/data/reputation.js)
    const rep = c.reputation || {};
    sec.push(`<h3>Trade and reputation</h3><table class="bsheet skills">${skillRow('bartering')}</table>
      <table class="bsheet rep">${Object.entries(PLACES).map(([id, pl]) => {
        const v = rep[id] ?? 0, t = repTier(v);
        return `<tr title="${escapeHtml(t.perks)}${pl.note ? ' — ' + escapeHtml(pl.note) : ''}"><th>${escapeHtml(pl.name)} <small>${pl.kind}</small></th><td class="num">${v}</td><td class="tier t-${t.id}">${t.name}</td><td>${bar(repProgress(v), 'rep')}</td></tr>
          <tr class="perk"><td colspan="4">${escapeHtml(t.perks)}</td></tr>`;
      }).join('')}</table>
      <p class="hint">Reputation runs from −1000 to 1000 in each place, moved by quests, trade and crimes there. Its price effects stack with Bartering.</p>`);
    // crafting (the longest list) gets the right-hand page to itself
    const keys = [...Object.keys(groups), 'trade'], right = keys.indexOf('crafting');
    const leftSecs = sec.filter((_, i) => i !== right), rightSecs = right >= 0 ? [sec[right]] : [];
    return `<div class="pg two"><section class="cell-p">${leftSecs.join('')}</section><section class="cell-p">${rightSecs.join('')}
      <p class="hint">Ranks: ${RANKS.map(r => r.name).join(' → ')}.</p></section></div>`;
  }

  function pageCombat() {
    const body = ctx.body(), w = body?.gear.stats().weapon;
    const need = xpToNext(c.level);
    const weapons = visible('weapon').map(id => skillRow(id, w?.skill === id ? '<td class="tag">in hand</td>' : '<td></td>')).join('');
    return `<div class="pg two">
      <section class="cell-p"><h3>Combat level ${c.level}</h3>
        <p>${bar(c.xp / need, 'xp')} <span class="muted">${display(c.xp)} / ${need} XP</span></p>
        <p class="hint">Combat experience comes from defeating or subduing monsters and from some quests. Each level gives points to shape your body as you choose.</p>
        ${c.unspentPoints ? `<p class="note">${c.unspentPoints} point${c.unspentPoints > 1 ? 's' : ''} to assign on the Attributes page.</p>` : ''}
        <h3>Combat skills</h3><table class="bsheet skills">${visible('combat').map(id => skillRow(id)).join('')}</table>
        ${w ? `<h3>In hand</h3><p>${escapeHtml(w.name)}: damage ${w.damage}, speed ${w.speed}, reach ${w.reach}</p>` : ''}</section>
      <section class="cell-p"><h3>Weapons</h3><table class="bsheet skills">${weapons}</table></section></div>`;
  }

  let magicCategory = 'Spirit';
  function pageMagic() {
    const d = derived(c), body = ctx.body(), focus = body?.gear.stats().focus;
    const schools = Object.keys(SKILLS).filter(id => SKILLS[id].group === 'magic');
    const selected = (MAGIC_GROUPS[magicCategory] || []).filter(id => schools.includes(id));
    const knownCount = Object.keys(c.spells || {}).length, prep = preparedOf(c), pmax = preparedMax(c);
    const categories = Object.keys(MAGIC_GROUPS).map(name => `<button class="beast-page-tab ${name === magicCategory ? 'on' : ''}" data-magic-category="${name}"><span>${name}</span></button>`).join('');
    const rows = selected.map(id => {
      const v = c.skills[id] ?? 100, r = rankOf(v);
      return `<tr><th class="treelink" data-tree="${id}" title="Open the ${escapeHtml(label(id))} tree">${escapeHtml(label(id))}</th><td class="num">${display(v)}</td><td class="rank r-${r.id}">${r.name}</td><td>${skillMeter(v)}</td></tr>`;
    }).join('');
    return `<div class="pg magic-page">
      <header class="beast-collection-head"><div><h2>Magic</h2><p class="hint">Your capacity for magic, the disciplines you study, and the techniques that shape your casting.</p></div><strong>${knownCount} <small>spells known</small></strong></header>
      <section class="spell-journal-summary"><b>Mana</b><span>${display(d.maxMp)} MP</span><small>Focus: ${focus ? escapeHtml(label(focus)) : 'none'} · Prepared spells: ${prep.length} / ${pmax}</small></section>
      <section class="cell-p"><h3>Casting skills</h3><table class="bsheet skills">${CASTING.map(id => skillRow(id)).join('')}</table></section>
      <nav class="beast-page-nav" aria-label="Magic school categories"><span class="beast-page-tabs">${categories}</span></nav>
      <section class="beast-type-page"><header class="beast-family-head"><div><small>School disciplines</small><h3>${magicCategory}</h3><p>${magicCategory === 'Spirit' ? 'Magic shaped by the soul, life, radiance and shadow.' : 'Magic shaped by thought, elements, force and the physical world.'}</p></div><small>${selected.length} schools</small></header>
      <table class="bsheet skills">${rows}</table>
      <p class="hint">Casting grows the schools that belong to each spell. Hybrid spells train every school they draw upon.</p></section>
    </div>`;
  }

  // ---- body ----
  // 'elf:nature' -> 'Nature elf' (the same names the potions use)
  const speciesName = key => {
    const [rid, sub] = key.split(':'), r = BODY_RACES.find(x => x.id === rid), sb = r?.subraces.find(x => x.name.toLowerCase() === sub);
    if (!r || !sb) return key;
    return sb.name.toLowerCase().includes(r.name.toLowerCase()) ? sb.name : `${sb.name} ${r.name.toLowerCase()}`;
  };
  const SHOWN_PARTS = Object.keys(BODY_PARTS).filter(id => BODY_PARTS[id].visible !== false);
  const SEXED = ['face', 'neck', 'chest', 'torso', 'waist', 'hips', 'arms', 'hands', 'legs', 'feet'];
  const pct = v => `${Math.round(v * 100)}%`;
  // masculine ↔ feminine as a two-sided meter: sex -1 (masculine) .. +1 (feminine)
  const sexMeter = sx => { const f = (sx + 1) / 2; return `<span class="sexm" title="${pct(1 - f)} masculine · ${pct(f)} feminine"><i style="width:${f * 100}%"></i></span>`; };
  const sexWord = sx => { const f = (sx + 1) / 2; return f >= 0.5 ? `${pct(f)} feminine` : `${pct(1 - f)} masculine`; };
  const mixText = sp => Object.entries(sp).filter(([, v]) => v >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${speciesName(k)} ${pct(v)}`).join(' · ');
  function pageBody() {
    const v = ctx.body(); if (!v) return '<div class="pg two"><section class="cell-p"><p class="muted">Your body is still loading.</p></section><section class="cell-p"></section></div>';
    const b = v.body, tot = b.totals(), sx = b.bodySex(), p = v.params;
    const lineage = Object.entries(tot.species).filter(([, x]) => x >= 0.005).sort((a, c) => c[1] - a[1])
      .map(([k, x]) => `<tr><th>${escapeHtml(speciesName(k))}</th><td class="num">${pct(x)}</td><td>${bar(x)}</td></tr>`).join('');
    const sliders = [['height', 'Height'], ['muscle', 'Muscle'], ['weight', 'Weight'], ['proportions', 'Proportions'], ['bust', 'Chest size'], ['age', 'Age']]
      .filter(([k]) => p[k] !== undefined).map(([k, n]) => `<tr><th>${n}</th><td class="num">${pct(p[k])}</td><td>${bar(p[k])}</td></tr>`).join('');
    const parts = SHOWN_PARTS.map(id => {
      const part = b.parts[id];
      return `<tr><th>${BODY_PARTS[id].name}</th><td class="mix">${escapeHtml(mixText(part.species))}</td><td class="sx">${SEXED.includes(id) ? `${sexMeter(part.sex)}<small>${sexWord(part.sex)}</small>` : ''}</td></tr>`;
    }).join('');
    return `<div class="pg two">
      <section class="cell-p"><h3>Lineage</h3><table class="bsheet">${lineage}</table>
        <p class="hint">Weighted by how much each part counts: the head and torso more than a tail.</p>
        <h3>Masculine and feminine</h3><p class="sexline"><span>Masculine</span>${sexMeter(sx)}<span>Feminine</span></p>
        <p class="muted">Overall body: ${sexWord(sx)}${Math.abs(tot.sex - sx) > 0.02 ? ` · counting every part: ${sexWord(tot.sex)}` : ''}</p>
        <h3>Build</h3><table class="bsheet">${sliders}</table></section>
      <section class="cell-p"><h3>Each part</h3><table class="bsheet parts">${parts}</table></section></div>`;
  }

  // ---- skill trees ----
  let selSkill = null, resetArmed = false;
  const TIERS = [['Unskilled', 0], ['Apprentice', 201], ['Journeyman', 501], ['Expert', 1001], ['Master', 5001]];
  const TREE_GROUPS = [['Weapons', id => SKILLS[id].group === 'weapon'], ['Combat', id => SKILLS[id].group === 'combat'],
    ['Magic', id => SKILLS[id].group === 'magic' || CASTING.includes(id)], ['Life skills', id => SKILLS[id].group === 'profession'],
    ['General', id => SKILLS[id].group === 'general' && !CASTING.includes(id)]];
  function pageTrees() {
    const list = TREE_GROUPS.map(([g, test]) => {
      const ids = Object.keys(SKILL_TREES).filter(test); if (!ids.length) return '';
      return `<h4 class="tl-g">${g}</h4>` + ids.map(id => {
        const v = c.skills[id] ?? 0, free = pointsFree(c, id);
        return `<li class="wl ${id === selSkill ? 'on' : ''}" data-skill="${id}"><span>${escapeHtml(label(id))}</span><b>${display(v)}</b>${free > 0 ? `<i class="pts">${free}</i>` : ''}</li>`;
      }).join('');
    }).join('');
    const tree = SKILL_TREES[selSkill], v = c.skills[selSkill] ?? 0;
    const st = treeState(c, selSkill), free = pointsFree(c, selSkill), spent = Object.values(st.nodes).reduce((t, n) => t + n, 0);
    const bkeys = Object.keys(tree.branches), [bA, bB] = bkeys;
    const card = n => {
      const have = n.innate ? n.ranks : st.nodes[n.id] ?? 0, r = canBuy(c, selSkill, n.id), br = n.branch ? tree.branches[n.branch] : null;
      const shut = n.opposite && (st.nodes[n.opposite] ?? 0) > 0, gated = v < n.gate;
      return `<div class="node ${n.kind} ${have ? 'got' : ''} ${have >= n.ranks ? 'full' : ''} ${r.ok ? 'buy' : ''} ${shut ? 'shut' : ''} ${gated ? 'gated' : ''} ${n.branch === bA ? 'br-a' : n.branch === bB ? 'br-b' : ''}" data-node="${n.id}" title="${escapeHtml(r.ok ? 'Click to learn' : r.reason)}">
        <header><b>${escapeHtml(n.name)}</b><span class="kind">${n.kind === 'active' ? 'Active' : 'Passive'}</span></header>
        <p>${escapeHtml(n.text)}</p>
        <footer><span>${n.innate ? 'Known' : `${have}/${n.ranks}`}</span>${br ? `<span class="brn">${br.name}</span>` : ''}<span class="gate">${escapeHtml(tree.name)} ${n.gate}</span></footer></div>`;
    };
    const rows = TIERS.map(([name, lo], i) => {
      const hi = TIERS[i + 1]?.[1] ?? Infinity, ns = tree.nodes.filter(n => n.gate >= lo && n.gate < hi);
      if (!ns.length) return '';
      const col = list => list.map(card).join('');
      return `<div class="tier"><h4>${name}${v >= lo ? '' : ' <small>(locked)</small>'}</h4><div class="tier-row"><div class="col bl">${col(ns.filter(n => n.branch === bA))}</div><div class="col mid">${col(ns.filter(n => !n.branch))}</div><div class="col brr">${col(ns.filter(n => n.branch === bB))}</div></div></div>`;
    }).join('');
    const right = `<header class="tree-head"><h3>${escapeHtml(tree.name)} <span class="muted">${display(v)}</span></h3>
        <span class="pts-line">${free} point${free === 1 ? '' : 's'} to spend · ${skillPoints(v)} earned</span>
        ${(() => { const wid = Object.values(ITEMS).find(it => it.skill === selSkill && it.damage && it.weapon)?.weapon; if (!wid) return ''; const L = comboLength(wid, v); return `<span class="pts-line">Max combo: ${L} light · ${heavyLength(L)} heavy</span>`; })()}
        <span class="tree-btns">${spent ? `<button class="tree-reset ${resetArmed ? 'armed' : ''}" data-reset="${selSkill}">${resetArmed ? `Refund ${spent} point${spent === 1 ? '' : 's'}?` : 'Reset tree'}</button>` : ''}
        <button class="test-train" data-train="${selSkill}" title="Test grounds only">+100 (test)</button></span></header>
      <p class="hint">${tree.generic ? '<b>Placeholder tree</b>, to be designed. ' : escapeHtml(tree.intro) + ' '} Points: one per 50 skill up to 1000, then one per 500. Paths: <b class="br-a-t">${tree.branches[bA].name}</b> (${escapeHtml(tree.branches[bA].text)}) or <b class="br-b-t">${tree.branches[bB].name}</b> (${escapeHtml(tree.branches[bB].text)}). Each node on one side locks only its opposite on the other side (same row); reset to choose again.</p>
      <div class="tree">${rows}</div>`;
    return `<div class="pg wtree"><section class="cell-p tree-single"><header class="tree-return"><button data-tree-back>‹ Back</button><span>Skill progression</span></header>${right}</section></div>`;
  }

  // ---- Bestiary: a complete creature catalogue, with pages unlocked by discovery ----
  let beastSel = null, beastView = 'collection';
  const DMG = ['slash', 'pierce', 'blunt', 'crush', 'fire', 'frost', 'storm', 'earth', 'light', 'lunar', 'dark', 'arcane', 'poison'];
  const resWord = v => v === 0 ? 'Immune' : v < 0.5 ? `Resists (×${v})` : v < 1 ? `Hardy (×${v})` : v > 1 ? `Weak (×${v})` : 'Normal';
  const range = (a, b) => a == null ? '—' : a === b ? `${a}` : `${a} – ${b}`;
  const beastIds = () => Object.keys(MONSTERS).filter(id => MONSTERS[id]).sort((a, b) => MONSTERS[a].name.localeCompare(MONSTERS[b].name));
  const BEAST_PAGES = BEAST_CLASSIFICATION_ORDER.flatMap(family =>
    Object.entries(BEAST_CLASSIFICATIONS[family].orders).map(([order, description]) => ({
      family, order, description, familyDescription: BEAST_CLASSIFICATIONS[family].description
    }))
  );
  const BEAST_UNSORTED_PAGE = { family: 'Unclassified', order: 'Unidentified', description: 'Creatures not yet assigned to a recognized order.' };
  let beastPage = 0;
  function pageBestiary() {
    const all = beastIds(), found = new Set(knownIds(c).filter(id => MONSTERS[id]));
    if (beastView === 'collection') {
      const pages = [...BEAST_PAGES, BEAST_UNSORTED_PAGE];
      beastPage = Math.max(0, Math.min(beastPage, pages.length - 1));
      const current = pages[beastPage];
      const ids = all.filter(id => {
        const classification = MONSTERS[id].classification || [];
        if (current === BEAST_UNSORTED_PAGE) return !BEAST_PAGES.some(p => classification[0] === p.family && classification[1] === p.order);
        return classification[0] === current.family && classification[1] === current.order;
      });
      const slot = id => {
        const M = MONSTERS[id], unlocked = found.has(id);
        const mark = unlocked ? (M.group === 'swarm' ? '✧' : M.group === 'boss' ? '♜' : M.group === 'solo' ? '◆' : '✦') : '？';
        return `<button class="beast-slot ${unlocked ? 'discovered' : 'undiscovered'}" ${unlocked ? `data-beast-open="${id}" title="Read about ${escapeHtml(M.name)}"` : 'disabled aria-label="Undiscovered creature" title="Undiscovered creature"'}>
          <span class="beast-slot-icon">${mark}</span><span class="beast-slot-name">${unlocked ? escapeHtml(M.name) : 'Unknown'}</span>
          <span class="beast-slot-state">${unlocked ? 'Discovered' : 'Not yet recorded'}</span></button>`;
      };
      const discovered = ids.filter(id => found.has(id)).length;
      const tabs = pages.map((page, index) => `<button class="beast-page-tab ${index === beastPage ? 'on' : ''}" data-beast-page="${index}" ${index === beastPage ? 'aria-current="page"' : ''} title="${escapeHtml(page.order)}"><span>${escapeHtml(page.order)}</span></button>`).join('');
      return `<div class="pg beast-collection">
        <header class="beast-collection-head"><div><h2>Bestiary</h2><p class="hint">A field journal of the creatures known to the guild.</p></div><strong>${found.size} <small>/ ${all.length} discovered</small></strong></header>
        <nav class="beast-page-nav" aria-label="Bestiary pages">
          <button class="beast-page-arrow" data-beast-prev ${beastPage === 0 ? 'disabled' : ''} aria-label="Previous page" title="Previous page">‹</button>
          <div class="beast-page-tabs">${tabs}</div>
          <button class="beast-page-arrow" data-beast-next ${beastPage === pages.length - 1 ? 'disabled' : ''} aria-label="Next page" title="Next page">›</button>
        </nav>
        <section class="beast-type-page">
          <header class="beast-family-head"><div><small>${escapeHtml(current.family)}</small><h3>${escapeHtml(current.order)}</h3><p>${escapeHtml(current.description)}</p></div><small>${discovered} / ${ids.length} recorded</small></header>
          <div class="beast-grid">${ids.length ? ids.map(slot).join('') : '<p class="beast-empty">No creatures are recorded in this order yet.</p>'}</div>
          <footer class="beast-page-count">Page ${beastPage + 1} of ${pages.length}</footer>
        </section>
      </div>`;
    }
    if (!beastSel || !found.has(beastSel)) { beastView = 'collection'; return pageBestiary(); }
    const id = beastSel, M = MONSTERS[id], E = c.bestiary[id];
    const res = DMG.map(t => `<tr><th>${label(t)}</th><td class="${E.res[t] ? '' : 'muted'}">${E.res[t] ? resWord(M.resist?.[t] ?? 1) : '???'}</td></tr>`).join('');
    const stages = M.harvest ? (M.harvest.stages || [{ id: 'skin', verb: 'skin', yields: M.harvest.yields }]) : [];
    const drops = stages.map(S => `<tr><th>${label(S.verb)}</th><td>${E.stages[S.id] ? Object.entries(S.yields).map(([p, [, hi]]) => `up to ${hi} ${escapeHtml(MATERIALS[`${M.harvest.creature}.${p}`]?.name || p)}`).join(', ') : '<span class="muted">??? — not yet tried</span>'}</td></tr>`).join('');
    return `<div class="pg two bestiary"><section class="cell-p"><div class="bst-nav"><button data-beast-back title="Back to creature collection">‹ Collection</button></div>
      <h2 class="bst-name">${escapeHtml(M.name)}</h2><p class="muted">${escapeHtml([...(M.classification || [])].filter(x => x && x !== '—').join(' · '))}${M.hazard ? ` · ${escapeHtml(M.hazard)}` : ''}</p>
      ${M.lore ? `<p class="bst-lore">${escapeHtml(M.lore)}</p>` : ''}
      <h3>Encounters</h3><table class="bsheet"><tr><th>Slain</th><td class="num">${E.kills}</td></tr><tr><th>Levels met</th><td class="num">${range(E.minLv, E.maxLv)}</td></tr><tr><th>Health met</th><td class="num">${range(E.minHp, E.maxHp)}</td></tr></table>
      <h3>Nature</h3><table class="bsheet"><tr><th>Rank</th><td>${escapeHtml(range(M.rank?.[0], M.rank?.[1]))}</td></tr><tr><th>Active</th><td>${escapeHtml(M.activity || '—')}</td></tr>
        <tr><th>Found in</th><td>${escapeHtml(label(M.group || '—'))}${M.temper === 'passive' ? ' · flees when struck' : ''}</td></tr>
        <tr><th>Speed</th><td class="num">${M.stats?.speed ? `${M.stats.speed} m/s` : '—'}</td></tr><tr><th>Notices you at</th><td class="num">${M.stats?.aggro ? `${M.stats.aggro} m` : '—'}</td></tr></table>
      <h3>Resistances <span class="hint">(learned by striking it with each)</span></h3><table class="bsheet">${res}</table>
      ${drops ? `<h3>Harvest <span class="hint">(the most each can give)</span></h3><table class="bsheet">${drops}</table>` : ''}
      </section><section class="bst-right"><section class="beast-fig" aria-label="${escapeHtml(M.name)}"><span class="figure-hint">Drag to turn</span></section>
      <div class="bst-foot"><button class="bst-regions" disabled title="Comes with the world map">Regions encountered</button></div></section></div>`;
  }

  function pageRunes() {
    const value = c.skills.runicScript ?? 0, rank = rankOf(value);
    return `<div class="pg runes-journal">
      <header class="runes-head"><div><h2>Runes</h2><p class="hint">A study of written magic, ancient symbols and their meanings.</p></div></header>
      <section class="runes-overview">
        <article class="runes-skill"><div><small>FOUNDATIONAL SKILL</small><h3>Runic Script</h3><p>Knowledge of runic forms, their written structure and the principles behind their use.</p></div>
          <div class="runes-rank"><strong>${display(value)}</strong><span>${escapeHtml(rank.name)}</span><button class="runes-tree-link" data-tree="runicScript">Study skill tree ↗</button></div>
        </article>
        <section class="rune-catalogue"><div class="rune-catalogue-mark" aria-hidden="true">ᚱ</div><div><h3>Runic Catalogue</h3><p>Discovered runes, translations and known properties will be recorded here.</p><small>No runes have been catalogued yet.</small></div></section>
        <section class="rune-inscriptions"><div class="rune-catalogue-mark" aria-hidden="true">✧</div><div><h3>Inscriptions</h3><p>Known combinations and written arrangements will be collected here when the inscription system is established.</p><small>No inscriptions recorded.</small></div></section>
      </section>
    </div>`;
  }

  let herbSel=null,herbView='collection',herbPage=0;
  function pageHerbarum(){
    const all=PLANTS.slice().sort((a,b)=>a.name.localeCompare(b.name)),found=new Set(knownPlantIds(c));
    if(herbView==='collection'){
      const pages=HERBARUM_PAGES;herbPage=Math.max(0,Math.min(herbPage,pages.length-1));
      const current=pages[herbPage],ids=all.filter(p=>{const q=classifyPlant(p);return q.family===current.family&&q.order===current.order;});
      const discovered=ids.filter(p=>found.has(p.id)).length;
      const tabs=pages.map((page,index)=>'<button class="beast-page-tab '+(index===herbPage?'on':'')+'" data-herb-page="'+index+'" title="'+escapeHtml(page.order)+'"><span>'+escapeHtml(page.order)+'</span></button>').join('');
      const slots=ids.map(p=>{const unlocked=found.has(p.id);return '<button class="beast-slot '+(unlocked?'discovered':'undiscovered')+'" '+(unlocked?'data-herb-open="'+p.id+'" title="Read about '+escapeHtml(p.name)+'"':'disabled title="Undiscovered plant"')+'><span class="beast-slot-icon">'+(unlocked?'❧':'？')+'</span><span class="beast-slot-name">'+(unlocked?escapeHtml(p.name):'Unknown specimen')+'</span><span class="beast-slot-state">'+(unlocked?'Discovered':'Not yet recorded')+'</span></button>';}).join('');
      return '<div class="pg beast-collection herbarum-journal"><header class="beast-collection-head"><div><h2>Herbarum</h2><p class="hint">A field journal of the flora known to the guild.</p></div><strong>'+found.size+' <small>/ '+all.length+' discovered</small></strong></header><nav class="beast-page-nav" aria-label="Herbarum categories"><button class="beast-page-arrow" data-herb-prev '+(herbPage===0?'disabled':'')+' aria-label="Previous category">‹</button><div class="beast-page-tabs">'+tabs+'</div><button class="beast-page-arrow" data-herb-next '+(herbPage===pages.length-1?'disabled':'')+' aria-label="Next category">›</button></nav><section class="beast-type-page"><header class="beast-family-head"><div><small>'+escapeHtml(current.family)+'</small><h3>'+escapeHtml(current.order)+'</h3><p>'+escapeHtml(current.description)+'</p></div><small>'+discovered+' / '+ids.length+' recorded</small></header><div class="beast-grid">'+(slots||'<p class="beast-empty">No plants are assigned to this order yet.</p>')+'</div><footer class="beast-page-count">Category '+(herbPage+1)+' of '+pages.length+'</footer></section></div>';
    }
    const P=all.find(p=>p.id===herbSel),E=c.herbarum?.[herbSel];
    if(!P||!found.has(herbSel)){herbView='collection';return pageHerbarum();}
    const cl=classifyPlant(P),props=Object.entries(P.props||{}).filter(([k,v])=>v!=null&&typeof v!=='object').map(([k,v])=>'<tr><th>'+escapeHtml(label(k))+'</th><td>'+escapeHtml(String(v))+'</td></tr>').join('');
    return '<div class="pg two bestiary herbarum-entry"><section class="cell-p"><div class="bst-nav"><button data-herb-back title="Back to botanical collection">‹ Catalogue</button></div><h2 class="bst-name">'+escapeHtml(P.name)+'</h2><p class="muted">'+escapeHtml(cl.family)+' · '+escapeHtml(cl.order)+' · '+escapeHtml(label(P.kind))+'</p><p class="bst-lore">'+escapeHtml(P.props?.use||P.note||('A '+P.kind+' plant known to the guild. Its properties are recorded as specimens are gathered and studied.'))+'</p><h3>Botanical record</h3><table class="bsheet"><tr><th>Gathering skill</th><td>'+escapeHtml(label(P.source))+'</td></tr><tr><th>Material tier</th><td>'+P.tier+'</td></tr>'+props+'</table><h3>Field notes</h3><table class="bsheet"><tr><th>Gathered</th><td class="num">'+E.gathers+'</td></tr><tr><th>First recorded</th><td>'+(E.first?new Date(E.first).toLocaleDateString():'—')+'</td></tr><tr><th>Last gathered</th><td>'+(E.last?new Date(E.last).toLocaleDateString():'—')+'</td></tr></table></section><section class="bst-right"><section class="herb-fig" aria-label="'+escapeHtml(P.name)+'"><span class="figure-hint">Drag to turn</span></section><div class="bst-foot"><small class="hint">Specimen study · '+escapeHtml(cl.order)+'</small></div></section></div>';
  }

  function pageTools(){
    if(c.toolLoadout){
      c.toolSlots ||= {};
      for(const [skill,uid] of Object.entries(c.toolLoadout))if(!c.toolSlots[skill]){
        const index=ctx.inv.items.findIndex(item=>item.uid===uid);
        if(index>=0)c.toolSlots[skill]=ctx.inv.items.splice(index,1)[0];
      }
      delete c.toolLoadout;ctx.onChange?.();
    }
    const groups={gathering:[],crafting:[],other:[]},body=ctx.body(),worn=body?.gear.equipped()||{};
    const slotted=new Set(Object.values(c.toolSlots||{}).map(x=>x?.uid).filter(Boolean));
    const toolSkills=[...new Set(Object.values(ITEMS).map(item=>item.tool?.skill).filter(Boolean))].filter(id=>SKILLS[id]).sort((a,b)=>label(a).localeCompare(label(b)));
    for(const skill of toolSkills){
      const category=PROFESSIONS[skill]?.category,group=category==='gathering'?'gathering':category==='crafting'?'crafting':'other';
      const choices=ctx.inv.items.map((item,index)=>({item,id:item.id||item.item,key:item.uid||('legacy:'+String(item.id||item.item)+':'+index)})).filter(x=>x.id&&ITEMS[x.id]?.tool?.skill===skill&&!slotted.has(x.key));
      const assigned=c.toolSlots?.[skill]||null,wornId=!assigned&&worn.mainHand&&ITEMS[worn.mainHand]?.tool?.skill===skill?worn.mainHand:null;
      groups[group].push({skill,choices,assigned,wornId});
    }
    const names={gathering:'Gathering tools',crafting:'Crafting tools',other:'Other skill tools'};
    const slotRows=group=>groups[group].map(({skill,choices,assigned,wornId})=>{
      const active=assigned?itemName(assigned.id||assigned.item):wornId?itemName(wornId)+' (equipped)':'Empty';
      return '<tr class="tool-slot-row"><th><span>'+escapeHtml(label(skill))+'</span><small>'+escapeHtml(active)+' · '+choices.length+' available</small></th><td><select class="tool-slot-select" data-tool-slot="'+skill+'" aria-label="'+escapeHtml(label(skill))+' tool"><option value="">Empty</option>'+
        (assigned?'<option value="'+escapeHtml(assigned.uid)+'" selected>'+escapeHtml(itemName(assigned.id||assigned.item))+' · assigned</option>':wornId?'<option value="equipped:'+escapeHtml(wornId)+'" selected>'+escapeHtml(itemName(wornId))+' · equipped</option>':'')+
        choices.map(x=>'<option value="'+escapeHtml(x.key)+'">'+escapeHtml(itemName(x.id))+'</option>').join('')+'</select></td></tr>';
    }).join('');
    return '<div class="pg two tools-page"><section class="cell-p"><h2>Tools</h2><p class="hint">Assign tools to dedicated skill slots. Assigned tools leave your pack and are kept ready for their profession.</p><h3>'+names.gathering+'</h3><table class="bsheet skills tool-slots">'+slotRows('gathering')+'</table><h3>'+names.crafting+'</h3><table class="bsheet skills tool-slots">'+slotRows('crafting')+'</table></section><section class="cell-p"><h3>'+names.other+'</h3><table class="bsheet skills tool-slots">'+slotRows('other')+'</table><p class="hint">Tools in these slots do not occupy pack space or count toward pack weight. A tool is moved back to your pack when its slot is cleared or replaced.</p></section></div>';
  }

  function pageNewSection(title, description) {
    return `<div class="pg two"><section class="cell-p"><h2>${title}</h2><p class="muted">${description}</p><p class="hint">This section is reserved for its own dedicated journal content.</p></section><section class="cell-p"></section></div>`;
  }
  let spellView = 'list', spellChainEdit = false;
  const chainCapacity = () => Math.max(1, Math.min(8, 1 + Math.floor(Math.max(0, (c.skills.chainCasting ?? 100) - 100) / 200)));
  const spellChain = () => { c.spellChain ||= []; c.spellChain = c.spellChain.filter(id => preparedOf(c).includes(id)); return c.spellChain; };
  function pageSpells() {
    const known = Object.entries(c.spells || {}).filter(([id]) => SPELLS[id]).sort((a,b) => SPELLS[a[0]].name.localeCompare(SPELLS[b[0]].name));
    const prep = preparedOf(c), pmax = preparedMax(c), chain = spellChain(), maxChain = chainCapacity();
    if (spellView === 'combo') {
      const options = prep.filter(id => SPELLS[id]);
      const chainRows = chain.map((id,i) => `<li class="spell-chain-slot"><b>${i+1}</b><span>${escapeHtml(SPELLS[id]?.name || id)}</span><button data-chain-up="${i}" ${i===0?'disabled':''} title="Move earlier">↑</button><button data-chain-down="${i}" ${i===chain.length-1?'disabled':''} title="Move later">↓</button><button data-chain-remove="${id}" title="Remove from chain">×</button></li>`).join('');
      const available = options.filter(id => !chain.includes(id)).map(id => `<li class="spell-chain-option"><span>${escapeHtml(SPELLS[id].name)}</span><small>${escapeHtml(schoolsOf(SPELLS[id]).map(label).join(' + '))}</small><button data-chain-add="${id}" ${chain.length>=maxChain?'disabled':''}>Add</button></li>`).join('');
      return `<div class="pg spell-journal"><header class="beast-collection-head"><div><button class="journal-back" data-spell-list>‹ Spells</button><h2>Spell combo</h2><p class="hint">Arrange prepared spells into a casting sequence. Chain Casting determines how many spells you can link.</p></div><strong>${chain.length} <small>/ ${maxChain} links</small></strong></header>
        <section class="spell-journal-summary"><b>Chain Casting</b><span>${display(c.skills.chainCasting ?? 100)}</span><small>Current chain capacity: ${maxChain} spell${maxChain===1?'':'s'}. Prepare spells on the Magic page before adding them here.</small></section>
        <section class="spell-chain-panel"><h3>Current sequence</h3>${chainRows ? `<ol class="spell-chain-list">${chainRows}</ol>` : '<p class="muted">No spells have been linked yet.</p>'}</section>
        <section class="spell-chain-panel"><h3>Prepared spells</h3>${available ? `<ul class="spell-chain-options">${available}</ul>` : '<p class="muted">No other prepared spells are available to add.</p>'}</section>
      </div>`;
    }
    const rows = known.map(([id, level]) => {
      const sp = SPELLS[id], evolution = spellEvolutionOf(c,id), progress = Math.min(1, level / MASTERY.core);
      return `<article class="spell-list-row">
        <button class="spell-name-link" data-tree="${id}" title="Open this spell's evolution tree">${escapeHtml(sp.name)}</button>
        <span class="spell-row-progress">${bar(progress,'xp')}</span><span class="spell-row-percent">${Math.round(progress*100)}%</span>
        <strong class="spell-row-mastery">${display(level)}</strong>
        <button class="prep-btn spell-row-prepare ${prep.includes(id)?'on':''}" data-prepare="${id}">${prep.includes(id)?'✦ Prepared':'Prepare'}</button>
        <button class="prep-btn spell-row-combo" data-spell-combo>Combo</button>
      </article>`;
    }).join('');
    return `<div class="pg spell-journal"><header class="beast-collection-head"><div><h2>Spells</h2><p class="hint">Your learned spells and their individual mastery. Select a spell to open its evolution tree.</p></div><strong>${known.length} <small>known</small></strong></header>
      <section class="spell-journal-summary"><b>Prepared</b><span>${prep.length} / ${pmax}</span><small>Prepared spells are available to the spell wheel and hotbar.</small><button class="prep-btn" data-spell-combo>Combo</button></section>
      <div class="spell-list-head"><span>Spell</span><span>Progress</span><span></span><span>Mastery</span><span>Prepare</span><span>Combo</span></div>
      ${rows ? `<div class="spell-entry-list">${rows}</div>` : '<p class="muted">You have not learned any spells yet. Teachers, scrolls and books can teach you new spells.</p>'}
    </div>`;
  }

  const spellTierLabel = level => level >= 100 ? 'Mastered' : level > 0 ? 'Learning' : 'Unmastered';
  const PAGES = { bestiary: pageBestiary, runes: pageRunes, body: pageBody, character: pageCharacter, attributes: pageAttributes, tools: pageTools, life: pageLife, combat: pageCombat, magic: pageMagic,
    crafting: () => pageNewSection('Crafting', 'Your crafting professions, recipes, workbenches and production progress will live here.'),
    spells: pageSpells,
    herbarum: pageHerbarum,
    lore: () => pageNewSection('Lore', 'Discoveries, people, factions, places and story entries will be collected here.')
  };

  let lastTab = null;
  function render() {
    if (el.hidden) return;
    // keep each scrolling page where it was when the same tab re-renders (after a click inside it)
    const keep = lastTab === tab ? [...el.querySelectorAll('.cell-p')].map(x => x.scrollTop) : [];
    lastTab = tab;
    const nav = (items, side) => `<nav class="ribbons ribbons-${side}" aria-label="${side} book tabs">${items.map(([id, name]) => `<button class="ribbon ${id === tab ? 'on' : ''}" data-tab="${id}" title="${name}" aria-current="${id === tab ? 'page' : 'false'}"><span>${name}</span></button>`).join('')}</nav>`;
    el.innerHTML = `<div class="book book-${tab}" role="dialog" aria-label="Character book">
      ${nav(TOP_TABS, 'top')}${nav(LEFT_TABS, 'left')}${nav(RIGHT_TABS, 'right')}
      <div class="pages pages-${treeView ? 'skill-tree' : tab}">${treeView ? pageTrees() : PAGES[tab]()}</div>
      <button class="book-close" title="Close (Tab, I or Esc)">×</button></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { treeView = false; tab = b.dataset.tab; render(); });
    el.querySelectorAll('[data-magic-category]').forEach(b => b.onclick = () => { magicCategory = b.dataset.magicCategory; render(); });
    el.querySelectorAll('[data-spell-combo]').forEach(b => b.onclick = () => { spellView = 'combo'; render(); });
    el.querySelector('[data-spell-list]')?.addEventListener('click', () => { spellView = 'list'; render(); });
    el.querySelectorAll('[data-chain-add]').forEach(b => b.onclick = () => { const chain = spellChain(); if (chain.length < chainCapacity() && preparedOf(c).includes(b.dataset.chainAdd) && !chain.includes(b.dataset.chainAdd)) chain.push(b.dataset.chainAdd); ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-chain-remove]').forEach(b => b.onclick = () => { const chain = spellChain(), i = chain.indexOf(b.dataset.chainRemove); if (i >= 0) chain.splice(i,1); ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-chain-up]').forEach(b => b.onclick = () => { const chain = spellChain(), i = Number(b.dataset.chainUp); if (i > 0) [chain[i-1],chain[i]] = [chain[i],chain[i-1]]; ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-chain-down]').forEach(b => b.onclick = () => { const chain = spellChain(), i = Number(b.dataset.chainDown); if (i >= 0 && i < chain.length-1) [chain[i+1],chain[i]] = [chain[i],chain[i+1]]; ctx.onChange?.(); render(); });
    el.querySelector('.book-close').onclick = () => ctx.onClose();
    el.querySelectorAll('[data-skill]').forEach(li => li.onclick = () => { selSkill = li.dataset.skill; resetArmed = false; render(); });
    el.querySelector('[data-tree-back]')?.addEventListener('click', () => { treeView = false; tab = treeReturnTab; render(); });
    el.querySelectorAll('.node.buy').forEach(nd => nd.onclick = () => { buyNode(c, selSkill, nd.dataset.node); resetArmed = false; ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { if (!resetArmed) { resetArmed = true; return render(); } resetTree(c, b.dataset.reset); resetArmed = false; ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-train]').forEach(b => b.onclick = () => { c.skills[b.dataset.train] = (c.skills[b.dataset.train] ?? 100) + 100; render(); });
    el.querySelectorAll('.cell-p').forEach((x, i) => { if (keep[i] !== undefined) x.scrollTop = keep[i]; });
    if (!keep.length) el.querySelector('.wl.on')?.scrollIntoView({ block: 'nearest' });
    // a skill's name anywhere else in the book opens its tree
    el.querySelectorAll('[data-tree]').forEach(t => t.onclick = () => { treeReturnTab = tab; selSkill = t.dataset.tree; resetArmed = false; treeView = true; render(); });
    el.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => { assignPoints(c, b.dataset.assign, 1); ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-tool-slot]').forEach(select=>select.onchange=()=>{
      const skill=select.dataset.toolSlot,value=select.value;c.toolSlots ||= {};
      const old=c.toolSlots[skill];if(old&&old.uid===value)return;
      if(old){ctx.inv.items.push(old);delete c.toolSlots[skill];}
      if(value.startsWith('equipped:')){
        const id=value.slice(9),body=ctx.body();
        if(body?.gear.unequip('mainHand')===id)c.toolSlots[skill]={uid:'tool-'+Date.now().toString(36),id,enchantments:[]};
      }else if(value){
        const index=ctx.inv.items.findIndex(x=>x.uid===value);
        if(index>=0)c.toolSlots[skill]=ctx.inv.items.splice(index,1)[0];
      }
      ctx.onChange?.();render();
    });
    el.querySelectorAll('.eq.full').forEach(li => li.onclick = () => {
      const body = ctx.body(); if (!body) return;
      const id = body.gear.unequip(li.dataset.slot); if (id) { ctx.inv.items.push({ uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, id, enchantments: [] }); ctx.onChange?.(); }
      render();
    });
    el.querySelectorAll('.cell[data-kind=stack]').forEach(li => {   // a material: hovering shows a card of what qualities you hold (all in one slot)
      li.onmouseenter = () => matCard(li); li.onmousemove = ev => placeCard(ev); li.onmouseleave = () => { card.hidden = true; };
    });
    el.querySelectorAll('.cell[data-kind=item]').forEach(li => li.onclick = () => {
      const body = ctx.body(), id = li.dataset.id, it = ITEMS[id]; if (!body || !it?.slot || it.carried) return;
      const r = body.gear.equip(id); if (!r.ok) return ctx.toast?.(r.reason);
      const i = ctx.inv.items.findIndex(x => x.uid === li.dataset.uid); if (i >= 0) ctx.inv.items.splice(i, 1);
      for (const old of r.replaced) ctx.inv.items.push({ uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, id: old, enchantments: [] });
      ctx.onChange?.(); render();
    });
    el.querySelector('[data-prepmode]')?.addEventListener('click', () => { prepMode = !prepMode; render(); });
    el.querySelectorAll('[data-prepare]').forEach(li => li.addEventListener('click', () => { const r = togglePrepared(c, li.dataset.prepare); if (!r.ok) ctx.toast?.(r.reason); if (r.ok && !r.prepared) { c.spellChain = (c.spellChain || []).filter(id => id !== li.dataset.prepare); } ctx.onChange?.(); render(); }));
    el.querySelectorAll('[data-spell]').forEach(li => { li.ondragstart = e => e.dataTransfer.setData('text/plain', 'spell:' + li.dataset.spell); });
    el.querySelectorAll('[data-potion]').forEach(li => {
      li.ondragstart = e => e.dataTransfer.setData('text/plain', li.dataset.potion);
      li.onclick = () => { ctx.onUse(li.dataset.potion); render(); };
    });
    el.querySelectorAll('[data-beast-open]').forEach(b => b.onclick = () => { beastSel = b.dataset.beastOpen; beastView = 'entry'; api.turn = 0; render(); });
    el.querySelectorAll('[data-herb-open]').forEach(b=>b.onclick=()=>{herbSel=b.dataset.herbOpen;herbView='entry';api.turn=0;render();});
    el.querySelectorAll('[data-herb-page]').forEach(b=>b.onclick=()=>{herbPage=Number(b.dataset.herbPage);render();});
    el.querySelector('[data-herb-prev]')?.addEventListener('click',()=>{herbPage=Math.max(0,herbPage-1);render();});
    el.querySelector('[data-herb-next]')?.addEventListener('click',()=>{herbPage=Math.min(HERBARUM_PAGES.length-1,herbPage+1);render();});
    el.querySelector('[data-herb-back]')?.addEventListener('click',()=>{herbView='collection';api.turn=0;render();});
    el.querySelectorAll('[data-beast-page]').forEach(b => b.onclick = () => { beastPage = Number(b.dataset.beastPage); render(); });
    el.querySelector('[data-beast-prev]')?.addEventListener('click', () => { beastPage = Math.max(0, beastPage - 1); render(); });
    el.querySelector('[data-beast-next]')?.addEventListener('click', () => { beastPage = Math.min(BEAST_PAGES.length, beastPage + 1); render(); });
    el.querySelector('[data-beast-back]')?.addEventListener('click', () => { beastView = 'collection'; api.turn = 0; render(); });
    // drag on the figure (or the creature) to turn it
    const fig = el.querySelector('.figure, .beast-fig, .herb-fig');
    if (fig) fig.onpointerdown = e => {
      fig.setPointerCapture(e.pointerId); let x = e.clientX;
      fig.onpointermove = ev => { api.turn += (ev.clientX - x) * 0.01; x = ev.clientX; };
      fig.onpointerup = () => { fig.onpointermove = null; };
    };
  }

  const api = {
    turn: 0,                                          // figure rotation, from dragging
    get isOpen() { return !el.hidden; },
    get tab() { return tab; },
    open(t) { if (t) tab = t; treeView = false; el.hidden = false; api.turn = 0; render(); },
    close() { el.hidden = true; el.innerHTML = ''; },
    render,
    // where the figure box is on screen (for play.js to render the character into), or null
    portraitRect() { const f = !el.hidden && el.querySelector('.figure'); return f ? f.getBoundingClientRect() : null; },
    // the Bestiary's creature box and whose page it is (play.js draws the creature there)
    beastRect() { const f = !el.hidden && tab === 'bestiary' && beastView === 'entry' && el.querySelector('.beast-fig'); return f ? f.getBoundingClientRect() : null; },
    get beastId() { return tab === 'bestiary' && beastView === 'entry' ? beastSel : null; },
    herbRect(){const f=!el.hidden&&tab==='herbarum'&&herbView==='entry'&&el.querySelector('.herb-fig');return f?f.getBoundingClientRect():null;},
    get herbId(){return tab==='herbarum'&&herbView==='entry'?herbSel:null;},
  };
  return api;
}
