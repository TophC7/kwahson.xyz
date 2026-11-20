import * as THREE from 'three';
import {
  createPastureKit,
  PASTURE_HEMI_GROUND,
  PASTURE_HEMI_SKY,
  PASTURE_SUN_COLOR,
  type PartKind,
} from '../../lib/pastureKit';
import { createMoojongAudio } from './audio';
import {
  canTilesMatch,
  DIFFICULTIES,
  findValidMoves,
  generateBoard,
  getActiveTiles,
  getBlockReason,
  isSlotFree,
  randomSeed,
  reshuffleRemaining,
  type BoardTile,
  type Difficulty,
  type GeneratedBoard,
} from './board';
import { SUIT_STYLES, TILE_DESIGN_MAP } from './deck';
import { buildTileArtAtlas } from './tileArt';

const TILE_W = 1.0;
const TILE_D = 1.28;
const TILE_H = 0.42;
const STEP_X = 0.525; // half-grid unit in X -> full tile pitch 1.05
const STEP_Z = 0.67; // half-grid unit in Z -> full tile pitch 1.34
const LAYER_Y = 0.425;

// Straight-on top-front vantage: dead-level horizontal rows & vertical columns,
// showing crisp 3D tile thickness and multi-layer elevation with zero crooked yaw.
const CAM_OFFSET = new THREE.Vector3(0, 22, 6.8);
const MAX_ZOOM = 2.35;

// Depth cue: each layer below the board's top tints a step toward a cool meadow
// shade, so stacking reads at a glance without competing with Free-tile dimming.
const LAYER_SHADE = new THREE.Color(0xdde4d6);
const LAYER_SHADE_STEPS = [0, 0.3, 0.55, 0.75, 0.9, 1];

export interface MoojongHudState {
  difficulty: Difficulty;
  layoutName: string;
  seed: number;
  tilesLeft: number;
  movesLeft: number;
  elapsedSec: number;
  canUndo: boolean;
  muted: boolean;
  highlightFree: boolean;
  zoomed: boolean;
  hintsUsed: number;
  reshufflesUsed: number;
  status: string;
  phase: 'playing' | 'deadend' | 'won';
  selectedName: string;
}

export interface MoojongController {
  setDifficulty(diff: Difficulty): void;
  newBoard(): void;
  retryBoard(): void;
  reshuffle(): void;
  undo(): void;
  hint(): void;
  toggleMute(): void;
  toggleHighlightFree(): void;
  resetView(): void;
  destroy(): void;
  readonly previews: Record<string, string>;
}

interface TileVisual {
  tile: BoardTile;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  sageMesh: THREE.Mesh;
  ivoryMesh: THREE.Mesh;
  faceMesh: THREE.Mesh;
  rimMat: THREE.MeshBasicMaterial;
  dimMesh: THREE.Mesh;
  basePos: THREE.Vector3;
  hoverAmount: number;
  selectAmount: number;
  shakeTimer: number;
  errorFlash: number;
  spawnDelay: number;
  spawnProgress: number;
  clearing: boolean;
  clearProgress: number;
  clearTargetOffset: THREE.Vector3;
}

