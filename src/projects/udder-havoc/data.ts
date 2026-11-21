import type { MiniatureId } from '../../lib/miniatures';
import type { PastureTablePalette } from '../../lib/pastureTable';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayTime = 'day' | 'dusk' | 'night';
export type ArenaLayout = 'meadow' | 'cornrows' | 'barnyard' | 'stonering';
export type BossKind = 'harvester' | 'strider' | 'queen';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const DAYTIMES: readonly DayTime[] = ['day', 'dusk', 'night'];
export const LAYOUTS: readonly ArenaLayout[] = ['meadow', 'cornrows', 'barnyard', 'stonering'];

export const SEASON_DEFS: Record<Season, {
  label: string;
  palette: PastureTablePalette;
  decor: readonly MiniatureId[];
}> = {
  spring: {
    label: 'Spring',
    palette: {
      earth: 0x8f6246,
      rim: 0x67944d,
      turf: 0x8bc263,
      checker: 0x82b75b,
      tuft: 0x6ea04c,
      flowerA: 0xb7d9ff,
      flowerB: 0xf7b8dc,
    },
    decor: ['bloom-allium', 'bloom-forget-me-not', 'season-spring'],
  },
  summer: {
    label: 'Summer',
    palette: {
      earth: 0x9b684a,
      rim: 0x769448,
      turf: 0x99bd5b,
      checker: 0x8eb152,
      tuft: 0x7aa047,
      flowerA: 0xffe469,
      flowerB: 0xf4cf47,
    },
    decor: ['bloom-sunflower', 'bloom-hibiscus', 'season-summer'],
  },
  autumn: {
    label: 'Autumn',
    palette: {
      earth: 0x7f4f38,
      rim: 0x996a3a,
      turf: 0xc2934c,
      checker: 0xb58642,
      tuft: 0x9e6332,
      flowerA: 0xe07a3d,
      flowerB: 0xf2b544,
    },
    decor: ['season-autumn', 'pumpkin', 'hay-bale'],
  },
  winter: {
    label: 'Winter',
    palette: {
      earth: 0x6d747d,
      rim: 0xb6cad6,
      turf: 0xe6eef2,
      checker: 0xd8e4eb,
      post: 0x9e8c7a,
      rail: 0xb09f8d,
      tuft: 0x4f785c,
      flowerA: 0xd8f1ff,
      flowerB: 0xffffff,
    },
    decor: ['season-winter', 'stump', 'rock'],
  },
};

export const DAYTIME_DEFS: Record<DayTime, {
  label: string;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  fillColor: number;
  fillIntensity: number;
  lanterns: boolean;
}> = {
  day: {
    label: 'Day',
    hemiSky: 0xfff8e8,
    hemiGround: 0x709675,
    hemiIntensity: 2.05,
    sunColor: 0xffedd0,
    sunIntensity: 2.4,
    sunPos: [-9, 22, 14],
    fillColor: 0xd8e8d6,
    fillIntensity: 0.55,
    lanterns: false,
  },
  dusk: {
    label: 'Dusk',
    hemiSky: 0xffd2a8,
    hemiGround: 0x5c4f63,
    hemiIntensity: 1.75,
    sunColor: 0xffa65c,
    sunIntensity: 2.6,
    sunPos: [-16, 11, 14],
    fillColor: 0x9c8cb8,
    fillIntensity: 0.6,
    lanterns: true,
  },
  night: {
    label: 'Night',
    hemiSky: 0x7d94cc,
    hemiGround: 0x2f3b4a,
    hemiIntensity: 1.45,
    sunColor: 0x9bb8ff,
    sunIntensity: 1.35,
    sunPos: [10, 20, -10],
    fillColor: 0x5c6e99,
    fillIntensity: 0.45,
    lanterns: true,
  },
};

export const LAYOUT_DEFS: Record<ArenaLayout, { label: string }> = {
  meadow: { label: 'Open Meadow' },
  cornrows: { label: 'Corn Rows' },
  barnyard: { label: 'Barnyard Loop' },
  stonering: { label: 'Stone Ring' },
};

export const BOSS_NAMES: Record<BossKind, string> = {
  harvester: 'Dreadnought Harvester',
  strider: 'Tripod Strider',
  queen: 'Hive Queen',
};

export type PowerupId =
  | 'butter'
  | 'double'
  | 'popcorn'
  | 'goldsight'
  | 'milk'
  | 'pumpkin'
  | 'homing'
  | 'healer'
  | 'backblast'
  | 'ricochet'
  | 'bees'
  | 'trail'
  | 'magnet';

export interface PowerupDef {
  id: PowerupId;
  name: string;
  tag: string;
  desc: string;
  accent: string;
}

