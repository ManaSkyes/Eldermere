import { PLANTS } from '../data/materials.js';
export const HERBARUM_CLASSIFICATIONS = {
  'Herbs': { description: 'Medicinal and alchemical plants, valued for the properties held in their leaves, roots and blooms.', orders: {
    'Restorative Herbs': 'Plants used to soothe, mend and restore the body.',
    'Vitality Blooms': 'Flowers and bright growths used in simple restorative preparations.',
    'Medicinal Roots': 'Roots and underground growths prized for concentrated remedies.',
    'Alchemical Botanicals': 'Potent, unusual or magically active plants used in alchemy.' } },
  'Food Plants': { description: 'Edible wild plants and cultivated crops gathered for nourishment and cooking.', orders: {
    'Edible Greens': 'Leaves, shoots and tender plants gathered as food.',
    'Wild Fruits & Berries': 'Wild-growing fruits and berries.',
    'Roots & Tubers': 'Edible roots and underground storage organs.',
    'Cultivated Crops': 'Plants raised in fields and gardens for food.' } },
  'Fibers': { description: 'Plants whose stems, leaves or seeds provide fibers for thread, cloth and cordage.', orders: {
    'Bast Fibers': 'Strong fibers taken from the inner bark of stems.',
    'Leaf Fibers': 'Fibers gathered from long, tough leaves and similar growths.',
    'Seed Fibers': 'Soft fibers surrounding seeds.' } },
  'Dyes & Inks': { description: 'Plants and tree growths used to make pigments, dyes and writing materials.', orders: {
    'Dye-bearing Plants': 'Flowers, leaves and roots that yield useful pigments.',
    'Ink-bearing Plants': 'Galls and other botanical materials used in inks.' } },
  'Woods': { description: 'Trees and other harvestable timber plants, classified by the qualities of their wood.', orders: {
    'Softwoods': 'Light, workable timber from coniferous trees.',
    'Hardwoods': 'Dense and durable timber for tools, furniture and construction.',
    'Bowwoods': 'Resilient woods prized for their spring and flexibility.',
    'Arcane Timber': 'Rare woods with unusual magical or material properties.' } }
};
export const HERBARUM_FAMILIES = Object.keys(HERBARUM_CLASSIFICATIONS);
export const HERBARUM_PAGES = HERBARUM_FAMILIES.flatMap(family => Object.entries(HERBARUM_CLASSIFICATIONS[family].orders).map(([order, description]) => ({ family, order, description, familyDescription: HERBARUM_CLASSIFICATIONS[family].description })));
export function classifyPlant(value) {
  const p = typeof value === 'string' ? PLANTS.find(x => x.id === value) : value;
  if (!p) return { family: 'Unclassified', order: 'Unidentified' };
  if (p.kind === 'herb') {
    if (p.id === 'sunCupTulip') return { family: 'Herbs', order: 'Vitality Blooms' };
    if (['yarrow', 'chamomile', 'mint', 'valerian'].includes(p.id)) return { family: 'Herbs', order: 'Restorative Herbs' };
    if (p.id === 'sunroot') return { family: 'Herbs', order: 'Medicinal Roots' };
    return { family: 'Herbs', order: 'Alchemical Botanicals' };
  }
  if (p.kind === 'food') {
    if (p.id === 'wildBerry') return { family: 'Food Plants', order: 'Wild Fruits & Berries' };
    if (p.id === 'potato') return { family: 'Food Plants', order: 'Roots & Tubers' };
    return { family: 'Food Plants', order: p.source === 'farming' ? 'Cultivated Crops' : 'Edible Greens' };
  }
  if (p.kind === 'fiber') return { family: 'Fibers', order: p.id === 'cotton' ? 'Seed Fibers' : p.id === 'silkweed' ? 'Leaf Fibers' : 'Bast Fibers' };
  if (p.kind === 'ink') return { family: 'Dyes & Inks', order: p.id === 'oakGall' ? 'Ink-bearing Plants' : 'Dye-bearing Plants' };
  if (p.kind === 'wood') return { family: 'Woods', order: p.id === 'pine' ? 'Softwoods' : p.id === 'yew' ? 'Bowwoods' : ['ironwood', 'elderwood'].includes(p.id) ? 'Arcane Timber' : 'Hardwoods' };
  return { family: 'Unclassified', order: 'Unidentified' };
}
export function discoverPlant(c, id, amount = 1) {
  if (!PLANTS.some(p => p.id === id)) return null;
  c.herbarum ||= {};
  const e = c.herbarum[id] ||= { gathers: 0, first: null, last: null };
  e.gathers += Math.max(1, amount | 0); e.first ||= Date.now(); e.last = Date.now();
  return e;
}
export const knownPlantIds = c => Object.keys(c.herbarum || {}).filter(id => (c.herbarum[id].gathers || 0) > 0);