interface UndoRecord {
  idA: number;
  idB: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function createTileGeometries() {
  const baseShape = createRoundedRectShape(TILE_W * 0.96, TILE_D * 0.96, 0.1);
  const sageGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  sageGeo.rotateX(-Math.PI / 2);
  sageGeo.translate(0, 0.018, 0);

  const ivoryShape = createRoundedRectShape(TILE_W * 0.955, TILE_D * 0.955, 0.1);
  const ivoryGeo = new THREE.ExtrudeGeometry(ivoryShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  ivoryGeo.rotateX(-Math.PI / 2);
  ivoryGeo.translate(0, 0.16, 0);

  const faceGeo = new THREE.PlaneGeometry(TILE_W * 0.92, TILE_D * 0.92);
  faceGeo.rotateX(-Math.PI / 2);

  // Outer glowing selection / hint rim slightly larger than tile top
  const outerRim = createRoundedRectShape(TILE_W * 1.03, TILE_D * 1.03, 0.12);
  const hole = createRoundedRectShape(TILE_W * 0.93, TILE_D * 0.93, 0.085);
  outerRim.holes.push(hole);
  const rimGeo = new THREE.ShapeGeometry(outerRim);
  rimGeo.rotateX(-Math.PI / 2);

  // Invisible slightly forgiving hitbox for clean touch targeting
  const hitGeo = new THREE.BoxGeometry(TILE_W * 1.01, TILE_H, TILE_D * 1.01);

  return {
    sageGeo,
    ivoryGeo,
    faceGeo,
    rimGeo,
    hitGeo,
    dispose() {
      sageGeo.dispose();
      ivoryGeo.dispose();
      faceGeo.dispose();
      rimGeo.dispose();
      hitGeo.dispose();
    },
  };
}

export function mountMoojong({
  viewport,
  onState,
}: {
  viewport: HTMLElement;
  onState: (patch: Partial<MoojongHudState>) => void;
}): MoojongController {
  const cleanups: (() => void)[] = [];
  let disposed = false;

  function runCleanups() {
    if (disposed) return;
    disposed = true;
    for (let i = cleanups.length - 1; i >= 0; i--) {
      cleanups[i]();
    }
    cleanups.length = 0;
  }

  try {
    const abort = new AbortController();
    const { signal } = abort;
    cleanups.push(() => abort.abort());

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewport.appendChild(renderer.domElement);
    cleanups.push(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });

    const kit = createPastureKit();
    cleanups.push(() => kit.dispose());

    // Render all 42 Pasture Patrol 3D miniatures onto high-DPI tile face textures once
    const atlas = buildTileArtAtlas(renderer, kit);
    cleanups.push(() => atlas.dispose());

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera();

    // Warm Pasture Patrol studio lighting with soft upper-left sun casting
    // depth-revealing shadows down and to the right of every tile stack.
    scene.add(new THREE.HemisphereLight(PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, 2.05));
    const sun = new THREE.DirectionalLight(PASTURE_SUN_COLOR, 2.4);
    sun.position.set(-9, 22, -7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 48;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xd8e8d6, 0.55);
    fill.position.set(10, 12, -8);
    scene.add(fill);

    const tileGeos = createTileGeometries();
    cleanups.push(() => tileGeos.dispose());

    const sageBackMat = new THREE.MeshStandardMaterial({
      color: 0x567752,
      roughness: 0.62,
      metalness: 0.04,
    });
    const ivoryBodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1e8d6,
      roughness: 0.45,
      metalness: 0.02,
    });
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const dimMat = new THREE.MeshBasicMaterial({
      color: 0x161915,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    cleanups.push(() => {
      sageBackMat.dispose();
      ivoryBodyMat.dispose();
      hitMat.dispose();
      dimMat.dispose();
    });

    // Lazily cloned per-depth variants of the tile materials (textures stay shared).
    const shadedMats = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial[]>();
    function shaded(base: THREE.MeshStandardMaterial, depth: number): THREE.MeshStandardMaterial {
      if (depth <= 0) return base;
      let byDepth = shadedMats.get(base);
      if (!byDepth) shadedMats.set(base, (byDepth = []));
      let mat = byDepth[depth];
      if (!mat) {
        const step = LAYER_SHADE_STEPS[Math.min(depth, LAYER_SHADE_STEPS.length - 1)];
        mat = base.clone();
        mat.color.multiply(new THREE.Color(1, 1, 1).lerp(LAYER_SHADE, step));
        byDepth[depth] = mat;
      }
      return mat;
    }
    cleanups.push(() => {
      for (const byDepth of shadedMats.values()) for (const mat of byDepth) mat?.dispose();
    });

    const audio = createMoojongAudio();
    cleanups.push(() => audio.destroy());

    // Scene groups
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);
    const tilesGroup = new THREE.Group();
    scene.add(tilesGroup);
    const effectsGroup = new THREE.Group();
    scene.add(effectsGroup);

    // State
    let currentBoard: GeneratedBoard | null = null;
    let visuals = new Map<number, TileVisual>();
    let hitMeshes: THREE.Mesh[] = [];
    let selectedId: number | null = null;
    let hoveredId: number | null = null;
    let hintedIds: [number, number] | null = null;
    let undoStack: UndoRecord[] = [];
    let phase: MoojongHudState['phase'] = 'playing';
    let highlightFree = false;
    let hintsUsed = 0;
    let reshufflesUsed = 0;
    let matchStreak = 0;
    let lastMatchAt = -10;
    let elapsedSec = 0;
    let timerRunning = false;
    let statusText = '';
    let statusUntil = 0;
    let clockTime = 0;

    const particles: BurstParticle[] = [];

    // Camera framing & pan/zoom state
    let boardBounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5, maxY: 2 };
    let topLayer = 0;
    let fitHalfW = 8;
    let fitHalfH = 6;
    let zoom = 1;
    let targetZoom = 1;
    const pan = new THREE.Vector2(0, 0);
    const targetPan = new THREE.Vector2(0, 0);
    let viewCenterY = 0.6;

    function setStatus(text: string, duration = 2.6) {
      statusText = text;
      statusUntil = clockTime + duration;
      onState({ status: text });
    }

    function tileWorldPos(tile: BoardTile): THREE.Vector3 {
      return new THREE.Vector3(
        tile.gx * STEP_X,
        0.08 + tile.gz * LAYER_Y,
        tile.gy * STEP_Z,
      );
    }