export const POWERUPS: readonly PowerupDef[] = [
  {
    id: 'butter',
    name: 'Butter Hooves',
    tag: 'MOBILITY',
    desc: '+18% trot speed and slicker grass for longer recoil skates.',
    accent: '#ffd859',
  },
  {
    id: 'double',
    name: 'Double Cob',
    tag: 'VOLLEY',
    desc: '+1 corn cob per shot in a fan spread and stronger kickback.',
    accent: '#9eb09a',
  },
  {
    id: 'popcorn',
    name: 'Popcorn Split',
    tag: 'SHRAPNEL',
    desc: 'Cob hits pop into +2 bouncing popcorn pellets.',
    accent: '#fff1b8',
  },
  {
    id: 'goldsight',
    name: 'Gold Sight',
    tag: 'CHARGE',
    desc: '+18% fire rate, faster charge lock, and +2 beam pierce.',
    accent: '#ffe469',
  },
  {
    id: 'milk',
    name: 'Explosive Milk',
    tag: 'BLAST',
    desc: 'Enemy KOs splash nearby aliens with radial damage and knockback.',
    accent: '#f4f0e6',
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin Proc',
    tag: 'ORDNANCE',
    desc: 'Chance on hit to call down an explosive pumpkin mortar.',
    accent: '#e07a3d',
  },
  {
    id: 'homing',
    name: 'Homing Kernels',
    tag: 'GUIDANCE',
    desc: 'Fired cobs and popcorn curve toward the nearest alien.',
    accent: '#b6ffdb',
  },
  {
    id: 'healer',
    name: 'Pink Healer Aura',
    tag: 'SUSTAIN',
    desc: '+20 max HP, heal 15 now, and summon wandering pink healer cows.',
    accent: '#f08db4',
  },
  {
    id: 'backblast',
    name: 'Backblast Cone',
    tag: 'RECOIL',
    desc: 'Every shot scorches and shoves chasers behind your hooves.',
    accent: '#ff8f5a',
  },
  {
    id: 'ricochet',
    name: 'Chain Cob',
    tag: 'BOUNCE',
    desc: 'Direct cob hits ricochet toward +1 nearby alien per stack.',
    accent: '#7ee6d6',
  },
  {
    id: 'bees',
    name: 'Guard Bees',
    tag: 'ORBIT',
    desc: 'Summons +2 friendly meadow bees that orbit and sting flankers.',
    accent: '#f7c948',
  },
  {
    id: 'trail',
    name: 'Sizzling Trail',
    tag: 'SKATE',
    desc: 'Recoil-skating drops popping butter-kernel mines behind you.',
    accent: '#f5a642',
  },
  {
    id: 'magnet',
    name: 'Barn Magnet',
    tag: 'GREED',
    desc: 'Wide XP and healer pull across the pasture plus +15% XP gain.',
    accent: '#d8786a',
  },
] as const;

export const POWERUP_MAP: Record<PowerupId, PowerupDef> = Object.fromEntries(
  POWERUPS.map(p => [p.id, p]),
) as Record<PowerupId, PowerupDef>;

export type EnemyKind = 'visitor' | 'skimmer' | 'sprout' | 'splitter' | 'sniper' | 'brute' | 'lobber' | 'saucer' | 'boss';

export interface EnemyArchetype {
  kind: EnemyKind;
  name: string;
  cost: number;
  unlockSec: number;
  baseHp: number;
  speed: number;
  radius: number;
  contactDmg: number;
  xp: number;
  score: number;
}

export const ENEMY_TYPES: Record<EnemyKind, EnemyArchetype> = {
  visitor: {
    kind: 'visitor',
    name: 'Alien Visitor',
    cost: 1,
    unlockSec: 0,
    baseHp: 14,
    speed: 1.9,
    radius: 0.45,
    contactDmg: 7,
    xp: 5,
    score: 10,
  },
  skimmer: {
    kind: 'skimmer',
    name: 'Scout Pod',
    cost: 1.8,
    unlockSec: 16,
    baseHp: 16,
    speed: 3.05,
    radius: 0.46,
    contactDmg: 8,
    xp: 7,
    score: 16,
  },
  sprout: {
    kind: 'sprout',
    name: 'Alien Sprout',
    cost: 0.7,
    unlockSec: 26,
    baseHp: 10,
    speed: 2.55,
    radius: 0.34,
    contactDmg: 5,
    xp: 4,
    score: 8,
  },
  splitter: {
    kind: 'splitter',
    name: 'Hive Egg',
    cost: 2.6,
    unlockSec: 34,
    baseHp: 28,
    speed: 1.7,
    radius: 0.52,
    contactDmg: 8,
    xp: 12,
    score: 26,
  },
  brute: {
    kind: 'brute',
    name: 'Alien Brute',
    cost: 3.5,
    unlockSec: 42,
    baseHp: 56,
    speed: 1.55,
    radius: 0.62,
    contactDmg: 12,
    xp: 16,
    score: 36,
  },
  sniper: {
    kind: 'sniper',
    name: 'Laser Drone',
    cost: 3.2,
    unlockSec: 50,
    baseHp: 22,
    speed: 2.3,
    radius: 0.46,
    contactDmg: 7,
    xp: 14,
    score: 32,
  },
  lobber: {
    kind: 'lobber',
    name: 'Plasma Lobber',
    cost: 4,
    unlockSec: 58,
    baseHp: 34,
    speed: 1.75,
    radius: 0.56,
    contactDmg: 8,
    xp: 16,
    score: 38,
  },
  saucer: {
    kind: 'saucer',
    name: 'Beam Saucer',
    cost: 5,
    unlockSec: 68,
    baseHp: 44,
    speed: 2.0,
    radius: 0.72,
    contactDmg: 10,
    xp: 22,
    score: 48,
  },
  boss: {
    kind: 'boss',
    name: 'Mothership',
    cost: 0,
    unlockSec: 90,
    baseHp: 260,
    speed: 1.5,
    radius: 1.35,
    contactDmg: 18,
    xp: 65,
    score: 250,
  },
};
