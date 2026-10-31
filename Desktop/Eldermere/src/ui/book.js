// src/ui/book.js — the character book (Tab / I): a leather-bound journal with ribbon tabs.
//
//   1 Character   equipment slots, the player's figure (rendered live by play.js into the box), the pack
//   2 Body        what the body is made of: lineages, masculine/feminine, each part
//   3 Attributes  main stats, derived stats, general skills
//   3 Life skills professions with rank, title and progress
//   4 Combat      combat level, weapon and combat skills
//   6 Skill trees  every skill's tree (src/data/skillTrees.js); skill names elsewhere link here
//   7 Magic       mana, casting skills, schools, known spells
//
// The figure box is see-through: play.js renders the character into that part of the game canvas
// (portraitRect), so the book never builds a second 3D view.
import { escapeHtml, label } from './util.js';
import { MAIN_STATS, SKILLS, effectiveMain, derived, limitState, display, xpToNext, assignPoints } from '../rpg/stats.js';
import { RANKS, rankOf, rankProgress, titleFor, PROFESSIONS } from '../data/professions.js';
import { SLOTS, ITEMS } from '../rpg/equipment.js';
import { MATERIALS } from '../data/materials.js';
import { SPELLS } from '../data/spells.js';
import { MASTERY, preparedMax, preparedOf, togglePrepared, castProfile } from '../rpg/magic.js';
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

export const TOP_TABS = [['character', 'Character'], ['body', 'Body'], ['attributes', 'Attributes']];
export const LEFT_TABS = [['combat', 'Combat'], ['trees', 'Skill trees'], ['magic', 'Magic'], ['spells', 'Spells']];
export const RIGHT_TABS = [['life', 'Life skills'], ['crafting', 'Crafting'], ['bestiary', 'Bestiary'], ['lore', 'Lore']];
export const TABS = [...TOP_TABS, ...LEFT_TABS, ...RIGHT_TABS];
// equipment slots as laid out down the left of the page, head to toe, then hands
const SLOT_ORDER = ['head', 'back', 'chest', 'top', 'arms', 'hands', 'wrist', 'legs', 'bottom', 'feet', 'mainHand', 'offHand'];
const CASTING = ['attunement', 'incantation', 'voiceless', 'manaControl', 'manaSense'];
const CATEGORY_NAMES = { gathering: 'Gathering', crafting: 'Crafting', trade: 'Trade', processing: 'Processing' };

