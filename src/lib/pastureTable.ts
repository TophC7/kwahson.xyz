import * as THREE from 'three';
import { PASTURE_HEMI_GROUND, PASTURE_HEMI_SKY, PASTURE_SUN_COLOR, type PartKind, type PastureKit } from './pastureKit';

/** Warm light over the table; sunZ picks which way shadows fall. */
export function addTableLights(scene: THREE.Object3D, sunZ: number): () => void {
  const sun = new THREE.DirectionalLight(PASTURE_SUN_COLOR, 2.4);
  sun.position.set(-9, 22, sunZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 2, far: 48, left: -12, right: 12, top: 12, bottom: -12 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  const fill = new THREE.DirectionalLight(0xd8e8d6, 0.55);
  fill.position.set(10, 12, -8);
  scene.add(new THREE.HemisphereLight(PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, 2.05), sun, fill);
  return () => sun.shadow.dispose();
}

export interface PastureTablePalette {
  earth?: number;
  rim?: number;
  turf?: number;
  checker?: number;
  post?: number;
  rail?: number;
  tuft?: number;
  flowerA?: number;
  flowerB?: number;
}

export function buildPastureTable(
  kit: PastureKit,
  group: THREE.Group,
  o: { cx: number; cz: number; spanX: number; spanZ: number; checker: boolean; palette?: PastureTablePalette },
): void {
  group.clear();
  const { cx, cz, spanX, spanZ, palette: pal = {} } = o;

  const addPart = (
    kind: PartKind,
    color: number,
    scale: [number, number, number],
    pos: [number, number, number],
    receiveShadow = false,
  ) => {
    const m = kit.part(group, kind, color, scale, pos);
    m.receiveShadow = receiveShadow;
    return m;
  };

  // Earthy diorama slab + grass/snow rim + soft checkered pasture tabletop
  addPart('box', pal.earth ?? 0x9b684a, [spanX + 0.5, 0.72, spanZ + 0.5], [cx, -0.5, cz]);
  addPart('box', pal.rim ?? 0x6f9650, [spanX + 0.64, 0.24, spanZ + 0.64], [cx, -0.06, cz], true);
  addPart('box', pal.turf ?? 0x8dbd62, [spanX + 0.24, 0.08, spanZ + 0.24], [cx, 0.04, cz], true);

  if (o.checker) {
    // Subtle pasture checkerboard patches
    const patchSize = 1.65;
    const cols = Math.floor(spanX / patchSize);
    const rows = Math.floor(spanZ / patchSize);
    const startX = cx - ((cols - 1) * patchSize) / 2;
    const startZ = cz - ((rows - 1) * patchSize) / 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) {
          addPart(
            'box',
            pal.checker ?? 0x85b45c,
            [patchSize - 0.04, 0.012, patchSize - 0.04],
            [startX + i * patchSize, 0.082, startZ + j * patchSize],
            true,
          );
        }
      }
    }
  }

  // Perimeter wooden pasture fence
  const hx = spanX / 2 + 0.16;
  const hz = spanZ / 2 + 0.16;
  const postStep = 2.0;
  const xPosts = Math.max(4, Math.round(spanX / postStep));
  const zPosts = Math.max(4, Math.round(spanZ / postStep));

  const postColor = pal.post ?? 0xf3e6bd;
  const postCap = pal.rail ?? 0xfff1cf;
  for (let i = 0; i <= xPosts; i++) {
    const px = cx - hx + (i / xPosts) * (hx * 2);
    for (const pz of [cz - hz, cz + hz]) {
      addPart('box', postColor, [0.11, 0.44, 0.11], [px, 0.24, pz]);
      addPart('sphere', postCap, [0.09, 0.065, 0.09], [px, 0.48, pz]);
    }
  }
  for (let j = 1; j < zPosts; j++) {
    const pz = cz - hz + (j / zPosts) * (hz * 2);
    for (const px of [cx - hx, cx + hx]) {
      addPart('box', postColor, [0.11, 0.44, 0.11], [px, 0.24, pz]);
      addPart('sphere', postCap, [0.09, 0.065, 0.09], [px, 0.48, pz]);
    }
  }

  // Fence rails
  const railColor = pal.rail ?? 0xe0cf9e;
  for (const pz of [cz - hz, cz + hz]) {
    addPart('box', railColor, [hx * 2, 0.07, 0.07], [cx, 0.29, pz]);
  }
  for (const px of [cx - hx, cx + hx]) {
    addPart('box', railColor, [0.07, 0.07, hz * 2], [px, 0.29, cz]);
  }

  // Quiet little grass tufts & wildflowers tucked along the fence perimeter
  for (let i = 0; i < 28; i++) {
    const side = i % 4;
    const t = ((i * 37) % 100) / 100 - 0.5;
    let x = cx;
    let z = cz;
    if (side === 0) {
      x = cx + t * (spanX - 0.8);
      z = cz - hz + 0.34;
    } else if (side === 1) {
      x = cx + t * (spanX - 0.8);
      z = cz + hz - 0.34;
    } else if (side === 2) {
      x = cx - hx + 0.34;
      z = cz + t * (spanZ - 0.8);
    } else {
      x = cx + hx - 0.34;
      z = cz + t * (spanZ - 0.8);
    }

    if (i % 3 === 0) {
      addPart('sphere', i % 2 ? (pal.flowerA ?? 0xffe4a0) : (pal.flowerB ?? 0xf7f4d9), [0.06, 0.045, 0.06], [x, 0.13, z]);
    } else {
      const tuft = addPart('cone', pal.tuft ?? 0x6f9b4d, [0.055, 0.16, 0.055], [x, 0.15, z]);
      tuft.rotation.z = 0.2;
    }
  }
}
