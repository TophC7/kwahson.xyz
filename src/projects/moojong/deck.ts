import { shuffle } from '../../lib/rng';

export type TileSuit = 'herd' | 'farm' | 'harvest' | 'sky' | 'night' | 'season' | 'bloom';

export interface TileDesign {
  id: string;
  name: string;
  suit: TileSuit;
  badge: string;
  matchKey: string;
  isBonus: boolean;
}

export interface SuitStyle {
  label: string;
  accent: string;
  softBg: string;
  border: string;
  symbol: string;
}

export const SUIT_STYLES: Record<TileSuit, SuitStyle> = {
  herd: {
    label: 'Herd',
    accent: '#3e613a',
    softBg: '#d6dcd0',
    border: '#6c8c66',
    symbol: '●',
  },
  farm: {
    label: 'Pasture',
    accent: '#805729',
    softBg: '#dfd8ca',
    border: '#aa8655',
    symbol: '■',
  },
  harvest: {
    label: 'Harvest',
    accent: '#944433',
    softBg: '#e0d5cf',
    border: '#bc7564',
    symbol: '▲',
  },
  sky: {
    label: 'Visitors',
    accent: '#286160',
    softBg: '#d1ddda',
    border: '#558e8b',
    symbol: '◎',
  },
  night: {
    label: 'Night Watch',
    accent: '#5f426b',
    softBg: '#d9d4dd',
    border: '#8c6f99',
    symbol: '✦',
  },
  season: {
    label: 'Seasons',
    accent: '#8c651b',
    softBg: '#dfd7c1',
    border: '#c29840',
    symbol: '☀',
  },
  bloom: {
    label: 'Blooms',
    accent: '#8d425f',
    softBg: '#e0d3d8',
    border: '#bd758f',
    symbol: '✿',
  },
};

const CORE_DESIGNS: Omit<TileDesign, 'matchKey' | 'isBonus'>[] = [
  // Herd suit (9 x 4 = 36) — includes existing Cow & Pink Healer Cow
  { id: 'cow', name: 'Cow', suit: 'herd', badge: '1' },
  { id: 'healer-cow', name: 'Healer', suit: 'herd', badge: '2' },
  { id: 'bee', name: 'Bee', suit: 'herd', badge: '3' },
  { id: 'sheep', name: 'Sheep', suit: 'herd', badge: '4' },
  { id: 'pig', name: 'Pig', suit: 'herd', badge: '5' },
  { id: 'chicken', name: 'Hen', suit: 'herd', badge: '6' },
  { id: 'duck', name: 'Duck', suit: 'herd', badge: '7' },
  { id: 'goat', name: 'Goat', suit: 'herd', badge: '8' },
  { id: 'barn-cat', name: 'Cat', suit: 'herd', badge: '9' },

  // Pasture Props suit (9 x 4 = 36) — includes existing Hay, Rock, Stump, Crate
  { id: 'hay-bale', name: 'Hay', suit: 'farm', badge: '1' },
  { id: 'rock', name: 'Rock', suit: 'farm', badge: '2' },
  { id: 'stump', name: 'Stump', suit: 'farm', badge: '3' },
  { id: 'crate', name: 'Crate', suit: 'farm', badge: '4' },
  { id: 'barn', name: 'Barn', suit: 'farm', badge: '5' },
  { id: 'tractor', name: 'Tractor', suit: 'farm', badge: '6' },
  { id: 'silo', name: 'Silo', suit: 'farm', badge: '7' },
  { id: 'windmill', name: 'Mill', suit: 'farm', badge: '8' },
  { id: 'well', name: 'Well', suit: 'farm', badge: '9' },

  // Harvest & Tools suit (9 x 4 = 36)
  { id: 'milk-churn', name: 'Milk', suit: 'harvest', badge: '1' },
  { id: 'corn', name: 'Corn', suit: 'harvest', badge: '2' },
  { id: 'pumpkin', name: 'Gourd', suit: 'harvest', badge: '3' },
  { id: 'apple', name: 'Apple', suit: 'harvest', badge: '4' },
  { id: 'carrot', name: 'Carrot', suit: 'harvest', badge: '5' },
  { id: 'honey-jar', name: 'Honey', suit: 'harvest', badge: '6' },
  { id: 'straw-hat', name: 'Hat', suit: 'harvest', badge: '7' },
  { id: 'watering-can', name: 'Can', suit: 'harvest', badge: '8' },
  { id: 'scarecrow', name: 'Crow', suit: 'harvest', badge: '9' },

  // Sky & Visitors / Winds (4 x 4 = 16) — includes existing UFO
  { id: 'ufo', name: 'Saucer', suit: 'sky', badge: 'N' },
  { id: 'scout-pod', name: 'Scout', suit: 'sky', badge: 'E' },
  { id: 'alien', name: 'Visitor', suit: 'sky', badge: 'S' },
  { id: 'sprouts', name: 'Sprouts', suit: 'sky', badge: 'W' },

  // Night Watch / Dragons (3 x 4 = 12)
  { id: 'moon', name: 'Moon', suit: 'night', badge: '★' },
  { id: 'lantern', name: 'Lantern', suit: 'night', badge: '◆' },
  { id: 'comet', name: 'Star', suit: 'night', badge: '✦' },
];

