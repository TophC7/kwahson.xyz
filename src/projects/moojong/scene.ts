import * as THREE from 'three';
import { createBoardCamera, type Insets } from '../../lib/boardCamera';
import { createBursts } from '../../lib/bursts';
import { buildPastureTable } from '../../lib/pastureTable';
import { randomSeed } from '../../lib/rng';
import {
  createPastureKit,
  PASTURE_HEMI_GROUND,
  PASTURE_HEMI_SKY,
  PASTURE_SUN_COLOR,
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
  refit(): void;
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
  const hole = createRoundedRectShape(TILE_W * 0.89, TILE_D * 0.89, 0.07);
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
  insets,
  onState,
}: {
  viewport: HTMLElement;
  insets: (width: number, height: number) => Insets;
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
    const bursts = createBursts(kit, effectsGroup);

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

    let boardBounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5, maxY: 2 };
    let topLayer = 0;
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

    function isPortrait() {
      return viewport.clientWidth < viewport.clientHeight;
    }

    function loadBoard(difficulty: Difficulty, seed: number, announce?: string, portrait = isPortrait()) {
      currentBoard = generateBoard(difficulty, seed, portrait);
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

      computeBoardBounds(currentBoard.tiles);
      buildPastureTable(kit, tableGroup, {
        spanX: boardBounds.maxX - boardBounds.minX + (portrait ? 0.55 : 2.2),
        spanZ: boardBounds.maxZ - boardBounds.minZ + (portrait ? 0.6 : 2.0),
        cx: (boardBounds.minX + boardBounds.maxX) / 2,
        cz: (boardBounds.minZ + boardBounds.maxZ) / 2,
        checker: true,
      });

      for (const tile of currentBoard.tiles) {
        const delay = tile.gz * 0.045 + ((tile.gx + tile.gy + 20) % 7) * 0.012;
        visuals.set(tile.id, createTileVisual(tile, delay));
      }

      refreshFreeStates();
      cam.snapHome();
      cam.setBounds(boardBounds, viewCenterY);
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
          bursts.spawn(p, i % 2 === 0 ? 0xffefaf : 0x9eb09a, 12);
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
          bursts.spawn(v.basePos, burstColor, 8);
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
      const { tiles: nextTiles, flattened } = reshuffleRemaining(currentBoard.tiles, currentBoard.portrait);
      currentBoard.tiles = nextTiles;
      reshufflesUsed++;
      phase = 'playing';
      selectedId = null;
      hintedIds = null;
      undoStack = []; // Reshuffle starts a clean post-shuffle history

      // Settled boards need fresh bounds (and top layer) before re-shading tiles
      if (flattened) {
        computeBoardBounds(getActiveTiles(currentBoard.tiles));
        cam.setBounds(boardBounds, viewCenterY);
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

    const raycaster = new THREE.Raycaster();

    function pickTileAt(clientX: number, clientY: number): number | null {
      if (!cam.setRay(raycaster, clientX, clientY)) return null;
      const activeHits = hitMeshes.filter((m) => {
        const id = m.userData.tileId as number;
        const v = visuals.get(id);
        return Boolean(v && !v.tile.removed && !v.clearing);
      });
      const hits = raycaster.intersectObjects(activeHits, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.tileId as number;
    }

    const cam = createBoardCamera({
      viewport,
      renderer,
      offset: CAM_OFFSET,
      pad: {
        get x() { return isPortrait() ? 0.12 : 1.35; },
        get z() { return isPortrait() ? 0.15 : 1.25; },
      },
      maxZoom: MAX_ZOOM,
      insets,
      signal,
      onPress: () => audio.unlock(),
      onTap: (x, y) => {
        const hit = pickTileAt(x, y);
        if (hit !== null) handleTileTap(hit);
        else if (selectedId !== null) deselect();
      },
      onHover: (x, y, e) => {
        if (e.pointerType === 'mouse' && phase === 'playing') {
          hoveredId = pickTileAt(x, y);
          renderer.domElement.style.cursor = hoveredId !== null ? 'pointer' : 'default';
        }
      },
      onZoomedChange: (zoomed) => onState({ zoomed }),
    });

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

      cam.update(dt);

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
          // Bright cyan: reads against the green felt, ivory tiles, and the gold selection rim.
          v.rimMat.color.setHex(0x4fe0ff);
          v.rimMat.opacity = 0.75 + (Math.sin(clockTime * 5.2) * 0.5 + 0.5) * 0.25;
        } else if (v.hoverAmount > 0.05) {
          v.rimMat.color.setHex(0xd5d7cf);
          v.rimMat.opacity = v.hoverAmount * 0.55;
        } else {
          v.rimMat.opacity = 0;
        }
      }

      bursts.update(dt);

      renderer.render(scene, cam.camera);
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
      cam.resetView();
      audio.playUiClick(false);
    }

    // Boot initial Medium board
    loadBoard('medium', randomSeed(), 'Match identical free tiles to clear the pasture');
    rafId = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(rafId));

    function deal(difficulty: Difficulty, seed: number, announce?: string, portrait = isPortrait()) {
      audio.playUiClick(true);
      loadBoard(difficulty, seed, announce, portrait);
    }

    return {
      setDifficulty: (diff) => deal(diff, randomSeed()),
      newBoard() {
        if (currentBoard) deal(currentBoard.difficulty, randomSeed());
      },
      retryBoard() {
        if (currentBoard) deal(currentBoard.difficulty, currentBoard.seed, `Retrying ${currentBoard.layoutName}`, currentBoard.portrait);
      },
      reshuffle,
      undo,
      hint,
      toggleMute,
      toggleHighlightFree,
      resetView,
      refit: cam.refit,
      previews: atlas.previews,
      destroy: runCleanups,
    };
  } catch (err) {
    runCleanups();
    throw err;
  }
}
