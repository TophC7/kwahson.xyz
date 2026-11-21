import * as THREE from 'three';
import type { GalleryItem } from '../../components/AssetGallery.svelte';
import { buildMiniature, type StudioBuilder } from '../../lib/miniatures';
import { ENEMIES, HEROES, HERO_KINDS, ITEMS, PROPS } from './data';

export const GALLERY_GROUPS = {
  heroes: { label: 'Herd', accent: '#3e613a' },
  enemies: { label: 'Visitors', accent: '#286160' },
  terrain: { label: 'Terrain', accent: '#805729' },
  items: { label: 'Items', accent: '#944433' },
};

function galleryGroup(group: keyof typeof GALLERY_GROUPS, entries: { model: string; name: string }[]): GalleryItem[] {
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

export function buildTacticsModel(studio: StudioBuilder, id: string): THREE.Group {
  const { part, mesh, track } = studio;
  switch (id) {
    case 'brute': {
      const g = new THREE.Group();
      part(g, 'box', 0x4fb85a, [0.62, 0.5, 0.46], [0, 0.5, 0]);
      part(g, 'box', 0x8fe08a, [0.4, 0.3, 0.03], [0, 0.46, 0.235]);
      part(g, 'box', 0x67d964, [0.44, 0.3, 0.4], [0, 0.9, 0.04]);
      for (const side of [-1, 1]) {
        part(g, 'cylinder', 0x4fb85a, [0.04, 0.16, 0.04], [side * 0.16, 1.12, 0.04]).rotation.z = -side * 0.5;
        part(g, 'sphere', 0x67d964, [0.07, 0.05, 0.07], [side * 0.2, 1.2, 0.04]);
        part(g, 'sphere', 0x111613, [0.1, 0.05, 0.03], [side * 0.11, 0.92, 0.24]).rotation.z = side * 0.3;
        part(g, 'box', 0x3f9a4a, [0.2, 0.44, 0.24], [side * 0.44, 0.46, 0.04]);
        part(g, 'box', 0x4fb85a, [0.26, 0.2, 0.28], [side * 0.44, 0.2, 0.08]);
        part(g, 'box', 0x3f9a4a, [0.2, 0.26, 0.22], [side * 0.17, 0.13, 0]);
        part(g, 'box', 0x454f4c, [0.26, 0.08, 0.3], [side * 0.44, 0.72, 0.04]);
      }
      g.rotation.y = 0.46;
      return g;
    }
    case 'lobber': {
      // Blocky four-legged mortar walker in saucer teal.
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          part(g, 'box', 0x3d7167, [0.1, 0.2, 0.1], [sx * 0.2, 0.1, sz * 0.15]);
          part(g, 'box', 0xebb84c, [0.14, 0.05, 0.14], [sx * 0.2, 0.025, sz * 0.15]);
        }
      }
      part(g, 'box', 0x5eaea4, [0.56, 0.3, 0.48], [0, 0.34, 0]);
      part(g, 'box', 0x3d7167, [0.6, 0.06, 0.52], [0, 0.26, 0]);
      for (const x of [-0.2, 0, 0.2]) part(g, 'box', 0xffdc76, [0.06, 0.04, 0.02], [x, 0.26, 0.265]);
      part(g, 'box', 0x111613, [0.14, 0.11, 0.02], [0, 0.39, 0.245]);
      part(g, 'box', 0xc7f6dc, [0.04, 0.04, 0.01], [0.03, 0.41, 0.256]);
      part(g, 'box', 0x3d7167, [0.3, 0.12, 0.3], [0, 0.55, -0.02]);
      const barrel = new THREE.Group();
      barrel.position.set(0, 0.58, -0.04);
      barrel.rotation.x = 0.4;
      g.add(barrel);
      part(barrel, 'box', 0x454f4c, [0.18, 0.4, 0.18], [0, 0.2, 0]);
      part(barrel, 'box', 0xebb84c, [0.22, 0.06, 0.22], [0, 0.4, 0]);
      part(barrel, 'box', 0xff8f5a, [0.11, 0.11, 0.11], [0, 0.45, 0]);
      g.rotation.y = 0.35;
      return g;
    }
    case 'corn-wall': {
      // Blocky row of three corn stalks on a dirt bed.
      const g = new THREE.Group();
      part(g, 'box', 0x9b684a, [0.92, 0.08, 0.32], [0, 0.04, 0]);
      for (const [x, h] of [[-0.3, 0.84], [0, 1.0], [0.3, 0.9]]) {
        part(g, 'box', 0x6f9b4d, [0.08, h, 0.08], [x, 0.08 + h / 2, 0]);
        part(g, 'box', 0x7fb05a, [0.24, 0.05, 0.1], [x - 0.1, 0.3, 0]).rotation.z = 0.5;
        part(g, 'box', 0x7fb05a, [0.24, 0.05, 0.1], [x + 0.1, 0.52, 0]).rotation.z = -0.5;
        part(g, 'box', 0xa9c96a, [0.13, 0.1, 0.13], [x + 0.07, 0.5, 0.07]);
        part(g, 'box', 0xf2c63b, [0.11, 0.2, 0.11], [x + 0.07, 0.64, 0.07]);
        part(g, 'box', 0xe6b853, [0.16, 0.05, 0.05], [x, 0.1 + h, 0]);
        part(g, 'box', 0xe6b853, [0.05, 0.1, 0.05], [x, 0.14 + h, 0]);
      }
      g.rotation.y = 0.2;
      return g;
    }
    default:
      return buildMiniature(studio, id);
  }
}
