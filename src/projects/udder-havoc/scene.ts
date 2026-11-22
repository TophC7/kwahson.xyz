import * as THREE from 'three';
import { BAZOOKA_MUZZLE_LOCAL, buildBazookaCow, createSightBeams, wrapCornShell } from '../../lib/bazookaCow';
import { createBursts } from '../../lib/bursts';
import { isGameKey } from '../../lib/hotkeys';
import { createModelCache, createStudioBuilder, type MiniatureId } from '../../lib/miniatures';
import { createPastureKit } from '../../lib/pastureKit';
import { addTableLights, buildPastureTable, createPastureRenderer } from '../../lib/pastureTable';
import { mulberry32, randomSeed } from '../../lib/rng';
import { onLeavePage, readStorage, writeStorage } from '../../lib/gameSave';
import { scoped } from '../../lib/scope';
import { createArenaAudio } from './audio';
import {
  BOSS_NAMES,
  DAYTIME_DEFS,
  LAYOUT_DEFS,
  SEASON_DEFS,
  type ArenaLayout,
  type DayTime,
  type PowerupId,
  type Season,
} from './data';
import {
  ARENA_HALF,
  applyPowerup,
  createSimState,
  stepSim,
  type ObstacleModelKind,
  type SimBeam,
  type SimEnemy,
  type SimPickup,
  type SimProjectile,
  type SimState,
} from './sim';

type AimMode = 'cursor' | 'charge' | 'auto';

export interface ArenaHudState {
  seed: number;
  season: Season;
  daytime: DayTime;
  layout: ArenaLayout;
  seasonLabel: string;
  daytimeLabel: string;
  layoutLabel: string;
  hp: number;
  maxHp: number;
  xp: number;
  nextXp: number;
  level: number;
  wave: number;
  elapsed: number;
  score: number;
  kills: number;
  charge: number;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  powerups: Record<PowerupId, number>;
  pendingChoices: PowerupId[] | null;
  aimMode: AimMode;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  status: string;
}

interface RestartOptions {
  seed?: number;
  season?: Season;
  daytime?: DayTime;
  layout?: ArenaLayout;
}

export interface ArenaController {
  pickPowerup(id: PowerupId): void;
  toggleAutoAim(): void;
  toggleMute(): void;
  togglePause(): void;
  restart(options?: RestartOptions): void;
  setStickInput(nx: number, ny: number, active: boolean): void;
  setAimStickInput(nx: number, ny: number, active: boolean): void;
  setChargeInput(active: boolean): void;
  destroy(): void;
}

