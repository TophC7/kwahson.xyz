import * as THREE from 'three';
import { buildBazookaCow } from './bazookaCow';
import {
  PASTURE_HEMI_GROUND,
  PASTURE_HEMI_SKY,
  PASTURE_SUN_COLOR,
  type PastureKit,
} from './pastureKit';

type SmoothPrim = (
  parent: THREE.Object3D,
  color: number,
  scale: [number, number, number],
  pos?: [number, number, number],
  roughness?: number,
) => THREE.Mesh;

/**
 * Studio helper passed into model builders so organic/sculpted models can use
 * smooth-shaded high-segment geometries, LatheGeometry, and ExtrudeGeometry,
 * while automatically disposing all temporary studio resources after baking.
 */
export interface StudioBuilder {
  kit: PastureKit;
  /** Chunky flat-shaded Pasture Patrol primitive (for voxel/blocky assets). */
  part: PastureKit['part'];
  /** Mesh from any geometry; flat-shaded by default. */
  mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: number,
    pos?: [number, number, number],
    opts?: { roughness?: number; flat?: boolean; opacity?: number; emissive?: number },
  ): THREE.Mesh;
  /** Shared smooth high-segment primitives for non-lumpy organic forms. */
  smoothCyl: SmoothPrim;
  smoothTorus: SmoothPrim;
  track<T extends THREE.BufferGeometry>(geo: T): T;
  dispose(): void;
}