    function buildPastureTable() {
      tableGroup.clear();

      const spanX = Math.max(9.5, boardBounds.maxX - boardBounds.minX + 2.2);
      const spanZ = Math.max(7.5, boardBounds.maxZ - boardBounds.minZ + 2.0);
      const cx = (boardBounds.minX + boardBounds.maxX) / 2;
      const cz = (boardBounds.minZ + boardBounds.maxZ) / 2;

      const addPart = (
        kind: PartKind,
        color: number,
        scale: [number, number, number],
        pos: [number, number, number],
        receiveShadow = false,
      ) => {
        const m = kit.part(tableGroup, kind, color, scale, pos);
        m.receiveShadow = receiveShadow;
        return m;
      };

      // Earthy diorama slab + dark grass rim + soft checkered pasture tabletop
      addPart('box', 0x9b684a, [spanX + 0.5, 0.72, spanZ + 0.5], [cx, -0.5, cz]);
      addPart('box', 0x6f9650, [spanX + 0.64, 0.24, spanZ + 0.64], [cx, -0.06, cz], true);
      addPart('box', 0x8dbd62, [spanX + 0.24, 0.08, spanZ + 0.24], [cx, 0.04, cz], true);

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
              0x85b45c,
              [patchSize - 0.04, 0.012, patchSize - 0.04],
              [startX + i * patchSize, 0.082, startZ + j * patchSize],
              true,
            );
          }
        }
      }

      // Perimeter wooden pasture fence (matches Pasture Patrol diorama!)
      const hx = spanX / 2 + 0.16;
      const hz = spanZ / 2 + 0.16;
      const postStep = 2.0;
      const xPosts = Math.max(4, Math.round(spanX / postStep));
      const zPosts = Math.max(4, Math.round(spanZ / postStep));

      for (let i = 0; i <= xPosts; i++) {
        const px = cx - hx + (i / xPosts) * (hx * 2);
        for (const pz of [cz - hz, cz + hz]) {
          addPart('box', 0xf3e6bd, [0.11, 0.44, 0.11], [px, 0.24, pz]);
          addPart('sphere', 0xfff1cf, [0.09, 0.065, 0.09], [px, 0.48, pz]);
        }
      }
      for (let j = 1; j < zPosts; j++) {
        const pz = cz - hz + (j / zPosts) * (hz * 2);
        for (const px of [cx - hx, cx + hx]) {
          addPart('box', 0xf3e6bd, [0.11, 0.44, 0.11], [px, 0.24, pz]);
          addPart('sphere', 0xfff1cf, [0.09, 0.065, 0.09], [px, 0.48, pz]);
        }
      }

      // Fence rails
      for (const pz of [cz - hz, cz + hz]) {
        addPart('box', 0xe0cf9e, [hx * 2, 0.07, 0.07], [cx, 0.29, pz]);
      }
      for (const px of [cx - hx, cx + hx]) {
        addPart('box', 0xe0cf9e, [0.07, 0.07, hz * 2], [px, 0.29, cz]);
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
          addPart('sphere', i % 2 ? 0xffe4a0 : 0xf7f4d9, [0.06, 0.045, 0.06], [x, 0.13, z]);
        } else {
          const tuft = addPart('cone', 0x6f9b4d, [0.055, 0.16, 0.055], [x, 0.15, z]);
          tuft.rotation.z = 0.2;
        }
      }
    }

    function clearTileMeshes() {
      for (const v of visuals.values()) {
        tilesGroup.remove(v.group);
        v.rimMat.dispose();
      }
      visuals.clear();
      hitMeshes = [];
    }

    function createTileVisual(tile: BoardTile, cascadeDelay: number): TileVisual {
      const group = new THREE.Group();

      const sageMesh = new THREE.Mesh(tileGeos.sageGeo, sageBackMat);
      sageMesh.castShadow = true;
      sageMesh.receiveShadow = true;
      group.add(sageMesh);

      const ivoryMesh = new THREE.Mesh(tileGeos.ivoryGeo, ivoryBodyMat);
      ivoryMesh.castShadow = true;
      ivoryMesh.receiveShadow = true;
      group.add(ivoryMesh);

      const faceMesh = new THREE.Mesh(tileGeos.faceGeo);
      faceMesh.position.y = TILE_H + 0.004;
      faceMesh.receiveShadow = true;
      group.add(faceMesh);

      const dimMesh = new THREE.Mesh(tileGeos.faceGeo, dimMat);
      dimMesh.position.y = TILE_H + 0.008;
      dimMesh.visible = false;
      group.add(dimMesh);

      const rimMat = new THREE.MeshBasicMaterial({
        color: 0xe6b853,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const rimMesh = new THREE.Mesh(tileGeos.rimGeo, rimMat);
      rimMesh.position.y = TILE_H + 0.014;
      group.add(rimMesh);

      const hitMesh = new THREE.Mesh(tileGeos.hitGeo, hitMat);
      hitMesh.position.y = TILE_H / 2;
      hitMesh.userData.tileId = tile.id;
      group.add(hitMesh);

      const basePos = tileWorldPos(tile);
      group.position.copy(basePos);
      tilesGroup.add(group);
      hitMeshes.push(hitMesh);

      const visual: TileVisual = {
        tile,
        group,
        hitMesh,
        sageMesh,
        ivoryMesh,
        faceMesh,
        rimMat,
        dimMesh,
        basePos,
        hoverAmount: 0,
        selectAmount: 0,
        shakeTimer: 0,
        errorFlash: 0,
        spawnDelay: cascadeDelay,
        spawnProgress: cascadeDelay > 0 ? 0 : 1,
        clearing: false,
        clearProgress: 0,
        clearTargetOffset: new THREE.Vector3(),
      };
      applyLayerShade(visual);
      return visual;
    }

    function applyLayerShade(v: TileVisual) {
      const depth = topLayer - v.tile.gz;
      v.sageMesh.material = shaded(sageBackMat, depth);
      v.ivoryMesh.material = shaded(ivoryBodyMat, depth);
      v.faceMesh.material = shaded(atlas.materials.get(v.tile.designId) ?? ivoryBodyMat, depth);
    }

    function computeBoardBounds(tiles: readonly BoardTile[]) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let maxY = 0;
      topLayer = 0;

      for (const t of tiles) {
        const p = tileWorldPos(t);
        minX = Math.min(minX, p.x - TILE_W / 2);
        maxX = Math.max(maxX, p.x + TILE_W / 2);
        minZ = Math.min(minZ, p.z - TILE_D / 2);
        maxZ = Math.max(maxZ, p.z + TILE_D / 2);
        maxY = Math.max(maxY, p.y + TILE_H);
        topLayer = Math.max(topLayer, t.gz);
      }

      boardBounds = { minX, maxX, minZ, maxZ, maxY };
      viewCenterY = maxY * 0.38;
    }

    function updateCameraFrustum() {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;

      const cx = (boardBounds.minX + boardBounds.maxX) / 2;
      const cz = (boardBounds.minZ + boardBounds.maxZ) / 2;

      // Temporarily position camera at board center to measure exact projected bounds
      const focus = new THREE.Vector3(cx, viewCenterY, cz);
      camera.position.copy(focus).add(CAM_OFFSET);
      camera.lookAt(focus);
      camera.updateMatrixWorld(true);

      const invCam = camera.matrixWorldInverse;
      const padX = 1.35;
      const padZ = 1.25;
      const corners = [
        new THREE.Vector3(boardBounds.minX - padX, -0.5, boardBounds.minZ - padZ),
        new THREE.Vector3(boardBounds.maxX + padX, -0.5, boardBounds.minZ - padZ),
        new THREE.Vector3(boardBounds.minX - padX, -0.5, boardBounds.maxZ + padZ),
        new THREE.Vector3(boardBounds.maxX + padX, -0.5, boardBounds.maxZ + padZ),
        new THREE.Vector3(boardBounds.minX - padX, boardBounds.maxY + 0.3, boardBounds.minZ - padZ),
        new THREE.Vector3(boardBounds.maxX + padX, boardBounds.maxY + 0.3, boardBounds.minZ - padZ),
        new THREE.Vector3(boardBounds.minX - padX, boardBounds.maxY + 0.3, boardBounds.maxZ + padZ),
        new THREE.Vector3(boardBounds.maxX + padX, boardBounds.maxY + 0.3, boardBounds.maxZ + padZ),
      ];

      let minVX = Infinity;
      let maxVX = -Infinity;
      let minVY = Infinity;
      let maxVY = -Infinity;
      for (const c of corners) {
        c.applyMatrix4(invCam);
        minVX = Math.min(minVX, c.x);
        maxVX = Math.max(maxVX, c.x);
        minVY = Math.min(minVY, c.y);
        maxVY = Math.max(maxVY, c.y);
      }

      // Reserve safe screen headroom for top HUD and bottom thumb toolbar
      const isCompact = width < 640;
      const verticalUsable = isCompact ? 0.74 : 0.78;
      const horizontalUsable = isCompact ? 0.94 : 0.92;

      const reqW = (maxVX - minVX) / horizontalUsable;
      const reqH = (maxVY - minVY) / verticalUsable;

      if (reqW / reqH > aspect) {
        fitHalfW = reqW / 2;
        fitHalfH = fitHalfW / aspect;
      } else {
        fitHalfH = reqH / 2;
        fitHalfW = fitHalfH * aspect;
      }

      applyCameraTransform();
    }

    function clampPan(p: THREE.Vector2, z: number) {
      const maxPanX = Math.max(0, fitHalfW * (1 - 1 / z) + 0.5);
      const maxPanZ = Math.max(0, fitHalfH * (1 - 1 / z) + 0.5);
      p.x = THREE.MathUtils.clamp(p.x, -maxPanX, maxPanX);
      p.y = THREE.MathUtils.clamp(p.y, -maxPanZ, maxPanZ);
    }

    function setTargetZoom(next: number) {
      targetZoom = THREE.MathUtils.clamp(next, 1, MAX_ZOOM);
      clampPan(targetPan, targetZoom);
      onState({ zoomed: targetZoom > 1.06 });
    }

    function applyCameraTransform() {
      const cx = (boardBounds.minX + boardBounds.maxX) / 2;
      const cz = (boardBounds.minZ + boardBounds.maxZ) / 2;

      const halfW = fitHalfW / zoom;
      const halfH = fitHalfH / zoom;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.near = 0.5;
      camera.far = 80;
      camera.updateProjectionMatrix();

      const focus = new THREE.Vector3(cx + pan.x, viewCenterY, cz + pan.y);
      camera.position.copy(focus).add(CAM_OFFSET);
      camera.lookAt(focus);
    }

    function spawnBurst(pos: THREE.Vector3, colorHex: number, count = 10) {
      for (let i = 0; i < count; i++) {
        const size = 0.08 + Math.random() * 0.07;
        const mesh = kit.part(effectsGroup, 'box', colorHex, [size, size, size], [pos.x, pos.y + 0.35, pos.z]);
        particles.push({
          mesh,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 3.4,
            1.8 + Math.random() * 2.4,
            (Math.random() - 0.5) * 3.4,
          ),
          spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          life: 0.55 + Math.random() * 0.25,
          maxLife: 0.8,
        });
      }
    }

    function refreshFreeStates() {
      if (!currentBoard) return;
      const active = getActiveTiles(currentBoard.tiles);
      const freeSet = new Set<number>();
      for (const t of active) {
        if (isSlotFree(t, active)) freeSet.add(t.id);
      }
      for (const v of visuals.values()) {
        if (v.tile.removed || v.clearing) {
          v.dimMesh.visible = false;
        } else {
          v.dimMesh.visible = highlightFree && !freeSet.has(v.tile.id);
        }
      }
    }

    function syncHud() {
      if (!currentBoard) return;
      const active = getActiveTiles(currentBoard.tiles);
      const moves = findValidMoves(currentBoard.tiles);
      const selectedDesign =
        selectedId !== null
          ? TILE_DESIGN_MAP.get(currentBoard.tiles[selectedId]?.designId ?? '')
          : undefined;

      onState({
        difficulty: currentBoard.difficulty,
        layoutName: currentBoard.layoutName,
        seed: currentBoard.seed,
        tilesLeft: active.length,
        movesLeft: moves.length,
        elapsedSec: Math.floor(elapsedSec),
        canUndo: undoStack.length > 0 && phase !== 'won',
        muted: audio.isMuted(),
        highlightFree,
        hintsUsed,
        reshufflesUsed,
        phase,
        selectedName: selectedDesign
          ? selectedDesign.isBonus
            ? `${selectedDesign.name} (${SUIT_STYLES[selectedDesign.suit].label})`
            : selectedDesign.name
          : '',
      });
    }

    function loadBoard(difficulty: Difficulty, seed: number, announce?: string) {
      currentBoard = generateBoard(difficulty, seed);
      clearTileMeshes();

      selectedId = null;
      hoveredId = null;
      hintedIds = null;
      undoStack = [];
      phase = 'playing';
      hintsUsed = 0;
      reshufflesUsed = 0;
      matchStreak = 0;
      elapsedSec = 0;
      timerRunning = false;
      zoom = 1;
      pan.set(0, 0);
      targetPan.set(0, 0);
      setTargetZoom(1);

      computeBoardBounds(currentBoard.tiles);
      buildPastureTable();

      for (const tile of currentBoard.tiles) {
        const delay = tile.gz * 0.045 + ((tile.gx + tile.gy + 20) % 7) * 0.012;
        visuals.set(tile.id, createTileVisual(tile, delay));
      }

      refreshFreeStates();
      updateCameraFrustum();
      syncHud();
      setStatus(announce ?? `${currentBoard.layoutName} · ${DIFFICULTIES[difficulty].label}`, 2.8);
    }

    function checkEndConditions() {
      if (!currentBoard) return;
      const active = getActiveTiles(currentBoard.tiles);
      if (active.length === 0) {
        phase = 'won';
        timerRunning = false;
        audio.playWin();
        // Celebratory meadow fireworks
        for (let i = 0; i < 6; i++) {
          const p = new THREE.Vector3((Math.random() - 0.5) * 7, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 5);
          spawnBurst(p, i % 2 === 0 ? 0xffefaf : 0x9eb09a, 12);
        }
        setStatus('Pasture cleared!', 5);
        syncHud();
        return;
      }

      const moves = findValidMoves(currentBoard.tiles);
      if (moves.length === 0) {
        phase = 'deadend';
        timerRunning = false;
        selectedId = null;
        hintedIds = null;
        audio.playDeadEnd();
        setStatus('No free matches remaining', 4);
        syncHud();
      }
    }

    function matchTiles(a: BoardTile, b: BoardTile) {
      if (!currentBoard) return;
      timerRunning = true;

      const designA = TILE_DESIGN_MAP.get(a.designId);
      const isBonus = Boolean(designA?.isBonus);

      a.removed = true;
      b.removed = true;
      undoStack.push({ idA: a.id, idB: b.id });
      selectedId = null;
      hintedIds = null;

      if (clockTime - lastMatchAt < 4.5) matchStreak++;
      else matchStreak = 0;
      lastMatchAt = clockTime;

      const visA = visuals.get(a.id);
      const visB = visuals.get(b.id);
      if (visA && visB) {
        const mid = visA.basePos.clone().add(visB.basePos).multiplyScalar(0.5);
        const burstColor = isBonus
          ? designA?.suit === 'season'
            ? 0xf2c95d
            : 0xe69db6
          : 0xffefaf;
        for (const v of [visA, visB]) {
          v.clearing = true;
          v.clearProgress = 0;
          v.clearTargetOffset.copy(mid).sub(v.basePos).multiplyScalar(0.28);
          v.hitMesh.visible = false;
          spawnBurst(v.basePos, burstColor, 8);
        }
      }

      audio.playMatch(matchStreak, isBonus);
      if (isBonus && designA) {
        setStatus(`${SUIT_STYLES[designA.suit].label} bonus match!`, 1.8);
      } else if (matchStreak >= 3) {
        setStatus(`${matchStreak + 1}x pasture streak`, 1.6);
      }

      refreshFreeStates();
      syncHud();
      checkEndConditions();
    }

    function handleTileTap(tileId: number) {
      if (!currentBoard || phase !== 'playing') return;
      const tile = currentBoard.tiles[tileId];
      const vis = visuals.get(tileId);
      if (!tile || tile.removed || !vis || vis.clearing) return;

      const active = getActiveTiles(currentBoard.tiles);
      const reason = getBlockReason(tile, active);
      if (reason !== 'free') {
        vis.shakeTimer = 0.28;
        vis.errorFlash = 1.0;
        audio.playBlocked();
        setStatus(reason === 'above' ? 'Blocked from above' : 'Blocked on left & right', 1.7);
        return;
      }

      timerRunning = true;

      if (selectedId === tileId) {
        deselect();
        return;
      }

      if (selectedId !== null) {
        const prev = currentBoard.tiles[selectedId];
        if (prev && !prev.removed && canTilesMatch(prev, tile)) {
          matchTiles(prev, tile);
          return;
        }
      }

      // Smoothly select (or switch selection to) this free tile
      selectedId = tileId;
      audio.playSelect();
      syncHud();
    }

    function deselect() {
      selectedId = null;
      audio.playDeselect();
      syncHud();
    }

    function undo() {
      if (!currentBoard || undoStack.length === 0 || phase === 'won') return;
      const last = undoStack.pop()!;
      const tileA = currentBoard.tiles[last.idA];
      const tileB = currentBoard.tiles[last.idB];
      if (!tileA || !tileB) return;

      tileA.removed = false;
      tileB.removed = false;
      phase = 'playing';
      selectedId = null;
      hintedIds = null;

      for (const id of [last.idA, last.idB]) {
        const v = visuals.get(id);
        if (v) {
          v.clearing = false;
          v.clearProgress = 0;
          v.group.visible = true;
          v.group.scale.setScalar(1);
          v.group.position.copy(v.basePos);
          v.spawnDelay = 0;
          v.spawnProgress = 0.2;
          v.hitMesh.visible = true;
        }
      }

      audio.playUndo();
      refreshFreeStates();
      syncHud();
      setStatus('Undid last match', 1.5);
    }

    function hint() {
      if (!currentBoard || phase !== 'playing') return;
      const moves = findValidMoves(currentBoard.tiles);
      if (moves.length === 0) {
        checkEndConditions();
        return;
      }
      // Prefer a pair involving the currently selected tile if one exists
      const chosen =
        (selectedId !== null
          ? moves.find(([a, b]) => a.id === selectedId || b.id === selectedId)
          : undefined) ?? moves[0];

      hintedIds = [chosen[0].id, chosen[1].id];
      hintsUsed++;
      audio.playHint();
      const design = TILE_DESIGN_MAP.get(chosen[0].designId);
      setStatus(
        design?.isBonus
          ? `Hint: match ${SUIT_STYLES[design.suit].label} bonus pair`
          : `Hint: match ${design?.name ?? 'pair'}`,
        2.6,
      );
      syncHud();
    }

    function reshuffle() {
      if (!currentBoard || phase === 'won') return;
      const { tiles: nextTiles, flattened } = reshuffleRemaining(currentBoard.tiles);
      currentBoard.tiles = nextTiles;
      reshufflesUsed++;
      phase = 'playing';
      selectedId = null;
      hintedIds = null;
      undoStack = []; // Reshuffle starts a clean post-shuffle history

      // Settled boards need fresh bounds (and top layer) before re-shading tiles
      if (flattened) {
        computeBoardBounds(getActiveTiles(currentBoard.tiles));
        updateCameraFrustum();
      }

      // Update tile visuals with fresh faces & gentle hop animation
      for (const tile of currentBoard.tiles) {
        const v = visuals.get(tile.id);
        if (!v) continue;
        v.tile = tile;
        if (tile.removed) continue;

        const nextPos = tileWorldPos(tile);
        v.basePos.copy(nextPos);
        v.group.position.copy(nextPos);
        applyLayerShade(v);
        v.spawnDelay = Math.random() * 0.14;
        v.spawnProgress = 0;
      }

      audio.playReshuffle();
      refreshFreeStates();
      syncHud();
      setStatus(
        flattened
          ? 'Reshuffled & settled onto meadow (solvable)'
          : 'Remaining tiles reshuffled (100% solvable)',
        2.6,
      );
    }

    // -------------------------------------------------------------------------
    // Pointer, Touch Pinch-Zoom, Pan & Raycasting
    // -------------------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function pickTileAt(clientX: number, clientY: number): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const activeHits = hitMeshes.filter((m) => {
        const id = m.userData.tileId as number;
        const v = visuals.get(id);
        return Boolean(v && !v.tile.removed && !v.clearing);
      });
      const hits = raycaster.intersectObjects(activeHits, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.tileId as number;
    }

    const activePointers = new Map<number, { x: number; y: number }>();
    let downX = 0;
    let downY = 0;
    let dragged = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let lastPanX = 0;
    let lastPanY = 0;

    function screenDeltaToWorldPan(dxPx: number, dyPx: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const worldPerPxX = (fitHalfW * 2) / zoom / rect.width;
      const worldPerPxY = (fitHalfH * 2) / zoom / rect.height;
      targetPan.x -= dxPx * worldPerPxX;
      targetPan.y -= dyPx * worldPerPxY;
      clampPan(targetPan, targetZoom);
    }

    renderer.domElement.addEventListener(
      'pointerdown',
      (e) => {
        audio.unlock();
        renderer.domElement.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 1) {
          downX = e.clientX;
          downY = e.clientY;
          lastPanX = e.clientX;
          lastPanY = e.clientY;
          dragged = false;
        } else if (activePointers.size === 2) {
          dragged = true;
          const pts = Array.from(activePointers.values());
          pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          pinchStartZoom = targetZoom;
          lastPanX = (pts[0].x + pts[1].x) / 2;
          lastPanY = (pts[0].y + pts[1].y) / 2;
        }
      },
      { signal },
    );

    renderer.domElement.addEventListener(
      'pointermove',
      (e) => {
        if (activePointers.has(e.pointerId)) {
          activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          if (activePointers.size === 2) {
            const pts = Array.from(activePointers.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            if (pinchStartDist > 10) setTargetZoom(pinchStartZoom * (dist / pinchStartDist));
            screenDeltaToWorldPan(midX - lastPanX, midY - lastPanY);
            lastPanX = midX;
            lastPanY = midY;
            return;
          }

          if (activePointers.size === 1) {
            const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
            if (moveDist > 9 && targetZoom > 1.04) {
              dragged = true;
              screenDeltaToWorldPan(e.clientX - lastPanX, e.clientY - lastPanY);
              lastPanX = e.clientX;
              lastPanY = e.clientY;
            } else if (moveDist > 14) {
              dragged = true;
            }
          }
          return;
        }

        // Desktop hover highlight
        if (e.pointerType === 'mouse' && phase === 'playing') {
          hoveredId = pickTileAt(e.clientX, e.clientY);
          renderer.domElement.style.cursor = hoveredId !== null ? 'pointer' : 'default';
        }
      },
      { signal },
    );

    function finishPointer(e: PointerEvent) {
      const wasSingle = activePointers.size === 1;
      activePointers.delete(e.pointerId);
      if (wasSingle && !dragged && e.button !== 2) {
        const hit = pickTileAt(e.clientX, e.clientY);
        if (hit !== null) {
          handleTileTap(hit);
        } else if (selectedId !== null) {
          deselect();
        }
      }
      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        lastPanX = remaining.x;
        lastPanY = remaining.y;
      }
    }

    renderer.domElement.addEventListener('pointerup', finishPointer, { signal });
    renderer.domElement.addEventListener(
      'pointercancel',
      (e) => {
        activePointers.delete(e.pointerId);
      },
      { signal },
    );

    renderer.domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        setTargetZoom(targetZoom * factor);
      },
      { passive: false, signal },
    );

    // Keyboard shortcuts
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
        const k = e.key.toLowerCase();
        if (k === 'm') {
          toggleMute();
        } else if (k === 'h') {
          hint();
        } else if (k === 'z' || k === 'u') {
          undo();
        } else if (k === 'f') {
          toggleHighlightFree();
        } else if (k === 'escape' && selectedId !== null) {
          deselect();
        }
      },
      { signal },
    );

    const resizeObserver = new ResizeObserver(() => updateCameraFrustum());
    resizeObserver.observe(viewport);
    cleanups.push(() => resizeObserver.disconnect());

    document.addEventListener(
      'visibilitychange',
      () => {
        audio.setHidden(document.hidden);
      },
      { signal },
    );

    // -------------------------------------------------------------------------
    // Animation Loop
    // -------------------------------------------------------------------------
    const clock = new THREE.Clock();
    let lastTimerReported = -1;
    let rafId = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      clockTime += dt;

      if (timerRunning && phase === 'playing') {
        elapsedSec += dt;
        const whole = Math.floor(elapsedSec);
        if (whole !== lastTimerReported) {
          lastTimerReported = whole;
          onState({ elapsedSec: whole });
        }
      }

      if (statusText && clockTime > statusUntil) {
        statusText = '';
        onState({ status: '' });
      }

      // Smooth camera zoom & pan interpolation
      const camLerp = 1 - Math.exp(-dt * 12);
      const prevZoom = zoom;
      zoom = THREE.MathUtils.lerp(zoom, targetZoom, camLerp);
      pan.lerp(targetPan, camLerp);
      if (Math.abs(zoom - targetZoom) > 0.0005 || Math.abs(zoom - prevZoom) > 0.0005 || pan.distanceTo(targetPan) > 0.0005) {
        applyCameraTransform();
      }

      // Active free set for hover lift
      const active = currentBoard ? getActiveTiles(currentBoard.tiles) : [];

      for (const v of visuals.values()) {
        if (v.clearing) {
          v.clearProgress = Math.min(1, v.clearProgress + dt / 0.26);
          const ease = 1 - Math.pow(1 - v.clearProgress, 3);
          v.group.position
            .copy(v.basePos)
            .addScaledVector(v.clearTargetOffset, ease);
          v.group.position.y += Math.sin(v.clearProgress * Math.PI) * 0.42;
          const sc = Math.max(0.001, 1 - ease * 0.92);
          v.group.scale.setScalar(sc);
          v.rimMat.opacity = (1 - ease) * 0.85;
          v.rimMat.color.setHex(0x9eb09a);
          if (v.clearProgress >= 1) {
            v.clearing = false;
            v.group.visible = false;
          }
          continue;
        }

        if (v.tile.removed) continue;

        // Deal / reshuffle cascade entrance
        let dropY = 0;
        if (v.spawnProgress < 1) {
          if (v.spawnDelay > 0) {
            v.spawnDelay -= dt;
            dropY = 0.65;
            v.group.scale.setScalar(0.86);
          } else {
            v.spawnProgress = Math.min(1, v.spawnProgress + dt / 0.24);
            const ease = 1 - Math.pow(1 - v.spawnProgress, 3);
            dropY = (1 - ease) * 0.65;
            v.group.scale.setScalar(0.86 + ease * 0.14);
          }
        }

        const isSelected = selectedId === v.tile.id;
        const isHinted = hintedIds !== null && (hintedIds[0] === v.tile.id || hintedIds[1] === v.tile.id);
        const isHovered = hoveredId === v.tile.id && isSlotFree(v.tile, active);

        v.selectAmount = THREE.MathUtils.lerp(v.selectAmount, isSelected ? 1 : 0, 1 - Math.exp(-dt * 16));
        v.hoverAmount = THREE.MathUtils.lerp(v.hoverAmount, isHovered && !isSelected ? 1 : 0, 1 - Math.exp(-dt * 16));

        let shakeX = 0;
        if (v.shakeTimer > 0) {
          v.shakeTimer = Math.max(0, v.shakeTimer - dt);
          shakeX = Math.sin(v.shakeTimer * 48) * 0.08 * (v.shakeTimer / 0.28);
        }
        if (v.errorFlash > 0) {
          v.errorFlash = Math.max(0, v.errorFlash - dt * 3.4);
        }

        const hintBob = isHinted ? (Math.sin(clockTime * 5.2) * 0.5 + 0.5) * 0.13 : 0;
        const liftY = v.selectAmount * 0.18 + v.hoverAmount * 0.06 + hintBob + dropY;

        v.group.position.set(v.basePos.x + shakeX, v.basePos.y + liftY, v.basePos.z);

        // Rim glow priority: error flash > selected > hinted > hover
        if (v.errorFlash > 0.02) {
          v.rimMat.color.setHex(0xc96c5b);
          v.rimMat.opacity = v.errorFlash * 0.85;
        } else if (isSelected) {
          v.rimMat.color.setHex(0xe8bd5b);
          v.rimMat.opacity = 0.85 + Math.sin(clockTime * 6) * 0.15;
        } else if (isHinted) {
          v.rimMat.color.setHex(0x9eb09a);
          v.rimMat.opacity = 0.5 + (Math.sin(clockTime * 5.2) * 0.5 + 0.5) * 0.5;
        } else if (v.hoverAmount > 0.05) {
          v.rimMat.color.setHex(0xd5d7cf);
          v.rimMat.opacity = v.hoverAmount * 0.55;
        } else {
          v.rimMat.opacity = 0;
        }
      }

      // Update sparkle burst particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          effectsGroup.remove(p.mesh);
          particles.splice(i, 1);
          continue;
        }
        p.velocity.y -= 7.2 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        const t = p.life / p.maxLife;
        p.mesh.scale.setScalar(Math.max(0.001, t * 0.14));
      }

      renderer.render(scene, camera);
    }

    function toggleMute() {
      const next = audio.setMuted(!audio.isMuted());
      if (!next) audio.playUiClick(true);
      syncHud();
    }

    function toggleHighlightFree() {
      highlightFree = !highlightFree;
      audio.playUiClick(highlightFree);
      refreshFreeStates();
      syncHud();
      setStatus(highlightFree ? 'Highlighting free tiles' : 'Full pasture shading', 1.6);
    }

    function resetView() {
      targetPan.set(0, 0);
      setTargetZoom(1);
      audio.playUiClick(false);
    }

    // Boot initial Medium board
    loadBoard('medium', randomSeed(), 'Match identical free tiles to clear the pasture');
    rafId = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(rafId));

    function deal(difficulty: Difficulty, seed: number, announce?: string) {
      audio.playUiClick(true);
      loadBoard(difficulty, seed, announce);
    }

    return {
      setDifficulty: (diff) => deal(diff, randomSeed()),
      newBoard() {
        if (currentBoard) deal(currentBoard.difficulty, randomSeed());
      },
      retryBoard() {
        if (currentBoard) deal(currentBoard.difficulty, currentBoard.seed, `Retrying ${currentBoard.layoutName}`);
      },
      reshuffle,
      undo,
      hint,
      toggleMute,
      toggleHighlightFree,
      resetView,
      previews: atlas.previews,
      destroy: runCleanups,
    };
  } catch (err) {
    runCleanups();
    throw err;
  }
}