// ctx: { character, inv, body: () => viewer|null, hotbar, onUse(id), onChange(), onClose() }
export function createBook(root, ctx) {
  const el = document.createElement('div');
  el.className = 'book-wrap'; el.hidden = true;
  root.appendChild(el);
  let tab = 'character', prepMode = false;
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

  function pageMagic() {
    const d = derived(c), body = ctx.body(), focus = body?.gear.stats().focus;
    const known = Object.entries(c.spells || {}), prep = preparedOf(c), pmax = preparedMax(c);
    // preparing: tick the spells to hold ready (the spell wheel, Q, and the hotbar draw from these)
    const prepList = prepMode ? `<div class="prep-list"><p class="hint">Click a spell to prepare it or let it go. Hover one and press 1–9 (or drag it) to put it on the hotbar.</p>
      <ul>${known.map(([id, lv]) => { const sp = SPELLS[id], on = prep.includes(id), pr = sp ? castProfile(c, sp, { focus: !!focus }) : null;
        return `<li class="prep ${on ? 'on' : ''}" data-prepare="${id}" data-spell="${id}" draggable="true" title="${escapeHtml(sp?.description ?? '')}"><span class="tick">${on ? '✦' : ''}</span><b>${escapeHtml(sp?.name ?? id)}</b>
          <small>${escapeHtml(label(sp?.school ?? ''))} · ${pr ? `${Math.ceil(pr.mana)} MP · ${pr.castTime.toFixed(1)} s` : ''} · mastery ${display(lv)}</small></li>`; }).join('')}</ul></div>` : '';
    return `<div class="pg two">
      <section class="cell-p"><h3 class="mana-head">Mana <button class="prep-btn ${prepMode ? 'on' : ''}" data-prepmode title="Prepare spells: choose which to hold ready">✦ Prepare <span>${prep.length}/${pmax}</span></button></h3>
        <p class="big">${display(d.maxMp)} <span class="muted">MP</span></p>
        <p class="muted">Focus: ${focus ? escapeHtml(label(focus)) : 'none'} · Prepared spells: ${prep.length} of ${pmax} (Intelligence and Mind raise this, up to 30)</p>${prepList}
        <h3>Casting</h3><table class="bsheet skills">${CASTING.map(id => skillRow(id)).join('')}</table>
        <h3>Spells</h3>${known.length ? `<table class="bsheet">${known.map(([id, lv]) => {
          const sp = SPELLS[id];
          return `<tr data-spell="${id}" draggable="true" title="Hover and press 1–9, or drag, to put it on the hotbar"><th>${prep.includes(id) ? '✦ ' : ''}${escapeHtml(sp?.name ?? id)}</th><td class="muted">${escapeHtml(label(sp?.school ?? ''))}</td><td class="num">${display(lv)}</td><td>${lv >= MASTERY.core ? 'Mastered' : bar(lv / MASTERY.core)}</td></tr>`;
        }).join('')}</table>` : '<p class="muted">You know no spells yet. Spells are learned from teachers, scrolls and books.</p>'}</section>
      <section class="cell-p"><h3>Schools</h3><table class="bsheet skills">${visible('magic').map(id => skillRow(id)).join('')}</table>
        <p class="hint">A school grows whenever you cast one of its spells, and makes each of its spells quicker to master.</p></section></div>`;
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
    const held = ctx.body()?.gear.stats().weapon?.skill;
    selSkill ||= held && SKILL_TREES[held] ? held : 'mace';
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
    return `<div class="pg wtree"><section class="cell-p"><ul class="wlist">${list}</ul>
      <p class="hint">A number beside a skill is points waiting to be spent.</p></section><section class="cell-p">${right}</section></div>`;
  }

  // ---- the Bestiary: a page per creature you've slain (or caught), filled in as you learn about it ----
  let beastSel = null;
  const DMG = ['slash', 'pierce', 'blunt', 'crush', 'fire', 'frost', 'storm', 'earth', 'light', 'lunar', 'dark', 'arcane', 'poison'];
  const resWord = v => v === 0 ? 'Immune' : v < 0.5 ? `Resists (×${v})` : v < 1 ? `Hardy (×${v})` : v > 1 ? `Weak (×${v})` : 'Normal';
  const range = (a, b) => a == null ? '—' : a === b ? `${a}` : `${a} – ${b}`;
  function pageBestiary() {
    const ids = knownIds(c).filter(id => MONSTERS[id]).sort((a, b) => MONSTERS[a].name.localeCompare(MONSTERS[b].name));
    if (!ids.length) { beastSel = null; return `<div class="pg two"><section class="cell-p"><h3>Bestiary</h3><p class="hint">Empty. Slay a creature (or catch a fish) and its page begins here; everything you learn about it afterwards fills it in.</p></section><section class="cell-p"></section></div>`; }
    if (!ids.includes(beastSel)) beastSel = ids[0];
    const id = beastSel, M = MONSTERS[id], E = c.bestiary[id], i = ids.indexOf(id);
    const res = DMG.map(t => `<tr><th>${label(t)}</th><td class="${E.res[t] ? '' : 'muted'}">${E.res[t] ? resWord(M.resist?.[t] ?? 1) : '???'}</td></tr>`).join('');
    const stages = M.harvest ? (M.harvest.stages || [{ id: 'skin', verb: 'skin', yields: M.harvest.yields }]) : [];
    const drops = stages.map(S => `<tr><th>${label(S.verb)}</th><td>${E.stages[S.id] ? Object.entries(S.yields).map(([p, [, hi]]) => `up to ${hi} ${escapeHtml(MATERIALS[`${M.harvest.creature}.${p}`]?.name || p)}`).join(', ') : '<span class="muted">??? — not yet tried</span>'}</td></tr>`).join('');
    const nav = `<div class="bst-nav"><button data-beast="${ids[(i - 1 + ids.length) % ids.length]}" ${ids.length < 2 ? 'disabled' : ''}>‹</button><select data-beastsel>${ids.map(x => `<option value="${x}" ${x === id ? 'selected' : ''}>${escapeHtml(MONSTERS[x].name)}</option>`).join('')}</select><button data-beast="${ids[(i + 1) % ids.length]}" ${ids.length < 2 ? 'disabled' : ''}>›</button></div>`;
    return `<div class="pg two bestiary"><section class="cell-p">${nav}
      <h2 class="bst-name">${escapeHtml(M.name)}</h2>
      <p class="muted">${escapeHtml([...(M.classification || [])].filter(x => x && x !== '—').join(' · '))}${M.hazard ? ` · ${escapeHtml(M.hazard)}` : ''}</p>
      ${M.lore ? `<p class="bst-lore">${escapeHtml(M.lore)}</p>` : ''}
      <h3>Encounters</h3><table class="bsheet">
        <tr><th>Slain</th><td class="num">${E.kills}</td></tr>
        <tr><th>Levels met</th><td class="num">${range(E.minLv, E.maxLv)}</td></tr>
        <tr><th>Health met</th><td class="num">${range(E.minHp, E.maxHp)}</td></tr></table>
      <h3>Nature</h3><table class="bsheet">
        <tr><th>Rank</th><td>${escapeHtml(range(M.rank?.[0], M.rank?.[1]))}</td></tr>
        <tr><th>Active</th><td>${escapeHtml(M.activity || '—')}</td></tr>
        <tr><th>Found in</th><td>${escapeHtml(label(M.group || '—'))}${M.temper === 'passive' ? ' · flees when struck' : ''}</td></tr>
        <tr><th>Speed</th><td class="num">${M.stats?.speed ? `${M.stats.speed} m/s` : '—'}</td></tr>
        <tr><th>Notices you at</th><td class="num">${M.stats?.aggro ? `${M.stats.aggro} m` : '—'}</td></tr></table>
      <h3>Resistances <span class="hint">(learned by striking it with each)</span></h3><table class="bsheet">${res}</table>
      ${drops ? `<h3>Harvest <span class="hint">(the most each can give)</span></h3><table class="bsheet">${drops}</table>` : ''}
      </section><section class="bst-right"><section class="beast-fig" aria-label="${escapeHtml(M.name)}"><span class="figure-hint">Drag to turn</span></section>
      <div class="bst-foot"><button class="bst-regions" disabled title="Comes with the world map">Regions encountered</button></div></section></div>`;
  }

  function pageNewSection(title, description) {
    return `<div class="pg two"><section class="cell-p"><h2>${title}</h2><p class="muted">${description}</p><p class="hint">This section is reserved for its own dedicated journal content.</p></section><section class="cell-p"></section></div>`;
  }
  const PAGES = { bestiary: pageBestiary, trees: pageTrees, body: pageBody, character: pageCharacter, attributes: pageAttributes, life: pageLife, combat: pageCombat, magic: pageMagic,
    crafting: () => pageNewSection('Crafting', 'Your crafting professions, recipes, workbenches and production progress will live here.'),
    spells: () => pageNewSection('Spells', 'Your known spells, spell details, preparation and hotbar assignment will live here.'),
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
      <div class="pages pages-${tab}">${PAGES[tab]()}</div>
      <button class="book-close" title="Close (Tab, I or Esc)">×</button></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    el.querySelector('.book-close').onclick = () => ctx.onClose();
    el.querySelectorAll('[data-skill]').forEach(li => li.onclick = () => { selSkill = li.dataset.skill; resetArmed = false; render(); });
    el.querySelectorAll('.node.buy').forEach(nd => nd.onclick = () => { buyNode(c, selSkill, nd.dataset.node); resetArmed = false; ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { if (!resetArmed) { resetArmed = true; return render(); } resetTree(c, b.dataset.reset); resetArmed = false; ctx.onChange?.(); render(); });
    el.querySelectorAll('[data-train]').forEach(b => b.onclick = () => { c.skills[b.dataset.train] = (c.skills[b.dataset.train] ?? 100) + 100; render(); });
    el.querySelectorAll('.cell-p').forEach((x, i) => { if (keep[i] !== undefined) x.scrollTop = keep[i]; });
    if (!keep.length) el.querySelector('.wl.on')?.scrollIntoView({ block: 'nearest' });
    // a skill's name anywhere else in the book opens its tree
    el.querySelectorAll('[data-tree]').forEach(t => t.onclick = () => { selSkill = t.dataset.tree; resetArmed = false; tab = 'trees'; render(); });
    el.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => { assignPoints(c, b.dataset.assign, 1); ctx.onChange?.(); render(); });
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
    el.querySelectorAll('[data-prepare]').forEach(li => li.addEventListener('click', () => { const r = togglePrepared(c, li.dataset.prepare); if (!r.ok) ctx.toast?.(r.reason); ctx.onChange?.(); render(); }));
    el.querySelectorAll('[data-spell]').forEach(li => { li.ondragstart = e => e.dataTransfer.setData('text/plain', 'spell:' + li.dataset.spell); });
    el.querySelectorAll('[data-potion]').forEach(li => {
      li.ondragstart = e => e.dataTransfer.setData('text/plain', li.dataset.potion);
      li.onclick = () => { ctx.onUse(li.dataset.potion); render(); };
    });
    el.querySelectorAll('[data-beast]').forEach(b => b.onclick = () => { beastSel = b.dataset.beast; api.turn = 0; render(); });
    el.querySelector('[data-beastsel]')?.addEventListener('change', e => { beastSel = e.target.value; api.turn = 0; render(); });
    // drag on the figure (or the creature) to turn it
    const fig = el.querySelector('.figure, .beast-fig');
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
    open(t) { if (t) tab = t; el.hidden = false; api.turn = 0; render(); },
    close() { el.hidden = true; el.innerHTML = ''; },
    render,
    // where the figure box is on screen (for play.js to render the character into), or null
    portraitRect() { const f = !el.hidden && el.querySelector('.figure'); return f ? f.getBoundingClientRect() : null; },
    // the Bestiary's creature box and whose page it is (play.js draws the creature there)
    beastRect() { const f = !el.hidden && el.querySelector('.beast-fig'); return f ? f.getBoundingClientRect() : null; },
    get beastId() { return tab === 'bestiary' ? beastSel : null; },
  };
  return api;
}
