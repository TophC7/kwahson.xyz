import * as THREE from 'three';
import type { GalleryGroup, GalleryItem } from '../../components/AssetGallery.svelte';
import { createStudioStage, frameModel, type ModelCache } from '../../lib/miniatures';
import type { PastureKit } from '../../lib/pastureKit';
import { CROPS, cropByTier, type HarvestCropId } from './crops';

export const HARVEST_GALLERY_GROUPS: Record<string, GalleryGroup> = {
  droppable: { label: 'Drop Pool (Tiers 1-6)', accent: '#3e613a' },
  merged: { label: 'Merged Crops (Tiers 7-12)', accent: '#944433' },
  tools: { label: 'Tools', accent: '#805729' },
};

export const HARVEST_GALLERY_ITEMS: GalleryItem[] = [
  ...CROPS.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.droppable ? 'droppable' : 'merged',
    badge: `T${c.tier}`,
  })),
  { id: 'pineapple', name: 'Pineapple Bomb', group: 'tools', badge: 'Tool' },
];

export const HARVEST_GALLERY_TAGS: Record<string, string> = {
  pea: 'Drop',
  blueberry: 'Drop',
  strawberry: 'Drop',
  lemon: 'Drop',
  garlic: 'Drop',
  turnip: 'Drop',
  carrot: 'Polygon',
  corn: 'Polygon',
  pumpkin: 'Max Tier',
  pineapple: 'Rare Bomb',
};

interface CropVisualBounds {
  /** Body bounding range in the raw miniature [minY, maxY, widthXZ]. */
  bodyMinY: number;
  bodyMaxY: number;
  bodyWidth: number;
  /** Slight 3/4 yaw so stems/leaves/ribs catch key light cleanly from the front camera. */
  yaw: number;
}

const CROP_VISUAL_BOUNDS: Record<HarvestCropId, CropVisualBounds> = {
  pea: { bodyMinY: 0, bodyMaxY: 0.9, bodyWidth: 0.9, yaw: 0.45 },
  blueberry: { bodyMinY: 0.04, bodyMaxY: 0.84, bodyWidth: 0.96, yaw: 0.35 },
  strawberry: { bodyMinY: 0, bodyMaxY: 0.95, bodyWidth: 0.88, yaw: 0.25 },
  lemon: { bodyMinY: 0.04, bodyMaxY: 0.91, bodyWidth: 0.76, yaw: 0.28 },
  garlic: { bodyMinY: 0.02, bodyMaxY: 0.78, bodyWidth: 0.88, yaw: 0.3 },
  turnip: { bodyMinY: 0, bodyMaxY: 0.94, bodyWidth: 0.97, yaw: 0.28 },
  apple: { bodyMinY: 0.02, bodyMaxY: 0.9, bodyWidth: 0.96, yaw: 0.32 },
  carrot: { bodyMinY: 0, bodyMaxY: 1.26, bodyWidth: 0.49, yaw: 0.35 },
  corn: { bodyMinY: 0.04, bodyMaxY: 1.15, bodyWidth: 0.64, yaw: 0.4 },
  cauliflower: { bodyMinY: 0.0, bodyMaxY: 0.87, bodyWidth: 0.9, yaw: 0.25 },
  watermelon: { bodyMinY: 0.02, bodyMaxY: 0.94, bodyWidth: 1.06, yaw: 0.3 },
  pumpkin: { bodyMinY: 0, bodyMaxY: 0.72, bodyWidth: 1.06, yaw: 0.22 },
};

export function createCropMeshFactory(modelFor: ModelCache): (tier: number) => THREE.Group {
  const templates = new Map<number, THREE.Group>();

  function buildTemplate(tier: number): THREE.Group {
    const def = cropByTier(tier);
    const spec = CROP_VISUAL_BOUNDS[def.id];
    const raw = modelFor(def.id);
    // Reset miniature showcase tilts (e.g. corn/carrot) so upright +Y matches Box2D polygon orientation
    raw.rotation.set(0, spec.yaw, 0);

    const sx = (def.halfW * 2) / spec.bodyWidth;
    const sy = (def.maxY - def.minY) / (spec.bodyMaxY - spec.bodyMinY);
    const bodyCenterY = (spec.bodyMinY + spec.bodyMaxY) * 0.5;
    const colCenterY = (def.minY + def.maxY) * 0.5;

    raw.scale.set(sx, sy, sx);
    raw.position.set(0, colCenterY - bodyCenterY * sy, 0);

    raw.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const rig = new THREE.Group();
    rig.add(raw);
    return rig;
  }

  return (tier: number) => {
    let tpl = templates.get(tier);
    if (!tpl) {
      tpl = buildTemplate(tier);
      templates.set(tier, tpl);
    }
    return tpl.clone();
  };
}

