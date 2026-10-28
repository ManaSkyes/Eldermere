// src/ui/util.js — small shared UI helpers.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LABELS = {
  attunement: 'Magic attunement', voiceless: 'Voiceless casting', forgotten: 'Forgotten script',
  runicScript: 'Runic script', manaControl: 'Mana control', manaSense: 'Mana sense',
  trapHandling: 'Trap handling', firstAid: 'First aid', monsterLore: 'Monster lore',
  crystalHarvesting: 'Crystal harvesting', talismanCrafting: 'Talisman crafting',
  throwing: 'Throwing weapons', void: 'Void magic',
};
export function label(id) {
  if (LABELS[id]) return LABELS[id];
  const s = id.replace(/([A-Z])/g, ' $1').toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
}
