export const COLS = 8;
export const ROWS = 9;
export const POWER_PER_TURN = 3;
export const HOLD_TURNS = 6;
export const BARN_HP = 6;
export const MAX_EGGS = 3;
export const CROP_COUNT = 4;
// Mend can heal this far past max HP; the excess lasts until the next player turn.
export const OVERHEAL = 2;

export type Difficulty = 'easy' | 'medium' | 'hard';
export const THREAT: Record<Difficulty, number> = { easy: 0.9, medium: 1.2, hard: 1.5 };
export const SALT: Record<Difficulty, number> = { easy: 0x51ed, medium: 0xa3c7, hard: 0xf00d };
export const DIFFICULTIES: Record<Difficulty, { label: string; tagline: string }> = {
  easy: { label: 'Easy', tagline: 'A light scouting party' },
  medium: { label: 'Medium', tagline: 'A proper raid' },
  hard: { label: 'Hard', tagline: 'The whole fleet' },
};

export const HERO_KINDS = ['cow', 'healer', 'bee', 'goat', 'cat', 'hen', 'sheep'] as const;
export const ENEMY_KINDS = ['visitor', 'sprouts', 'scout', 'brute', 'lobber', 'saucer', 'redSprout', 'yellowSprout', 'blueSprout'] as const;
// A Sprouts trio splits into these, in this order; damage to the trio knocks them out from the back.
export const SPROUT_KINDS = ['redSprout', 'yellowSprout', 'blueSprout'] as const;
const PROP_KINDS = ['rock', 'stump', 'silo', 'hay', 'crate', 'corn', 'scarecrow', 'barn', 'crop'] as const;
export const ITEM_KINDS = ['honey', 'apple', 'bale', 'can', 'pumpkin', 'decoy', 'tractor'] as const;

export type HeroKind = typeof HERO_KINDS[number];
export type EnemyKind = typeof ENEMY_KINDS[number];
export type PropKind = typeof PROP_KINDS[number];
export type ItemKind = typeof ITEM_KINDS[number];
export type EntityKind = HeroKind | EnemyKind | PropKind;
// Saves encode kinds by their position here.
export const ENTITY_KINDS: EntityKind[] = [...HERO_KINDS, ...ENEMY_KINDS, ...PROP_KINDS];

export interface CostParts {
  hp?: number;
  move?: number;
  dmg?: number;
  heal?: number;
  reach?: number;
  push?: number;
  charge?: number;
  leap?: number;
  fly?: number;
  shield?: number;
  extraTiles?: number;
  wall?: number;
  taunt?: number;
  extraMove?: number;
  overheal?: number;
}

export const PRICES = {
  hp: 1, move: 1, dmg: 1, heal: 1, reach: [0, 1, 2], push: 1, charge: 1,
  leap: 1, fly: 1, shield: 2, extraTiles: 0.5, wall: 1, taunt: 1, extraMove: 2, overheal: 1,
} as const;

export function cost(parts: CostParts): number {
  let total = 0;
  for (const key in parts) {
    const part = key as keyof CostParts;
    const n = parts[part] ?? 0;
    total += part === 'reach' ? PRICES.reach[n <= 1 ? 0 : n === 2 ? 1 : 2] : n * PRICES[part];
  }
  return total;
}

interface Unit {
  name: string;
  model: string;
  /** Largest model dimension on the board, in tiles. */
  size: number;
  hp: number;
  move: number;
  fly: boolean;
  parts: CostParts;
}
interface Ability { name: string; desc: string }