const BONUS_DESIGNS: Omit<TileDesign, 'isBonus'>[] = [
  // Seasons bonus group (4 unique x 1 = 4, any two match)
  { id: 'season-spring', name: 'Spring', suit: 'season', badge: 'Season 1', matchKey: 'bonus-season' },
  { id: 'season-summer', name: 'Summer', suit: 'season', badge: 'Season 2', matchKey: 'bonus-season' },
  { id: 'season-autumn', name: 'Autumn', suit: 'season', badge: 'Season 3', matchKey: 'bonus-season' },
  { id: 'season-winter', name: 'Winter', suit: 'season', badge: 'Season 4', matchKey: 'bonus-season' },

  // Blooms bonus group (4 unique x 1 = 4, any two match)
  { id: 'bloom-hibiscus', name: 'Hibiscus', suit: 'bloom', badge: 'Bloom 1', matchKey: 'bonus-bloom' },
  { id: 'bloom-sunflower', name: 'Sunflower', suit: 'bloom', badge: 'Bloom 2', matchKey: 'bonus-bloom' },
  { id: 'bloom-allium', name: 'Allium', suit: 'bloom', badge: 'Bloom 3', matchKey: 'bonus-bloom' },
  { id: 'bloom-forget-me-not', name: 'Forget-Me-Not', suit: 'bloom', badge: 'Bloom 4', matchKey: 'bonus-bloom' },
];

export const TILE_DESIGNS: TileDesign[] = [
  ...CORE_DESIGNS.map((d) => ({
    ...d,
    matchKey: d.id,
    isBonus: false,
  })),
  ...BONUS_DESIGNS.map((d) => ({
    ...d,
    isBonus: true,
  })),
];

export const TILE_DESIGN_MAP = new Map<string, TileDesign>(
  TILE_DESIGNS.map((design) => [design.id, design]),
);

export const TOTAL_TILES = 144;

/**
 * Builds the standard 72 matching pairs (144 tiles total):
 * - 34 core designs x 2 pairs each = 68 pairs (136 tiles)
 * - 4 unique Season tiles paired into 2 pairs (4 tiles)
 * - 4 unique Bloom tiles paired into 2 pairs (4 tiles)
 */
export function buildDeckPairs(rng: () => number): [TileDesign, TileDesign][] {
  const pairs: [TileDesign, TileDesign][] = [];

  for (const design of TILE_DESIGNS) {
    if (!design.isBonus) {
      pairs.push([design, design], [design, design]);
    }
  }

  const seasons = TILE_DESIGNS.filter((d) => d.suit === 'season');
  const blooms = TILE_DESIGNS.filter((d) => d.suit === 'bloom');

  shuffle(seasons, rng);
  shuffle(blooms, rng);

  pairs.push([seasons[0], seasons[1]], [seasons[2], seasons[3]]);
  pairs.push([blooms[0], blooms[1]], [blooms[2], blooms[3]]);
  shuffle(pairs, rng);

  return pairs;
}

export function tilesMatch(a: TileDesign, b: TileDesign): boolean {
  return a.matchKey === b.matchKey;
}