export function createStudioBuilder(kit: PastureKit): StudioBuilder {
  const trackedGeos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();

  const sharedSmooth = {
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
    torus: new THREE.TorusGeometry(1, 0.2, 14, 32),
  };
  trackedGeos.push(sharedSmooth.cyl, sharedSmooth.torus);

  function getMat(color: number, roughness: number, flat: boolean, opacity: number, emissive: number) {
    const key = `${color}:${roughness}:${flat ? 1 : 0}:${opacity}:${emissive}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness,
        flatShading: flat,
        transparent: opacity < 1,
        opacity,
        emissive: emissive ? new THREE.Color(emissive) : undefined,
        emissiveIntensity: emissive ? 0.85 : 0,
      });
      mats.set(key, m);
    }
    return m;
  }

  function track<T extends THREE.BufferGeometry>(geo: T): T {
    trackedGeos.push(geo);
    return geo;
  }

  function mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: number,
    pos: [number, number, number] = [0, 0, 0],
    opts: { roughness?: number; flat?: boolean; opacity?: number; emissive?: number } = {},
  ): THREE.Mesh {
    const m = new THREE.Mesh(
      geo,
      getMat(
        color,
        opts.roughness ?? 0.62,
        opts.flat ?? true,
        opts.opacity ?? 1,
        opts.emissive ?? 0,
      ),
    );
    m.position.set(...pos);
    parent.add(m);
    return m;
  }

  function smoothPrim(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: number,
    scale: [number, number, number],
    pos: [number, number, number] = [0, 0, 0],
    roughness = 0.6,
  ) {
    const m = mesh(parent, geo, color, pos, { flat: false, roughness });
    m.scale.set(...scale);
    return m;
  }

  return {
    kit,
    part: kit.part,
    mesh,
    smoothCyl: (p, c, s, pos, r) => smoothPrim(p, sharedSmooth.cyl, c, s, pos, r),
    smoothTorus: (p, c, s, pos, r) => smoothPrim(p, sharedSmooth.torus, c, s, pos, r),
    track,
    dispose() {
      for (const g of trackedGeos) g.dispose();
      for (const m of mats.values()) m.dispose();
      trackedGeos.length = 0;
      mats.clear();
    },
  };
}

/** Lit orthographic studio for baking and spinning single models. */
export function createStudioStage(): { scene: THREE.Scene; camera: THREE.OrthographicCamera } {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, 2.35));
  const keyLight = new THREE.DirectionalLight(PASTURE_SUN_COLOR, 2.85);
  keyLight.position.set(-4.5, 10, 7.5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xd9ebd9, 0.8);
  rimLight.position.set(6, 4.5, -5);
  scene.add(rimLight);

  // Generous orthographic frustum so rotated 3D corners never clip
  const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 30);
  camera.position.set(3.8, 3.25, 4.9);
  camera.lookAt(0, 0, 0);
  return { scene, camera };
}

/**
 * Wraps a miniature in a holder, centred and scaled by its bounding sphere so it
 * fits the studio frustum from any angle (spinning the holder never clips).
 */
export function frameModel(model: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const preScale = 1.05 / Math.max(sphere.radius, 0.001);
  model.scale.multiplyScalar(preScale);
  model.position.copy(sphere.center).multiplyScalar(-preScale);
  return holder;
}

export type ModelCache = (id: MiniatureId) => THREE.Group;

/** Lazy template cache returning fresh cloned instances backed by shared studio geometry/materials. */
export function createModelCache(studio: StudioBuilder): ModelCache {
  const templates = new Map<MiniatureId, THREE.Group>();
  return (id) => {
    let tpl = templates.get(id);
    if (!tpl) {
      tpl = buildMiniature(studio, id);
      templates.set(id, tpl);
    }
    return tpl.clone();
  };
}

export interface FittedModel {
  model: THREE.Group;
  scale: number;
  height: number;
}

/** Center in XZ, ground at y = 0, and uniformly scale to fit width (and optional maxHeight). */
export function fitModel(child: THREE.Object3D, width: number, maxHeight = Infinity): FittedModel {
  child.rotation.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(child);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(width / Math.max(0.001, size.x, size.z), maxHeight / Math.max(0.001, size.y));
  child.position.sub(new THREE.Vector3((box.max.x + box.min.x) / 2, box.min.y, (box.max.z + box.min.z) / 2));
  const model = new THREE.Group();
  model.add(child);
  model.scale.setScalar(scale);
  return { model, scale, height: size.y * scale };
}

// ---------------------------------------------------------------------------
// Reusable sculptural 2D shapes for crisp leaves, petals, stars, crescent
// ---------------------------------------------------------------------------

function makePointedLeafGeo(
  studio: StudioBuilder,
  length: number,
  width: number,
  depth = 0.03,
  curve = 0,
): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width, length * 0.25, width * 0.8 + curve, length * 0.72, curve, length);
  s.bezierCurveTo(-width * 0.8 + curve, length * 0.72, -width, length * 0.25, 0, 0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.35,
    bevelSize: depth * 0.35,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -depth / 2);
  return studio.track(geo);
}

function makeMapleLeafGeo(studio: StudioBuilder, scale = 0.42): THREE.ExtrudeGeometry {
  const pts: [number, number][] = [
    [0.0, -0.55],
    [0.14, -0.34],
    [0.54, -0.4],
    [0.44, -0.14],
    [0.86, 0.05],
    [0.62, 0.2],
    [0.72, 0.42],
    [0.36, 0.34],
    [0.3, 0.76],
    [0.14, 0.62],
    [0.0, 1.0],
    [-0.14, 0.62],
    [-0.3, 0.76],
    [-0.36, 0.34],
    [-0.72, 0.42],
    [-0.62, 0.2],
    [-0.86, 0.05],
    [-0.44, -0.14],
    [-0.54, -0.4],
    [-0.14, -0.34],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
  for (let i = 1; i < pts.length; i++) {
    s.lineTo(pts[i][0] * scale, pts[i][1] * scale);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.018);
  return studio.track(geo);
}

function makeLowPolyPetalGeo(
  studio: StudioBuilder,
  length: number,
  width: number,
  depth = 0.04,
): THREE.ExtrudeGeometry {
  // Crisp angular low-poly kite/diamond petal with sharp unrounded edges
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(width, length * 0.42);
  s.lineTo(0, length);
  s.lineTo(-width, length * 0.42);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -depth / 2);
  return studio.track(geo);
}

type SproutColor = 'red' | 'yellow' | 'blue';

/** One blocky mini visitor; its colour picks the sprout on its head (red bud, yellow leaf, blue flower). */
function buildSprout({ part }: StudioBuilder, kind: SproutColor): THREE.Group {
  const p = new THREE.Group();
  const color = kind === 'blue' ? 0x3b80d9 : kind === 'yellow' ? 0xf2d144 : 0xe0483d;
  part(p, 'box', color, [0.16, 0.16, 0.13], [0, 0.16, 0]);
  part(p, 'box', color, [0.3, 0.22, 0.24], [0, 0.35, 0]);
  part(p, 'box', 0x4ca644, [0.03, 0.18, 0.03], [0, 0.55, 0]);
  for (const side of [-1, 1]) {
    part(p, 'box', color, [0.05, 0.08, 0.06], [side * 0.045, 0.04, 0]);
    part(p, 'box', color, [0.04, 0.1, 0.05], [side * 0.1, 0.17, 0.01]);
    part(p, 'sphere', 0x111613, [0.06, 0.03, 0.012], [side * 0.075, 0.36, 0.12]).rotation.z = side * 0.3;
  }
  if (kind === 'red') {
    part(p, 'box', 0x4ca644, [0.1, 0.05, 0.1], [0, 0.66, 0]);
    part(p, 'box', 0x9cd994, [0.1, 0.12, 0.1], [0, 0.74, 0]);
  } else if (kind === 'yellow') {
    part(p, 'box', 0x76bf54, [0.2, 0.04, 0.1], [0.08, 0.67, 0]).rotation.z = 0.4;
    part(p, 'box', 0x76bf54, [0.08, 0.035, 0.06], [0.2, 0.74, 0]).rotation.z = 0.7;
  } else {
    part(p, 'box', 0xf6c93b, [0.07, 0.07, 0.05], [0, 0.69, 0.02]);
    for (const [px, py] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      part(p, 'box', 0x8fb8f5, [0.08, 0.08, 0.03], [px * 0.075, 0.69 + py * 0.075, 0]);
    }
  }
  return p;
}

/**
 * Builds a crisp, sharp-edged flat-extruded 3D NovaMark emblem (flat image with
 * width + faceted center sphere), parameterized so it powers Star (`comet`),
 * Moon's companion star, and Summer's sun variation.
 */
function makeNovaLogoGroup(
  studio: StudioBuilder,
  opts: {
    coreRadius: number;
    ringInner: number;
    ringOuter: number;
    ringSegments?: number;
    depth: number;
    primaryCount: number;
    primaryBaseHalf: number;
    primaryTip: number;
    secondaryBaseHalf: number;
    secondaryTip: number;
    coreColor: number;
    ringColor: number;
    primaryColor: number;
    secondaryColor: number;
  },
): THREE.Group {
  const g = new THREE.Group();
  const { mesh, track } = studio;

  // Low-poly center sphere
  const coreGeo = track(new THREE.SphereGeometry(opts.coreRadius, 12, 8));
  mesh(g, coreGeo, opts.coreColor, [0, 0, 0], { roughness: 0.85 });

  // Flat-extruded annular ring (zero bevels, crisp polygonal sides)
  const segs = opts.ringSegments ?? 16;
  const ringShape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * opts.ringOuter;
    const y = Math.sin(a) * opts.ringOuter;
    if (i === 0) ringShape.moveTo(x, y);
    else ringShape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= segs; i++) {
    const a = -(i / segs) * Math.PI * 2;
    const x = Math.cos(a) * opts.ringInner;
    const y = Math.sin(a) * opts.ringInner;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  ringShape.holes.push(hole);
  const ringGeo = track(
    new THREE.ExtrudeGeometry(ringShape, {
      depth: opts.depth,
      bevelEnabled: false,
    }),
  );
  ringGeo.translate(0, 0, -opts.depth / 2);
  mesh(g, ringGeo, opts.ringColor, [0, 0, 0], { roughness: 0.85 });

  const makeRayGeo = (baseHalf: number, tipDist: number) => {
    const startDist = (opts.ringInner + opts.ringOuter) * 0.5;
    const s = new THREE.Shape();
    s.moveTo(-baseHalf, startDist);
    s.lineTo(0, tipDist);
    s.lineTo(baseHalf, startDist);
    s.closePath();
    // Rays sit a touch thinner than the ring so their bases tuck inside it instead of z-fighting
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: opts.depth * 0.8,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -opts.depth * 0.4);
    return track(geo);
  };

  const primaryRayGeo = makeRayGeo(opts.primaryBaseHalf, opts.primaryTip);
  const secondaryRayGeo = makeRayGeo(opts.secondaryBaseHalf, opts.secondaryTip);
  const step = (Math.PI * 2) / opts.primaryCount;

  for (let i = 0; i < opts.primaryCount; i++) {
    const pRay = mesh(g, primaryRayGeo, opts.primaryColor, [0, 0, 0], { roughness: 0.85 });
    pRay.rotation.z = i * step;

    const sRay = mesh(g, secondaryRayGeo, opts.secondaryColor, [0, 0, 0], { roughness: 0.85 });
    sRay.rotation.z = i * step + step / 2;
  }

  return g;
}

function makeCrescentGeo(studio: StudioBuilder): THREE.ExtrudeGeometry {
  // Crisp flat-extruded low-poly crescent (zero bevels, visible geometric facets!)
  const R = 0.58;
  const r = 0.48;
  const d = 0.25;

  const ix = (R * R - r * r + d * d) / (2 * d);
  const iy = Math.sqrt(Math.max(0.0001, R * R - ix * ix));
  const outerTop = Math.atan2(iy, ix);
  const outerBot = -outerTop;
  const innerTop = Math.atan2(iy, ix - d);
  const innerBot = -innerTop;

  const s = new THREE.Shape();
  s.absarc(0, 0, R, outerTop, outerBot + Math.PI * 2, false);
  s.absarc(d, 0, r, innerBot, innerTop, true);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: false,
    curveSegments: 7,
  });
  geo.translate(0, 0, -0.08);
  return studio.track(geo);
}

function addPumpkinLobes(studio: StudioBuilder, parent: THREE.Object3D) {
  const lobeGeo = studio.track(new THREE.SphereGeometry(1, 7, 5));
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    const lobe = studio.mesh(
      parent,
      lobeGeo,
      i % 2 === 0 ? 0xe07628 : 0xc9631d,
      [Math.cos(a) * 0.23, 0.36, Math.sin(a) * 0.23],
      { roughness: 0.88 },
    );
    lobe.scale.set(0.3, 0.36, 0.25);
    lobe.rotation.y = -a;
  }
}

export type MiniatureId =
  | 'cow' | 'healer-cow' | 'bazooka-cow' | 'hay-bale' | 'rock' | 'stump' | 'crate' | 'ufo' | 'bee'
  | 'sheep' | 'pig' | 'chicken' | 'duck' | 'goat' | 'barn-cat' | 'barn' | 'tractor'
  | 'silo' | 'windmill' | 'well' | 'milk-churn' | 'corn' | 'pumpkin' | 'apple' | 'carrot'
  | 'honey-jar' | 'straw-hat' | 'watering-can' | 'egg' | 'scarecrow' | 'scout-pod' | 'alien' | 'sprout-red'
  | 'sprout-yellow' | 'sprout-blue' | 'brute' | 'lobber' | 'corn-wall' | 'sprouts'
  | 'plasma-orb' | 'splitter' | 'sniper' | 'boss-harvester' | 'boss-strider' | 'boss-queen'
  | 'moon' | 'lantern'
  | 'comet' | 'season-spring' | 'season-summer' | 'season-autumn' | 'season-winter' | 'bloom-hibiscus' | 'bloom-sunflower' | 'bloom-allium'
  | 'bloom-forget-me-not'
  | 'pea' | 'blueberry' | 'strawberry' | 'lemon' | 'garlic' | 'turnip' | 'pineapple' | 'cauliflower' | 'watermelon';

export function buildMiniature(studio: StudioBuilder, id: MiniatureId): THREE.Group {
  const { kit, part, mesh, smoothCyl, smoothTorus, track } = studio;

  function addRadialLeaves(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    opts: {
      count: number;
      y: number;
      z: number;
      tilt: number;
      offset?: number;
      color: number | ((i: number) => number);
      roughness?: number;
      flat?: boolean;
    },
  ) {
    const offset = opts.offset ?? 0;
    for (let i = 0; i < opts.count; i++) {
      const h = new THREE.Group();
      h.position.set(0, opts.y, 0);
      h.rotation.y = (i * Math.PI * 2) / opts.count + offset;
      const col = typeof opts.color === 'function' ? opts.color(i) : opts.color;
      const leaf = mesh(h, geo, col, [0, 0, opts.z], { roughness: opts.roughness, flat: opts.flat });
      leaf.rotation.x = opts.tilt;
      parent.add(h);
    }
  }

  switch (id) {
    // -------------------------------------------------------------------------
    // EXISTING PASTURE PATROL ASSETS (reused verbatim from PastureKit)
    // -------------------------------------------------------------------------
    case 'cow':
    case 'healer-cow': {
      const g = kit.makeCow({ special: id === 'healer-cow' }).mesh;
      g.rotation.y = 0.25;
      return g;
    }
    case 'bazooka-cow':
      return buildBazookaCow(kit, () => buildMiniature(studio, 'corn')).mesh;
    case 'hay-bale': {
      const g = kit.makeObstacle('hay').mesh;
      g.rotation.y = 0.35;
      return g;
    }
    case 'rock':
      return kit.makeObstacle('rock').mesh;
    case 'stump':
      return kit.makeObstacle('stump').mesh;
    case 'crate': {
      const g = kit.makeObstacle('crate').mesh;
      g.rotation.y = -0.15;
      return g;
    }
    case 'ufo': {
      const g = kit.makeUfo();
      g.rotation.z = -0.14;
      g.rotation.x = 0.1;
      return g;
    }

    // -------------------------------------------------------------------------
    // HERD (CHUNKY PASTURE CREATURES)
    // -------------------------------------------------------------------------
    case 'bee': {
      // Fully squared Minecraft-style low-poly Bee!
      const g = new THREE.Group();
      const yellow = 0xf2c63b;
      const stripe = 0x362c24;
      const rearBrown = 0x5c422c;
      const wingColor = 0xeaf4f7;

      // Plump squared rectangular bee body
      part(g, 'box', yellow, [0.56, 0.56, 0.78], [0, 0.44, 0]);
      // Crisp dark bee stripes wrapping around the body + warm brown rear section
      part(g, 'box', stripe, [0.575, 0.575, 0.11], [0, 0.44, 0.14]);
      part(g, 'box', stripe, [0.575, 0.575, 0.11], [0, 0.44, -0.08]);
      part(g, 'box', rearBrown, [0.565, 0.565, 0.2], [0, 0.44, -0.3]);
      // Small dark stinger poking straight out of the rear
      const stinger = part(g, 'cone', stripe, [0.06, 0.14, 0.06], [0, 0.44, -0.47]);
      stinger.rotation.x = -Math.PI / 2;

      // Clean dark dot eyes matching the rest of the Herd + forward squared antennae
      for (const side of [-1, 1]) {
        part(g, 'sphere', 0x222624, [0.054, 0.06, 0.032], [side * 0.17, 0.45, 0.396]);
        // Thin squared antennae sticking forward & tilted slightly upward from upper brow
        const antenna = part(g, 'box', stripe, [0.045, 0.045, 0.19], [side * 0.13, 0.655, 0.475]);
        antenna.rotation.x = -0.36;
      }

      // Flat rectangular squared wings perched on top & angled gently upward
      for (const side of [-1, 1]) {
        const wing = part(g, 'box', wingColor, [0.42, 0.04, 0.3], [side * 0.34, 0.78, 0.04]);
        wing.rotation.z = side * 0.26;
      }

      // 6 tiny squared dark-brown dangling bee legs underneath
      for (const side of [-1, 1]) {
        for (const z of [0.18, 0.0, -0.18]) {
          part(g, 'box', stripe, [0.06, 0.12, 0.06], [side * 0.16, 0.11, z]);
        }
      }

      g.rotation.x = -0.1;
      g.rotation.y = 0.28;
      return g;
    }

    case 'sheep': {
      // Matches Goat's clean blocky low-poly style with a classic Minecraft sheep face!
      const g = new THREE.Group();
      const wool = 0xfaf5e8;
      const woolShade = 0xeee6d3;
      const skin = 0xd9b89c;
      const hoof = 0x5c5145;

      // Chunky boxy wool fleece body (matches goat proportions + fluffy blocky wool coat)
      part(g, 'box', wool, [0.64, 0.48, 0.88], [0, 0.56, 0]);
      part(g, 'box', woolShade, [0.68, 0.36, 0.72], [0, 0.58, 0]);

      // 4 sturdy legs matching Goat (wool upper cuffs + tan legs + hooves)
      for (const x of [-0.2, 0.2]) {
        for (const z of [-0.28, 0.28]) {
          part(g, 'box', wool, [0.15, 0.14, 0.15], [x, 0.32, z]);
          part(g, 'box', skin, [0.12, 0.24, 0.12], [x, 0.17, z]);
          part(g, 'box', hoof, [0.13, 0.08, 0.13], [x, 0.06, z]);
        }
      }

      // Classic Minecraft sheep head: white wool hood framing a warm tan square face
      part(g, 'box', wool, [0.46, 0.44, 0.36], [0, 0.78, 0.48]);
      part(g, 'box', skin, [0.36, 0.32, 0.16], [0, 0.75, 0.62]);

      // Simple dark dot eyes matching Cow, Calf & Pig + small skin-toned snout
      for (const side of [-1, 1]) {
        part(g, 'sphere', 0x262926, [0.038, 0.044, 0.025], [side * 0.11, 0.81, 0.705]);
        // Small blocky side ears
        const ear = part(g, 'box', wool, [0.16, 0.08, 0.1], [side * 0.29, 0.86, 0.46]);
        ear.rotation.z = side > 0 ? -0.25 : 0.25;
      }

      // Small protruding skin-colored snout (replaces pink mouth)
      part(g, 'box', skin, [0.22, 0.13, 0.1], [0, 0.68, 0.72]);
      part(g, 'box', 0xc29e80, [0.14, 0.045, 0.025], [0, 0.71, 0.775]);

      // Small boxy wool tail
      part(g, 'box', wool, [0.16, 0.16, 0.12], [0, 0.64, -0.48]);

      g.rotation.y = 0.32;
      return g;
    }

    case 'pig': {
      const g = new THREE.Group();
      const pink = 0xf0a6b3;
      const deep = 0xd67e91;
      part(g, 'box', pink, [0.64, 0.48, 0.82], [0, 0.5, 0]);
      part(g, 'box', pink, [0.54, 0.44, 0.4], [0, 0.58, 0.48]);
      part(g, 'box', deep, [0.34, 0.22, 0.16], [0, 0.5, 0.73]);
      for (const x of [-0.07, 0.07]) {
        part(g, 'sphere', 0x7b3c4b, [0.032, 0.04, 0.025], [x, 0.51, 0.81]);
      }
      for (const x of [-0.16, 0.16]) {
        part(g, 'sphere', 0x262926, [0.038, 0.044, 0.025], [x, 0.67, 0.68]);
        const ear = part(g, 'box', deep, [0.16, 0.15, 0.09], [x * 1.65, 0.84, 0.45]);
        ear.rotation.z = x > 0 ? -0.35 : 0.35;
        ear.rotation.x = 0.35;
      }
      for (const x of [-0.21, 0.21]) {
        for (const z of [-0.26, 0.24]) {
          part(g, 'box', pink, [0.13, 0.24, 0.13], [x, 0.18, z]);
          part(g, 'box', 0x8d5260, [0.14, 0.08, 0.14], [x, 0.07, z]);
        }
      }
      const tail = mesh(g, track(new THREE.TorusGeometry(0.11, 0.0264, 8, 18)), deep, [0, 0.58, -0.45], { roughness: 0.85 });
      tail.rotation.y = Math.PI / 2;
      g.rotation.y = 0.28;
      return g;
    }

    case 'chicken': {
      // Boxy Crossy Road / Minecraft hen
      const g = new THREE.Group();
      const white = 0xfaf5ea;
      const shade = 0xebe3d1;
      const red = 0xd64a44;
      const beak = 0xebaa3e;

      // Rectangular body + folded side wings + stepped tail
      part(g, 'box', white, [0.54, 0.44, 0.68], [0, 0.48, -0.02]);
      for (const x of [-0.31, 0.31]) {
        part(g, 'box', shade, [0.09, 0.26, 0.44], [x, 0.49, -0.04]);
      }
      part(g, 'box', white, [0.34, 0.28, 0.18], [0, 0.64, -0.42]);
      part(g, 'box', shade, [0.22, 0.16, 0.12], [0, 0.78, -0.46]);

      // Tall boxy head + comb + blocky beak + wattle
      part(g, 'box', white, [0.38, 0.44, 0.36], [0, 0.84, 0.28]);
      // Stepped voxel red comb
      part(g, 'box', red, [0.1, 0.14, 0.26], [0, 1.12, 0.28]);
      part(g, 'box', red, [0.1, 0.08, 0.12], [0, 1.2, 0.33]);
      // Blocky beak & red wattle underneath
      part(g, 'box', beak, [0.18, 0.11, 0.2], [0, 0.84, 0.54]);
      part(g, 'box', red, [0.12, 0.13, 0.11], [0, 0.73, 0.5]);

      // Dark dot eyes on the head sides, matching the rest of the Herd
      for (const x of [-0.19, 0.19]) {
        part(g, 'sphere', 0x222624, [0.02, 0.05, 0.045], [x, 0.91, 0.36]);
      }

      // Blocky orange legs + feet
      for (const x of [-0.14, 0.14]) {
        part(g, 'box', beak, [0.08, 0.24, 0.08], [x, 0.16, 0.02]);
        part(g, 'box', beak, [0.15, 0.05, 0.22], [x, 0.03, 0.08]);
      }

      g.rotation.y = 0.36;
      return g;
    }

    case 'duck': {
      // Same boxy Crossy Road / Minecraft silhouette as Hen, clearly a Mallard Duck!
      const g = new THREE.Group();
      const body = 0xb89674;
      const wing = 0x8e7154;
      const headGreen = 0x3b7856;
      const collar = 0xfaf5ea;
      const bill = 0xe88632;

      // Rectangular duck body + tucked darker wings + short tail
      part(g, 'box', body, [0.54, 0.42, 0.7], [0, 0.46, -0.02]);
      part(g, 'box', 0xdccab2, [0.52, 0.16, 0.42], [0, 0.34, 0.14]);
      for (const x of [-0.31, 0.31]) {
        const shoulder = new THREE.Group();
        shoulder.name = x < 0 ? 'wing-left' : 'wing-right';
        shoulder.position.set(x, 0.60, -0.04);
        g.add(shoulder);
        part(shoulder, 'box', wing, [0.09, 0.24, 0.46], [0, -0.12, 0]);
        part(shoulder, 'box', 0x527a96, [0.1, 0.1, 0.2], [0, -0.15, -0.02]);
      }
      part(g, 'box', 0x454a46, [0.3, 0.18, 0.18], [0, 0.6, -0.42]);

      // Crisp white neck ring + boxy emerald mallard head
      part(g, 'box', collar, [0.37, 0.08, 0.35], [0, 0.67, 0.26]);
      part(g, 'box', headGreen, [0.38, 0.38, 0.38], [0, 0.89, 0.27]);

      // Wide flat orange duck bill (distinct from hen's narrow beak!)
      part(g, 'box', bill, [0.3, 0.1, 0.28], [0, 0.82, 0.58]);
      part(g, 'box', 0xd17226, [0.26, 0.04, 0.24], [0, 0.77, 0.56]);

      // Dark dot eyes on the head sides, matching the rest of the Herd
      for (const x of [-0.19, 0.19]) {
        part(g, 'sphere', 0x1c211e, [0.02, 0.05, 0.045], [x, 0.94, 0.36]);
      }

      // Orange legs + wide flat webbed feet
      for (const x of [-0.15, 0.15]) {
        part(g, 'box', bill, [0.08, 0.22, 0.08], [x, 0.15, 0.02]);
        part(g, 'box', bill, [0.22, 0.05, 0.26], [x, 0.03, 0.1]);
      }

      g.rotation.y = 0.36;
      return g;
    }

    case 'goat': {
      // Keep the great body/shape; refine face, muzzle, eyes, and goatee
      const g = new THREE.Group();
      const tan = 0xd8c3a2;
      const cream = 0xf2e6cf;
      const dark = 0x5c5145;
      part(g, 'box', tan, [0.54, 0.44, 0.86], [0, 0.54, 0]);
      for (const x of [-0.19, 0.19]) {
        for (const z of [-0.28, 0.28]) {
          part(g, 'box', tan, [0.12, 0.34, 0.12], [x, 0.22, z]);
          part(g, 'box', dark, [0.13, 0.09, 0.13], [x, 0.07, z]);
        }
      }
      // Clean head + tapered cream snout + neat goatee
      part(g, 'box', tan, [0.38, 0.36, 0.36], [0, 0.82, 0.46]);
      part(g, 'box', cream, [0.28, 0.22, 0.2], [0, 0.73, 0.68]);
      part(g, 'box', 0x6e5c50, [0.12, 0.07, 0.04], [0, 0.76, 0.79]);
      // Tidy chin beard tucked under the snout
      const beard = part(g, 'box', cream, [0.11, 0.18, 0.1], [0, 0.56, 0.66]);
      beard.rotation.x = 0.15;

      // Simple dark dot eyes matching the rest of the Herd (no white backing!)
      for (const x of [-0.195, 0.195]) {
        part(g, 'sphere', 0x262926, [0.026, 0.044, 0.044], [x, 0.87, 0.56]);
      }
      for (const x of [-0.12, 0.12]) {
        const horn = part(g, 'cone', dark, [0.065, 0.32, 0.065], [x * 1.1, 1.1, 0.4]);
        horn.rotation.x = -0.45;
        const ear = part(g, 'box', tan, [0.22, 0.08, 0.11], [x * 2.25, 0.91, 0.42]);
        ear.rotation.z = x > 0 ? 0.2 : -0.2;
      }
      const tail = part(g, 'cone', cream, [0.09, 0.2, 0.09], [0, 0.74, -0.46]);
      tail.rotation.x = -0.5;
      g.rotation.y = 0.32;
      return g;
    }

    case 'barn-cat': {
      // Chunky, clean low-poly Minecraft sitting cat matching Cow/Goat/Sheep scale & simplicity
      const g = new THREE.Group();
      const white = 0xf4f1ea;
      const gray = 0xd8d7d0;
      const orange = 0xe0923f;
      const dark = 0x3f3934;

      // Chunky sloped Minecraft sitting torso (clean bold calico blocks, no tiny clutter)
      const body = new THREE.Group();
      body.position.set(0, 0.36, -0.04);
      body.rotation.x = -0.52;
      g.add(body);
      part(body, 'box', gray, [0.42, 0.38, 0.78], [0, 0, 0]);
      part(body, 'box', orange, [0.43, 0.2, 0.34], [0, 0.1, 0.08]);
      part(body, 'box', dark, [0.43, 0.2, 0.22], [0, 0.1, -0.24]);

      // Two chunky straight vertical front legs
      for (const x of [-0.12, 0.12]) {
        part(g, 'box', white, [0.16, 0.54, 0.16], [x, 0.27, 0.28]);
      }

      // Two chunky horizontal folded back legs resting flat on the ground
      for (const x of [-0.13, 0.13]) {
        part(g, 'box', gray, [0.16, 0.16, 0.36], [x, 0.08, -0.04]);
      }

      // Big chunky Minecraft cat head (scales nicely alongside Cow, Pig & Goat)
      const head = new THREE.Group();
      head.position.set(0, 0.68, 0.34);
      g.add(head);
      part(head, 'box', white, [0.46, 0.36, 0.42], [0, 0, 0]);
      part(head, 'box', orange, [0.22, 0.22, 0.32], [0.125, 0.075, 0.02]);
      part(head, 'box', dark, [0.18, 0.18, 0.28], [-0.145, 0.095, 0.02]);

      // Two clean rectangular Minecraft ear tabs (one white, one orange)
      part(head, 'box', gray, [0.11, 0.12, 0.18], [-0.15, 0.23, -0.02]);
      part(head, 'box', orange, [0.11, 0.12, 0.18], [0.15, 0.23, -0.02]);

      // Protruding white snout + pink nose
      part(head, 'box', white, [0.26, 0.15, 0.1], [0, -0.09, 0.25]);
      part(head, 'box', 0xe599a0, [0.09, 0.07, 0.03], [0, -0.07, 0.3]);

      // Two solid odd-eyed dots (one amber, one cyan)
      part(head, 'sphere', 0xe6c35a, [0.05, 0.06, 0.025], [-0.12, 0.02, 0.21]);
      part(head, 'sphere', 0x57c7db, [0.05, 0.06, 0.025], [0.12, 0.02, 0.21]);

      // Simple compact upright-angled tail tucked close behind the rump (keeps scale chunky & big!)
      const tail = part(g, 'box', dark, [0.1, 0.34, 0.1], [0, 0.3, -0.44]);
      tail.rotation.x = -0.45;
      part(g, 'box', white, [0.105, 0.11, 0.105], [0, 0.44, -0.51]);

      g.rotation.y = 0.08;
      return g;
    }

    // -------------------------------------------------------------------------
    // PASTURE PROPS (FARM STRUCTURES)
    // -------------------------------------------------------------------------
    case 'barn': {
      const g = new THREE.Group();
      const red = 0xb84a40;
      const roof = 0x474f4c;
      const trim = 0xf5efe0;
      part(g, 'box', red, [0.96, 0.66, 0.88], [0, 0.33, 0]);
      const rL = part(g, 'box', roof, [0.64, 0.1, 0.98], [-0.26, 0.82, 0]);
      rL.rotation.z = 0.62;
      const rR = part(g, 'box', roof, [0.64, 0.1, 0.98], [0.26, 0.82, 0]);
      rR.rotation.z = -0.62;
      part(g, 'box', red, [0.6, 0.26, 0.84], [0, 0.74, 0]);
      part(g, 'box', trim, [0.46, 0.48, 0.06], [0, 0.26, 0.44]);
      part(g, 'box', red, [0.36, 0.38, 0.07], [0, 0.26, 0.45]);
      const d1 = part(g, 'box', trim, [0.46, 0.055, 0.08], [0, 0.26, 0.46]);
      d1.rotation.z = Math.PI / 4;
      const d2 = part(g, 'box', trim, [0.46, 0.055, 0.08], [0, 0.26, 0.46]);
      d2.rotation.z = -Math.PI / 4;
      part(g, 'box', trim, [0.22, 0.2, 0.06], [0, 0.73, 0.44]);
      part(g, 'box', 0x3b403c, [0.15, 0.13, 0.07], [0, 0.73, 0.45]);
      g.rotation.y = 0.3;
      return g;
    }

    case 'tractor': {
      const g = new THREE.Group();
      const green = 0x5f8c52;
      const tire = 0x343936;
      const hub = 0xe8be58;
      part(g, 'box', green, [0.5, 0.38, 0.92], [0, 0.46, 0.05]);
      part(g, 'box', 0x45693c, [0.46, 0.24, 0.1], [0, 0.46, 0.51]);
      part(g, 'box', 0xdde8e2, [0.46, 0.38, 0.4], [0, 0.8, -0.22]);
      part(g, 'box', green, [0.54, 0.08, 0.48], [0, 1.02, -0.22]);
      part(g, 'cylinder', 0x434a47, [0.05, 0.42, 0.05], [0.16, 0.82, 0.36]);
      for (const x of [-0.34, 0.34]) {
        const rear = part(g, 'cylinder', tire, [0.3, 0.16, 0.3], [x, 0.3, -0.22]);
        rear.rotation.z = Math.PI / 2;
        const rHub = part(g, 'cylinder', hub, [0.14, 0.18, 0.14], [x, 0.3, -0.22]);
        rHub.rotation.z = Math.PI / 2;

        const front = part(g, 'cylinder', tire, [0.18, 0.12, 0.18], [x * 0.9, 0.18, 0.36]);
        front.rotation.z = Math.PI / 2;
        const fHub = part(g, 'cylinder', hub, [0.08, 0.14, 0.08], [x * 0.9, 0.18, 0.36]);
        fHub.rotation.z = Math.PI / 2;
      }
      g.rotation.y = 0.35;
      return g;
    }

    case 'silo': {
      const g = new THREE.Group();
      const body = 0xe2dac8;
      const band = 0x879497;
      const dome = 0x99a9ad;
      part(g, 'cylinder', body, [0.4, 1.08, 0.4], [0, 0.54, 0]);
      for (const y of [0.22, 0.54, 0.86]) {
        part(g, 'cylinder', band, [0.42, 0.055, 0.42], [0, y, 0]);
      }
      part(g, 'sphere', dome, [0.41, 0.34, 0.41], [0, 1.08, 0]);
      part(g, 'box', 0x6f7d80, [0.16, 0.92, 0.18], [0.38, 0.48, 0.12]);
      part(g, 'box', 0x454e4c, [0.18, 0.24, 0.08], [0, 0.14, 0.39]);
      return g;
    }

    case 'windmill': {
      const g = new THREE.Group();
      const wood = 0x9c724c;
      const sail = 0xf4e6c2;
      const hub = 0xb85245;
      part(g, 'cylinder', wood, [0.18, 1.05, 0.18], [0, 0.52, 0]);
      part(g, 'box', 0x7c5737, [0.48, 0.12, 0.48], [0, 0.06, 0]);
      const rotor = new THREE.Group();
      rotor.position.set(0, 0.96, 0.22);
      rotor.rotation.z = Math.PI / 4;
      g.add(rotor);
      const axle = part(rotor, 'cylinder', hub, [0.11, 0.14, 0.11], [0, 0, 0]);
      axle.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI) / 2;
        rotor.add(arm);
        part(arm, 'box', 0x755235, [0.05, 0.56, 0.04], [0, 0.32, 0]);
        part(arm, 'box', sail, [0.18, 0.42, 0.03], [0.09, 0.38, 0.02]);
      }
      g.rotation.y = 0.25;
      return g;
    }

    case 'well': {
      // Hollow stone shaft with recessed water inside + centered windlass, rope & bucket
      const g = new THREE.Group();
      const stone = 0x87949b;
      const stoneRim = 0xa2adb0;
      const wood = 0x8c6240;
      const roof = 0xa85a44;

      // Hollow stone well cylinder built with LatheGeometry so there's a real deep opening
      const wellProfile = [
        new THREE.Vector2(0.32, 0.04),
        new THREE.Vector2(0.46, 0.04),
        new THREE.Vector2(0.46, 0.44),
        new THREE.Vector2(0.5, 0.44),
        new THREE.Vector2(0.5, 0.52),
        new THREE.Vector2(0.32, 0.52),
        new THREE.Vector2(0.32, 0.04),
      ];
      const wellGeo = track(new THREE.LatheGeometry(wellProfile, 16));
      mesh(g, wellGeo, stone, [0, 0, 0], { roughness: 0.88 });
      // Subtle top capstone ring accent
      const capGeo = track(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.325, 0.45),
            new THREE.Vector2(0.505, 0.45),
            new THREE.Vector2(0.505, 0.525),
            new THREE.Vector2(0.325, 0.525),
          ],
          16,
        ),
      );
      mesh(g, capGeo, stoneRim, [0, 0, 0], { roughness: 0.85 });

      // Dark inner shaft base + recessed shimmering water partway down (y = 0.30, well below 0.52 rim!)
      smoothCyl(g, 0x263236, [0.33, 0.08, 0.33], [0, 0.08, 0], 0.9);
      smoothCyl(g, 0x4b8ea3, [0.325, 0.05, 0.325], [0, 0.3, 0], 0.25);
      const ripple = smoothTorus(g, 0x8bd0e0, [0.16, 0.16, 0.08], [0, 0.33, 0], 0.25);
      ripple.rotation.x = Math.PI / 2;

      // Side timber posts + centered horizontal windlass beam + crank
      for (const x of [-0.41, 0.41]) {
        part(g, 'box', wood, [0.09, 0.68, 0.09], [x, 0.82, 0]);
      }
      const axle = part(g, 'cylinder', 0x6f4d31, [0.045, 0.86, 0.045], [0, 0.94, 0]);
      axle.rotation.z = Math.PI / 2;
      part(g, 'box', 0x5c4029, [0.04, 0.14, 0.04], [0.47, 0.88, 0]);
      part(g, 'box', 0xc9a368, [0.1, 0.04, 0.04], [0.52, 0.82, 0]);

      // Centered vertical rope + centered hanging wooden bucket right over the well hole
      smoothCyl(g, 0xd9c28c, [0.018, 0.24, 0.018], [0, 0.82, 0], 0.85);
      smoothCyl(g, 0xd4a45c, [0.13, 0.19, 0.11], [0, 0.63, 0], 0.72);
      smoothCyl(g, 0x535a5c, [0.136, 0.03, 0.136], [0, 0.68, 0], 0.5);
      smoothCyl(g, 0x4b8ea3, [0.105, 0.02, 0.105], [0, 0.72, 0], 0.25);

      // Symmetrical pitched shingled roof
      const r1 = part(g, 'box', roof, [0.98, 0.09, 0.48], [0, 1.24, 0.17]);
      r1.rotation.x = 0.55;
      const r2 = part(g, 'box', roof, [0.98, 0.09, 0.48], [0, 1.24, -0.17]);
      r2.rotation.x = -0.55;
      part(g, 'box', 0x7e4231, [1.0, 0.07, 0.08], [0, 1.37, 0]);

      g.rotation.y = 0.22;
      return g;
    }

    // -------------------------------------------------------------------------
    // HARVEST & TOOLS
    // -------------------------------------------------------------------------
    case 'milk-churn': {
      // Classic dairy farm matte low-poly glass milk bottle filled with fresh cream + crimson foil cap!
      const g = new THREE.Group();

      // Inner creamy-white milk fill visible cleanly through the glass bottle
      const milkPts = [
        new THREE.Vector2(0.0, 0.04),
        new THREE.Vector2(0.28, 0.04),
        new THREE.Vector2(0.28, 0.56),
        new THREE.Vector2(0.18, 0.72),
        new THREE.Vector2(0.15, 0.8),
        new THREE.Vector2(0.0, 0.8),
      ];
      mesh(g, track(new THREE.LatheGeometry(milkPts, 10)), 0xfbf6ea, [0, 0, 0], { roughness: 0.82 });

      // Clean 10-sided low-poly translucent pale-aqua glass milk bottle shell
      const bottlePts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.29, 0.0),
        new THREE.Vector2(0.33, 0.05),
        new THREE.Vector2(0.33, 0.58),
        new THREE.Vector2(0.19, 0.78),
        new THREE.Vector2(0.17, 1.0),
        new THREE.Vector2(0.2, 1.04),
        new THREE.Vector2(0.2, 1.08),
        new THREE.Vector2(0.0, 1.08),
      ];
      mesh(g, track(new THREE.LatheGeometry(bottlePts, 10)), 0xd6eceb, [0, 0, 0], { roughness: 0.42, opacity: 0.36 });

      // Simple dairy blue stripe band + classic red farm foil cap
      const bandGeo = track(new THREE.CylinderGeometry(0.336, 0.336, 0.16, 10));
      mesh(g, bandGeo, 0x5c8aa3, [0, 0.36, 0], { roughness: 0.84 });
      const capGeo = track(new THREE.CylinderGeometry(0.21, 0.22, 0.12, 10));
      mesh(g, capGeo, 0xd14c44, [0, 1.1, 0], { roughness: 0.78 });
      return g;
    }

    case 'corn': {
      // Sculpted smooth golden ear of corn with layered peeling green husks
      const g = new THREE.Group();
      const cobPts = [
        new THREE.Vector2(0.0, 0.05),
        new THREE.Vector2(0.14, 0.08),
        new THREE.Vector2(0.24, 0.26),
        new THREE.Vector2(0.26, 0.56),
        new THREE.Vector2(0.22, 0.84),
        new THREE.Vector2(0.15, 1.04),
        new THREE.Vector2(0.07, 1.13),
        new THREE.Vector2(0.0, 1.15),
      ];
      const cobGeo = track(new THREE.LatheGeometry(cobPts, 20));
      mesh(g, cobGeo, 0xf3c842, [0, 0, 0], { flat: false, roughness: 0.55 });

      // Subtle golden kernel bead rows along the exposed upper cob
      for (let row = 0; row < 5; row++) {
        const y = 0.42 + row * 0.135;
        const r = 0.245 - Math.abs(row - 1.2) * 0.022;
        const ring = smoothTorus(g, row % 2 === 0 ? 0xe5b22c : 0xf7d65c, [r, r, 0.18], [0, y, 0], 0.55);
        ring.rotation.x = Math.PI / 2;
      }

      // Stem base
      smoothCyl(g, 0x629147, [0.065, 0.16, 0.065], [0, 0.0, 0], 0.72);

      // 3 sculpted peeling green husk leaves cupping the lower cob
      const huskGeo = makePointedLeafGeo(studio, 0.78, 0.24, 0.032, 0.08);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.35;
        const holder = new THREE.Group();
        holder.position.set(0, 0.08, 0);
        holder.rotation.y = a;
        const husk = mesh(holder, huskGeo, i === 0 ? 0x6ba14d : 0x5c9142, [0, 0, 0.18], { flat: false, roughness: 0.68 });
        husk.rotation.x = 0.36;
        g.add(holder);
      }

      g.rotation.z = -0.24;
      return g;
    }

    case 'pumpkin': {
      // Matte flat-shaded low-poly ribbed pumpkin
      const g = new THREE.Group();
      addPumpkinLobes(studio, g);

      // Chunky low-poly tilted green stem + simple angular leaf
      const stem = part(g, 'cylinder', 0x587342, [0.075, 0.26, 0.075], [0.03, 0.76, 0]);
      stem.rotation.z = -0.26;
      const leafGeo = makeLowPolyPetalGeo(studio, 0.32, 0.15, 0.03);
      const leaf = mesh(g, leafGeo, 0x6ea052, [-0.03, 0.68, 0.06], { roughness: 0.86 });
      leaf.rotation.z = 0.9;
      leaf.rotation.x = 0.45;
      return g;
    }

    case 'apple': {
      // Matte flat-shaded 8-sided low-poly apple matching Pasture Patrol's exact aesthetic
      const g = new THREE.Group();
      const applePts = [
        new THREE.Vector2(0.0, 0.06),
        new THREE.Vector2(0.18, 0.02),
        new THREE.Vector2(0.38, 0.14),
        new THREE.Vector2(0.48, 0.44),
        new THREE.Vector2(0.45, 0.72),
        new THREE.Vector2(0.32, 0.88),
        new THREE.Vector2(0.14, 0.9),
        new THREE.Vector2(0.0, 0.8),
      ];
      const appleGeo = track(new THREE.LatheGeometry(applePts, 8));
      mesh(g, appleGeo, 0xcf453e, [0, 0, 0], { roughness: 0.86 });

      // Simple low-poly woody stem + sharp flat-extruded leaf
      const stem = part(g, 'box', 0x6e4d32, [0.07, 0.28, 0.07], [-0.02, 0.95, 0]);
      stem.rotation.z = 0.18;
      const leafGeo = makeLowPolyPetalGeo(studio, 0.38, 0.15, 0.032);
      const leaf = mesh(g, leafGeo, 0x6ba64c, [0.02, 0.94, 0.02], { roughness: 0.86 });
      leaf.rotation.z = -1.0;
      leaf.rotation.y = 0.3;
      return g;
    }

    case 'carrot': {
      // Thicker, longer sculpted organic carrot (not a rigid sharp cone) + leafy top fronds
      const g = new THREE.Group();
      const carrotPts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.055, 0.04),
        new THREE.Vector2(0.11, 0.22),
        new THREE.Vector2(0.165, 0.48),
        new THREE.Vector2(0.215, 0.78),
        new THREE.Vector2(0.245, 1.04),
        new THREE.Vector2(0.23, 1.18),
        new THREE.Vector2(0.15, 1.25),
        new THREE.Vector2(0.0, 1.26),
      ];
      const carrotGeo = track(new THREE.LatheGeometry(carrotPts, 24));
      mesh(g, carrotGeo, 0xe8762c, [0, 0, 0], { flat: false, roughness: 0.54 });

      // Subtle organic horizontal root ridges
      for (const [y, r] of [
        [0.45, 0.162],
        [0.74, 0.212],
        [0.98, 0.24],
      ] as [number, number][]) {
        const ridge = smoothTorus(g, 0xcf5f1c, [r, r, 0.08], [0, y, 0], 0.65);
        ridge.rotation.x = Math.PI / 2;
      }

      // Lush feathery green fronds radiating cleanly from the crown
      const frondGeo = makePointedLeafGeo(studio, 0.46, 0.11, 0.024, 0.05);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        const holder = new THREE.Group();
        holder.position.set(0, 1.22, 0);
        holder.rotation.y = a;
        const frond = mesh(holder, frondGeo, i % 2 === 0 ? 0x629e49 : 0x73b256, [0, 0, 0], { flat: false, roughness: 0.62 });
        frond.rotation.x = 0.34;
        g.add(holder);
      }

      g.rotation.z = -0.42;
      return g;
    }

    case 'honey-jar': {
      // Clean, minimal low-poly glass mason jar filled with golden honey + silver/tin screw lid
      const g = new THREE.Group();

      // Inner deep amber honey fill (visible cleanly through the glass!)
      const honeyGeo = track(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 10));
      mesh(g, honeyGeo, 0xe0780f, [0, 0.36, 0], { roughness: 0.78 });

      // Clean low-poly 10-sided translucent pale glass mason jar shell
      const glassPts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.36, 0.0),
        new THREE.Vector2(0.41, 0.06),
        new THREE.Vector2(0.41, 0.74),
        new THREE.Vector2(0.32, 0.86),
        new THREE.Vector2(0.32, 0.94),
        new THREE.Vector2(0.0, 0.94),
      ];
      const glassGeo = track(new THREE.LatheGeometry(glassPts, 10));
      mesh(g, glassGeo, 0xdff0ed, [0, 0, 0], { roughness: 0.4, opacity: 0.24 });

      // Simple clean low-poly silver-tin mason screw lid
      const lidGeo = track(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 10));
      mesh(g, lidGeo, 0xadb8b5, [0, 0.96, 0], { roughness: 0.65 });
      const lidTopGeo = track(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 10));
      mesh(g, lidTopGeo, 0xc7d1ce, [0, 1.04, 0], { roughness: 0.65 });
      return g;
    }

    case 'straw-hat': {
      // Exact same conical farmer straw hat as Scarecrow, pinned with a tiny astral-blue Star charm!
      const g = new THREE.Group();
      const brimGeo = track(new THREE.CylinderGeometry(0.72, 0.76, 0.08, 8));
      mesh(g, brimGeo, 0xe8c460, [0, 0.08, 0], { roughness: 0.86 });
      const bandGeo = track(new THREE.CylinderGeometry(0.41, 0.43, 0.15, 8));
      mesh(g, bandGeo, 0x5c8556, [0, 0.18, 0], { roughness: 0.86 });
      const crownGeo = track(new THREE.ConeGeometry(0.41, 0.58, 8));
      mesh(g, crownGeo, 0xd9b14e, [0, 0.52, 0], { roughness: 0.86 });

      // Tiny 3D NovaMark Star charm pinned cleanly onto the front-right of the sage hatband!
      const starCharm = makeNovaLogoGroup(studio, {
        coreRadius: 0.24,
        ringInner: 0.43,
        ringOuter: 0.58,
        ringSegments: 12,
        depth: 0.18,
        primaryCount: 4,
        primaryBaseHalf: 0.15,
        primaryTip: 1.0,
        secondaryBaseHalf: 0.12,
        secondaryTip: 0.84,
        coreColor: 0xeaf4ff,
        ringColor: 0x679ae0,
        primaryColor: 0x7eb4f5,
        secondaryColor: 0x4569a6,
      });
      starCharm.scale.setScalar(0.19);
      starCharm.position.set(0.28, 0.23, 0.34);
      starCharm.rotation.y = 0.65;
      starCharm.rotation.x = -0.15;
      g.add(starCharm);

      g.rotation.x = 0.22;
      g.rotation.z = -0.14;
      return g;
    }

    case 'watering-can': {
      // Chunky, bold matte low-poly blue enamel garden watering can with clean geometric spout, brass rose & strap handle!
      const g = new THREE.Group();
      const bodyBlue = 0x5288a8;
      const trimBlue = 0x3b6885;
      const brass = 0xe8be52;

      // Chunky 8-sided tapered metal can body + crisp base & top rims
      const bodyGeo = track(new THREE.CylinderGeometry(0.35, 0.4, 0.62, 8));
      mesh(g, bodyGeo, bodyBlue, [0, 0.31, 0], { roughness: 0.84 });
      const baseRimGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8));
      mesh(g, baseRimGeo, trimBlue, [0, 0.03, 0], { roughness: 0.84 });
      // Hollow octagonal brass top rim + recessed dark open water basin inside
      const topRimPts = [
        new THREE.Vector2(0.35, 0.59),
        new THREE.Vector2(0.37, 0.59),
        new THREE.Vector2(0.37, 0.65),
        new THREE.Vector2(0.3, 0.65),
        new THREE.Vector2(0.3, 0.61),
      ];
      mesh(g, track(new THREE.LatheGeometry(topRimPts, 8)), brass, [0, 0, 0], { roughness: 0.78 });
      const waterGeo = track(new THREE.CylinderGeometry(0.3, 0.3, 0.016, 8));
      mesh(g, waterGeo, 0x2c4e63, [0, 0.63, 0], { roughness: 0.6 });

      // Bold straight faceted tapered spout angled cleanly at 45 deg
      const spoutGeo = track(new THREE.CylinderGeometry(0.065, 0.13, 0.68, 6));
      const spout = mesh(g, spoutGeo, bodyBlue, [0.54, 0.44, 0], { roughness: 0.84 });
      spout.rotation.z = -0.82;

      // Wide chunky brass sprinkler rose head at spout tip
      const roseConeGeo = track(new THREE.CylinderGeometry(0.18, 0.07, 0.15, 8));
      const rose = mesh(g, roseConeGeo, brass, [0.82, 0.69, 0], { roughness: 0.76 });
      rose.rotation.z = -0.82;
      const roseCapGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8));
      const roseCap = mesh(g, roseCapGeo, 0x997324, [0.87, 0.74, 0], { roughness: 0.82 });
      roseCap.rotation.z = -0.82;

      // Clean geometric side carry handle only
      part(g, 'box', trimBlue, [0.22, 0.08, 0.11], [-0.46, 0.54, 0]);
      part(g, 'box', trimBlue, [0.24, 0.08, 0.11], [-0.46, 0.16, 0]);
      part(g, 'box', trimBlue, [0.08, 0.46, 0.11], [-0.56, 0.35, 0]);

      g.rotation.y = 0.32;
      return g;
    }

    case 'egg': {
      // Speckled egg in a straw nest: Pasture Tactics' Hen trap and Pasture Patrol's egg bomb.
      const g = new THREE.Group();
      part(g, 'cylinder', 0xe6b853, [0.24, 0.06, 0.24], [0, 0.03, 0]);
      part(g, 'cylinder', 0xc3933e, [0.19, 0.065, 0.19], [0, 0.035, 0]);
      const profile = [
        new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0.17, 0.12),
        new THREE.Vector2(0.15, 0.24), new THREE.Vector2(0.09, 0.33), new THREE.Vector2(0, 0.37),
      ];
      mesh(g, track(new THREE.LatheGeometry(profile, 8)), 0xfaf5ea, [0, 0.04, 0], { roughness: 0.85 });
      part(g, 'box', 0xd9c9a8, [0.03, 0.03, 0.01], [-0.065, 0.17, 0.143]).rotation.y = -Math.PI / 8;
      part(g, 'box', 0xd9c9a8, [0.03, 0.03, 0.01], [0.05, 0.22, 0.14]).rotation.y = Math.PI / 8;
      part(g, 'box', 0xd9c9a8, [0.03, 0.03, 0.01], [-0.03, 0.29, 0.131]).rotation.y = -Math.PI / 8;
      g.rotation.y = 0.35;
      return g;
    }

    case 'scarecrow': {
      // Matte low-poly Pumpkin-Headed Scarecrow reusing the exact 7-lobe low-poly pumpkin!
      const g = new THREE.Group();
      const post = 0x7d573a;
      const shirt = 0xb85640;
      const denim = 0x527387;
      const straw = 0xe8c460;

      // Small meadow mound + sturdy wooden cross-post staked into the ground
      const moundGeo = track(new THREE.CylinderGeometry(0.32, 0.38, 0.1, 8));
      mesh(g, moundGeo, 0x7aa652, [0, 0.05, 0], { roughness: 0.88 });
      part(g, 'cylinder', post, [0.06, 1.05, 0.06], [0, 0.54, 0]);
      part(g, 'box', post, [1.08, 0.075, 0.075], [0, 0.72, 0]);

      // Cozy flannel coat + sleeves + denim overalls bib + straw tufts poking from cuffs & hem
      part(g, 'box', shirt, [0.44, 0.44, 0.28], [0, 0.62, 0]);
      part(g, 'box', shirt, [0.84, 0.17, 0.17], [0, 0.72, 0]);
      part(g, 'box', denim, [0.46, 0.22, 0.3], [0, 0.48, 0]);
      // Overall straps
      for (const side of [-1, 1]) {
        part(g, 'box', denim, [0.08, 0.24, 0.3], [side * 0.13, 0.71, 0]);
        // Straw tufts sticking out of sleeve cuffs
        const cuff = part(g, 'cone', straw, [0.085, 0.16, 0.085], [side * 0.48, 0.72, 0]);
        cuff.rotation.z = -side * (Math.PI / 2);
      }
      // Straw fringe peeking out under the hem
      part(g, 'box', straw, [0.4, 0.08, 0.24], [0, 0.35, 0]);

      // Pumpkin Head (reusing the exact 7-lobe matte flat-shaded low-poly pumpkin!)
      const head = new THREE.Group();
      head.position.set(0, 0.85, 0);
      head.scale.setScalar(0.56);
      g.add(head);
      addPumpkinLobes(studio, head);
      // Classic carved scarecrow face (two dark triangular eyes + cute triangle nose)
      for (const side of [-1, 1]) {
        const eye = part(head, 'cone', 0x2a1d15, [0.095, 0.13, 0.06], [side * 0.19, 0.44, 0.44]);
        eye.rotation.y = side * 0.28;
      }
      part(head, 'cone', 0x2a1d15, [0.065, 0.09, 0.05], [0, 0.31, 0.48]);
      part(head, 'box', 0x2a1d15, [0.24, 0.055, 0.05], [0, 0.2, 0.46]);

      // Jaunty tilted straw farmer hat perched atop the pumpkin head
      const hat = new THREE.Group();
      hat.position.set(0.02, 1.24, 0);
      hat.rotation.z = -0.14;
      hat.rotation.x = -0.08;
      g.add(hat);
      const brimGeo = track(new THREE.CylinderGeometry(0.42, 0.44, 0.05, 8));
      mesh(hat, brimGeo, straw, [0, 0, 0], { roughness: 0.86 });
      const bandGeo = track(new THREE.CylinderGeometry(0.24, 0.25, 0.09, 8));
      mesh(hat, bandGeo, 0x5c8556, [0, 0.06, 0], { roughness: 0.86 });
      const crownGeo = track(new THREE.ConeGeometry(0.24, 0.34, 8));
      mesh(hat, crownGeo, 0xd9b14e, [0, 0.25, 0], { roughness: 0.86 });

      g.rotation.y = 0.26;
      return g;
    }

    // -------------------------------------------------------------------------
    // SKY & VISITORS (WINDS)
    // -------------------------------------------------------------------------
    case 'scout-pod': {
      // Pikmin-style (S.S. Dolphin inspired) chunky low-poly bulbous rocket ship!
      const g = new THREE.Group();
      const cream = 0xf4eee0;
      const red = 0xd65143;
      const gold = 0xebb84c;
      const glass = 0x6ec2b4;
      const slate = 0x454f4c;

      // Plump bulbous 8-sided low-poly Pikmin hull
      const hullPts = [
        new THREE.Vector2(0.0, 0.2),
        new THREE.Vector2(0.28, 0.24),
        new THREE.Vector2(0.42, 0.44),
        new THREE.Vector2(0.42, 0.72),
        new THREE.Vector2(0.32, 0.96),
        new THREE.Vector2(0.16, 1.14),
        new THREE.Vector2(0.0, 1.24),
      ];
      mesh(g, track(new THREE.LatheGeometry(hullPts, 8)), cream, [0, 0, 0], { roughness: 0.85 });

      // Signature red Pikmin nosecone cap + lower belly accent band
      const nosePts = [
        new THREE.Vector2(0.31, 0.96),
        new THREE.Vector2(0.16, 1.14),
        new THREE.Vector2(0.0, 1.25),
      ];
      mesh(g, track(new THREE.LatheGeometry(nosePts, 8)), red, [0, 0, 0], { roughness: 0.85 });
      const bandGeo = track(new THREE.CylinderGeometry(0.425, 0.34, 0.14, 8));
      mesh(g, bandGeo, red, [0, 0.34, 0], { roughness: 0.85 });

      // Chunky low-poly bulbous cockpit window bubble on the front
      part(g, 'sphere', glass, [0.22, 0.22, 0.16], [0, 0.7, 0.33]);
      part(g, 'cylinder', slate, [0.23, 0.05, 0.23], [0, 0.7, 0.32]).rotation.x = Math.PI / 2;

      // Iconic Pikmin top antenna with golden beacon orb
      part(g, 'cylinder', slate, [0.03, 0.24, 0.03], [0, 1.32, 0]);
      part(g, 'sphere', gold, [0.095, 0.095, 0.095], [0, 1.47, 0]);

      // 3 chunky splayed Pikmin landing tripod pods + yellow foot pads
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.45;
        const holder = new THREE.Group();
        holder.rotation.y = a;
        const strut = part(holder, 'box', red, [0.12, 0.38, 0.14], [0.42, 0.24, 0]);
        strut.rotation.z = 0.42;
        part(holder, 'cylinder', gold, [0.12, 0.08, 0.12], [0.49, 0.06, 0]);
        // Little round side booster pod
        part(holder, 'cylinder', slate, [0.09, 0.18, 0.09], [0.4, 0.3, 0]);
        g.add(holder);
      }

      // Main bottom engine bell
      part(g, 'cone', slate, [0.18, 0.2, 0.18], [0, 0.14, 0]);
      part(g, 'sphere', gold, [0.1, 0.1, 0.1], [0, 0.04, 0]);

      g.rotation.y = 0.35;
      return g;
    }

    case 'alien': {
      // Blocky green visitor: big square head, slanted oval eyes, oval-tipped antennae.
      const g = new THREE.Group();
      const green = 0x67d964;
      const dark = 0x4fb85a;
      part(g, 'box', green, [0.38, 0.3, 0.3], [0, 0.33, 0]);
      part(g, 'box', green, [0.6, 0.42, 0.46], [0, 0.69, 0]);
      for (const side of [-1, 1]) {
        part(g, 'box', dark, [0.14, 0.18, 0.16], [side * 0.11, 0.09, 0]);
        part(g, 'box', dark, [0.1, 0.24, 0.12], [side * 0.24, 0.32, 0.02]);
        part(g, 'sphere', 0x111613, [0.11, 0.055, 0.02], [side * 0.14, 0.7, 0.23]).rotation.z = side * 0.3;
        part(g, 'box', dark, [0.05, 0.2, 0.05], [side * 0.18, 1.0, 0]).rotation.z = -side * 0.35;
        part(g, 'sphere', green, [0.07, 0.09, 0.07], [side * 0.22, 1.14, 0]);
      }
      g.rotation.y = 0.46;
      return g;
    }

    case 'sprout-red':
    case 'sprout-yellow':
    case 'sprout-blue': {
      const g = buildSprout(studio, id.slice('sprout-'.length) as SproutColor);
      g.rotation.y = 0.46;
      return g;
    }

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

    case 'sprouts': {
      // Blue, yellow and red sprouts huddled side by side.
      const g = new THREE.Group();
      const lineup = [['blue', -0.33, -0.02, 0.12], ['yellow', 0, 0.08, 0], ['red', 0.33, -0.02, -0.18]] as const;
      for (const [kind, x, z, yaw] of lineup) {
        const p = buildSprout(studio, kind);
        p.position.set(x, 0, z);
        p.rotation.y = yaw;
        g.add(p);
      }
      g.rotation.y = 0.56;
      return g;
    }

    // -------------------------------------------------------------------------
    // UDDER HAVOC VISITORS & BOSSES
    // -------------------------------------------------------------------------
    case 'plasma-orb': {
      const g = new THREE.Group();
      const coreGeo = track(new THREE.IcosahedronGeometry(0.32, 0));
      mesh(g, coreGeo, 0x3ef0c6, [0, 0, 0], { flat: true, emissive: 0x1aa88a, roughness: 0.25 });
      const ring = smoothTorus(g, 0xff6e7f, [0.38, 0.38, 0.38], [0, 0, 0], 0.35);
      ring.rotation.x = Math.PI / 3;
      return g;
    }

    case 'splitter': {
      // Alien hive egg nestled in three dark-teal claws.
      const g = new THREE.Group();
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
      const g = new THREE.Group();
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
      const g = new THREE.Group();
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
      const g = new THREE.Group();
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
      const g = new THREE.Group();
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

    // -------------------------------------------------------------------------
    // NIGHT WATCH (DRAGONS)
    // -------------------------------------------------------------------------
    case 'moon': {
      // Crisp flat-extruded low-poly Crescent Moon + mini 3D NovaMark logo star!
      const g = new THREE.Group();
      const crescentGeo = makeCrescentGeo(studio);
      const crescent = mesh(g, crescentGeo, 0xf3cc5a, [-0.08, 0.56, 0], { roughness: 0.85 });
      crescent.rotation.z = 0.22;

      // Mini flat-extruded NovaMark star nestled inside the crescent curve
      const miniLogo = makeNovaLogoGroup(studio, {
        coreRadius: 0.2,
        ringInner: 0.4,
        ringOuter: 0.56,
        ringSegments: 12,
        depth: 0.15,
        primaryCount: 4,
        primaryBaseHalf: 0.15,
        primaryTip: 0.96,
        secondaryBaseHalf: 0.12,
        secondaryTip: 0.82,
        coreColor: 0xfff8dc,
        ringColor: 0xffe99c,
        primaryColor: 0xffe99c,
        secondaryColor: 0xe6c35a,
      });
      miniLogo.scale.setScalar(0.32);
      miniLogo.position.set(0.28, 0.68, 0.04);
      g.add(miniLogo);

      g.rotation.y = 0.42;
      g.rotation.x = -0.16;
      return g;
    }

    case 'lantern': {
      // Cozy matte low-poly vintage camp/barn lantern with glowing amber glass globe, brass accents & bail handle!
      const g = new THREE.Group();
      const iron = 0x363f3d;
      const brass = 0xd4a448;

      // Stepped octagonal wrought-iron base + brass oil tank collar
      const footGeo = track(new THREE.CylinderGeometry(0.34, 0.4, 0.12, 8));
      mesh(g, footGeo, iron, [0, 0.06, 0], { roughness: 0.84 });
      const tankGeo = track(new THREE.CylinderGeometry(0.32, 0.35, 0.12, 8));
      mesh(g, tankGeo, brass, [0, 0.18, 0], { roughness: 0.74 });

      // Faceted bulged glowing warm amber-honey lantern glass globe (clean clearance inside cage!)
      const globePts = [
        new THREE.Vector2(0.0, 0.24),
        new THREE.Vector2(0.22, 0.24),
        new THREE.Vector2(0.3, 0.42),
        new THREE.Vector2(0.3, 0.64),
        new THREE.Vector2(0.22, 0.82),
        new THREE.Vector2(0.0, 0.82),
      ];
      mesh(g, track(new THREE.LatheGeometry(globePts, 8)), 0xffcf54, [0, 0, 0], { roughness: 0.45, emissive: 0xe89824 });

      // 4 crisp dark-iron vertical protective guard struts cleanly outside globe
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const strut = part(
          g,
          'box',
          iron,
          [0.045, 0.62, 0.045],
          [Math.cos(a) * 0.36, 0.53, Math.sin(a) * 0.36],
        );
        strut.rotation.y = -a;
      }

      // Wide stepped iron eaves cap + brass vent chimney + top hanging bail ring
      const capGeo = track(new THREE.CylinderGeometry(0.22, 0.42, 0.16, 8));
      mesh(g, capGeo, iron, [0, 0.88, 0], { roughness: 0.84 });
      const ventGeo = track(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 8));
      mesh(g, ventGeo, brass, [0, 1.02, 0], { roughness: 0.74 });
      const finialGeo = track(new THREE.CylinderGeometry(0.08, 0.18, 0.08, 8));
      mesh(g, finialGeo, iron, [0, 1.12, 0], { roughness: 0.84 });

      const bailGeo = track(new THREE.TorusGeometry(0.16, 0.028, 6, 10));
      mesh(g, bailGeo, iron, [0, 1.24, 0], { roughness: 0.84 });

      g.rotation.y = 0.35;
      return g;
    }

    case 'comet': {
      // Crisp sharp-edged flat-extruded 3D NovaMark logo in a spacey astral blue-indigo palette!
      const g = makeNovaLogoGroup(studio, {
        coreRadius: 0.24,
        ringInner: 0.43,
        ringOuter: 0.58,
        ringSegments: 16,
        depth: 0.16,
        primaryCount: 4,
        primaryBaseHalf: 0.145,
        primaryTip: 1.0,
        secondaryBaseHalf: 0.115,
        secondaryTip: 0.85,
        coreColor: 0xeaf4ff,
        ringColor: 0x679ae0,
        primaryColor: 0x7eb4f5,
        secondaryColor: 0x4569a6,
      });

      g.rotation.y = 0.46;
      g.rotation.x = -0.18;
      return g;
    }

    // -------------------------------------------------------------------------
    // BONUS GROUP 1: SEASONS
    // -------------------------------------------------------------------------
    case 'season-spring': {
      // Matte low-poly Breath of the Wild Silent Princess (luminous blue-and-white lily with cyan-tipped stamens
      // & golden pistil) paired with a tiny low-detail pink Silent Princess companion on a meadow turf mound!
      const g = new THREE.Group();

      // Neat 8-sided faceted meadow turf pad over earthy soil base
      const soilGeo = track(new THREE.CylinderGeometry(0.44, 0.5, 0.14, 8));
      mesh(g, soilGeo, 0x8a5e3f, [0, 0.07, 0], { roughness: 0.88 });
      const grassGeo = track(new THREE.CylinderGeometry(0.47, 0.45, 0.09, 8));
      mesh(g, grassGeo, 0x76ad52, [0, 0.17, 0], { roughness: 0.86 });

      // Graceful curved green main stem + slender companion stem
      const stemColor = 0x3f783b;
      const mainStemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.18, 0),
        new THREE.Vector3(-0.04, 0.52, 0),
        new THREE.Vector3(-0.02, 0.86, 0.04),
      ]);
      mesh(g, track(new THREE.TubeGeometry(mainStemCurve, 8, 0.032, 6, false)), stemColor, [0, 0, 0], { roughness: 0.86 });

      const sideStemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02, 0.2, 0),
        new THREE.Vector3(0.22, 0.44, 0.06),
        new THREE.Vector3(0.36, 0.58, 0.12),
      ]);
      mesh(g, track(new THREE.TubeGeometry(sideStemCurve, 7, 0.022, 5, false)), stemColor, [0, 0, 0], { roughness: 0.86 });

      // Basal foliage leaves fanning cleanly from the turf
      const leafGeo = makeLowPolyPetalGeo(studio, 0.42, 0.12, 0.026);
      const leafAngles = [-0.95, 0.9, -0.35, 0.45];
      leafAngles.forEach((rz, i) => {
        const l = mesh(g, leafGeo, i % 2 === 0 ? 0x5c9c48 : 0x4b873d, [0, 0.24, 0.02], { roughness: 0.86 });
        l.rotation.z = rz;
        l.rotation.x = 0.25 + (i % 2) * 0.18;
      });

      // Reusable 5-pointed Silent Princess petal (white outer + glowing colored inner heart!)
      const outerPetalGeo = makeLowPolyPetalGeo(studio, 0.44, 0.135, 0.026);
      const innerPetalGeo = makeLowPolyPetalGeo(studio, 0.26, 0.095, 0.028);
      const sepalGeo = makeLowPolyPetalGeo(studio, 0.34, 0.07, 0.02);

      // Main Hero Silent Princess (cerulean blue inner glow + crisp white pointed tips)
      const princess = new THREE.Group();
      princess.position.set(-0.02, 0.88, 0.06);
      princess.rotation.order = 'YXZ';
      princess.rotation.y = 0.52;
      princess.rotation.x = -0.36;
      g.add(princess);

      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.18;
        const holder = new THREE.Group();
        holder.rotation.z = a;

        // Luminous snowy-white outer lily petal cupped forward (+0.28)
        const pOut = mesh(holder, outerPetalGeo, 0xf7fcff, [0, 0.03, 0], { roughness: 0.82 });
        pOut.rotation.x = 0.28;
        // Vivid cerulean-blue inner heart on each petal
        const pIn = mesh(holder, innerPetalGeo, 0x34b4f5, [0, 0.03, 0.012], { roughness: 0.78, emissive: 0x1a8cd8 });
        pIn.rotation.x = 0.28;
        // Pointed green calyx sepal tucked behind the petals
        const sep = mesh(holder, sepalGeo, 0x3b7338, [0, 0.02, -0.04], { roughness: 0.86 });
        sep.rotation.z = Math.PI / 5;
        sep.rotation.x = -0.15;
        princess.add(holder);
      }

      // Iconic central golden-yellow pistil + 5 slender filaments tipped with glowing aqua-cyan beads!
      const pistilGeo = track(new THREE.CylinderGeometry(0.02, 0.022, 0.26, 5));
      const pistil = mesh(princess, pistilGeo, 0xd4ebd4, [0, 0, 0.12], { roughness: 0.84 });
      pistil.rotation.x = Math.PI / 2;
      const tipGeo = track(new THREE.OctahedronGeometry(0.045, 0));
      mesh(princess, tipGeo, 0xf7cc36, [0, 0.015, 0.26], { roughness: 0.8 });
      mesh(princess, tipGeo, 0xf7cc36, [0.028, -0.01, 0.25], { roughness: 0.8 });

      const filGeo = track(new THREE.CylinderGeometry(0.009, 0.011, 0.24, 4));
      const beadGeo = track(new THREE.SphereGeometry(0.032, 6, 5));
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.5;
        const fh = new THREE.Group();
        fh.rotation.z = a;
        const fil = mesh(fh, filGeo, 0xd8f0dc, [0, 0.055, 0.12], { roughness: 0.84 });
        fil.rotation.x = Math.PI / 2 - 0.36;
        mesh(fh, beadGeo, 0x4eead2, [0, 0.1, 0.24], { roughness: 0.4, emissive: 0x38d9c0 });
        princess.add(fh);
      }

      // Tiny low-detail PINK Silent Princess companion perched on the side stem!
      const miniPink = new THREE.Group();
      miniPink.position.set(0.37, 0.6, 0.14);
      miniPink.scale.setScalar(0.46);
      miniPink.rotation.order = 'YXZ';
      miniPink.rotation.y = 0.72;
      miniPink.rotation.x = -0.32;
      g.add(miniPink);

      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.1;
        const holder = new THREE.Group();
        holder.rotation.z = a;
        const pOut = mesh(holder, outerPetalGeo, 0xfff5f8, [0, 0.03, 0], { roughness: 0.84 });
        pOut.rotation.x = 0.32;
        const pIn = mesh(holder, innerPetalGeo, 0xf279b0, [0, 0.03, 0.012], { roughness: 0.82 });
        pIn.rotation.x = 0.32;
        miniPink.add(holder);
      }
      mesh(miniPink, tipGeo, 0xf7cc36, [0, 0, 0.09], { roughness: 0.82 });

      return g;
    }

    case 'season-summer': {
      // Sun-colored low-poly variation of the NovaMark logo: bigger center sphere + 12 sharp peaks!
      const g = makeNovaLogoGroup(studio, {
        coreRadius: 0.36,
        ringInner: 0.46,
        ringOuter: 0.59,
        ringSegments: 12,
        depth: 0.15,
        primaryCount: 6,
        primaryBaseHalf: 0.12,
        primaryTip: 0.98,
        secondaryBaseHalf: 0.095,
        secondaryTip: 0.84,
        coreColor: 0xffd24c,
        ringColor: 0xeba12c,
        primaryColor: 0xf7be36,
        secondaryColor: 0xe37d2b,
      });

      g.rotation.y = 0.46;
      g.rotation.x = -0.18;
      return g;
    }

    case 'season-autumn': {
      // Smooth sculpted acorn + crisp 5-lobed 3D maple leaf!
      const g = new THREE.Group();

      // Smooth acorn nut (LatheGeometry with gentle pointed bottom tip)
      const nutPts = [
        new THREE.Vector2(0.0, 0.04),
        new THREE.Vector2(0.05, 0.09),
        new THREE.Vector2(0.24, 0.24),
        new THREE.Vector2(0.3, 0.46),
        new THREE.Vector2(0.28, 0.64),
        new THREE.Vector2(0.0, 0.64),
      ];
      const acorn = new THREE.Group();
      acorn.position.set(-0.24, 0.06, 0.04);
      acorn.rotation.z = 0.18;
      g.add(acorn);
      mesh(acorn, track(new THREE.LatheGeometry(nutPts, 24)), 0xa86135, [0, 0, 0], { flat: false, roughness: 0.42 });

      // Smooth acorn cap dome + rim + little twig stem
      const capPts = [
        new THREE.Vector2(0.27, 0.58),
        new THREE.Vector2(0.34, 0.62),
        new THREE.Vector2(0.33, 0.72),
        new THREE.Vector2(0.22, 0.84),
        new THREE.Vector2(0.0, 0.88),
      ];
      mesh(acorn, track(new THREE.LatheGeometry(capPts, 24)), 0x5c3a25, [0, 0, 0], { flat: false, roughness: 0.78 });
      smoothCyl(acorn, 0x4c301e, [0.036, 0.18, 0.036], [0, 0.95, 0], 0.8);

      // Authentic 5-lobed sculpted maple leaf + slender stem angled cleanly toward camera
      const mapleGeo = makeMapleLeafGeo(studio, 0.48);
      const leafGroup = new THREE.Group();
      leafGroup.position.set(0.28, 0.46, 0.08);
      leafGroup.rotation.z = -0.25;
      leafGroup.rotation.y = 0.42;
      leafGroup.rotation.x = -0.14;
      g.add(leafGroup);
      mesh(leafGroup, mapleGeo, 0xd96130, [0, 0, 0], { flat: false, roughness: 0.55 });
      smoothCyl(leafGroup, 0x8c3f1e, [0.022, 0.28, 0.022], [0, -0.36, 0], 0.75);

      return g;
    }

    case 'season-winter': {
      // Snowy matte low-poly pine tree wrapped with colorful glowing Christmas lights!
      const g = new THREE.Group();
      part(g, 'cylinder', 0x7c5538, [0.12, 0.28, 0.12], [0, 0.14, 0]);
      const snow = 0xf2f6f8;
      const tiers: [number, number, number, number][] = [
        [0.56, 0.46, 0.44, 0x3d6b4c],
        [0.44, 0.42, 0.72, 0x467855],
        [0.32, 0.36, 0.98, 0x4f8460],
      ];
      for (const [r, h, y, color] of tiers) part(g, 'cone', color, [r, h, r], [0, y, 0]);

      // Snowcap over the top tier: a white cone sharing its apex, nudged outward so it rests on the needles
      const [topR, topH, topY] = tiers[2];
      const capR = topR * 0.62;
      const capH = topH * 0.6;
      part(g, 'cone', snow, [capR, capH, capR], [0, topY + topH / 2 + 0.006 - capH / 2, 0]);

      // A few flattened snow lumps resting on the lower tiers' visible shoulders, lying along the slope
      const lumps: [tier: number, angle: number, surfaceR: number, size: number][] = [
        [0, 0.35, 0.48, 1],
        [0, 2.5, 0.47, 0.85],
        [0, 4.4, 0.49, 0.95],
        [1, 1.3, 0.38, 0.85],
        [1, 3.6, 0.37, 0.75],
        [1, 5.5, 0.38, 0.8],
      ];
      for (const [tier, angle, surfaceR, size] of lumps) {
        const [r, h, y] = tiers[tier];
        const surfaceY = y + h / 2 - (surfaceR * h) / r;
        const lump = part(
          g,
          'sphere',
          snow,
          [0.11 * size, 0.045 * size, 0.08 * size],
          [Math.sin(angle) * (surfaceR + 0.01), surfaceY, Math.cos(angle) * (surfaceR + 0.01)],
        );
        lump.rotation.order = 'YXZ';
        lump.rotation.y = angle;
        lump.rotation.x = Math.atan2(h, r);
      }

      // Spiral festive garland wire + glowing colorful Christmas light bulbs
      const bulbColors = [0xffdf59, 0xff595e, 0x62e3ff, 0xff8ed4, 0x7ef28a];
      const bulbGeo = track(new THREE.OctahedronGeometry(0.056, 0));

      const cordPts: THREE.Vector3[] = [];
      const totalBulbs = 15;
      for (let i = 0; i < totalBulbs; i++) {
        const t = i / (totalBulbs - 1);
        const y = 0.28 + t * 0.72;
        const angle = -0.7 + t * Math.PI * 3.4;
        const radius = THREE.MathUtils.lerp(0.51, 0.17, t);
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        cordPts.push(new THREE.Vector3(x * 0.96, y, z * 0.96));

        const col = bulbColors[i % bulbColors.length];
        mesh(g, bulbGeo, col, [x, y, z], { roughness: 0.3, emissive: col });
      }

      const cordCurve = new THREE.CatmullRomCurve3(cordPts);
      mesh(g, track(new THREE.TubeGeometry(cordCurve, 28, 0.014, 5, false)), 0x26382b, [0, 0, 0], { roughness: 0.9 });

      return g;
    }

    // -------------------------------------------------------------------------
    // BONUS GROUP 2: BLOOMS (SMOOTH SCULPTED BOTANICALS)
    // -------------------------------------------------------------------------
    case 'bloom-hibiscus': {
      // Iconic matte low-poly Hibiscus bloom (no stem, larger forward-cupped petals,
      // tilted slightly upward & right with long arched golden-pollen stamen!)
      const g = new THREE.Group();

      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.13, 0.16);
      s.lineTo(0.28, 0.39);
      s.lineTo(0.22, 0.58);
      s.lineTo(0.0, 0.65);
      s.lineTo(-0.22, 0.58);
      s.lineTo(-0.28, 0.39);
      s.lineTo(-0.13, 0.16);
      s.closePath();
      const petalGeo = track(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }));
      petalGeo.translate(0, 0, -0.02);
      const leafGeo = makeLowPolyPetalGeo(studio, 0.62, 0.22, 0.032);

      // Blossom head tilted clearly UPWARD (-0.56 X in YXZ order) and gently to the right (+0.96 Y)
      const head = new THREE.Group();
      head.position.set(0, 0.62, 0);
      head.rotation.order = 'YXZ';
      head.rotation.y = 0.96;
      head.rotation.x = -0.56;
      head.rotation.z = -0.1;
      g.add(head);

      // Two rich tropical leaves poking cleanly out from BOTH bottom-left and bottom-right sides!
      const lLeft = mesh(head, leafGeo, 0x3e7841, [-0.18, -0.18, -0.09], { roughness: 0.86 });
      lLeft.rotation.z = 2.18;
      lLeft.rotation.x = -0.1;
      const lRight = mesh(head, leafGeo, 0x4f9151, [0.24, -0.22, -0.08], { roughness: 0.86 });
      lRight.rotation.z = -2.32;
      lRight.rotation.x = -0.06;

      // Green calyx cup tucked neatly behind the bloom
      const calyxGeo = track(new THREE.ConeGeometry(0.19, 0.18, 6));
      const calyx = mesh(head, calyxGeo, 0x4b8749, [0, 0, -0.1], { roughness: 0.86 });
      calyx.rotation.x = -Math.PI / 2;

      // 5 broad, slightly larger coral-red petals cupped FORWARD (+rotation.x)
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.18;
        const holder = new THREE.Group();
        holder.rotation.z = a;
        const petal = mesh(holder, petalGeo, i % 2 === 0 ? 0xe64962 : 0xd63a54, [0, 0.04, 0], { roughness: 0.84 });
        petal.rotation.x = 0.28;
        petal.rotation.y = 0.08;
        head.add(holder);
      }

      // Deep crimson throat disc
      const throatGeo = track(new THREE.CylinderGeometry(0.17, 0.15, 0.06, 7));
      const throat = mesh(head, throatGeo, 0x991c37, [0, 0, 0.03], { roughness: 0.85 });
      throat.rotation.x = Math.PI / 2;

      // Long gracefully arched hibiscus stamen column sweeping out & upward
      const stamenCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0.02),
        new THREE.Vector3(0.02, 0.04, 0.3),
        new THREE.Vector3(0.04, 0.12, 0.6),
        new THREE.Vector3(0.05, 0.24, 0.82),
      ]);
      const stamenGeo = track(new THREE.TubeGeometry(stamenCurve, 8, 0.032, 6, false));
      mesh(head, stamenGeo, 0xf29aa6, [0, 0, 0], { roughness: 0.84 });

      // Golden pollen cluster along the upper stamen + crimson stigma tip
      const pollenGeo = track(new THREE.SphereGeometry(0.048, 6, 5));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const t = 0.62 + (i % 3) * 0.13;
        const pt = stamenCurve.getPoint(t);
        mesh(
          head,
          pollenGeo,
          0xf7d046,
          [pt.x + Math.cos(a) * 0.07, pt.y + Math.sin(a) * 0.07, pt.z],
          { roughness: 0.84 },
        );
      }
      const tipPt = stamenCurve.getPoint(1);
      mesh(head, pollenGeo, 0xc72242, [tipPt.x, tipPt.y, tipPt.z], { roughness: 0.84 });

      return g;
    }

    case 'bloom-sunflower': {
      // Cute sunflower rendered in crisp matte flat-shaded low-poly!
      const g = new THREE.Group();
      const stemGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 6));
      mesh(g, stemGeo, 0x528543, [0, 0.28, 0], { roughness: 0.86 });

      const leafGeo = makeLowPolyPetalGeo(studio, 0.36, 0.15, 0.034);
      const l1 = mesh(g, leafGeo, 0x649952, [0.03, 0.22, 0], { roughness: 0.86 });
      l1.rotation.z = -0.9;
      const l2 = mesh(g, leafGeo, 0x568a47, [-0.03, 0.16, 0], { roughness: 0.86 });
      l2.rotation.z = 0.95;

      const head = new THREE.Group();
      head.position.set(0, 0.78, 0.04);
      head.rotation.x = -0.22;
      head.rotation.y = 0.42;
      g.add(head);

      // Faceted low-poly cocoa seed disc
      const centerGeo = track(new THREE.CylinderGeometry(0.21, 0.23, 0.1, 8));
      const center = mesh(head, centerGeo, 0x4d3424, [0, 0, 0.03], { roughness: 0.88 });
      center.rotation.x = Math.PI / 2;

      // Double layered ring of 12 crisp angular low-poly golden petals
      const petalGeo = makeLowPolyPetalGeo(studio, 0.32, 0.088, 0.034);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12;
        const h1 = new THREE.Group();
        h1.rotation.z = a;
        const p1 = mesh(h1, petalGeo, 0xf5be32, [0, 0.17, 0.015], { roughness: 0.85 });
        p1.rotation.x = -0.12;
        head.add(h1);

        const h2 = new THREE.Group();
        h2.rotation.z = a + Math.PI / 12;
        const p2 = mesh(h2, petalGeo, 0xdf9b22, [0, 0.15, -0.025], { roughness: 0.85 });
        p2.rotation.x = -0.2;
        head.add(h2);
      }
      return g;
    }

    case 'bloom-allium': {
      // Bunch of matte flat-shaded low-poly purple Alliums with height, size, and violet hue variation!
      const g = new THREE.Group();
      const coreGeo = track(new THREE.IcosahedronGeometry(1, 1));
      const floretGeo = track(new THREE.OctahedronGeometry(1, 0));
      const leafGeo = makeLowPolyPetalGeo(studio, 0.56, 0.095, 0.024);

      // Sleek radiating sword-like green allium leaves at the base
      const leafConfigs: { a: number; tilt: number; s: number; color: number }[] = [
        { a: -0.6, tilt: 0.42, s: 1.0, color: 0x5c9650 },
        { a: 0.55, tilt: 0.38, s: 0.95, color: 0x6ba65c },
        { a: 1.7, tilt: 0.46, s: 0.85, color: 0x518746 },
        { a: -1.8, tilt: 0.45, s: 0.85, color: 0x5f9952 },
      ];
      for (const lc of leafConfigs) {
        const holder = new THREE.Group();
        holder.position.set(0, 0.02, 0);
        holder.rotation.y = lc.a;
        const leaf = mesh(holder, leafGeo, lc.color, [0, 0, 0.03], { roughness: 0.86 });
        leaf.scale.setScalar(lc.s);
        leaf.rotation.x = lc.tilt;
        g.add(holder);
      }

      // 5 varied purple Allium orbs (varying height, puffball radius, and purple/lilac/plum shades)
      const alliums: {
        top: [number, number, number];
        radius: number;
        coreColor: number;
        floretColor: number;
        accentColor: number;
        seed: number;
      }[] = [
        { top: [0.0, 1.18, -0.04], radius: 0.235, coreColor: 0x8f5cc2, floretColor: 0xb183de, accentColor: 0xd0aef0, seed: 1 },
        { top: [-0.34, 0.94, 0.14], radius: 0.185, coreColor: 0xa468c7, floretColor: 0xc590e3, accentColor: 0xdfb8f5, seed: 2 },
        { top: [0.34, 1.0, 0.06], radius: 0.205, coreColor: 0x7c4eb0, floretColor: 0x9f71d1, accentColor: 0xc29de8, seed: 3 },
        { top: [0.06, 0.72, 0.24], radius: 0.155, coreColor: 0xb07dd4, floretColor: 0xcfa4ed, accentColor: 0xe6c8fa, seed: 4 },
        { top: [-0.26, 0.66, -0.18], radius: 0.135, coreColor: 0x764aa3, floretColor: 0x966bc2, accentColor: 0xb892de, seed: 5 },
      ];

      for (const al of alliums) {
        // Slightly curved slender green stalk from base bundle up to the orb
        const stalkCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(al.top[0] * 0.12, 0.0, al.top[2] * 0.12),
          new THREE.Vector3(al.top[0] * 0.6, al.top[1] * 0.54, al.top[2] * 0.6),
          new THREE.Vector3(al.top[0], al.top[1] - al.radius * 0.6, al.top[2]),
        ]);
        const stalkGeo = track(new THREE.TubeGeometry(stalkCurve, 7, 0.022, 5, false));
        mesh(g, stalkGeo, 0x59914d, [0, 0, 0], { roughness: 0.86 });

        // Faceted spherical allium umbel head studded with crisp tiny floret starlets
        const orb = new THREE.Group();
        orb.position.set(...al.top);
        g.add(orb);

        const core = mesh(orb, coreGeo, al.coreColor, [0, 0, 0], { roughness: 0.86 });
        core.scale.setScalar(al.radius);

        // Fibonacci-sphere distribution of 14 crisp little low-poly florets around each allium head
        const florets = 14;
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < florets; i++) {
          const y = 1 - (i / (florets - 1)) * 2;
          const r = Math.sqrt(Math.max(0, 1 - y * y));
          const theta = golden * (i + al.seed * 3.7);
          const nx = Math.cos(theta) * r;
          const nz = Math.sin(theta) * r;
          const dist = al.radius * 0.96;
          const fl = mesh(
            orb,
            floretGeo,
            i % 3 === 0 ? al.accentColor : al.floretColor,
            [nx * dist, y * dist, nz * dist],
            { roughness: 0.84 },
          );
          const fScale = al.radius * (i % 2 === 0 ? 0.27 : 0.22);
          fl.scale.setScalar(fScale);
          fl.rotation.set(i * 0.7, theta, i * 0.4);
        }
      }

      return g;
    }

    case 'bloom-forget-me-not': {
      // Tight lush bouquet dome of 7 big sky-blue 5-petal Forget-Me-Not blooms on V-forking
      // dark-olive stems with pointed framing leaves (directly matching the reference photo!)
      const g = new THREE.Group();

      // Broad rounded low-poly Forget-Me-Not petal
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.085, 0.06);
      s.lineTo(0.135, 0.15);
      s.lineTo(0.085, 0.24);
      s.lineTo(0, 0.26);
      s.lineTo(-0.085, 0.24);
      s.lineTo(-0.135, 0.15);
      s.lineTo(-0.085, 0.06);
      s.closePath();
      const petalGeo = track(new THREE.ExtrudeGeometry(s, { depth: 0.026, bevelEnabled: false }));
      petalGeo.translate(0, 0, -0.013);
      const whiteRayGeo = makeLowPolyPetalGeo(studio, 0.115, 0.032, 0.02);
      const yellowRingGeo = track(new THREE.CylinderGeometry(0.068, 0.068, 0.036, 7));
      const darkEyeGeo = track(new THREE.CylinderGeometry(0.028, 0.028, 0.044, 6));
      const leafGeo = makeLowPolyPetalGeo(studio, 0.56, 0.16, 0.028);

      // V-forking dark-olive stems rising cleanly from the bottom into the flower bouquet
      const stemColor = 0x3d5e32;
      const forks: [number, number, number][] = [
        [-0.22, 0.58, 0.08],
        [0.18, 0.58, 0.06],
        [0.0, 0.72, -0.04],
      ];
      const forkCurves = forks.map(
        (tip) =>
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.0, 0),
            new THREE.Vector3(tip[0] * 0.45, 0.28, tip[2] * 0.45),
            new THREE.Vector3(...tip),
          ]),
      );
      for (const curve of forkCurves) {
        mesh(g, track(new THREE.TubeGeometry(curve, 6, 0.026, 5, false)), stemColor, [0, 0, 0], { roughness: 0.88 });
      }

      // Framing leaves sprout from the fork stems: each leaf's narrow base is pinned to a stem point
      const leaves = [
        { fork: 1, t: 0.45, color: 0x6ba144, scale: [0.85, 1.12], rotZ: -0.34, rotY: 0.4 },
        { fork: 1, t: 0.18, color: 0x5c913b, scale: [0.95, 0.88], rotZ: -0.95, rotY: 0.35 },
        { fork: 0, t: 0.25, color: 0x4f8033, scale: [0.8, 0.82], rotZ: 0.88, rotY: 0.45 },
      ];
      for (const l of leaves) {
        const { x, y, z } = forkCurves[l.fork].getPoint(l.t);
        const leaf = mesh(g, leafGeo, l.color, [x, y, z], { roughness: 0.86 });
        leaf.scale.set(l.scale[0], l.scale[1], 1);
        leaf.rotation.z = l.rotZ;
        leaf.rotation.y = l.rotY;
      }

      const makeBlossom = (scale: number, blueHex: number) => {
        const b = new THREE.Group();
        b.scale.setScalar(scale);

        // 5 sky-blue rounded petals cupped gently FORWARD (+0.12)
        for (let i = 0; i < 5; i++) {
          const h = new THREE.Group();
          h.rotation.z = (i * Math.PI * 2) / 5 + 0.15;
          const p = mesh(h, petalGeo, blueHex, [0, 0.02, 0], { roughness: 0.84 });
          p.rotation.x = 0.12;
          // Crisp iconic white throat star rays between/at the base of the petals!
          const wRay = mesh(h, whiteRayGeo, 0xfcfbf6, [0, 0.01, 0.018], { roughness: 0.84 });
          wRay.rotation.x = 0.12;
          b.add(h);
        }

        // Sunny golden-yellow eye + tiny dark center dot
        const yRing = mesh(b, yellowRingGeo, 0xf7cf36, [0, 0, 0.026], { roughness: 0.84 });
        yRing.rotation.x = Math.PI / 2;
        const dEye = mesh(b, darkEyeGeo, 0x6b4e16, [0, 0, 0.032], { roughness: 0.85 });
        dEye.rotation.x = Math.PI / 2;
        return b;
      };

      // Airy, well-spaced bouquet of 5 sky-blue Forget-Me-Not blooms so each 5-petal silhouette breathes cleanly!
      const cluster: { pos: [number, number, number]; scale: number; blue: number }[] = [
        { pos: [0.0, 1.02, 0.02], scale: 0.9, blue: 0x6db3f5 },
        { pos: [-0.42, 0.78, 0.12], scale: 0.88, blue: 0x61a9ef },
        { pos: [0.42, 0.76, 0.08], scale: 0.88, blue: 0x76bbf7 },
        { pos: [-0.24, 0.44, 0.2], scale: 0.84, blue: 0x76bbf7 },
        { pos: [0.28, 0.42, 0.16], scale: 0.84, blue: 0x67aef2 },
      ];

      const camVec = new THREE.Vector3(3.8, 3.25, 4.9).normalize();
      for (const c of cluster) {
        // Connect a slender dark-olive stem right into each bloom so nothing floats
        const branchCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.18, 0),
          new THREE.Vector3(c.pos[0] * 0.55, (0.18 + c.pos[1]) * 0.5, c.pos[2] * 0.45),
          new THREE.Vector3(c.pos[0], c.pos[1] - 0.04, c.pos[2] - 0.04),
        ]);
        mesh(g, track(new THREE.TubeGeometry(branchCurve, 6, 0.022, 5, false)), stemColor, [0, 0, 0], { roughness: 0.88 });

        const fl = makeBlossom(c.scale, c.blue);
        fl.position.set(...c.pos);
        const outward = new THREE.Vector3(c.pos[0], c.pos[1] - 0.55, c.pos[2] + 0.35).normalize();
        const aim = outward.multiplyScalar(0.28).add(camVec.clone().multiplyScalar(0.72));
        fl.lookAt(fl.position.clone().add(aim));
        g.add(fl);
      }

      return g;
    }

    // -------------------------------------------------------------------------
    // HARVEST DROP CROPS
    // -------------------------------------------------------------------------
    case 'pea': {
      // Plump bright-green garden pea with tiny stem dimple + leaf speck so rolling is readable
      const g = new THREE.Group();
      const bodyGeo = track(new THREE.SphereGeometry(0.45, 12, 8));
      mesh(g, bodyGeo, 0x74cf46, [0, 0.45, 0], { roughness: 0.72 });
      mesh(g, track(new THREE.SphereGeometry(0.11, 8, 6)), 0xa8e878, [-0.14, 0.62, 0.28], { roughness: 0.65 });
      const stem = part(g, 'cylinder', 0x4b8732, [0.055, 0.14, 0.055], [0.02, 0.9, 0]);
      stem.rotation.z = -0.22;
      return g;
    }

    case 'blueberry': {
      // Deep indigo berry with faceted 5-point crown calyx
      const g = new THREE.Group();
      const berryPts = [
        new THREE.Vector2(0.0, 0.04),
        new THREE.Vector2(0.28, 0.08),
        new THREE.Vector2(0.46, 0.28),
        new THREE.Vector2(0.48, 0.54),
        new THREE.Vector2(0.34, 0.76),
        new THREE.Vector2(0.16, 0.84),
        new THREE.Vector2(0.0, 0.78),
      ];
      const berryGeo = track(new THREE.LatheGeometry(berryPts, 10));
      mesh(g, berryGeo, 0x3b59b5, [0, 0, 0], { roughness: 0.74 });
      const crownGeo = makeLowPolyPetalGeo(studio, 0.18, 0.07, 0.025);
      addRadialLeaves(g, crownGeo, { count: 5, y: 0.8, z: 0.09, tilt: 0.65, color: 0x627fe0, roughness: 0.8 });
      return g;
    }

    case 'strawberry': {
      // Tapered heart-shaped red berry with golden seeds and 5-leaf green calyx cap
      const g = new THREE.Group();
      const berryPts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.12, 0.08),
        new THREE.Vector2(0.28, 0.26),
        new THREE.Vector2(0.42, 0.52),
        new THREE.Vector2(0.44, 0.74),
        new THREE.Vector2(0.32, 0.9),
        new THREE.Vector2(0.14, 0.95),
        new THREE.Vector2(0.0, 0.95),
      ];
      const berryGeo = track(new THREE.LatheGeometry(berryPts, 10));
      mesh(g, berryGeo, 0xd9383a, [0, 0, 0], { roughness: 0.72 });

      // Seed specks around the berry
      const seedGeo = track(new THREE.SphereGeometry(0.028, 5, 4));
      for (let row = 0; row < 3; row++) {
        const y = 0.28 + row * 0.22;
        const r = row === 0 ? 0.28 : row === 1 ? 0.42 : 0.43;
        const count = row === 0 ? 5 : 7;
        for (let i = 0; i < count; i++) {
          const a = (i * Math.PI * 2) / count + row * 0.45;
          mesh(g, seedGeo, 0xf7d768, [Math.cos(a) * r, y, Math.sin(a) * r], { roughness: 0.65 });
        }
      }

      const leafGeo = makeLowPolyPetalGeo(studio, 0.28, 0.11, 0.024);
      addRadialLeaves(g, leafGeo, { count: 5, y: 0.94, z: 0.04, tilt: 1.25, color: 0x5da145, roughness: 0.82 });
      part(g, 'cylinder', 0x4c8538, [0.05, 0.16, 0.05], [0, 1.01, 0]);
      return g;
    }

    case 'lemon': {
      // Matte flat-shaded 8-sided low-poly sunny lemon with soft blunt ends + green leaf
      const g = new THREE.Group();
      const lemonPts = [
        new THREE.Vector2(0.0, 0.04),
        new THREE.Vector2(0.12, 0.05),
        new THREE.Vector2(0.18, 0.10),
        new THREE.Vector2(0.32, 0.22),
        new THREE.Vector2(0.38, 0.40),
        new THREE.Vector2(0.38, 0.56),
        new THREE.Vector2(0.32, 0.74),
        new THREE.Vector2(0.18, 0.86),
        new THREE.Vector2(0.12, 0.90),
        new THREE.Vector2(0.0, 0.91),
      ];
      const lemonGeo = track(new THREE.LatheGeometry(lemonPts, 8));
      mesh(g, lemonGeo, 0xf2d338, [0, 0, 0], { roughness: 0.84 });

      const stem = part(g, 'box', 0x5c7838, [0.05, 0.11, 0.05], [0, 0.94, 0]);
      stem.rotation.z = 0.2;
      const leafGeo = makeLowPolyPetalGeo(studio, 0.30, 0.13, 0.028);
      const leaf = mesh(g, leafGeo, 0x629e44, [0.03, 0.91, 0.02], { roughness: 0.85 });
      leaf.rotation.z = -1.05;
      leaf.rotation.y = 0.25;
      return g;
    }

    case 'garlic': {
      // Sculpted multi-clove ivory garlic bulb tapering into a papery stem tuft
      const g = new THREE.Group();
      const clovePts = [
        new THREE.Vector2(0.0, 0.02),
        new THREE.Vector2(0.2, 0.04),
        new THREE.Vector2(0.28, 0.24),
        new THREE.Vector2(0.26, 0.48),
        new THREE.Vector2(0.14, 0.72),
        new THREE.Vector2(0.05, 0.92),
        new THREE.Vector2(0.0, 0.98),
      ];
      const cloveGeo = track(new THREE.LatheGeometry(clovePts, 8));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const c = mesh(g, cloveGeo, i % 2 === 0 ? 0xf5efe0 : 0xe9dfd0, [Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16], {
          roughness: 0.84,
        });
        c.scale.set(0.95, 1, 0.82);
        c.rotation.y = -a;
      }
      // Subtle mauve papery neck + trimmed root disc
      mesh(g, track(new THREE.CylinderGeometry(0.075, 0.12, 0.28, 8)), 0xd8bed4, [0, 0.9, 0], { roughness: 0.86 });
      mesh(g, track(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 8)), 0xb39a79, [0, 0.02, 0], { roughness: 0.92 });
      return g;
    }

    case 'turnip': {
      // Violet-crowned white root bulb with tapered root tip and leafy green crown
      const g = new THREE.Group();
      const lowerPts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.045, 0.09),
        new THREE.Vector2(0.22, 0.22),
        new THREE.Vector2(0.42, 0.36),
        new THREE.Vector2(0.48, 0.54),
        new THREE.Vector2(0.0, 0.54),
      ];
      mesh(g, track(new THREE.LatheGeometry(lowerPts, 10)), 0xf2ead6, [0, 0, 0], { roughness: 0.8 });

      const upperPts = [
        new THREE.Vector2(0.0, 0.52),
        new THREE.Vector2(0.485, 0.52),
        new THREE.Vector2(0.45, 0.72),
        new THREE.Vector2(0.3, 0.88),
        new THREE.Vector2(0.11, 0.94),
        new THREE.Vector2(0.0, 0.94),
      ];
      mesh(g, track(new THREE.LatheGeometry(upperPts, 10)), 0x99499e, [0, 0, 0], { roughness: 0.78 });

      const leafGeo = makePointedLeafGeo(studio, 0.44, 0.14, 0.026, 0.04);
      addRadialLeaves(g, leafGeo, {
        count: 3,
        y: 0.92,
        z: 0.03,
        tilt: 0.44,
        offset: 0.25,
        color: (i) => (i === 0 ? 0x62a348 : 0x52913b),
        flat: false,
        roughness: 0.68,
      });
      return g;
    }

    case 'cauliflower': {
      // Matte flat-shaded low-poly cauliflower dome cradled by sharp angular wrapper leaves
      const g = new THREE.Group();
      const curdGeo = track(new THREE.SphereGeometry(1, 6, 4));

      const core = mesh(g, curdGeo, 0xf2ebd7, [0, 0.48, 0], { roughness: 0.88 });
      core.scale.set(0.35, 0.3, 0.35);

      const crown = mesh(g, curdGeo, 0xf9f4e4, [0, 0.72, 0], { roughness: 0.88 });
      crown.scale.set(0.19, 0.15, 0.19);

      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const lower = mesh(
          g,
          curdGeo,
          i % 2 === 0 ? 0xf6f0de : 0xe9e0c9,
          [Math.cos(a) * 0.25, 0.45, Math.sin(a) * 0.25],
          { roughness: 0.88 },
        );
        lower.scale.set(0.21, 0.18, 0.21);
        lower.rotation.y = a;

        const ua = a + Math.PI / 6;
        const upper = mesh(
          g,
          curdGeo,
          i % 2 === 0 ? 0xe9e0c9 : 0xf9f4e4,
          [Math.cos(ua) * 0.17, 0.62, Math.sin(ua) * 0.17],
          { roughness: 0.88 },
        );
        upper.scale.set(0.16, 0.14, 0.16);
        upper.rotation.y = ua;
      }

      const leafGeo = makeLowPolyPetalGeo(studio, 0.52, 0.22, 0.036);
      addRadialLeaves(g, leafGeo, {
        count: 6,
        y: 0.16,
        z: 0.18,
        tilt: 0.88,
        offset: 0.26,
        color: (i) => (i % 2 === 0 ? 0x6ba154 : 0x588a45),
        roughness: 0.86,
      });

      mesh(g, track(new THREE.CylinderGeometry(0.16, 0.11, 0.18, 6)), 0x84ad6d, [0, 0.09, 0], {
        roughness: 0.86,
      });
      return g;
    }

    case 'watermelon': {
      // Matte flat-shaded low-poly faceted striped oval watermelon matching apple/pumpkin
      const g = new THREE.Group();
      const bodyGroup = new THREE.Group();
      bodyGroup.position.set(0, 0.48, 0);
      bodyGroup.scale.set(1.08, 0.94, 1.0);
      g.add(bodyGroup);

      const stripeCount = 6;
      const unit = (Math.PI * 2) / (stripeCount * 3);
      const darkArc = unit * 2;
      const lightArc = unit;
      const darkGeo = track(new THREE.SphereGeometry(0.49, 2, 6, 0, darkArc));
      const lightGeo = track(new THREE.SphereGeometry(0.49, 1, 6, darkArc, lightArc));
      for (let i = 0; i < stripeCount; i++) {
        const rotY = i * (darkArc + lightArc);
        const darkMesh = mesh(bodyGroup, darkGeo, 0x266b34, [0, 0, 0], { roughness: 0.86 });
        darkMesh.rotation.y = rotY;
        const lightMesh = mesh(bodyGroup, lightGeo, 0x7bc257, [0, 0, 0], { roughness: 0.86 });
        lightMesh.rotation.y = rotY;
      }

      // Chunky low-poly woody stem + angular vine leaf
      const stem = part(g, 'cylinder', 0x5d7341, [0.05, 0.18, 0.05], [0.02, 0.96, 0]);
      stem.rotation.z = -0.28;
      const leafGeo = makeLowPolyPetalGeo(studio, 0.28, 0.13, 0.028);
      const leaf = mesh(g, leafGeo, 0x6ea052, [-0.02, 0.92, 0.04], { roughness: 0.86 });
      leaf.rotation.z = 0.95;
      leaf.rotation.x = 0.4;
      return g;
    }

    case 'pineapple': {
      // Matte flat-shaded 8-sided amber pineapple with diamond facets + layered spiky crown
      const g = new THREE.Group();
      const bodyPts = [
        new THREE.Vector2(0.0, 0.02),
        new THREE.Vector2(0.24, 0.04),
        new THREE.Vector2(0.38, 0.22),
        new THREE.Vector2(0.41, 0.46),
        new THREE.Vector2(0.38, 0.72),
        new THREE.Vector2(0.25, 0.88),
        new THREE.Vector2(0.0, 0.90),
      ];
      const bodyGeo = track(new THREE.LatheGeometry(bodyPts, 8));
      mesh(g, bodyGeo, 0xde8f28, [0, 0, 0], { roughness: 0.86 });

      // Staggered low-poly diamond scale bosses wrapping the barrel
      const scaleGeo = track(new THREE.OctahedronGeometry(0.1, 0));
      for (let row = 0; row < 3; row++) {
        const y = 0.26 + row * 0.21;
        const r = row === 1 ? 0.37 : 0.34;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI * 2) / 8 + (row % 2 === 0 ? 0 : Math.PI / 8);
          const boss = mesh(
            g,
            scaleGeo,
            (i + row) % 2 === 0 ? 0xc27119 : 0xeba838,
            [Math.cos(a) * r, y, Math.sin(a) * r],
            { roughness: 0.86 },
          );
          boss.rotation.y = -a;
          boss.scale.set(0.8, 1.15, 0.65);
        }
      }

      // Layered spiky green crown
      const outerLeafGeo = makeLowPolyPetalGeo(studio, 0.46, 0.13, 0.028);
      addRadialLeaves(g, outerLeafGeo, {
        count: 6,
        y: 0.86,
        z: 0.08,
        tilt: 0.72,
        color: (i) => (i % 2 === 0 ? 0x4b913f : 0x5ca64c),
        roughness: 0.86,
      });

      const innerLeafGeo = makeLowPolyPetalGeo(studio, 0.42, 0.1, 0.026);
      addRadialLeaves(g, innerLeafGeo, {
        count: 5,
        y: 0.9,
        z: 0.04,
        tilt: 0.26,
        offset: 0.3,
        color: 0x67b354,
        roughness: 0.86,
      });
      return g;
    }
  }
}
