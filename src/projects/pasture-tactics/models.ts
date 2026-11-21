import type { MiniatureId } from '../../lib/miniatures';
import type { GalleryItem } from '../../components/AssetGallery.svelte';
import { ENEMIES, HEROES, HERO_KINDS, ITEMS, PROPS } from './data';

export const GALLERY_GROUPS = {
  heroes: { label: 'Herd', accent: '#3e613a' },
  enemies: { label: 'Visitors', accent: '#286160' },
  terrain: { label: 'Terrain', accent: '#805729' },
  items: { label: 'Items', accent: '#944433' },
};

function galleryGroup(group: keyof typeof GALLERY_GROUPS, entries: { model: MiniatureId; name: string }[]): GalleryItem[] {
  return entries.map(({ model: id, name }, index) => ({ id, name, group, badge: String(index + 1) }));
}

export const GALLERY_ITEMS: GalleryItem[] = [
  ...galleryGroup('heroes', HERO_KINDS.map((kind) => HEROES[kind])),
  ...galleryGroup('enemies', [
    ENEMIES.visitor, ENEMIES.sprouts, ENEMIES.redSprout, ENEMIES.yellowSprout, ENEMIES.blueSprout,
    ENEMIES.scout, ENEMIES.saucer, ENEMIES.brute, ENEMIES.lobber,
  ]),
  ...galleryGroup('terrain', [PROPS.rock, PROPS.stump, PROPS.silo, PROPS.hay, PROPS.crate, PROPS.barn, PROPS.corn, PROPS.scarecrow, { model: 'egg', name: 'Egg' }, PROPS.crop]),
  ...galleryGroup('items', [ITEMS.honey, ITEMS.apple, ITEMS.can, ITEMS.pumpkin, ITEMS.tractor]),
];

export const GALLERY_TAGS = { pig: 'New', duck: 'New', brute: 'New', lobber: 'New', egg: 'New', 'corn-wall': 'New' };