export const HEROES: Record<HeroKind, Unit & { skill: Ability }> = {
  cow: {
    name: 'Cow', model: 'cow', size: 0.8, hp: 5, move: 3, fly: false,
    skill: { name: 'Shove', desc: 'Push a neighbour 1 tile. Collisions hurt both.' },
    parts: { hp: 5, move: 3, push: 1, dmg: 1 },
  },
  healer: {
    name: 'Healer', model: 'healer-cow', size: 0.8, hp: 2, move: 3, fly: false,
    skill: { name: 'Mend', desc: 'Heal a friend within 3 tiles for 2. Healing past full is bonus HP until your next turn.' },
    parts: { hp: 2, move: 3, heal: 2, reach: 3, overheal: 1 },
  },
  bee: {
    name: 'Bee', model: 'bee', size: 0.8, hp: 2, move: 4, fly: true,
    skill: { name: 'Sting', desc: '1 damage up to 3 tiles in a line, over anything.' },
    parts: { hp: 2, move: 4, fly: 1, dmg: 1, reach: 3 },
  },
  goat: {
    name: 'Goat', model: 'goat', size: 0.8, hp: 4, move: 2, fly: false,
    skill: { name: 'Ram', desc: 'Charge a line: 2 damage and a push.' },
    parts: { hp: 4, move: 2, dmg: 2, push: 1, charge: 1 },
  },
  cat: {
    name: 'Cat', model: 'barn-cat', size: 0.8, hp: 3, move: 5, fly: false,
    skill: { name: 'Pounce', desc: 'Leap over a neighbour for 1 damage.' },
    parts: { hp: 3, move: 5, dmg: 1, leap: 1 },
  },
  hen: {
    name: 'Hen', model: 'chicken', size: 0.8, hp: 3, move: 4, fly: false,
    skill: { name: 'Egg', desc: 'Lay a trap within 2 tiles: 2 damage to the first ground visitor on it.' },
    parts: { hp: 3, move: 4, dmg: 2, reach: 2 },
  },
  sheep: {
    name: 'Sheep', model: 'sheep', size: 0.8, hp: 4, move: 3, fly: false,
    skill: { name: 'Wool', desc: 'Shield a friend within 2 tiles from the next hit.' },
    parts: { hp: 4, move: 3, shield: 1, reach: 2 },
  },
};

// weight 0 keeps a kind out of generated raids.
type EnemyData = Unit & { damage: number; attack: Ability; weight: number };
export const ENEMIES: Record<EnemyKind, EnemyData> = {
  visitor: {
    name: 'Visitor', model: 'alien', size: 0.8, hp: 2, move: 3, fly: false, damage: 1, weight: 3,
    attack: { name: 'Zap', desc: '1 damage to the next tile.' },
    parts: { hp: 2, move: 3, dmg: 1 },
  },
  // Priced as one unit with three attacks: it never acts itself and its three 1-HP members die to any splash.
  sprouts: {
    name: 'Sprouts', model: 'sprouts', size: 0.8, hp: 3, move: 3, fly: false, damage: 1, weight: 2,
    attack: { name: 'Split', desc: 'Splits into red, yellow and blue sprouts on its next turn. Each hit knocks one out first.' },
    parts: { hp: 3, move: 3, dmg: 3, reach: 3, extraTiles: 4 },
  },
  scout: {
    name: 'Scout', model: 'scout-pod', size: 0.95, hp: 2, move: 2, fly: false, damage: 1, weight: 2,
    attack: { name: 'Laser', desc: '1 damage to the first thing within 4 tiles in a line.' },
    parts: { hp: 2, move: 2, dmg: 1, reach: 4 },
  },
  brute: {
    name: 'Brute', model: 'brute', size: 1.05, hp: 4, move: 2, fly: false, damage: 2, weight: 2,
    attack: { name: 'Slam', desc: '2 damage and a push.' },
    parts: { hp: 4, move: 2, dmg: 2, push: 1 },
  },
  lobber: {
    name: 'Lobber', model: 'lobber', size: 0.85, hp: 2, move: 2, fly: false, damage: 1, weight: 2,
    attack: { name: 'Mortar', desc: '1 damage in a plus shape 3 tiles away.' },
    parts: { hp: 2, move: 2, dmg: 1, reach: 3, extraTiles: 4 },
  },
  saucer: {
    name: 'Saucer', model: 'ufo', size: 0.8, hp: 3, move: 3, fly: true, damage: 1, weight: 1,
    attack: { name: 'Beam', desc: 'Pulls the first thing within 3 tiles in a line and deals 1.' },
    parts: { hp: 3, move: 3, fly: 1, dmg: 1, reach: 3, push: 1 },
  },
  redSprout: {
    name: 'Red Sprout', model: 'sprout-red', size: 0.6, hp: 1, move: 3, fly: false, damage: 1, weight: 0,
    attack: { name: 'Flame', desc: '1 damage to the next 2 tiles in a line.' },
    parts: { hp: 1, move: 3, dmg: 1, reach: 2, extraTiles: 1 },
  },
  yellowSprout: {
    name: 'Yellow Sprout', model: 'sprout-yellow', size: 0.6, hp: 1, move: 3, fly: false, damage: 1, weight: 0,
    attack: { name: 'Chain', desc: '1 damage to the next tile and on through everything lined up behind it.' },
    parts: { hp: 1, move: 3, dmg: 1, extraTiles: 2 },
  },
  blueSprout: {
    name: 'Blue Sprout', model: 'sprout-blue', size: 0.6, hp: 1, move: 3, fly: false, damage: 1, weight: 0,
    attack: { name: 'Jet', desc: '1 damage and a push to the first thing within 3 tiles in a line.' },
    parts: { hp: 1, move: 3, dmg: 1, reach: 3, push: 1 },
  },
};