export function buildHarvestCrate(
  kit: PastureKit,
  parent: THREE.Group,
  halfW: number,
  height: number,
  dangerY: number,
): { dangerMat: THREE.MeshStandardMaterial; dispose(): void } {
  const crateGroup = new THREE.Group();
  parent.add(crateGroup);

  const customMats: THREE.Material[] = [];
  const customGeos: THREE.BufferGeometry[] = [];

  // Warm, cohesive orchard-crate palette (no high-contrast zebra stripes behind crops)
  const woodTrim = 0xd9a162;
  const woodMain = 0xb57b46;
  const woodDeep = 0x87562f;
  const backRecess = 0x3b2d22;
  const backPlankA = 0x4b392b;
  const backPlankB = 0x453427;
  const ironMetal = 0x525d58;
  const turfTop = 0x7cb054;
  const turfEdge = 0x618c41;
  const earthBase = 0x6e4b35;

  const innerDepth = 2.6;
  const halfD = innerDepth * 0.5;
  const wallThick = 0.34;
  const outerW = halfW * 2 + wallThick * 2;

  // 1. Meadow pasture pedestal sitting cleanly beneath the crate (strictly non-overlapping Y layers)
  const turfH = 0.24;
  const earthH = 0.34;
  const turf = kit.part(
    crateGroup,
    'box',
    turfTop,
    [outerW + 2.4, turfH, innerDepth + 1.8],
    [0, -0.44 - turfH * 0.5, 0],
  );
  turf.receiveShadow = true;
  kit.part(
    crateGroup,
    'box',
    turfEdge,
    [outerW + 2.52, 0.08, innerDepth + 1.92],
    [0, -0.44, 0],
  );
  kit.part(
    crateGroup,
    'box',
    earthBase,
    [outerW + 2.2, earthH, innerDepth + 1.6],
    [0, -0.44 - turfH - earthH * 0.5, 0],
  );

  // Tiny grass tufts & meadow blooms flanking the outer crate base
  for (const side of [-1, 1]) {
    const gx = side * (halfW + wallThick + 0.65);
    const tuftA = kit.part(crateGroup, 'cone', 0x649644, [0.11, 0.28, 0.11], [gx, -0.26, 0.45]);
    tuftA.rotation.z = side * -0.18;
    const tuftB = kit.part(crateGroup, 'cone', 0x76ab52, [0.09, 0.22, 0.09], [gx + side * 0.16, -0.29, 0.2]);
    tuftB.rotation.z = side * 0.14;
    kit.part(crateGroup, 'sphere', 0xffe48a, [0.07, 0.05, 0.07], [gx - side * 0.18, -0.36, 0.65]);
  }

  // Short sturdy crate skids resting on the grass
  for (const sx of [-halfW + 0.45, halfW - 0.45]) {
    kit.part(crateGroup, 'box', woodDeep, [0.55, 0.14, innerDepth + 0.24], [sx, -0.33, 0]);
  }

  // 2. Crate floor (top surface flush at y = 0, front trim flush)
  const floorH = 0.26;
  const floor = kit.part(crateGroup, 'box', woodMain, [outerW, floorH, innerDepth + 0.2], [0, -floorH * 0.5, 0]);
  floor.receiveShadow = true;
  // Clean front bevel lip along floor edge
  kit.part(crateGroup, 'box', woodTrim, [outerW + 0.08, 0.16, 0.14], [0, -0.1, halfD + 0.13]);

  // 3. Recessed warm timber back wall (subtle vertical tongue-and-groove planks)
  const backZ = -halfD - 0.12;
  const backPanel = kit.part(
    crateGroup,
    'box',
    backRecess,
    [outerW, height + 0.16, 0.14],
    [0, height * 0.5 - 0.06, backZ - 0.08],
  );
  backPanel.receiveShadow = true;

  const plankCount = 7;
  const plankGap = 0.04;
  const plankW = (halfW * 2 - plankGap * (plankCount + 1)) / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const px = -halfW + plankGap * (i + 1) + plankW * (i + 0.5);
    const plank = kit.part(
      crateGroup,
      'box',
      i % 2 === 0 ? backPlankA : backPlankB,
      [plankW, height - 0.08, 0.08],
      [px, height * 0.5 - 0.04, backZ + 0.02],
    );
    plank.receiveShadow = true;
  }

  // Horizontal back brace bars (top & mid) behind the plank faces
  kit.part(crateGroup, 'box', woodDeep, [outerW + 0.06, 0.24, 0.1], [0, height - 0.2, backZ - 0.18]);
  kit.part(crateGroup, 'box', woodDeep, [outerW + 0.06, 0.24, 0.1], [0, 1.2, backZ - 0.18]);

  // 4. Clean side walls (inner faces strictly at +/- halfW, zero overlapping posts)
  const sideH = height + 0.18;
  for (const side of [-1, 1]) {
    const wx = side * (halfW + wallThick * 0.5);
    const wall = kit.part(crateGroup, 'box', woodMain, [wallThick, sideH, innerDepth + 0.16], [wx, sideH * 0.5, 0]);
    wall.castShadow = true;
    wall.receiveShadow = true;

    // Front vertical trim molding & top rounded cap
    kit.part(
      crateGroup,
      'box',
      woodTrim,
      [wallThick + 0.06, sideH + 0.04, 0.14],
      [wx, sideH * 0.5, halfD + 0.12],
    );
    kit.part(
      crateGroup,
      'box',
      woodTrim,
      [wallThick + 0.12, 0.18, innerDepth + 0.34],
      [wx, sideH + 0.08, 0.02],
    );

    // Dark iron corner brackets + rivet accents (top & bottom front corners)
    for (const by of [0.22, height - 0.35]) {
      kit.part(
        crateGroup,
        'box',
        ironMetal,
        [wallThick + 0.1, 0.34, 0.16],
        [wx, by, halfD + 0.14],
      );
      kit.part(
        crateGroup,
        'sphere',
        0x92a199,
        [0.04, 0.04, 0.03],
        [wx, by, halfD + 0.22],
      );
    }

    // Small inner wall marker pegs at dangerY
    kit.part(
      crateGroup,
      'box',
      0xc95240,
      [0.08, 0.12, 0.26],
      [side * (halfW - 0.01), dangerY, halfD - 0.06],
    );
  }

  // 5. Subtle glass front window pane & top rim highlight (keeps front crisp without obscuring crops)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xdcf0eb,
    transparent: true,
    opacity: 0.065,
    roughness: 0.15,
    depthWrite: false,
  });
  const glassGeo = new THREE.PlaneGeometry(halfW * 2, height - 0.15);
  const glassPane = new THREE.Mesh(glassGeo, glassMat);
  glassPane.position.set(0, height * 0.5 - 0.04, halfD + 0.06);
  crateGroup.add(glassPane);
  customMats.push(glassMat);
  customGeos.push(glassGeo);

  // Subtle translucent mint/cream top edge highlight on the glass
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0xe6f7f2,
    transparent: true,
    opacity: 0.22,
  });
  kit.part(
    crateGroup,
    'box',
    0xe6f7f2,
    [halfW * 2, 0.045, 0.04],
    [0, height - 0.11, halfD + 0.06],
    rimMat,
  );
  customMats.push(rimMat);

  // 6. Danger line across the crate (clean glowing cord between the two wall pegs)
  const dangerMat = new THREE.MeshStandardMaterial({
    color: 0xe86b58,
    emissive: new THREE.Color(0xc93b2b),
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.48,
    roughness: 0.4,
  });
  const dangerBar = kit.part(
    crateGroup,
    'cylinder',
    0xe86b58,
    [0.028, halfW * 2, 0.028],
    [0, dangerY, halfD - 0.06],
    dangerMat,
  );
  dangerBar.rotation.z = Math.PI / 2;
  customMats.push(dangerMat);

  return {
    dangerMat,
    dispose() {
      for (const m of customMats) m.dispose();
      for (const g of customGeos) g.dispose();
    },
  };
}

/** Bakes crisp 128x128 transparent PNG snapshots of all 12 actual 3D crops for the HUD. */
export function bakeCropIcons(
  renderer: THREE.WebGLRenderer,
  modelFor: ModelCache,
): Record<number, string> {
  const iconSize = 128;
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);
  const prevDpr = renderer.getPixelRatio();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);
  const prevClearAlpha = renderer.getClearAlpha();

  const stage = createStudioStage();
  stage.camera.zoom = 1.24;
  stage.camera.updateProjectionMatrix();

  renderer.setPixelRatio(1);
  renderer.setSize(iconSize, iconSize, false);
  renderer.setClearColor(0x000000, 0);

  const icons: Record<number, string> = {};
  for (const crop of CROPS) {
    const model = modelFor(crop.id);
    const holder = frameModel(model);
    stage.scene.add(holder);
    renderer.clear();
    renderer.render(stage.scene, stage.camera);
    stage.scene.remove(holder);
    icons[crop.tier] = renderer.domElement.toDataURL('image/png');
  }

  renderer.setPixelRatio(prevDpr);
  renderer.setSize(prevSize.x, prevSize.y, false);
  renderer.setClearColor(prevClearColor, prevClearAlpha);

  return icons;
}
