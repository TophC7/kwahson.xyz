import * as THREE from 'three';
import { createBoardCamera, type Insets } from '../../lib/boardCamera';
import { createBursts } from '../../lib/bursts';
import { createStudioBuilder, createStudioStage, frameModel } from '../../lib/miniatures';
import { createPastureKit, PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, PASTURE_SUN_COLOR } from '../../lib/pastureKit';
import { buildPastureTable } from '../../lib/pastureTable';
import { randomSeed } from '../../lib/rng';
import { createTacticsAudio } from './audio';
import { COLS, ROWS, CROP_COUNT, HEROES, ENEMIES, ITEMS, PROPS, type Difficulty, type HeroKind, type ItemKind } from './data';
import { buildTacticsModel, GALLERY_ITEMS } from './models';
import { createPlayback, type EntityVisual } from './playback';
import { apply, danger, enemyReach, itemTargets, maxHp, moveTargets, skillTargets, stars, teamOf, tileAt, type Action, type Entity, type GameState, type Tile } from './rules';
import { decodeSave, encodeSave, readStoredCode, storeCode } from './save';
import { createGame } from './scenario';

export interface HeroHud {
  id: number; kind: HeroKind; name: string; hp: number; maxHp: number; shield: boolean;
  canMove: boolean; canAct: boolean; alive: boolean;
}
export interface ItemHud { kind: ItemKind; name: string; charges: number; power: number; usable: boolean }
export interface SelectedHud {
  id: number; team: 'herd' | 'sky' | 'neutral'; isHero: boolean; name: string; hp: number | null;
  maxHp: number | null; move: number | null; abilityName: string; abilityDesc: string; canMove: boolean; canSkill: boolean;
}
export interface TacticsHudState {
  seed: number; difficulty: Difficulty; objective: 'hold' | 'rout'; turn: number; power: number;
  phase: 'player' | 'enemy' | 'won' | 'lost'; busy: boolean; fastForward: boolean; canUndo: boolean; muted: boolean; zoomed: boolean;
  status: string; heroes: HeroHud[]; items: ItemHud[]; selected: SelectedHud | null;
  mode: 'idle' | 'move' | 'skill' | 'item'; pendingItem: ItemKind | null; preview: string[] | null;
  idleHeroes: number; incoming: number; enemiesLeft: number; crops: number; cropsTotal: number;
  danger: boolean; stars: 0 | 1 | 2 | 3;
}
export interface TacticsController {
  select(id: number | null): void;
  /** Arms the hero's skill or an item; calling it again for the armed one returns to moving. */
  chooseSkill(): void; chooseItem(kind: ItemKind): void; wait(): void;
  confirm(): void; cancel(): void; undo(): void; endTurn(): void;
  newFight(difficulty: Difficulty, seed?: number): void; retry(): void;
  toggleMute(): void; toggleDanger(): void; resetView(): void; refit(): void;
  readonly portraits: Record<string, string>;
  destroy(): void;
}

const TILE = 1.4, GROUND = 0.09;
const INFO = { ...HEROES, ...ENEMIES, ...PROPS };
const key = (p: Tile) => p.y * COLS + p.x;
const tileCenter = (x: number, y: number) => new THREE.Vector3((x - (COLS - 1) / 2) * TILE, GROUND, (y - (ROWS - 1) / 2) * TILE);
const DANGER_KEY = 'pasture-tactics-danger';
const hero = (e: Entity): e is Entity & { kind: HeroKind } => Object.hasOwn(HEROES, e.kind);
// Three-quarter view: camera swung `yaw` around the board and CAM_PITCH above the ground. Portrait screens
// face the board square-on, because the swing widens the 8-column grid past a phone's width.
const CAM_PITCH = 0.76, CAM_DIST = 24;
function cameraFor(width: number, height: number) {
  const camYaw = width < height ? 0 : 0.35;
  const offset = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(CAM_PITCH) * CAM_DIST,
    Math.sin(CAM_PITCH) * CAM_DIST,
    Math.cos(camYaw) * Math.cos(CAM_PITCH) * CAM_DIST,
  );
  // Resting pieces face the camera, angled slightly toward their last move.
  return { offset, yaw: (dir: number) => camYaw + (dir === 1 ? 0.5 : dir === 3 ? -0.5 : 0) };
}
const hashCode = () => new URLSearchParams(location.hash.slice(1)).get('g');