export function mountUdderHavoc({
  viewport,
  onState,
}: {
  viewport: HTMLElement;
  onState: (patch: Partial<ArenaHudState>) => void;
}): ArenaController {
  return scoped(scope => {
    const { signal, add, dispose } = scope;
    const renderer = createPastureRenderer(viewport, scope, { shadows: true });

    const scene = new THREE.Scene();
    const kit = createPastureKit();
    add(() => kit.dispose());
    const studio = createStudioBuilder(kit);
    add(() => studio.dispose());

    const model = createModelCache(studio);

    const lights = addTableLights(scene, 14, { shadowSpan: 16, shadowFar: 54 });
    add(() => lights.dispose());

    const tableGroup = new THREE.Group();
    const decorGroup = new THREE.Group();
    const entityRoot = new THREE.Group();
    scene.add(tableGroup, decorGroup, entityRoot);

    const bursts = createBursts(kit, entityRoot);
    add(() => bursts.clear());

    const audio = createArenaAudio();
    add(() => audio.destroy());

    const sight = createSightBeams(kit, scene, 1);
    add(() => sight.dispose());

    const sniperBeams = createSightBeams(kit, entityRoot, 0, {
      color: 0xff6e7f,
      opacity: 0.82,
      lockedColor: 0xff6e7f,
      lockedOpacity: 0.82,
    });
    add(() => sniperBeams.dispose());

    const cow = buildBazookaCow(kit, () => model('corn'));
    cow.mesh.traverse(obj => {
      if (obj instanceof THREE.Mesh) obj.castShadow = true;
    });
    scene.add(cow.mesh);
    const dashRingMat = new THREE.MeshBasicMaterial({ color: 0xffe469, transparent: true, opacity: 0.78, depthWrite: false });
    const dashRing = kit.part(cow.mesh, 'ring', 0, [0.95, 0.95, 1], [0, 0.08, 0], dashRingMat);
    dashRing.rotation.x = -Math.PI / 2;
    dashRing.visible = false;
    add(() => dashRingMat.dispose());

    const camOffset = new THREE.Vector3(14, 17, 14);
    const camFocus = new THREE.Vector3(0, 0, 0);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 95);
    camera.position.copy(camOffset);
    camera.lookAt(camFocus);

    function resize() {
      const w = Math.max(1, viewport.clientWidth);
      const h = Math.max(1, viewport.clientHeight);
      renderer.setSize(w, h, false);
      const halfSpan = w < 640 ? 9.2 : 10.6;
      const aspect = w / h;
      if (aspect >= 1) {
        camera.left = -halfSpan * aspect;
        camera.right = halfSpan * aspect;
        camera.top = halfSpan;
        camera.bottom = -halfSpan;
      } else {
        camera.left = -halfSpan;
        camera.right = halfSpan;
        camera.top = halfSpan / aspect;
        camera.bottom = -halfSpan / aspect;
      }
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(viewport);
    add(() => ro.disconnect());

    const obstacleMeshes: THREE.Object3D[] = [];
    const enemyMeshes = new Map<number, { root: THREE.Object3D; shadow?: THREE.Mesh }>();
    const projMeshes = new Map<number, THREE.Object3D>();
    const beamMeshes = new Map<number, { group: THREE.Group; ring: THREE.Mesh; fill: THREE.Mesh; drop?: THREE.Object3D }>();
    const mineMeshes = new Map<number, THREE.Object3D>();
    const beeMeshes = new Map<number, THREE.Object3D>();
    const pickupMeshes = new Map<number, { group: THREE.Group; legs?: { mesh: THREE.Mesh; phase: number }[] }>();
    const milkWaves: { group: THREE.Group; ring: THREE.Mesh; disc: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; discMat: THREE.MeshBasicMaterial; radius: number; life: number; duration: number }[] = [];
    const backblasts: { group: THREE.Group; rim: THREE.Mesh; fillMat: THREE.MeshBasicMaterial; rimMat: THREE.MeshBasicMaterial; life: number; gold: boolean }[] = [];
    // Match the damage cone's dot > 0.35; these shared sectors face local +Z.
    const blastHalfAngle = Math.acos(0.35);
    const blastFillGeo = new THREE.CircleGeometry(1, 32, -Math.PI / 2 - blastHalfAngle, blastHalfAngle * 2);
    const blastRimGeo = new THREE.RingGeometry(0.87, 1, 32, 1, -Math.PI / 2 - blastHalfAngle, blastHalfAngle * 2);
    add(() => {
      blastFillGeo.dispose();
      blastRimGeo.dispose();
    });

    function spawnBackblast(x: number, z: number, dx: number, dz: number, range: number, gold: boolean) {
      const group = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xff782f, transparent: true, opacity: 0.34, depthWrite: false });
      const rimMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 1, depthWrite: false });
      const fill = new THREE.Mesh(blastFillGeo, fillMat);
      const rim = new THREE.Mesh(blastRimGeo, rimMat);
      fill.rotation.x = rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.015;
      rim.scale.setScalar(0.2);
      group.add(fill, rim);
      // Keep the flash at the shot's origin, even while recoil moves the cow.
      group.position.set(x - dx * 0.7, 0.12, z - dz * 0.7);
      group.rotation.y = Math.atan2(dx, dz);
      group.scale.setScalar(range);
      entityRoot.add(group);
      backblasts.push({ group, rim, fillMat, rimMat, life: 1, gold });
    }

    const popcornGeo = new THREE.IcosahedronGeometry(0.18, 0);
    const xpMat = new THREE.MeshStandardMaterial({
      color: 0xffe066,
      emissive: new THREE.Color(0x9b7100),
      emissiveIntensity: 0.45,
      roughness: 0.35,
      flatShading: true,
    });
    const popcornMat = new THREE.MeshStandardMaterial({
      color: 0xfff5cf,
      roughness: 0.55,
      flatShading: true,
    });
    const goldShellMat = new THREE.MeshStandardMaterial({
      color: 0xffe469,
      emissive: new THREE.Color(0xffb800),
      emissiveIntensity: 0.75,
      roughness: 0.3,
      flatShading: true,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb6ffdb, transparent: true, opacity: 0.85, depthWrite: false });
    const tractorFillMat = new THREE.MeshBasicMaterial({ color: 0x7ff5b5, transparent: true, opacity: 0.22, depthWrite: false });
    const mortarRingMat = new THREE.MeshBasicMaterial({ color: 0xe05828, transparent: true, opacity: 0.85, depthWrite: false });
    const mortarFillMat = new THREE.MeshBasicMaterial({ color: 0xf64b18, transparent: true, opacity: 0.24, depthWrite: false });
    const plasmaRingMat = new THREE.MeshBasicMaterial({ color: 0x3ef0c6, transparent: true, opacity: 0.88, depthWrite: false });
    const plasmaFillMat = new THREE.MeshBasicMaterial({ color: 0xff6e7f, transparent: true, opacity: 0.24, depthWrite: false });
    const slamRingMat = new THREE.MeshBasicMaterial({ color: 0xff7a59, transparent: true, opacity: 0.9, depthWrite: false });
    const slamFillMat = new THREE.MeshBasicMaterial({ color: 0xff7a59, transparent: true, opacity: 0.22, depthWrite: false });
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1c2419, transparent: true, opacity: 0.35, depthWrite: false });
    add(() => {
      popcornGeo.dispose();
      xpMat.dispose();
      popcornMat.dispose();
      goldShellMat.dispose();
      ringMat.dispose();
      tractorFillMat.dispose();
      mortarRingMat.dispose();
      mortarFillMat.dispose();
      plasmaRingMat.dispose();
      plasmaFillMat.dispose();
      slamRingMat.dispose();
      slamFillMat.dispose();
      shadowMat.dispose();
    });

    const isTouchViewport = () =>
      window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 900px)').matches;

    const SAVE_KEY = 'udder-havoc-save-v1';
    let sim: SimState = createSimState(randomSeed());
    let paused = false;

    function saveRun() {
      writeStorage(SAVE_KEY, JSON.stringify({ ...sim, rng: undefined, events: [] }));
    }

    const rawSave = readStorage(SAVE_KEY);
    if (rawSave) {
      try {
        const parsed = JSON.parse(rawSave);
        if (parsed && typeof parsed.seed === 'number' && typeof parsed.elapsed === 'number' && !parsed.ended && parsed.elapsed > 0 && parsed.player) {
          sim = {
            ...parsed,
            rng: mulberry32((parsed.seed ^ Math.floor(parsed.elapsed * 1000)) >>> 0),
            events: [],
          };
          paused = !sim.pendingChoices;
        }
      } catch {
        // Ignore invalid save.
      }
    }
    let aimMode: AimMode = isTouchViewport() ? 'charge' : 'cursor';
    let statusMsg = 'Recoil-skate away from beams. Hold Click/Space for Gold Pierce.';
    let statusTimer = 5;
    let shake = 0;

    function buildObstacleVisual(kind: ObstacleModelKind): THREE.Object3D {
      if (kind === 'corn-wall' || kind === 'barn' || kind === 'silo' || kind === 'well' || kind === 'stump') {
        const m = model(kind);
        if (kind === 'barn') m.scale.setScalar(1.45);
        else if (kind === 'silo') m.scale.setScalar(1.25);
        else if (kind === 'well') m.scale.setScalar(1.1);
        else if (kind === 'corn-wall') m.scale.setScalar(1.35);
        return m;
      }
      return kit.makeObstacle(kind).mesh;
    }

    function applyEnvironment() {
      const seasonDef = SEASON_DEFS[sim.season];
      const dayDef = DAYTIME_DEFS[sim.daytime];

      lights.hemi.color.setHex(dayDef.hemiSky);
      lights.hemi.groundColor.setHex(dayDef.hemiGround);
      lights.hemi.intensity = dayDef.hemiIntensity;
      lights.sun.color.setHex(dayDef.sunColor);
      lights.sun.intensity = dayDef.sunIntensity;
      lights.sun.position.set(...dayDef.sunPos);
      lights.fill.color.setHex(dayDef.fillColor);
      lights.fill.intensity = dayDef.fillIntensity;

      buildPastureTable(kit, tableGroup, {
        cx: 0,
        cz: 0,
        spanX: ARENA_HALF * 2,
        spanZ: ARENA_HALF * 2,
        checker: true,
        palette: seasonDef.palette,
      });

      decorGroup.clear();
      const edge = ARENA_HALF - 0.55;
      const corners: [number, number][] = [
        [-edge, -edge],
        [edge, -edge],
        [-edge, edge],
        [edge, edge],
      ];
      corners.forEach(([x, z], i) => {
        const deco = model(seasonDef.decor[i % seasonDef.decor.length]);
        deco.position.set(x, 0.08, z);
        deco.scale.setScalar(0.95);
        decorGroup.add(deco);
        if (dayDef.lanterns) {
          const lantern = model('lantern');
          lantern.position.set(x + (x > 0 ? -0.9 : 0.9), 0.08, z);
          lantern.scale.setScalar(0.85);
          decorGroup.add(lantern);
        }
      });
    }

    function rebuildObstacles() {
      for (const m of obstacleMeshes) entityRoot.remove(m);
      obstacleMeshes.length = 0;
      for (const obs of sim.obstacles) {
        const mesh = buildObstacleVisual(obs.kind);
        mesh.position.set(obs.x, 0.08, obs.z);
        mesh.rotation.y = obs.yaw;
        mesh.traverse(c => {
          if (c instanceof THREE.Mesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        entityRoot.add(mesh);
        obstacleMeshes.push(mesh);
      }
    }

    function clearDynamicMeshes() {
      for (const v of enemyMeshes.values()) entityRoot.remove(v.root);
      for (const v of projMeshes.values()) entityRoot.remove(v);
      for (const v of beamMeshes.values()) entityRoot.remove(v.group);
      for (const v of mineMeshes.values()) entityRoot.remove(v);
      for (const v of beeMeshes.values()) entityRoot.remove(v);
      for (const v of pickupMeshes.values()) entityRoot.remove(v.group);
      for (const w of milkWaves) {
        entityRoot.remove(w.group);
        w.ringMat.dispose();
        w.discMat.dispose();
      }
      for (const blast of backblasts) {
        entityRoot.remove(blast.group);
        blast.fillMat.dispose();
        blast.rimMat.dispose();
      }
      backblasts.length = 0;
      enemyMeshes.clear();
      projMeshes.clear();
      beamMeshes.clear();
      mineMeshes.clear();
      beeMeshes.clear();
      pickupMeshes.clear();
      milkWaves.length = 0;
      bursts.clear();
      sight.hideFrom(0);
      sniperBeams.hideFrom(0);
    }
    add(clearDynamicMeshes);

    function pushHud() {
      const boss = sim.enemies.find(e => e.kind === 'boss');
      onState({
        seed: sim.seed,
        season: sim.season,
        daytime: sim.daytime,
        layout: sim.layout,
        seasonLabel: SEASON_DEFS[sim.season].label,
        daytimeLabel: DAYTIME_DEFS[sim.daytime].label,
        layoutLabel: LAYOUT_DEFS[sim.layout].label,
        hp: Math.ceil(sim.player.hp),
        maxHp: sim.player.maxHp,
        xp: sim.player.xp,
        nextXp: sim.player.nextXp,
        level: sim.player.level,
        wave: sim.wave,
        elapsed: sim.elapsed,
        score: sim.score,
        kills: sim.kills,
        charge: sim.player.charge,
        bossName: boss ? BOSS_NAMES[boss.bossKind ?? 'harvester'] : '',
        bossHp: boss ? Math.max(0, Math.ceil(boss.hp)) : 0,
        bossMaxHp: boss ? boss.maxHp : 0,
        powerups: { ...sim.powerups },
        pendingChoices: sim.pendingChoices ? [...sim.pendingChoices] : null,
        aimMode,
        paused,
        ended: sim.ended,
        muted: audio.isMuted(),
        status: statusTimer > 0 ? statusMsg : '',
      });
    }

    applyEnvironment();
    rebuildObstacles();
    pushHud();

    function spawnEnemyMesh(e: SimEnemy) {
      const root = new THREE.Group();
      let enemyModel: THREE.Object3D;
      let shadow: THREE.Mesh | undefined;
      if (e.kind === 'boss') {
        const bk = e.bossKind ?? 'harvester';
        enemyModel = model(`boss-${bk}`);
        if (bk === 'harvester') {
          enemyModel.position.y = 2.6;
        } else if (bk === 'queen') {
          enemyModel.position.y = 0.65;
        } else {
          enemyModel.position.y = 0.08;
        }
        shadow = kit.part(root, 'disc', 0, [e.radius * 0.95, e.radius * 0.95, 1], [0, 0.1, 0], shadowMat);
        shadow.rotation.x = -Math.PI / 2;
      } else if (e.kind === 'saucer') {
        enemyModel = kit.makeUfo();
        enemyModel.scale.setScalar(0.92);
        enemyModel.position.y = 2.35;
        shadow = kit.part(root, 'disc', 0, [e.radius * 0.95, e.radius * 0.95, 1], [0, 0.1, 0], shadowMat);
        shadow.rotation.x = -Math.PI / 2;
      } else if (e.kind === 'skimmer') {
        enemyModel = model('scout-pod');
        enemyModel.scale.setScalar(0.95);
        enemyModel.position.y = 0.65;
        shadow = kit.part(root, 'disc', 0, [0.42, 0.42, 1], [0, 0.1, 0], shadowMat);
        shadow.rotation.x = -Math.PI / 2;
      } else if (e.kind === 'sniper') {
        enemyModel = model('sniper');
        enemyModel.position.y = 0.68;
        shadow = kit.part(root, 'disc', 0, [0.4, 0.4, 1], [0, 0.1, 0], shadowMat);
        shadow.rotation.x = -Math.PI / 2;
      } else if (e.kind === 'splitter') {
        enemyModel = model('splitter');
        enemyModel.position.y = 0.08;
      } else if (e.kind === 'sprout') {
        const sproutIds: MiniatureId[] = ['sprout-red', 'sprout-yellow', 'sprout-blue'];
        enemyModel = model(sproutIds[e.id % 3]);
        enemyModel.scale.setScalar(0.95);
        enemyModel.position.y = 0.08;
      } else if (e.kind === 'brute') {
        enemyModel = model('brute');
        enemyModel.scale.setScalar(1.1);
        enemyModel.position.y = 0.08;
      } else if (e.kind === 'lobber') {
        enemyModel = model('lobber');
        enemyModel.scale.setScalar(1.0);
        enemyModel.position.y = 0.08;
      } else {
        enemyModel = model('alien');
        enemyModel.scale.setScalar(1.0);
        enemyModel.position.y = 0.08;
      }
      enemyModel.traverse(c => {
        if (c instanceof THREE.Mesh) c.castShadow = true;
      });
      root.add(enemyModel);
      root.position.set(e.x, 0, e.z);
      entityRoot.add(root);
      enemyMeshes.set(e.id, { root, shadow });
    }

    function spawnProjMesh(pr: SimProjectile) {
      let mesh: THREE.Object3D;
      if (pr.popcorn) {
        mesh = new THREE.Mesh(popcornGeo, popcornMat);
      } else if (pr.gold) {
        mesh = wrapCornShell(model('corn'), 1.2);
        mesh.traverse(c => {
          if (c instanceof THREE.Mesh) c.material = goldShellMat;
        });
      } else {
        mesh = wrapCornShell(model('corn'), 0.85);
      }
      mesh.position.set(pr.x, 0.93, pr.z);
      entityRoot.add(mesh);
      projMeshes.set(pr.id, mesh);
    }

    function spawnBeamMesh(b: SimBeam) {
      const group = new THREE.Group();
      group.position.set(b.x, 0.1, b.z);
      const fMat =
        b.kind === 'mortar' ? mortarFillMat :
        b.kind === 'enemyMortar' ? plasmaFillMat :
        b.kind === 'slam' ? slamFillMat : tractorFillMat;
      const rMat =
        b.kind === 'mortar' ? mortarRingMat :
        b.kind === 'enemyMortar' ? plasmaRingMat :
        b.kind === 'slam' ? slamRingMat : ringMat;
      const fill = kit.part(group, 'disc', 0, [b.radius, b.radius, 1], [0, 0, 0], fMat);
      fill.rotation.x = -Math.PI / 2;
      const ring = kit.part(group, 'ring', 0, [b.radius, b.radius, 1], [0, 0.01, 0], rMat);
      ring.rotation.x = -Math.PI / 2;
      let drop: THREE.Object3D | undefined;
      if (b.kind === 'mortar') {
        drop = model('pumpkin');
        drop.position.set(0, 6, 0);
        group.add(drop);
      } else if (b.kind === 'enemyMortar') {
        drop = model('plasma-orb');
        drop.position.set(0, 6, 0);
        group.add(drop);
      }
      entityRoot.add(group);
      beamMeshes.set(b.id, { group, ring, fill, drop });
    }

    function spawnMilkWave(x: number, z: number, radius: number) {
      const group = new THREE.Group();
      group.position.set(x, 0.12, z);
      const rMat = new THREE.MeshBasicMaterial({ color: 0xfffcf4, transparent: true, opacity: 0.95, depthWrite: false });
      const dMat = new THREE.MeshBasicMaterial({ color: 0xfbf7ea, transparent: true, opacity: 0.42, depthWrite: false });
      const disc = kit.part(group, 'disc', 0, [0.25, 0.25, 1], [0, 0, 0], dMat);
      disc.rotation.x = -Math.PI / 2;
      const ring = kit.part(group, 'ring', 0, [0.25, 0.25, 1], [0, 0.01, 0], rMat);
      ring.rotation.x = -Math.PI / 2;
      entityRoot.add(group);
      milkWaves.push({ group, ring, disc, ringMat: rMat, discMat: dMat, radius, life: 0.34, duration: 0.34 });
    }

    function spawnPickupMesh(pk: SimPickup) {
      const group = new THREE.Group();
      let legs: { mesh: THREE.Mesh; phase: number }[] | undefined;
      if (pk.kind === 'healer') {
        const healer = kit.makeCow({ special: true });
        healer.mesh.scale.setScalar(0.86);
        group.add(healer.mesh);
        legs = healer.legs;
      } else {
        const gem = kit.part(group, 'box', 0, [0.22, 0.22, 0.22], [0, 0.32, 0], xpMat);
        gem.rotation.set(0.5, 0.7, 0.4);
      }
      group.position.set(pk.x, 0.08, pk.z);
      entityRoot.add(group);
      pickupMeshes.set(pk.id, { group, legs });
    }

    const keys = new Set<string>();
    const pointerNdc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.93);
    const groundHit = new THREE.Vector3();
    let pointerActive = false;
    let pointerLastMove = 0;
    let mouseCharging = false;
    let touchCharging = false;
    let stickX = 0;
    let stickZ = 0;
    let stickActive = false;
    let aimStickX = 0;
    let aimStickZ = 0;
    let aimStickActive = false;
    let manualChargeAim = false;

    window.addEventListener('keydown', e => {
      if (sim.pendingChoices && !paused && !sim.ended && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const idx = Number(e.code.slice(-1)) - 1;
        const pick = sim.pendingChoices[idx];
        if (pick) controller.pickPowerup(pick);
        return;
      }
      if (!isGameKey(e)) return;
      audio.unlock();
      if (e.code === 'Escape') {
        e.preventDefault();
        if (e.repeat) return;
        if (!sim.ended && !sim.pendingChoices) {
          paused = !paused;
          pushHud();
        }
        return;
      }
      if (e.code === 'KeyM') {
        if (e.repeat) return;
        controller.toggleMute();
        return;
      }
      if (e.code === 'KeyQ') {
        if (e.repeat) return;
        controller.toggleAutoAim();
        return;
      }
      keys.add(e.code);
    }, { signal });

    window.addEventListener('keyup', e => {
      keys.delete(e.code);
    }, { signal });

    function updatePointer(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pointerActive = true;
      pointerLastMove = performance.now();
    }

    renderer.domElement.addEventListener('pointermove', updatePointer, { signal });
    renderer.domElement.addEventListener('pointerdown', e => {
      audio.unlock();
      if (e.pointerType === 'mouse' && e.button === 0) {
        updatePointer(e);
        mouseCharging = true;
      }
    }, { signal });
    window.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse' && e.button === 0) mouseCharging = false;
    }, { signal });

    const muzzleWorld = new THREE.Vector3();
    const sightEnd = new THREE.Vector3();
    const tmpVec = new THREE.Vector3();
    const sniperStart = new THREE.Vector3();
    const sniperEnd = new THREE.Vector3();

    let lastTime = performance.now();
    let hudTick = 0;
    let walkPhase = 0;
    let raf = 0;
    add(() => cancelAnimationFrame(raf));

    function syncVisuals(dt: number) {
      const pl = sim.player;
      cow.mesh.position.set(pl.x, 0.08, pl.z);
      cow.mesh.rotation.y = pl.heading;
      const speed = Math.hypot(pl.vx, pl.vz);
      walkPhase += dt * Math.min(18, 4 + speed * 2.2);
      for (const leg of cow.legs) {
        leg.mesh.position.y = 0.22 + (speed > 0.3 ? Math.max(0, Math.sin(walkPhase + leg.phase)) * 0.07 : 0);
      }
      cow.mesh.visible = true;
      const hitPulse = pl.invuln > 0 ? 0.92 + 0.1 * Math.abs(Math.sin(pl.invuln * 28)) : 1;
      cow.mesh.scale.setScalar(hitPulse);
      dashRing.visible = pl.dashInvuln > 0;
      if (dashRing.visible) {
        const s = 0.95 + (1 - pl.dashInvuln / 0.55) * 0.4;
        dashRing.scale.set(s, s, 1);
      }

      if (pl.charge > 0.05) {
        cow.mesh.updateMatrixWorld();
        cow.mesh.localToWorld(muzzleWorld.set(...BAZOOKA_MUZZLE_LOCAL));
        const locked = pl.charge >= 0.85;
        sightEnd.set(pl.x + pl.aimX * 14, 0.93, pl.z + pl.aimZ * 14);
        const pulse = locked ? 0.16 + 0.05 * Math.sin(pl.charge * 50) : 0.09;
        sight.setSegment(0, muzzleWorld, sightEnd, pulse, locked);
      } else {
        sight.hideFrom(0);
      }

      const targetX = THREE.MathUtils.clamp(pl.x * 0.72, -6.5, 6.5) + (shake > 0 ? (Math.random() - 0.5) * shake : 0);
      const targetZ = THREE.MathUtils.clamp(pl.z * 0.72, -6.5, 6.5) + (shake > 0 ? (Math.random() - 0.5) * shake : 0);
      camFocus.x = THREE.MathUtils.lerp(camFocus.x, targetX, Math.min(1, dt * 6));
      camFocus.z = THREE.MathUtils.lerp(camFocus.z, targetZ, Math.min(1, dt * 6));
      camera.position.copy(camFocus).add(camOffset);
      camera.lookAt(camFocus);

      // Sync Enemies & Sniper Locks
      const activeEnemies = new Set<number>();
      let sniperIdx = 0;
      for (const e of sim.enemies) {
        activeEnemies.add(e.id);
        let entry = enemyMeshes.get(e.id);
        if (!entry) {
          spawnEnemyMesh(e);
          entry = enemyMeshes.get(e.id)!;
        }
        entry.root.position.set(e.x, 0, e.z);
        const enemyObj = entry.root.children[0];
        if (e.kind === 'saucer' || (e.kind === 'boss' && e.bossKind !== 'strider')) {
          enemyObj.rotation.y += dt * (e.kind === 'boss' ? 1.1 : 2.1);
          if (enemyObj.userData.orbit instanceof THREE.Object3D) {
            enemyObj.userData.orbit.rotation.y -= dt * 3.1;
          }
        } else {
          entry.root.rotation.y = Math.atan2(pl.x - e.x, pl.z - e.z);
        }
        if (e.kind === 'sniper' && e.lockTimer > 0) {
          sniperStart.set(e.x, 0.9, e.z);
          sniperEnd.set(e.lockX, 0.9, e.lockZ);
          const w = e.lockTimer < 0.35 ? 0.14 : 0.07;
          sniperBeams.setSegment(sniperIdx, sniperStart, sniperEnd, w);
          sniperIdx++;
        }
        const pop = e.flash > 0 ? 1.15 : 1;
        entry.root.scale.setScalar(pop);
      }
      sniperBeams.hideFrom(sniperIdx);
      for (const [id, entry] of enemyMeshes) {
        if (!activeEnemies.has(id)) {
          entityRoot.remove(entry.root);
          enemyMeshes.delete(id);
        }
      }

      // Sync Projectiles
      const activeProj = new Set<number>();
      for (const pr of sim.projectiles) {
        activeProj.add(pr.id);
        let mesh = projMeshes.get(pr.id);
        if (!mesh) {
          spawnProjMesh(pr);
          mesh = projMeshes.get(pr.id)!;
        }
        mesh.position.set(pr.x, 0.93, pr.z);
        mesh.lookAt(pr.x + pr.vx, 0.93, pr.z + pr.vz);
        if (pr.popcorn) mesh.rotateX(dt * 12);
      }
      for (const [id, mesh] of projMeshes) {
        if (!activeProj.has(id)) {
          entityRoot.remove(mesh);
          projMeshes.delete(id);
        }
      }

      // Sync Beams
      const activeBeams = new Set<number>();
      for (const b of sim.beams) {
        activeBeams.add(b.id);
        let entry = beamMeshes.get(b.id);
        if (!entry) {
          spawnBeamMesh(b);
          entry = beamMeshes.get(b.id)!;
        }
        entry.group.position.set(b.x, 0.1, b.z);
        const progress = 1 - b.timer / b.duration;
        entry.fill.scale.set(b.radius * progress, b.radius * progress, 1);
        if (entry.drop) {
          entry.drop.position.y = Math.max(0.28, (1 - progress) * 6.2);
          entry.drop.rotation.y += dt * 7;
          entry.drop.rotation.x += dt * 4;
        }
      }
      for (const [id, entry] of beamMeshes) {
        if (!activeBeams.has(id)) {
          entityRoot.remove(entry.group);
          beamMeshes.delete(id);
        }
      }

      // Sync Milk Shockwaves
      for (let i = milkWaves.length - 1; i >= 0; i--) {
        const w = milkWaves[i];
        w.life -= dt;
        if (w.life <= 0) {
          entityRoot.remove(w.group);
          w.ringMat.dispose();
          w.discMat.dispose();
          milkWaves.splice(i, 1);
          continue;
        }
        const t = 1 - w.life / w.duration;
        const r = THREE.MathUtils.lerp(0.35, w.radius, 1 - (1 - t) * (1 - t));
        w.ring.scale.set(r, r, 1);
        w.disc.scale.set(r, r, 1);
        w.ringMat.opacity = (1 - t) * 0.95;
        w.discMat.opacity = (1 - t) * 0.45;
      }

      for (let i = backblasts.length - 1; i >= 0; i--) {
        const blast = backblasts[i];
        blast.life -= dt / (blast.gold ? 0.28 : 0.18);
        if (blast.life <= 0) {
          entityRoot.remove(blast.group);
          blast.fillMat.dispose();
          blast.rimMat.dispose();
          backblasts.splice(i, 1);
          continue;
        }
        // Damage is instant: show the full footprint immediately, then sweep its rim outward.
        blast.rim.scale.setScalar(1 - 0.8 * blast.life ** 3);
        blast.fillMat.opacity = (blast.gold ? 0.34 : 0.1) * blast.life ** 2;
        blast.rimMat.opacity = (blast.gold ? 1 : 0.36) * blast.life;
      }

      // Sync Guard Bees
      const activeBees = new Set<number>();
      for (const bee of sim.guardBees) {
        activeBees.add(bee.id);
        let mesh = beeMeshes.get(bee.id);
        if (!mesh) {
          mesh = model('bee');
          mesh.scale.setScalar(0.85);
          entityRoot.add(mesh);
          beeMeshes.set(bee.id, mesh);
        }
        mesh.position.set(bee.x, 0.85 + Math.sin(sim.elapsed * 9 + bee.id) * 0.1, bee.z);
        mesh.rotation.y = -bee.angle;
      }
      for (const [id, mesh] of beeMeshes) {
        if (!activeBees.has(id)) {
          entityRoot.remove(mesh);
          beeMeshes.delete(id);
        }
      }

      // Sync Sizzling Trail Mines
      const activeMines = new Set<number>();
      for (const m of sim.mines) {
        activeMines.add(m.id);
        let mesh = mineMeshes.get(m.id);
        if (!mesh) {
          mesh = new THREE.Mesh(popcornGeo, goldShellMat);
          mesh.scale.setScalar(1.35);
          entityRoot.add(mesh);
          mineMeshes.set(m.id, mesh);
        }
        mesh.position.set(m.x, 0.22 + Math.sin(sim.elapsed * 10 + m.id) * 0.04, m.z);
        mesh.rotation.y += dt * 4;
      }
      for (const [id, mesh] of mineMeshes) {
        if (!activeMines.has(id)) {
          entityRoot.remove(mesh);
          mineMeshes.delete(id);
        }
      }

      // Sync Pickups
      const activePickups = new Set<number>();
      for (const pk of sim.pickups) {
        activePickups.add(pk.id);
        let entry = pickupMeshes.get(pk.id);
        if (!entry) {
          spawnPickupMesh(pk);
          entry = pickupMeshes.get(pk.id)!;
        }
        entry.group.position.set(pk.x, 0.08, pk.z);
        if (pk.kind === 'xp') {
          entry.group.rotation.y += dt * 3;
        } else if (entry.legs) {
          entry.group.rotation.y = Math.atan2(pk.vx, pk.vz);
          for (const leg of entry.legs) {
            leg.mesh.position.y = 0.22 + Math.max(0, Math.sin(sim.elapsed * 8 + leg.phase)) * 0.06;
          }
        }
      }
      for (const [id, entry] of pickupMeshes) {
        if (!activePickups.has(id)) {
          entityRoot.remove(entry.group);
          pickupMeshes.delete(id);
        }
      }
    }

    function consumeEvents() {
      for (const ev of sim.events) {
        switch (ev.type) {
          case 'fire':
            audio.playFire(ev.gold);
            bursts.spawn(tmpVec.set(ev.x, 0.5, ev.z), ev.gold ? 0xffe469 : 0xf4f0d8, ev.gold ? 8 : 4);
            if (ev.gold) shake = Math.max(shake, 0.26);
            break;
          case 'backblast':
            spawnBackblast(ev.x, ev.z, ev.dx, ev.dz, ev.range, ev.gold);
            break;
          case 'hit':
            audio.playHit(ev.crit);
            bursts.spawn(tmpVec.set(ev.x, 0.4, ev.z), ev.color, ev.count);
            break;
          case 'kill':
            audio.playKill();
            bursts.spawn(tmpVec.set(ev.x, 0.5, ev.z), 0x8fe89a, ev.kind === 'boss' ? 24 : 10);
            if (ev.kind === 'boss') {
              statusMsg = 'Boss down! Snag the healer cow!';
              statusTimer = 4;
              shake = Math.max(shake, 0.45);
            }
            break;
          case 'milk':
            spawnMilkWave(ev.x, ev.z, ev.radius);
            bursts.spawn(tmpVec.set(ev.x, 0.45, ev.z), 0xfffcf2, 16);
            break;
          case 'mortar':
            audio.playMortar();
            bursts.spawn(tmpVec.set(ev.x, 0.4, ev.z), 0xff8a47, 14);
            shake = Math.max(shake, 0.2);
            break;
          case 'plasma':
            audio.playMortar();
            bursts.spawn(tmpVec.set(ev.x, 0.45, ev.z), 0x3ef0c6, 14);
            shake = Math.max(shake, 0.18);
            break;
          case 'slam':
            audio.playMortar();
            spawnMilkWave(ev.x, ev.z, ev.radius);
            bursts.spawn(tmpVec.set(ev.x, 0.4, ev.z), 0xff7a59, 18);
            shake = Math.max(shake, 0.35);
            break;
          case 'sniper':
            audio.playHit(true);
            bursts.spawn(tmpVec.set(ev.x1, 0.7, ev.z1), 0xff6e7f, 8);
            break;
          case 'beam':
            bursts.spawn(tmpVec.set(ev.x, 0.4, ev.z), 0xb6ffdb, 8);
            break;
          case 'hurt':
            audio.playHurt();
            bursts.spawn(tmpVec.set(ev.x, 0.6, ev.z), 0xe67261, 10);
            shake = Math.max(shake, 0.35);
            break;
          case 'xp':
            audio.playXp();
            break;
          case 'heal':
            audio.playHeal();
            bursts.spawn(tmpVec.set(ev.x, 0.6, ev.z), 0xffa6c9, 12);
            statusMsg = 'Healer cow! +HP';
            statusTimer = 2.5;
            break;
          case 'levelup':
            audio.playLevelUp();
            pushHud();
            break;
          case 'boss':
            audio.playBoss();
            statusMsg = `${BOSS_NAMES[ev.bossKind]} incoming!`;
            statusTimer = 4;
            shake = Math.max(shake, 0.35);
            break;
          case 'gameover':
            audio.playGameOver();
            pushHud();
            break;
        }
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (statusTimer > 0) statusTimer = Math.max(0, statusTimer - dt);
      if (shake > 0) shake = Math.max(0, shake - dt * 1.4);

      if (!paused && !sim.ended && !sim.pendingChoices) {
        let kx = 0;
        let kz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) { kx -= 1; kz -= 1; }
        if (keys.has('KeyS') || keys.has('ArrowDown')) { kx += 1; kz += 1; }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) { kx -= 1; kz += 1; }
        if (keys.has('KeyD') || keys.has('ArrowRight')) { kx += 1; kz -= 1; }

        let moveX = kx;
        let moveZ = kz;
        if (stickActive) {
          moveX = stickX + stickZ;
          moveZ = stickZ - stickX;
        }

        const charging = mouseCharging || touchCharging || keys.has('Space');
        let aimDirX = 0;
        let aimDirZ = 0;
        let hasManualAim = false;
        // Release clears the pad/buttons before this frame; fire along the last manual aim.
        if (!charging && manualChargeAim && aimMode !== 'auto') {
          aimDirX = sim.player.aimX;
          aimDirZ = sim.player.aimZ;
          hasManualAim = true;
        } else if (aimMode !== 'auto' && aimStickActive) {
          if (Math.hypot(aimStickX, aimStickZ) > 0.14) {
            aimDirX = aimStickX + aimStickZ;
            aimDirZ = aimStickZ - aimStickX;
            hasManualAim = true;
          }
        } else if (aimMode === 'cursor' || (aimMode === 'charge' && charging)) {
          const mouseFresh = pointerActive && (now - pointerLastMove < 3500 || mouseCharging);
          if (mouseFresh) {
            raycaster.setFromCamera(pointerNdc, camera);
            if (raycaster.ray.intersectPlane(aimPlane, groundHit)) {
              aimDirX = groundHit.x - sim.player.x;
              aimDirZ = groundHit.z - sim.player.z;
              hasManualAim = true;
            }
          }
        }

        stepSim(sim, { moveX, moveZ, aimDirX, aimDirZ, hasManualAim, charging }, dt);
        if (sim.ended) saveRun();
        manualChargeAim = charging && hasManualAim;
        consumeEvents();
        bursts.update(dt);
        syncVisuals(dt);

        hudTick += dt;
        if (hudTick >= 0.08) {
          hudTick = 0;
          pushHud();
        }
        saveAccum += dt;
        if (saveAccum >= 2) {
          saveAccum = 0;
          saveRun();
        }
      } else {
        syncVisuals(0);
      }

      renderer.render(scene, camera);
    }

    let saveAccum = 0;
    onLeavePage(scope, saveRun);
    raf = requestAnimationFrame(frame);

    const controller: ArenaController = {
      pickPowerup(id) {
        if (!sim.pendingChoices?.includes(id)) return;
        applyPowerup(sim, id);
        consumeEvents();
        pushHud();
        saveRun();
      },
      toggleAutoAim() {
        const touchMode = isTouchViewport();
        const order: AimMode[] = touchMode ? ['charge', 'auto'] : ['cursor', 'charge', 'auto'];
        const curIdx = order.indexOf(aimMode);
        aimMode = order[(curIdx + 1) % order.length];
        statusMsg =
          aimMode === 'auto'
            ? 'Auto-aim: always tracks nearest alien.'
            : aimMode === 'charge'
              ? touchMode
                ? 'Charge aim: auto-aims shots, drag right pad while charging.'
                : 'Charge aim: auto-aims normal shots, cursor aims while charging.'
              : 'Cursor aim: always aims toward cursor.';
        statusTimer = 2.5;
        pushHud();
      },
      toggleMute() {
        audio.setMuted(!audio.isMuted());
        pushHud();
      },
      togglePause() {
        if (sim.ended || sim.pendingChoices) return;
        paused = !paused;
        pushHud();
      },
      restart(options = {}) {
        clearDynamicMeshes();
        sim = createSimState(options.seed ?? randomSeed(), {
          season: options.season,
          daytime: options.daytime,
          layout: options.layout,
        });
        paused = false;
        manualChargeAim = false;
        statusMsg = `${SEASON_DEFS[sim.season].label} · ${DAYTIME_DEFS[sim.daytime].label} · ${LAYOUT_DEFS[sim.layout].label}`;
        statusTimer = 4;
        applyEnvironment();
        rebuildObstacles();
        pushHud();
        saveRun();
      },
      setStickInput(nx, ny, active) {
        stickX = nx;
        stickZ = ny;
        stickActive = active;
      },
      setAimStickInput(nx, ny, active) {
        aimStickX = nx;
        aimStickZ = ny;
        aimStickActive = active;
      },
      setChargeInput(active) {
        audio.unlock();
        touchCharging = active;
      },
      destroy: dispose,
    };

    return controller;
  });
}