export const PROPS: Record<PropKind, { name: string; model: string; hp: number | null; pushable: boolean }> = {
  rock: { name: 'Rock', model: 'rock', hp: null, pushable: false },
  stump: { name: 'Stump', model: 'stump', hp: null, pushable: false },
  silo: { name: 'Silo', model: 'silo', hp: null, pushable: false },
  hay: { name: 'Hay Bale', model: 'hay-bale', hp: 2, pushable: true },
  crate: { name: 'Crate', model: 'crate', hp: 2, pushable: true },
  corn: { name: 'Corn Wall', model: 'corn-wall', hp: 1, pushable: true },
  scarecrow: { name: 'Scarecrow', model: 'scarecrow', hp: 3, pushable: true },
  barn: { name: 'Barn', model: 'barn', hp: BARN_HP, pushable: false },
  crop: { name: 'Carrots', model: 'carrot', hp: 1, pushable: false },
};

interface Item {
  name: string;
  model: string;
  power: number;
  charges: number;
  desc: string;
  parts: CostParts;
}

export const ITEMS: Record<ItemKind, Item> = {
  honey: {
    name: 'Honey', model: 'honey-jar', power: 1, charges: 2,
    desc: 'Heal yourself or an adjacent friend for 2.', parts: { heal: 2 },
  },
  apple: {
    name: 'Apple', model: 'apple', power: 1, charges: 2,
    desc: 'Let yourself or an adjacent hero who has moved move again.', parts: { extraMove: 1 },
  },
  bale: {
    name: 'Hay Bale', model: 'hay-bale', power: 1, charges: 2,
    desc: 'Place a 2 HP hay bale on an empty tile within 2 tiles.', parts: { wall: 2, reach: 2 },
  },
  can: {
    name: 'Watering Can', model: 'watering-can', power: 2, charges: 1,
    desc: 'Grow a wall of up to 3 corn stalks across a line within 2 tiles.', parts: { wall: 3, reach: 2 },
  },
  pumpkin: {
    name: 'Pumpkin', model: 'pumpkin', power: 2, charges: 1,
    desc: 'Lob over blockers for 2 damage up to 3 tiles in a line.', parts: { dmg: 2, reach: 3 },
  },
  decoy: {
    name: 'Scarecrow', model: 'scarecrow', power: 2, charges: 1,
    desc: 'Place a 3 HP scarecrow within 2 tiles to draw enemy fire.', parts: { wall: 3, reach: 2, taunt: 1 },
  },
  tractor: {
    name: 'Tractor', model: 'tractor', power: 3, charges: 1,
    desc: 'Drive a line, dealing 2 damage and pushing each visitor or breakable neutral prop.',
    parts: { dmg: 2, reach: Math.max(COLS, ROWS) - 1, push: 1, charge: 1 },
  },
};
