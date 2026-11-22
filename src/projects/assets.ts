import * as THREE from 'three';
import type { GalleryGroup, GalleryItem } from '../components/AssetGallery.svelte';
import type { MiniatureId } from '../lib/miniatures';
import { createPastureKit } from '../lib/pastureKit';
import {
  HARVEST_GALLERY_GROUPS,
  HARVEST_GALLERY_ITEMS,
  HARVEST_GALLERY_TAGS,
} from './harvest-drop/models';
import { SUIT_STYLES, TILE_DESIGNS } from './moojong/deck';
import { buildTileArtAtlas } from './moojong/tileArt';
import {
  GALLERY_GROUPS as TACTICS_GROUPS,
  GALLERY_ITEMS as TACTICS_ITEMS,
  GALLERY_TAGS as TACTICS_TAGS,
} from './pasture-tactics/models';
import {
  UDDER_GALLERY_GROUPS,
  UDDER_GALLERY_ITEMS,
  UDDER_GALLERY_TAGS,
} from './udder-havoc/models';

export interface AssetCatalog {
  slug: string;
  title: string;
  accent: string;
  storageKey: string;
  items: GalleryItem<string>[];
  groups: Record<string, GalleryGroup>;
  tags?: Record<string, string>;
  loadPreviews?: () => Record<string, string>;
}

function groupEntries(group: string, entries: readonly [MiniatureId, string][]): GalleryItem[] {
  return entries.map(([id, name], idx) => ({ id, name, group, badge: String(idx + 1) }));
}

const CORN_GROUPS: Record<string, GalleryGroup> = {
  shooter: { label: 'Shooter & Ammo', accent: '#805729' },
  targets: { label: 'Targets', accent: '#286160' },
  arena: { label: 'Props & Obstacles', accent: '#3e613a' },
};

const CORN_ITEMS: GalleryItem[] = [
  ...groupEntries('shooter', [
    ['bazooka-cow', 'Bazooka Cow'],
    ['corn', 'Corn Cob Shell'],
  ]),
  ...groupEntries('targets', [
    ['alien', 'Alien Visitor'],
    ['scout-pod', 'Scout Pod'],
  ]),
  ...groupEntries('arena', [
    ['pumpkin', 'Explosive Pumpkin'],
    ['tractor', 'Moving Tractor'],
    ['hay-bale', 'Hay Bale'],
  ]),
];

const PATROL_GROUPS: Record<string, GalleryGroup> = {
  saucer: { label: 'Saucer', accent: '#286160' },
  herd: { label: 'Herd', accent: '#3e613a' },
  hazards: { label: 'Hazards & Props', accent: '#944433' },
};

const PATROL_ITEMS: GalleryItem[] = [
  ...groupEntries('saucer', [['ufo', 'Tractor Saucer']]),
  ...groupEntries('herd', [
    ['cow', 'Pasture Cow'],
    ['healer-cow', 'Healer Cow'],
    ['goat', 'Goat'],
    ['chicken', 'Chicken'],
    ['bazooka-cow', 'Gunner Cow'],
  ]),
  ...groupEntries('hazards', [
    ['bee', 'Guard Bee'],
    ['corn', 'Corn Cob Shell'],
    ['pumpkin', 'Pumpkin'],
    ['tractor', 'Tractor'],
    ['egg', 'Egg Bomb'],
    ['hay-bale', 'Hay Bale'],
    ['rock', 'Rock'],
    ['stump', 'Stump'],
    ['crate', 'Crate'],
  ]),
];

const MOOJONG_ITEMS: GalleryItem[] = TILE_DESIGNS.map((d) => ({
  id: d.id,
  name: d.name,
  group: d.suit,
  badge: d.badge,
}));

const MOOJONG_TAGS: Record<string, string> = Object.fromEntries(
  ['cow', 'healer-cow', 'hay-bale', 'rock', 'stump', 'crate', 'ufo'].map((id) => [id, 'Patrol']),
);

let cachedMoojongPreviews: Record<string, string> | null = null;

function getMoojongPreviews(): Record<string, string> {
  if (cachedMoojongPreviews) return cachedMoojongPreviews;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const kit = createPastureKit();
  try {
    const atlas = buildTileArtAtlas(renderer, kit);
    cachedMoojongPreviews = atlas.previews;
    atlas.dispose();
  } finally {
    kit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return cachedMoojongPreviews;
}

export const ASSET_CATALOGS: AssetCatalog[] = [
  {
    slug: 'harvest-drop',
    title: 'Harvest Drop',
    accent: '#3e613a',
    storageKey: 'harvest-drop-gallery-notes',
    items: HARVEST_GALLERY_ITEMS,
    groups: HARVEST_GALLERY_GROUPS,
    tags: HARVEST_GALLERY_TAGS,
  },
  {
    slug: 'udder-havoc',
    title: 'Udder Havoc',
    accent: '#944433',
    storageKey: 'udder-havoc-asset-review-v1',
    items: UDDER_GALLERY_ITEMS,
    groups: UDDER_GALLERY_GROUPS,
    tags: UDDER_GALLERY_TAGS,
  },
  {
    slug: 'corn-shots',
    title: 'Corn Shots',
    accent: '#805729',
    storageKey: 'corn-shots-asset-review-v1',
    items: CORN_ITEMS,
    groups: CORN_GROUPS,
  },
  {
    slug: 'pasture-tactics',
    title: 'Pasture Tactics',
    accent: '#286160',
    storageKey: 'pasture-tactics-asset-review-v1',
    items: TACTICS_ITEMS,
    groups: TACTICS_GROUPS,
    tags: TACTICS_TAGS,
  },
  {
    slug: 'moojong',
    title: 'Moojong',
    accent: '#5c6b54',
    storageKey: 'moojong-asset-review-v1',
    items: MOOJONG_ITEMS,
    groups: SUIT_STYLES,
    tags: MOOJONG_TAGS,
    loadPreviews: getMoojongPreviews,
  },
  {
    slug: 'pasture-patrol',
    title: 'Pasture Patrol',
    accent: '#6b533b',
    storageKey: 'pasture-patrol-asset-review-v1',
    items: PATROL_ITEMS,
    groups: PATROL_GROUPS,
  },
];