function canvasSprite(width: number, height: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 5;
  return sprite;
}
// HP bar canvas in CSS pixels (drawn at 2× for crisp edges); flat fills, no shadows or bevels.
const BAR_W = 256, BAR_H = 64;
const BAR_FILL = { herd: '#9cc97f', sky: '#e0604c', neutral: '#c2b089' } as const;
const BONUS_FILL = '#f2d77e';
function removeSprite(sprite: THREE.Sprite) {
  sprite.removeFromParent();
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

export function mountPastureTactics({ viewport, onState, insets }: {
  viewport: HTMLElement; onState: (patch: Partial<TacticsHudState>) => void; insets: () => Insets;
}): TacticsController {
  const cleanups: (() => void)[] = [];
  const abort = new AbortController(), { signal } = abort;
  function destroy() {
    if (signal.aborted) return;
    abort.abort();
    for (const fn of cleanups.reverse()) fn();
    cleanups.length = 0;
  }
  try {
    // ponytail: yaw is fixed at mount; rotating the device keeps it until reload.
    const { offset: camOffset, yaw } = cameraFor(viewport.clientWidth, viewport.clientHeight);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewport.appendChild(renderer.domElement);
    cleanups.push(() => { renderer.dispose(); renderer.domElement.remove(); });
    const kit = createPastureKit(), studio = createStudioBuilder(kit), audio = createTacticsAudio();
    cleanups.push(kit.dispose, studio.dispose, audio.destroy);
    const scene = new THREE.Scene(), table = new THREE.Group(), pieces = new THREE.Group(), effects = new THREE.Group();
    scene.add(table, pieces, effects, new THREE.HemisphereLight(PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, 2.05));
    const sun = new THREE.DirectionalLight(PASTURE_SUN_COLOR, 2.4);
    sun.position.set(-9, 22, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { near: 2, far: 48, left: -12, right: 12, top: 12, bottom: -12 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025;
    const fill = new THREE.DirectionalLight(0xd8e8d6, 0.55);
    fill.position.set(10, 12, -8);
    scene.add(sun, fill);
    cleanups.push(() => sun.shadow.dispose());
    buildPastureTable(kit, table, { cx: 0, cz: 0, spanX: COLS * TILE + 3.2, spanZ: ROWS * TILE + 1.2, checker: false });
    const templates = new Map<string, THREE.Group>();
    function modelFor(id: string) {
      let template = templates.get(id);
      if (!template) { template = buildTacticsModel(studio, id); templates.set(id, template); }
      return template.clone();
    }
    function sizedModel(id: string, width: number, maxHeight = Infinity) {
      const child = modelFor(id);
      child.rotation.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(child), size = box.getSize(new THREE.Vector3());
      const scale = Math.min(width / Math.max(size.x, size.z), maxHeight / size.y);
      child.position.sub(new THREE.Vector3((box.max.x + box.min.x) / 2, box.min.y, (box.max.z + box.min.z) / 2));
      child.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = true; });
      const model = new THREE.Group(); model.add(child); model.scale.setScalar(scale);
      return { model, scale, height: size.y * scale };
    }
    const margin = COLS / 2 + 0.8, halfDepth = ROWS / 2;
    for (const [id, x, z] of [['windmill', -margin, 1 - halfDepth], ['well', margin, halfDepth - 1.5], ['season-autumn', margin, 1.5 - halfDepth], ['season-spring', -margin, halfDepth - 2]] as const) {
      const { model } = sizedModel(id, 1.2);
      model.position.set(x * TILE, GROUND, z * TILE); table.add(model);
    }
    const planeGeo = studio.track(new THREE.PlaneGeometry(TILE - 0.06, TILE - 0.06).rotateX(-Math.PI / 2));
    const radius = (TILE - 0.08) / Math.sqrt(2);
    const frameGeo = studio.track(new THREE.RingGeometry(radius - 0.07, radius, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2));
    const ringGeo = studio.track(new THREE.RingGeometry(0.41, 0.47, 32).rotateX(-Math.PI / 2));
    function overlayMat(color: number, opacity: number) {
      const m = new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false });
      cleanups.push(() => m.dispose()); return m;
    }
    const frameMat = overlayMat(0xd9614f, 0.85), ringMat = overlayMat(0x5eaea4, 0.85);
    // Red tints over green grass muddy to brown, so threat reads as hazard stripes instead of a colour wash.
    const stripes = document.createElement('canvas'); stripes.width = stripes.height = 64;
    const sctx = stripes.getContext('2d')!; sctx.strokeStyle = '#ff4a3a'; sctx.lineWidth = 9;
    for (let s = -64; s <= 128; s += 21) { sctx.beginPath(); sctx.moveTo(s, 64); sctx.lineTo(s + 64, 0); sctx.stroke(); }
    const hatchMap = new THREE.CanvasTexture(stripes); hatchMap.colorSpace = THREE.SRGBColorSpace;
    cleanups.push(() => hatchMap.dispose());
    const overlays = Array.from({ length: COLS * ROWS }, (_, i) => {
      const x = i % COLS, y = Math.floor(i / COLS), pos = tileCenter(x, y);
      kit.part(table, 'box', (x + y) % 2 ? 0x85b45c : 0x8dbd62, [TILE - 0.05, 0.02, TILE - 0.05], [pos.x, 0.085, pos.z]).receiveShadow = true;
      const fill = new THREE.Mesh(planeGeo, overlayMat(0xffffff, 0));
      const hatchMat = overlayMat(0xffffff, 0); hatchMat.map = hatchMap;
      const hatch = new THREE.Mesh(planeGeo, hatchMat);
      const frame = new THREE.Mesh(frameGeo, frameMat), ring = new THREE.Mesh(ringGeo, ringMat);
      for (const mesh of [fill, hatch, frame, ring]) { mesh.visible = false; mesh.position.copy(pos); table.add(mesh); }
      fill.position.y += 0.02; hatch.position.y += 0.025; frame.position.y += 0.03; ring.position.y += 0.035;
      hatch.renderOrder = 1; frame.renderOrder = 2; ring.renderOrder = 3;
      return { fill, hatch, frame, ring };
    });
    const hitGeo = studio.track(new THREE.BoxGeometry(1, 1, 1)), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    // Faceted low-poly shell, unit radius; each visual scales it to hug its model.
    const bubbleGeo = studio.track(new THREE.IcosahedronGeometry(1, 1));
    cleanups.push(() => hitMat.dispose());
    const visuals = new Map<number, EntityVisual>(), visualEntities = new Map<number, Entity>();
    const hits: THREE.Mesh[] = [], eggs = new Map<number, THREE.Group>();
    const floats: { sprite: THREE.Sprite; life: number }[] = [];
    const bursts = createBursts(kit, effects);
    let threatState: GameState | null = null, threats: number[] = [];
    function setEgg(x: number, y: number, on: boolean) {
      const i = y * COLS + x, old = eggs.get(i);
      if (!on) { old?.removeFromParent(); eggs.delete(i); }
      else if (!old) {
        const { model } = sizedModel('egg', 0.5 * TILE);
        model.position.copy(tileCenter(x, y)); pieces.add(model); eggs.set(i, model);
      }
    }
    function redrawPips(id: number, hp: number) {
      const v = visuals.get(id), e = visualEntities.get(id);
      if (!v || !e) return;
      const n = maxHp(e), team = teamOf(e), risk = team === 'herd' ? threats[key(e)] ?? 0 : 0;
      const ko = hp > 0 && risk >= hp;
      v.pips.visible = n !== null && (hero(e) || team === 'sky' || e.kind === 'barn' || e.kind === 'crop' || hp !== n || risk > 0 || e.shield);
      if (!v.pips.visible || !n) return;
      // Bonus HP from Mend shows as extra gold pips past max.
      const total = Math.max(n, hp);
      const texture = v.pips.material.map!, ctx = (texture.image as HTMLCanvasElement).getContext('2d')!;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, BAR_W, BAR_H);
      const seg = 18, gap = 3, barW = total * seg + (total - 1) * gap, shieldW = e.shield ? 20 : 0, koW = ko ? 28 : 0;
      const plateW = barW + shieldW + koW + 12, cy = BAR_H / 2;
      let x = (BAR_W - plateW) / 2;
      ctx.fillStyle = 'rgba(21,24,20,0.88)'; ctx.beginPath(); ctx.roundRect(x, cy - 12, plateW, 24, 7); ctx.fill();
      x += 6;
      if (e.shield) {
        // Small heater shield glyph.
        ctx.fillStyle = '#cfe9f2'; ctx.beginPath();
        ctx.moveTo(x + 8, cy - 8); ctx.lineTo(x + 15, cy - 5.5); ctx.quadraticCurveTo(x + 15, cy + 5, x + 8, cy + 8.5);
        ctx.quadraticCurveTo(x + 1, cy + 5, x + 1, cy - 5.5); ctx.closePath(); ctx.fill();
        x += shieldW;
      }
      const lost = Math.min(hp, risk);
      for (let p = 0; p < total; p++) {
        const sx = x + p * (seg + gap), sy = cy - 6;
        ctx.save(); ctx.beginPath(); ctx.roundRect(sx, sy, seg, 12, 3); ctx.clip();
        if (p < hp - lost) {
          ctx.fillStyle = p < n ? BAR_FILL[team] : BONUS_FILL; ctx.fillRect(sx, sy, seg, 12);
        } else if (p < hp) {
          ctx.fillStyle = '#5c2620'; ctx.fillRect(sx, sy, seg, 12);
          ctx.strokeStyle = '#ff8a73'; ctx.lineWidth = 3;
          for (let s = -12; s < seg; s += 7) { ctx.beginPath(); ctx.moveTo(sx + s, sy + 12); ctx.lineTo(sx + s + 12, sy); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#2c302a'; ctx.fillRect(sx, sy, seg, 12);
        }
        ctx.restore();
      }
      if (ko) {
        const kx = x + barW + 5;
        ctx.fillStyle = '#d9614f'; ctx.beginPath(); ctx.roundRect(kx, cy - 8, 22, 16, 4); ctx.fill();
        ctx.fillStyle = '#fff4ef'; ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('KO', kx + 11, cy + 1);
      }
      v.pips.material.opacity = hero(e) && e.moved && e.acted ? 0.5 : 1;
      texture.needsUpdate = true;
    }
    // Creates the shield shell on first use and snaps it back to its resting size and look.
    function bubbleFor(v: EntityVisual) {
      if (!v.bubble) {
        v.bubble = new THREE.Mesh(bubbleGeo, new THREE.MeshStandardMaterial({
          color: 0xcfe9f2, emissive: 0x6fb3d9, emissiveIntensity: 0.35, roughness: 0.25, flatShading: true,
          transparent: true, depthWrite: false,
        }));
        v.holder.add(v.bubble);
      }
      const radius = 0.44 * TILE;
      v.bubble.scale.set(radius, Math.max(radius, v.hit.scale.y * 0.62), radius);
      v.bubble.position.y = v.hit.position.y; v.bubble.visible = true;
      (v.bubble.material as THREE.MeshStandardMaterial).opacity = 0.24;
      return v.bubble;
    }
    function clearBubble(v: EntityVisual) {
      if (!v.bubble) return;
      v.bubble.removeFromParent(); (v.bubble.material as THREE.Material).dispose(); v.bubble = null;
    }
    function addEntity(e: Entity): EntityVisual {
      const info = INFO[e.kind];
      // Units fit their largest dimension so tall models can't outgrow wide ones; props fit their footprint.
      const { model, scale: baseScale, height } = 'size' in info
        ? sizedModel(info.model, TILE * info.size, TILE * info.size)
        : sizedModel(info.model, TILE * (e.kind === 'barn' ? 0.95 : e.kind === 'crop' ? 0.6 : 0.86), (e.kind === 'crop' ? 0.75 : 1.25) * TILE);
      const holder = new THREE.Group(), pips = canvasSprite(BAR_W * 2, BAR_H * 2), hit = new THREE.Mesh(hitGeo, hitMat);
      const hover = e.kind === 'bee' ? 0.35 : e.kind === 'saucer' ? 0.8 : 0;
      model.position.y = hover; pips.position.y = hover + height + 0.16; pips.scale.set(2.2, 2.2 * BAR_H / BAR_W, 1);
      hit.scale.set(0.8 * TILE, height, 0.8 * TILE); hit.position.y = hover + height / 2; hit.userData.id = e.id; hits.push(hit);
      holder.add(model, pips, hit); holder.position.copy(tileCenter(e.x, e.y)); holder.rotation.y = yaw(e.dir); pieces.add(holder);
      const v: EntityVisual = { kind: e.kind, holder, model, baseScale, hover, pips, hit, bubble: null };
      visuals.set(e.id, v); visualEntities.set(e.id, e);
      if (e.shield) bubbleFor(v);
      redrawPips(e.id, e.hp);
      return v;
    }
    function removeEntity(id: number) {
      const v = visuals.get(id); if (!v) return;
      hits.splice(hits.indexOf(v.hit), 1); removeSprite(v.pips); clearBubble(v); v.holder.removeFromParent();
      visuals.delete(id); visualEntities.delete(id);
    }
    function syncVisuals(s: GameState) {
      for (const [id, v] of visuals) if (!s.entities.some(e => e.id === id && e.kind === v.kind)) removeEntity(id);
      for (const e of s.entities) {
        const v = visuals.get(e.id) ?? addEntity(e);
        visualEntities.set(e.id, e); v.holder.position.copy(tileCenter(e.x, e.y)); v.holder.rotation.set(0, yaw(e.dir), 0); v.holder.scale.setScalar(1);
        v.model.position.set(0, v.hover, 0); v.model.rotation.set(0, 0, 0); v.model.scale.setScalar(v.baseScale); v.model.visible = true;
        if (e.shield) bubbleFor(v);
        else clearBubble(v);
      }
      for (const i of eggs.keys()) if (!s.traps.some(t => key(t) === i)) setEgg(i % COLS, Math.floor(i / COLS), false);
      for (const p of s.traps) setEgg(p.x, p.y, true);
    }
    function floatText(pos: THREE.Vector3, text: string, color: string) {
      const sprite = canvasSprite(160, 64), ctx = (sprite.material.map!.image as HTMLCanvasElement).getContext('2d')!;
      ctx.font = 'bold 42px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6;
      ctx.strokeStyle = '#272e25'; ctx.strokeText(text, 80, 32); ctx.fillStyle = color; ctx.fillText(text, 80, 32);
      sprite.position.copy(pos); sprite.position.y += 0.7; sprite.scale.set(1.6, 0.64, 1); sprite.renderOrder = 6;
      effects.add(sprite); floats.push({ sprite, life: 0.7 });
    }
    function clearFloats() { for (const { sprite } of floats) removeSprite(sprite); floats.length = 0; }
    cleanups.push(() => { for (const id of visuals.keys()) removeEntity(id); clearFloats(); });

    let state: GameState, roster: (Entity & { kind: HeroKind })[] = [], status = '';
    let selectedId: number | null = null, mode: TacticsHudState['mode'] = 'idle', pendingItem: ItemKind | null = null;
    let pending: Extract<Action, { type: 'skill' | 'item' }> | null = null, preview: string[] | null = null;
    const previewTiles = new Set<number>(), undoStack: GameState[] = [];
    let legal: Tile[] = [], hoverTile = -1, zoomed = false, showDanger = false;
    const inspectMove = new Set<number>(), inspectAttack = new Set<number>();
    try { showDanger = localStorage.getItem(DANGER_KEY) === 'true'; } catch { /* Storage is optional. */ }
    let busy = false, enemyPhase = false, hinted = false, generation = 0, code = '';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const playback = createPlayback({ tileCenter, visual: id => visuals.get(id), addEntity, removeEntity, setEgg,
      floatText, redrawPips, effects, kit, bursts, audio, setStatus(text) {
        if (text === "Visitors' turn" && !hinted) { hinted = true; text = 'Hold the screen edge to fast-forward'; }
        setStatus(text);
      },
    }, reduceMotion);
    cleanups.push(() => playback.cancel());
    function setStatus(text: string) { status = text; onState({ status }); }
    function current() { return state.entities.find(e => e.id === selectedId); }
    function ready() { return !busy && state.phase === 'player'; }
    function syncHud() {
      const e = current(), info = e && INFO[e.kind], ability = info && ('skill' in info ? info.skill : 'attack' in info ? info.attack : null);
      const heroes = roster.map(({ id, kind }): HeroHud => {
        const alive = state.entities.find(e => e.id === id), def = HEROES[kind];
        return { id, kind, name: def.name, hp: alive?.hp ?? 0, maxHp: def.hp, shield: !!alive?.shield,
          canMove: !!alive && !alive.moved, canAct: !!alive && !alive.acted, alive: !!alive };
      });
      const selected: SelectedHud | null = e && info ? {
        id: e.id, team: teamOf(e), isHero: hero(e), name: info.name, hp: maxHp(e) === null ? null : e.hp, maxHp: maxHp(e),
        move: 'move' in info ? info.move : null, abilityName: ability?.name ?? (maxHp(e) === null ? 'Obstacle' : 'Cover'),
        abilityDesc: ability?.desc ?? (e.kind === 'barn' ? 'Defend the barn.' : maxHp(e) === null ? 'Cannot be moved or damaged.' : 'Blocks movement and can take damage.'),
        canMove: hero(e) && moveTargets(state, e.id).length > 0, canSkill: hero(e) && skillTargets(state, e.id).length > 0,
      } : null;
      const items = state.items.map(({ kind, charges }) => ({ kind, charges, name: ITEMS[kind].name, power: ITEMS[kind].power,
        usable: !!e && hero(e) && itemTargets(state, e.id, kind).length > 0 }));
      const crops = state.entities.filter(e => e.kind === 'crop').length;
      if (!busy && state.phase === 'lost') status = heroes.some(h => h.alive) ? 'The barn has fallen' : 'The herd is lost';
      if (!busy && state.phase === 'won') status = state.objective === 'hold' ? 'Pasture held' : 'Pasture cleared';
      onState({ seed: state.seed, difficulty: state.difficulty, objective: state.objective, turn: state.turn, power: state.power,
        phase: enemyPhase ? 'enemy' : state.phase, busy, fastForward: playback.timeScale > 1, canUndo: !!undoStack.length,
        muted: audio.isMuted(), danger: showDanger, stars: stars(state), zoomed, status, heroes, items, selected, mode, pendingItem, preview,
        idleHeroes: heroes.filter(h => h.canAct).length, incoming: state.waves.filter(w => w.turn === state.turn).length,
        enemiesLeft: state.entities.filter(e => teamOf(e) === 'sky').length, crops, cropsTotal: CROP_COUNT });
    }
    function paintFills() {
      const selected = current(), selectedTile = selected && key(selected);
      for (let i = 0; i < overlays.length; i++) {
        const { fill, hatch, frame } = overlays[i], risk = threats[i] ?? 0;
        const target = legal.some(p => key(p) === i), moving = target && mode === 'move';
        let color = 0, opacity = 0;
        if (previewTiles.has(i)) { color = 0xffffff; opacity = 0.5; }
        else if (moving) { color = 0x6fb3d9; opacity = 0.38; }
        else if (target) { color = 0xe8bd5b; opacity = 0.45; }
        else if (inspectMove.has(i)) { color = 0xffe1db; opacity = 0.35; }
        else if (i === selectedTile) { color = 0xe8bd5b; opacity = 0.3; }
        else if (i === hoverTile) { color = 0xd5d7cf; opacity = 0.2; }
        fill.visible = !busy && opacity > 0; fill.material.color.setHex(color); fill.material.opacity = opacity;
        // Stripes: an inspected enemy's attack range, else (Danger on) every threatened tile, denser with more damage.
        const stripe = inspectAttack.size ? (inspectAttack.has(i) ? 0.9 : 0) : showDanger && risk > 0 ? 0.35 + 0.2 * Math.min(risk - 1, 2) : 0;
        hatch.visible = !busy && stripe > 0; hatch.material.opacity = stripe;
        frame.visible = !busy && moving && risk > 0;
      }
    }
    function refreshOverlays() {
      const e = current();
      legal = !e || !ready() ? [] : mode === 'move' ? moveTargets(state, e.id) : mode === 'skill' ? skillTargets(state, e.id)
        : mode === 'item' && pendingItem ? itemTargets(state, e.id, pendingItem) : [];
      // Selection and hover don't change the board. Hide predictions during playback
      // rather than showing post-action danger on pieces still in their old positions.
      const board = busy ? null : state;
      if (board !== threatState) {
        threatState = board; threats = board?.phase === 'player' ? danger(board) : [];
        for (const e of visualEntities.values()) redrawPips(e.id, e.hp);
      }
      inspectMove.clear(); inspectAttack.clear();
      if (board?.phase === 'player' && e && teamOf(e) === 'sky') {
        const reach = enemyReach(board, e.id);
        for (const p of reach.move) inspectMove.add(key(p));
        for (const p of reach.attack) inspectAttack.add(key(p));
      }
      paintFills();
      for (const { ring } of overlays) ring.visible = false;
      if (board?.phase === 'player') for (const w of board.waves) if (w.turn === board.turn) overlays[w.x].ring.visible = true;
    }
    function refresh() { refreshOverlays(); syncHud(); }
    function clearPreview() { pending = null; preview = null; previewTiles.clear(); }
    function setMode(next: TacticsHudState['mode'], item: ItemKind | null = null) {
      clearPreview(); mode = next; pendingItem = item;
    }
    // Moving is implicit: a selected hero shows its move tiles unless an action card is armed.
    function disarm(e: Entity) { setMode(moveTargets(state, e.id).length ? 'move' : 'idle'); }
    function focus(id: number | null) {
      selectedId = id;
      const e = current();
      if (e && hero(e) && ready()) {
        setMode(moveTargets(state, e.id).length ? 'move' : skillTargets(state, e.id).length ? 'skill' : 'idle');
      } else setMode('idle');
    }
    function select(id: number | null) {
      if (!ready() || (id !== null && !state.entities.some(e => e.id === id))) return;
      focus(id === selectedId ? null : id); audio.play(selectedId === null ? 'deselect' : 'select');
      status = selectedId === null ? 'Tap a herd animal to give orders' : INFO[current()!.kind].name;
      refresh();
    }
    function invalid(message: string) { audio.play('invalid'); setStatus(message); }
    function choose(next: 'skill' | 'item', item: ItemKind | null = null) {
      if (!ready()) return;
      const e = current(); if (!e || !hero(e)) return invalid('Select a herd animal');
      if (mode === next && pendingItem === item) { disarm(e); audio.play('deselect'); status = INFO[e.kind].name; refresh(); return; }
      if (e.acted) return invalid('Already acted');
      if (item && !state.items.find(i => i.kind === item)?.charges) return invalid('No charges left');
      if (item && state.power < ITEMS[item].power) return invalid('Not enough power');
      if (!(item ? itemTargets(state, e.id, item) : skillTargets(state, e.id)).length) return invalid('No targets in reach');
      setMode(next, item); audio.play('uiClick'); status = 'Choose a target'; refresh();
    }
    function showPreview(action: Extract<Action, { type: 'item' | 'skill' }>) {
      const result = apply(state, action); clearPreview(); pending = action; preview = []; previewTiles.add(key(action));
      const positions = new Map(state.entities.map(e => [e.id, { x: e.x, y: e.y }]));
      const entity = (id: number) => state.entities.find(e => e.id === id)!;
      for (const ev of result.events) {
        const name = 'id' in ev ? INFO[entity(ev.id).kind].name : '';
        switch (ev.t) {
          case 'damage': preview.push(name + ' −' + ev.amount + (ev.hp <= 0 ? ' · KO' : '')); break;
          case 'heal': preview.push(name + ' +' + ev.amount + (ev.hp > maxHp(entity(ev.id))! ? ' · bonus until your turn' : '')); break;
          case 'shield': preview.push(name + ' shielded'); break;
          case 'block': preview.push(name + ' blocks'); break;
          case 'bump': {
            const blocker = ev.blockerId !== null && entity(ev.blockerId);
            preview.push(name + ' hits ' + (blocker ? INFO[blocker.kind].name : 'the edge'));
            if (blocker) previewTiles.add(key(positions.get(blocker.id)!)); break;
          }
          case 'move': {
            for (const p of ev.path) previewTiles.add(key(p));
            if (ev.path.length) positions.set(ev.id, ev.path[ev.path.length - 1]);
            if (ev.style === 'slide') preview.push(name + ' pushed'); break;
          }
          case 'spawn': preview.push('Places ' + INFO[ev.entity.kind].name); previewTiles.add(key(ev.entity)); break;
          case 'egg': if (ev.on) preview.push('Lays an egg'); previewTiles.add(key(ev)); break;
          case 'item':
            if (ev.item === 'apple') preview.push(INFO[tileAt(state, ev.x, ev.y)!.kind].name + ' can move again');
            break;
        }
        if ('id' in ev && ev.t !== 'skill' && ev.t !== 'item') previewTiles.add(key(positions.get(ev.id)!));
      }
      if (!preview.length) preview.push('No damage');
      audio.play('select'); status = 'Confirm the order or choose another target'; refresh();
    }
    function cancel() {
      if (!ready()) return;
      const e = current();
      if (pending) clearPreview(); else if (e && (mode === 'skill' || mode === 'item')) disarm(e); else focus(null);
      audio.play('deselect'); status = selectedId === null ? 'Tap a herd animal to give orders' : INFO[current()!.kind].name; refresh();
    }
    function tap(tile: Tile | null) {
      if (!tile) { cancel(); return; }
      const e = tileAt(state, tile.x, tile.y);
      if (!ready()) {
        if (e && !hero(e)) { selectedId = e.id; setMode('idle'); refresh(); } return;
      }
      // Tapping a skill target straight from move mode (e.g. a wounded friend for Mend) previews the skill.
      const actor = current(), onTile = (p: Tile) => key(p) === key(tile);
      if (mode === 'move' && actor && hero(actor) && !actor.acted && !legal.some(onTile) && skillTargets(state, actor.id).some(onTile)) {
        setMode('skill'); showPreview({ type: 'skill', id: actor.id, ...tile }); return;
      }
      if (selectedId !== null && legal.some(onTile)) {
        if (mode === 'move') void commit({ type: 'move', id: selectedId, ...tile });
        else if (pending && key(pending) === key(tile)) confirm();
        else if (mode === 'skill') showPreview({ type: 'skill', id: selectedId, ...tile });
        else if (mode === 'item' && pendingItem) showPreview({ type: 'item', item: pendingItem, id: selectedId, ...tile });
      } else if (pending) cancel();
      else if (e) select(e.id);
      else cancel();
    }
    function save() {
      code = encodeSave(state); storeCode(code);
      history.replaceState(history.state, '', location.pathname + location.search + '#g=' + code);
    }
    let fastTimer: number | undefined;
    function releaseFast() {
      window.clearTimeout(fastTimer); fastTimer = undefined;
      if (playback.timeScale !== 1) { playback.timeScale = 1; onState({ fastForward: false }); }
    }
    function armFast() {
      if (!busy || fastTimer !== undefined) return;
      fastTimer = window.setTimeout(() => { if (busy) { playback.timeScale = 3; onState({ fastForward: true }); } }, 180);
    }
    cleanups.push(releaseFast);
    function interrupt() {
      generation++; playback.cancel(); releaseFast(); busy = enemyPhase = false; clearFloats(); bursts.update(1);
    }
    async function commit(action: Action) {
      if (!ready()) return;
      const next = apply(state, action), ticket = ++generation;
      if (action.type === 'endTurn') { undoStack.length = 0; enemyPhase = true; audio.play('endTurn'); }
      else undoStack.push(state);
      state = next.state; busy = true; setMode('idle'); hoverTile = -1;
      // Give playback a hidden surface for newly granted shields; block events use the old visible one.
      for (const ev of next.events) if (ev.t === 'shield') {
        const v = visuals.get(ev.id); if (v && !v.bubble) bubbleFor(v).visible = false;
      }
      save(); refresh(); await playback.play(next.events);
      if (signal.aborted || generation !== ticket) return;
      releaseFast(); busy = enemyPhase = false; syncVisuals(state);
      if (state.phase !== 'player' || action.type === 'endTurn') focus(null);
      else if (action.type === 'move') focus(action.id);
      else focus(roster.find(h => state.entities.some(e => e.id === h.id && !e.acted))?.id ?? null);
      if (state.phase === 'player') status = mode === 'skill' ? 'Choose a skill target' : selectedId !== null ? INFO[current()!.kind].name : 'Your turn';
      refresh();
    }
    function confirm() { if (pending && ready()) void commit(pending); }
    function undo() {
      if (enemyPhase || !undoStack.length || state.phase !== 'player') return;
      interrupt(); state = undoStack.pop()!; focus(current()?.id ?? null); syncVisuals(state); save(); audio.play('undo'); status = 'Order undone'; refresh();
    }
    function toggleMute() { audio.unlock(); if (!audio.setMuted(!audio.isMuted())) audio.play('uiClick'); syncHud(); }
    function toggleDanger() {
      showDanger = !showDanger;
      try { localStorage.setItem(DANGER_KEY, String(showDanger)); } catch { /* Keep the session preference. */ }
      paintFills(); onState({ danger: showDanger });
    }

    const raycaster = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND), point = new THREE.Vector3();
    function pick(x: number, y: number): Tile | null {
      if (!cam.setRay(raycaster, x, y)) return null;
      // Units win over props they stand behind, so a hero hidden by the barn stays tappable.
      const found = raycaster.intersectObjects(hits, false).map(h => visualEntities.get(h.object.userData.id)).filter(e => e !== undefined);
      const e = found.find(e => teamOf(e) === 'sky' || hero(e)) ?? found[0];
      if (e) return { x: e.x, y: e.y };
      if (!raycaster.ray.intersectPlane(ground, point)) return null;
      const tx = Math.floor(point.x / TILE + COLS / 2), ty = Math.floor(point.z / TILE + ROWS / 2);
      return tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS ? { x: tx, y: ty } : null;
    }
    let pressedBusy = false;
    const cam = createBoardCamera({ viewport, renderer, insets, signal, offset: camOffset, pad: { x: 0.25, z: 0.35 }, maxZoom: 2.2,
      onTap: (x, y) => { if (!pressedBusy || busy) tap(pick(x, y)); },
      onHover(x, y, event) {
        if (event.pointerType !== 'mouse' || busy) return;
        const p = pick(x, y), i = p ? key(p) : -1;
        if (hoverTile !== i) { hoverTile = i; paintFills(); }
        renderer.domElement.style.cursor = p && (tileAt(state, p.x, p.y) || legal.some(t => key(t) === i)) ? 'pointer' : 'default';
      },
      onPress(event) {
        audio.unlock(); pressedBusy = busy;
        const rect = viewport.getBoundingClientRect(), fraction = (event.clientX - rect.left) / rect.width;
        if (fraction < 0.16 || fraction > 0.84) armFast();
      }, onRelease: releaseFast,
      onZoomedChange(value) { zoomed = value; onState({ zoomed }); },
    });
    cam.setBounds({ minX: -COLS / 2 * TILE, maxX: COLS / 2 * TILE, minZ: -ROWS / 2 * TILE, maxZ: ROWS / 2 * TILE, maxY: 1.6 }, 0.5);
    const portraits: Record<string, string> = {}, stage = createStudioStage();
    renderer.setPixelRatio(1); renderer.setSize(128, 128, false);
    for (const { id } of GALLERY_ITEMS) {
      const framed = frameModel(modelFor(id)); stage.scene.add(framed); renderer.render(stage.scene, stage.camera);
      portraits[id] = renderer.domElement.toDataURL('image/png'); framed.removeFromParent();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); cam.refit();
    function load(s: GameState, initial: GameState, message: string) {
      interrupt(); undoStack.length = 0; state = s; roster = initial.entities.filter(hero);
      focus(null); hoverTile = -1; status = message; cam.snapHome(); syncVisuals(s); save(); refresh();
    }
    function newFight(difficulty: Difficulty, seed = randomSeed()) {
      const s = createGame(seed, difficulty); load(s, s, 'Tap a herd animal to give orders');
    }
    function resume(value: string | null) {
      const decoded = value && decodeSave(value);
      if (!decoded) { newFight('medium'); return; }
      if ('restart' in decoded) {
        const s = createGame(decoded.restart.seed, decoded.restart.difficulty);
        load(s, s, 'This link is from an older version, so the fight restarts');
      } else load(decoded, createGame(decoded.seed, decoded.difficulty), 'Fight resumed');
    }
    window.addEventListener('hashchange', () => { const next = hashCode() ?? readStoredCode(); if (next !== code) resume(next); }, { signal });
    window.addEventListener('keydown', e => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (e.code === 'Space' && busy) { e.preventDefault(); armFast(); return; }
      if (e.repeat) return;
      switch (e.key.toLowerCase()) {
        case 'escape': cancel(); break;
        case 'z': case 'u': undo(); break;
        case 'tab': {
          if (!ready()) return;
          const active = state.entities.filter(e => hero(e) && !e.acted);
          if (!active.length) return;
          const i = active.findIndex(e => e.id === selectedId), step = e.shiftKey ? -1 : 1;
          focus(active[(i + step + active.length) % active.length].id); audio.play('select'); refresh(); break;
        }
        case 'q': choose('skill'); break;
        case 'enter': if (!pending) return; confirm(); break;
        case 'm': toggleMute(); break;
        case 'd': toggleDanger(); break;
        default: return;
      }
      e.preventDefault();
    }, { signal });
    window.addEventListener('keyup', e => { if (e.code === 'Space') releaseFast(); }, { signal });
    window.addEventListener('blur', releaseFast, { signal });
    document.addEventListener('visibilitychange', () => { audio.setHidden(document.hidden); if (document.hidden) releaseFast(); }, { signal });
    audio.setHidden(document.hidden);
    resume(hashCode() ?? readStoredCode());
    let last = performance.now(), raf: number;
    function tick(now: number) {
      const dt = Math.min(0.06, (now - last) / 1000); last = now;
      cam.update(dt); playback.update(dt);
      const scaled = dt * playback.timeScale; bursts.update(scaled);
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i]; f.life -= scaled;
        if (f.life <= 0) { removeSprite(f.sprite); floats.splice(i, 1); }
        else { f.sprite.position.y += scaled; f.sprite.material.opacity = Math.min(1, f.life / 0.3); }
      }
      const wave = reduceMotion ? 0 : Math.sin(now * 0.004);
      ringMat.opacity = 0.75 + 0.2 * wave;
      renderer.render(scene, cam.camera); raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick); cleanups.push(() => cancelAnimationFrame(raf));
    return { select, chooseSkill: () => choose('skill'), chooseItem: kind => choose('item', kind),
      wait() { const e = current(); if (ready() && e && hero(e) && !e.acted) void commit({ type: 'wait', id: e.id }); },
      confirm, cancel, undo, endTurn: () => { void commit({ type: 'endTurn' }); }, newFight, retry: () => newFight(state.difficulty, state.seed),
      toggleMute, toggleDanger, resetView() { cam.resetView(); audio.play('uiClick'); }, refit: cam.refit, portraits, destroy };
  } catch (error) { destroy(); throw error; }
}
