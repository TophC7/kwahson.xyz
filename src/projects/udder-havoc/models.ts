import * as THREE from 'three';
import type { GalleryGroup, GalleryItem } from '../../components/AssetGallery.svelte';
import { buildBazookaCow } from '../../lib/bazookaCow';
import { buildMiniature, type StudioBuilder } from '../../lib/miniatures';

export type UdderModelId =
  | 'plasma-orb'
  | 'splitter'
  | 'sniper'
  | 'boss-harvester'
  | 'boss-strider'
  | 'boss-queen';

export function buildUdderModel(studio: StudioBuilder, id: UdderModelId): THREE.Group {
  const { part, mesh, track, smoothCyl, smoothTorus } = studio;
  const g = new THREE.Group();

  switch (id) {
    case 'plasma-orb': {
      const coreGeo = track(new THREE.IcosahedronGeometry(0.32, 0));
      mesh(g, coreGeo, 0x3ef0c6, [0, 0, 0], { flat: true, emissive: 0x1aa88a, roughness: 0.25 });
      const ring = smoothTorus(g, 0xff6e7f, [0.38, 0.38, 0.38], [0, 0, 0], 0.35);
      ring.rotation.x = Math.PI / 3;
      return g;
    }

    case 'splitter': {
      // Alien hive egg nestled in three dark-teal claws.
      const eggGeo = track(new THREE.OctahedronGeometry(0.42, 1));
      const egg = mesh(g, eggGeo, 0x7ef2b8, [0, 0.48, 0], { flat: true, emissive: 0x267555, roughness: 0.32 });
      egg.scale.set(0.92, 1.18, 0.92);
      smoothTorus(g, 0x386962, [0.36, 0.36, 0.4], [0, 0.2, 0], 0.65).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const claw = part(g, 'cone', 0x2a4f4a, [0.1, 0.46, 0.1], [Math.cos(a) * 0.36, 0.3, Math.sin(a) * 0.36]);
        claw.rotation.z = Math.cos(a) * 0.38;
        claw.rotation.x = -Math.sin(a) * 0.38;
      }
      return g;
    }

    case 'sniper': {
      // Swept-wing alien sniper hunter drone with recessed optic barrel & glowing coral-mint sight ring.
      const chassis = part(g, 'box', 0x2f544f, [0.48, 0.24, 0.62], [0, 0.36, -0.04]);
      chassis.rotation.x = 0.08;
      part(g, 'box', 0x4d827a, [0.36, 0.14, 0.46], [0, 0.5, -0.08]);

      // Recessed dark optic housing + glowing cyclops sniper lens + precision ring
      const barrel = smoothCyl(g, 0x1b2624, [0.17, 0.24, 0.17], [0, 0.36, 0.31], 0.55);
      barrel.rotation.x = Math.PI / 2;
      mesh(g, track(new THREE.SphereGeometry(0.125, 16, 12)), 0xff5470, [0, 0.36, 0.41], {
        emissive: 0xd92649,
        roughness: 0.18,
      });
      smoothTorus(g, 0x7ef2b8, [0.18, 0.18, 0.25], [0, 0.36, 0.42], 0.3);

      // Swept lateral sniper wings + thruster pods
      for (const side of [-1, 1]) {
        const arm = part(g, 'box', 0x386962, [0.46, 0.07, 0.2], [side * 0.42, 0.34, -0.08]);
        arm.rotation.y = -side * 0.38;
        arm.rotation.z = side * 0.2;
        const pod = smoothCyl(g, 0x263f3c, [0.09, 0.34, 0.09], [side * 0.6, 0.31, -0.18], 0.5);
        pod.rotation.x = Math.PI / 2;
        mesh(g, track(new THREE.SphereGeometry(0.065, 10, 8)), 0x3ef0c6, [side * 0.6, 0.31, -0.36], {
          emissive: 0x1aa88a,
          roughness: 0.25,
        });
      }

      // Dorsal stabilizer fin & hover emitter beneath
      const fin = part(g, 'box', 0x263f3c, [0.07, 0.28, 0.26], [0, 0.62, -0.22]);
      fin.rotation.x = -0.35;
      const hover = part(g, 'cone', 0x263f3c, [0.16, 0.18, 0.16], [0, 0.16, -0.04]);
      hover.rotation.x = Math.PI;
      mesh(g, track(new THREE.SphereGeometry(0.08, 10, 8)), 0x3ef0c6, [0, 0.06, -0.04], {
        emissive: 0x1aa88a,
        roughness: 0.25,
      });
      return g;
    }

    case 'boss-harvester': {
      // Twin-ringed Dreadnought flagship with 3 flanking thruster pods & glowing core.
      smoothCyl(g, 0x2a4f4a, [1.55, 0.18, 1.55], [0, 0, 0], 0.55);
      part(g, 'sphere', 0x56968c, [1.22, 0.28, 1.22], [0, 0.14, 0]);
      part(g, 'sphere', 0x8ad6c7, [0.68, 0.42, 0.68], [0, 0.34, 0]);
      mesh(g, track(new THREE.OctahedronGeometry(0.32, 0)), 0xb6ffdb, [0, 0.82, 0], {
        flat: true,
        emissive: 0x45d69a,
        roughness: 0.2,
      });
      mesh(g, track(new THREE.SphereGeometry(0.45, 16, 12)), 0x7ff5b5, [0, -0.14, 0], {
        emissive: 0x3dd98f,
        roughness: 0.25,
      });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const px = Math.cos(a) * 1.48;
        const pz = Math.sin(a) * 1.48;
        smoothCyl(g, 0x386962, [0.28, 0.24, 0.28], [px, 0.02, pz], 0.5);
        mesh(g, track(new THREE.SphereGeometry(0.14, 12, 8)), 0xffdc76, [px, 0.16, pz], {
          emissive: 0xe6a82e,
          roughness: 0.3,
        });
      }
      return g;
    }

    case 'boss-strider': {
      // Three-legged alien war walker with glowing visor dome and mortar belly.
      const body = new THREE.Group();
      body.position.y = 1.45;
      g.add(body);
      part(body, 'sphere', 0x3b5c58, [0.85, 0.52, 0.85], [0, 0.15, 0]);
      smoothTorus(body, 0x263f3c, [0.88, 0.88, 0.6], [0, 0.04, 0], 0.6).rotation.x = Math.PI / 2;
      mesh(body, track(new THREE.SphereGeometry(0.32, 16, 12)), 0xff7a59, [0, 0.22, 0.65], {
        emissive: 0xd94826,
        roughness: 0.22,
      });
      smoothCyl(body, 0x263f3c, [0.24, 0.36, 0.24], [0, -0.35, 0], 0.55);
      mesh(body, track(new THREE.SphereGeometry(0.2, 12, 10)), 0x3ef0c6, [0, -0.54, 0], {
        emissive: 0x1aa88a,
        roughness: 0.2,
      });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        const sx = Math.cos(a);
        const sz = Math.sin(a);
        const upper = part(g, 'box', 0x2f4d49, [0.18, 0.95, 0.18], [sx * 0.9, 1.15, sz * 0.9]);
        upper.rotation.z = sx * 0.42;
        upper.rotation.x = -sz * 0.42;
        const lower = part(g, 'box', 0x4b756f, [0.14, 0.98, 0.14], [sx * 1.25, 0.48, sz * 1.25]);
        lower.rotation.z = -sx * 0.14;
        lower.rotation.x = sz * 0.14;
        part(g, 'box', 0xebb84c, [0.24, 0.08, 0.24], [sx * 1.32, 0.04, sz * 1.32]);
      }
      return g;
    }

    case 'boss-queen': {
      // Levitating crystalline alien core with orbiting armored shield plates.
      const coreGeo = track(new THREE.OctahedronGeometry(0.68, 0));
      mesh(g, coreGeo, 0xc77dff, [0, 1.35, 0], { flat: true, emissive: 0x7b2cbf, roughness: 0.22 });
      const crown = smoothTorus(g, 0x45d69a, [0.95, 0.95, 0.55], [0, 1.35, 0], 0.35);
      crown.rotation.x = Math.PI / 2;
      const orbit = new THREE.Group();
      orbit.position.y = 1.35;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const plate = part(orbit, 'box', 0x355c57, [0.24, 0.72, 0.56], [Math.cos(a) * 1.28, 0, Math.sin(a) * 1.28]);
        plate.rotation.y = -a;
        part(plate, 'box', 0x7ef2b8, [0.06, 0.42, 0.28], [0.12, 0, 0]);
      }
      g.add(orbit);
      g.userData.orbit = orbit;
      return g;
    }
  }
}

const UDDER_MODEL_SET = new Set<string>([
  'plasma-orb',
  'splitter',
  'sniper',
  'boss-harvester',
  'boss-strider',
  'boss-queen',
]);

export function buildUdderGalleryModel(studio: StudioBuilder, id: string): THREE.Group | undefined {
  if (id === 'bazooka-cow') {
    return buildBazookaCow(studio.kit, () => buildMiniature(studio, 'corn')).mesh;
  }
  if (UDDER_MODEL_SET.has(id)) {
    return buildUdderModel(studio, id as UdderModelId);
  }
  return undefined;
}

export const UDDER_GALLERY_GROUPS: Record<string, GalleryGroup> = {
  herd: { label: 'Herd & Gear', accent: '#3e613a' },
  visitors: { label: 'Visitors', accent: '#286160' },
  bosses: { label: 'Bosses', accent: '#944433' },
  pasture: { label: 'Maps & Seasons', accent: '#805729' },
};

function groupItems(group: string, entries: readonly [string, string][]): GalleryItem<string>[] {
  return entries.map(([id, name], idx) => ({ id, name, group, badge: String(idx + 1) }));
}

export const UDDER_GALLERY_ITEMS: GalleryItem<string>[] = [
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
