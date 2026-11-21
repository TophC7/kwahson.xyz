import type { GalleryGroup, GalleryItem } from '../../components/AssetGallery.svelte';
import type { MiniatureId } from '../../lib/miniatures';

export const UDDER_GALLERY_GROUPS: Record<string, GalleryGroup> = {
  herd: { label: 'Herd & Gear', accent: '#3e613a' },
  visitors: { label: 'Visitors', accent: '#286160' },
  bosses: { label: 'Bosses', accent: '#944433' },
  pasture: { label: 'Maps & Seasons', accent: '#805729' },
};

function groupItems(group: string, entries: readonly [MiniatureId, string][]): GalleryItem[] {
  return entries.map(([id, name], idx) => ({ id, name, group, badge: String(idx + 1) }));
}

export const UDDER_GALLERY_ITEMS: GalleryItem[] = [
  ...groupItems('herd', [
    ['bazooka-cow', 'Bazooka Cow'],
    ['healer-cow', 'Pink Healer Cow'],
    ['bee', 'Guard Bee'],
    ['corn', 'Corn Cob Shell'],
    ['pumpkin', 'Pumpkin Mortar'],
  ]),
  ...groupItems('visitors', [
    ['alien', 'Alien Visitor'],
    ['scout-pod', 'Scout Pod'],
    ['sprout-red', 'Red Sprout'],
    ['sprout-yellow', 'Yellow Sprout'],
    ['sprout-blue', 'Blue Sprout'],
    ['splitter', 'Hive Egg'],
    ['brute', 'Alien Brute'],
    ['sniper', 'Laser Drone'],
    ['lobber', 'Plasma Lobber'],
    ['plasma-orb', 'Alien Plasma Orb'],
    ['ufo', 'Beam Saucer'],
  ]),
  ...groupItems('bosses', [
    ['boss-harvester', 'Dreadnought Harvester'],
    ['boss-strider', 'Tripod Strider'],
    ['boss-queen', 'Hive Queen'],
  ]),
  ...groupItems('pasture', [
    ['corn-wall', 'Corn Row'],
    ['barn', 'Barn'],
    ['silo', 'Silo'],
    ['well', 'Stone Well'],
    ['hay-bale', 'Hay Bale'],
    ['crate', 'Crate'],
    ['rock', 'Rock'],
    ['stump', 'Stump'],
    ['lantern', 'Night Lantern'],
    ['season-spring', 'Spring'],
    ['season-summer', 'Summer'],
    ['season-autumn', 'Autumn'],
    ['season-winter', 'Winter'],
    ['bloom-allium', 'Allium'],
    ['bloom-forget-me-not', 'Forget-Me-Not'],
    ['bloom-sunflower', 'Sunflower'],
    ['bloom-hibiscus', 'Hibiscus'],
  ]),
];

export const UDDER_GALLERY_TAGS: Record<string, string> = {
  'bazooka-cow': 'Hero',
  splitter: 'New',
  sniper: 'New',
  'plasma-orb': 'New',
  'boss-harvester': '90s Boss',
  'boss-strider': '180s Boss',
  'boss-queen': '270s Boss',
};
