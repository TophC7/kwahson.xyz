import * as THREE from 'three';
import { createBursts } from '../../lib/bursts';
import { isGameKey } from '../../lib/hotkeys';
import { buildPastureTable, createPastureRenderer } from '../../lib/pastureTable';
import { pick } from '../../lib/rng';
import { onLeavePage, readStorage, writeStorage } from '../../lib/gameSave';
import { scoped } from '../../lib/scope';
import {
  createPastureKit,
  PASTURE_HEMI_GROUND,
  PASTURE_HEMI_SKY,
  PASTURE_SUN_COLOR,
  type CowLeg,
  type ObstacleKind,
} from '../../lib/pastureKit';
import { createAudio } from './audio';
import { createStudioBuilder, createStudioStage, frameModel } from '../../lib/miniatures';
import { chooseAnimal, createHerdModels, POINTS, type Animal } from './herd';
import { createThreats } from './threats';

const IDLE_STATUS = 'Beam on. Watch what you pick up.';

// Distances in world units; timers in seconds.
const FIELD = 7;
const UFO_SPEED = 9;
// Thumb-stick top speed, below the cursor's: a thumb can't make the cursor's fine corrections.
const STICK_SPEED = 6;
const STICK_DEADZONE = 0.08;
const COW_SPEED = 1.05;
const SUCTION_RADIUS = 1.3;
const COW_LIFT_SPEED = 1.55;
const HAZARD_LIFT_SPEED = 1.1;
const MAX_HEALTH = 100;
const DAMAGE = 20;
const HEAL = 25;
const COW_CAP = 11;
const OBSTACLE_CAP = 11;
const DEBRIS_LIFETIME = 28;
const HAY_LIFETIME = 18;
const DESPAWN_DURATION = 1.2;
const COW_SPACING = 1.15;
const COW_INTERVAL = 2.2;
const OBSTACLE_INTERVAL = 3.4;
const SPECIAL_INTERVAL = 12;
const CHAIN_WINDOW = 2.5;
const MAX_COMBO = 4;
const HAY_INTERVAL = 10;
const FLEE_RADIUS = 4.3;
const HOVER = 2.8;
// Kicked debris decelerates at this rate (units/s²), so kick speed sets how far it slides.
const SLIDE_DRAG = 3;
// Chickens start laying egg bombs at this level. Eggs are light: easy to graze into the beam.
const EGG_LEVEL = 3;
const EGG_LIFT_SPEED = 3;
const EGG_GRAB_BONUS = 0.4;

function difficultyAt(level: number) {
  const i = level - 1;
  return {
    level,
    // Levels take 10, 15, 20, … more passengers. Points never affect pressure.
    nextLevelAt: (5 * level * (level + 3)) / 2,
    obstacleCap: Math.min(18, OBSTACLE_CAP + Math.floor(i / 2)),
    obstacleInterval: Math.max(2.3, OBSTACLE_INTERVAL - i * 0.13),
    hayInterval: Math.max(6, HAY_INTERVAL - i * 0.32),
    hayCap: Math.min(4, 2 + Math.floor(i / 4)),
    haySpeed: Math.min(3.1, 1.6 + i * 0.1),
    fleeSpeed: Math.min(3.7, 2.4 + i * 0.09),
    hazardLift: Math.min(1.85, HAZARD_LIFT_SPEED + i * 0.05),
    healerInterval: Math.min(20, SPECIAL_INTERVAL + i * 0.75),
    eggCap: level < EGG_LEVEL ? 0 : Math.min(4, 1 + Math.floor((level - EGG_LEVEL) / 2)),
    eggGap: Math.max(5, 11 - (level - EGG_LEVEL)),
  };
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number) => THREE.MathUtils.clamp(v, -FIELD, FIELD);

interface Entity {
  animal?: Animal;
  flock?: number;
  scatter: number;
  mesh: THREE.Group;
  special?: boolean;
  aiming?: boolean;
  shadow: THREE.Mesh;
  lift: number;
  timer: number;
  heading: number;
  phase: number;
  age: number;
  lifetime: number;
  retiring: number;
  anchor?: Entity | null;
  kind?: ObstacleKind;
  wasScared?: boolean;
  legs?: CowLeg[];
  roller?: THREE.Group;
  /** Goats: seconds until the next debris kick. Chickens: seconds until the next egg. */
  trickWait?: number;
  /** Kicked debris: current slide speed. */
  slide?: number;
  /** Egg bomb: explodes when its lifetime runs out. */
  egg?: boolean;
  /** Seconds the animal stands still, e.g. a hen laying an egg. */
  pause?: number;
}

export interface PastureHudState {
  combo: number;
  score: number;
  health: number;
  level: number;
  abductions: number;
  nextLevelAt: number;
  status: string;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  legends: Record<string, string>;
}

export interface PastureController {
  toggleMute(): void;
  togglePause(): void;
  restart(): void;
  setStickInput(nx: number, ny: number, active: boolean): void;
  destroy(): void;
}

export function mountPasturePatrol({
  viewport,
  onState,
}: {
  viewport: HTMLElement;
  onState: (patch: Partial<PastureHudState>) => void;
}): PastureController {
  return scoped((scope) => {
    const { signal, add, dispose } = scope;
    const renderer = createPastureRenderer(viewport, scope, { shadows: true });
    renderer.domElement.setAttribute(
      'aria-label',
      'Isometric pasture. Move your cursor or drag a finger to steer the UFO.',
    );

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera();
    const CAM_OFFSET = new THREE.Vector3(15, 18, 15);
    const camFocus = new THREE.Vector3();
    let followStrength = 0;
    camera.position.copy(CAM_OFFSET);
    camera.lookAt(camFocus);
    scene.add(new THREE.HemisphereLight(PASTURE_HEMI_SKY, PASTURE_HEMI_GROUND, 2.4));
    const sun = new THREE.DirectionalLight(PASTURE_SUN_COLOR, 3);
    sun.position.set(-5, 12, 7);
    scene.add(sun);

    // Shared resources keep restarts and spawning memory-stable.
    const kit = createPastureKit();
    add(() => kit.dispose());
    const bursts = createBursts(kit, scene);
    const studio = createStudioBuilder(kit);
    add(() => studio.dispose());
    const models = createHerdModels(studio);
    const { part, makeCow, makeUfo, makeObstacle } = kit;

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x29482e,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    add(() => shadowMaterial.dispose());

    function shadow(parent: THREE.Object3D, size: number, x = 0, z = 0) {
      const mesh = part(parent, 'disc', 0, [size, size, 1], [x, 0.12, z], shadowMaterial);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }

    const land = new THREE.Group();
    scene.add(land);
    buildPastureTable(kit, land, { cx: 0, cz: 0, spanX: 15.5, spanZ: 15.5, checker: true });
    for (let i = 0; i < 55; i++) {
      const x = random(-7.7, 7.7);
      const z = random(-7.7, 7.7);
      if (i % 3 === 0) {
        part(land, 'sphere', i % 2 ? 0xffe4a0 : 0xf7f4d9, [0.055, 0.045, 0.055], [x, 0.15, z]);
      } else {
        const tuft = part(land, 'cone', 0x729e50, [0.055, 0.16, 0.055], [x, 0.17, z]);
        tuft.rotation.z = 0.2;
      }
    }

    function renderLegendPreviews() {
      const stage = createStudioStage();
      const legends: Record<string, string> = {};
      function capture(key: string, framed: THREE.Group) {
        stage.scene.add(framed);
        renderer.render(stage.scene, stage.camera);
        legends[key] = renderer.domElement.toDataURL('image/png');
        framed.removeFromParent();
      }
      renderer.setSize(128, 128, false);
      capture('cow', frameModel(makeCow().mesh));
      capture('healer', frameModel(makeCow({ special: true }).mesh));
      capture('gunner', frameModel(models.animal('gunner').mesh));
      for (const id of ['chicken', 'goat', 'pig', 'sheep', 'pumpkin', 'tractor', 'bee'] as const) {
        capture(id, frameModel(models.miniature(id)));
      }
      const hazardsGroup = new THREE.Group();
      (['rock', 'stump', 'crate', 'hay'] as ObstacleKind[]).forEach((kind, i) => {
        const model = makeObstacle(kind).mesh;
        model.position.x = (i - 1.5) * 1.12;
        model.rotation.y = -0.3;
        hazardsGroup.add(model);
      });
      // Turn the row to face the studio camera, then fill the 2:1 strip.
      hazardsGroup.rotation.y = Math.atan2(stage.camera.position.x, stage.camera.position.z);
      const row = frameModel(hazardsGroup);
      row.scale.setScalar(2);
      stage.camera.left *= 2;
      stage.camera.right *= 2;
      stage.camera.updateProjectionMatrix();
      renderer.setSize(256, 128, false);
      capture('hazards', row);
      onState({ legends });
    }
    renderLegendPreviews();

    const ufo = makeUfo();
    scene.add(ufo);
    const player = new THREE.Vector3(0, 0, 0);
    const target = player.clone();
    const movement = new THREE.Vector3();
    const groundHit = new THREE.Vector3();

    const beamGeometry = new THREE.CylinderGeometry(0.38, SUCTION_RADIUS, HOVER - 0.15, 32, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xc4ffb0,
      transparent: true,
      opacity: 0.17,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    scene.add(beam);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2ffbc,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    add(() => {
      beamGeometry.dispose();
      beamMaterial.dispose();
      ringMaterial.dispose();
    });
    const ring = part(scene, 'ring', 0, [SUCTION_RADIUS, SUCTION_RADIUS, 1], [0, 0.12, 0], ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    const playerShadow = shadow(scene, 0.62);
    // A flat disc foreshortens along the camera's ground direction. Undo that
    // projection for the round shadow marker, but not the true ground pickup ring.
    playerShadow.rotation.order = 'YXZ';
    playerShadow.rotation.y = -Math.atan2(CAM_OFFSET.z, CAM_OFFSET.x);
    playerShadow.scale.x *= CAM_OFFSET.length() / CAM_OFFSET.y;

    const entities: Entity[] = [];
    // One shared egg-blast shockwave. ponytail: a second blast within 0.4s restarts it; pool it if eggs ever chain.
    const blastWave = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }),
    );
    blastWave.visible = false;
    scene.add(blastWave);
    add(() => {
      blastWave.geometry.dispose();
      blastWave.material.dispose();
    });
    let blastAge = 0;
    let health = MAX_HEALTH;
    let score = 0;
    let abductions = 0;
    let pressure = difficultyAt(1);
    let combo = 1;
    let chainUntil = -1;
    let flockId = 0;
    let elapsed = 0;
    let cowTimer = 0;
    let obstacleTimer = 0;
    let specialTimer = 0;
    let hayTimer = 0;
    let ended = false;
    let statusText = '';
    let statusUntil = 0;
    let flash = 0;
    let paused = false;

    const gate = new AbortController();
    add(() => gate.abort());
    const audio = createAudio({
      onUnlock: () => {
        gate.abort();
        if (!audio.isMuted() && !ended && !paused && elapsed < 3) setStatus('Audio on. Beam ready.');
      },
    });
    add(() => audio.destroy());
    const threats = createThreats({
      scene, kit, miniature: models.miniature, audio, player, hover: HOVER, entities, clamp,
      burst: bursts.spawn, damage, status: setStatus,
      spawnGunner: () => spawnAnimal('gunner'),
    });
    add(() => threats.dispose());
    onState({ muted: audio.isMuted() });

    let stickActive = false;
    let stickX = 0;
    let stickY = 0;

    function setStickInput(nx: number, ny: number, active: boolean) {
      if (paused || ended) {
        stickActive = false;
        stickX = 0;
        stickY = 0;
        return;
      }
      const wasActive = stickActive;
      stickActive = active;
      stickX = nx;
      stickY = ny;
      if (!active && wasActive) {
        target.copy(player);
      }
    }

    function setStatus(text: string) {
      statusText = text;
      statusUntil = elapsed + 2.2;
      onState({ status: text });
    }

    function setPaused(value: boolean) {
      if (ended) return;
      paused = value;
      target.copy(player);
      stickActive = false;
      stickX = 0;
      stickY = 0;
      onState({ paused });
      audio.setActive(!paused && !ended);
    }

    function pointIsSafe(p: THREE.Vector3, separation = 1.25) {
      return (
        Math.abs(p.x) < 6.8 &&
        Math.abs(p.z) < 6.8 &&
        p.distanceTo(player) >= 2.8 &&
        entities.every((e) => Math.hypot(e.mesh.position.x - p.x, e.mesh.position.z - p.z) > separation)
      );
    }

    function healerPoint() {
      const anchors = entities.filter(
        (e) =>
          !e.animal &&
          e.kind !== 'hay' &&
          e.lift === 0 &&
          !e.retiring &&
          e.lifetime - e.age > 8,
      );
      for (let attempt = 0; attempt < 100 && anchors.length; attempt++) {
        const anchor = pick(anchors, Math.random);
        const angle = random(0, Math.PI * 2);
        const distance = random(1.6, 2.0);
        const p = anchor.mesh.position.clone().setY(0);
        p.x += Math.sin(angle) * distance;
        p.z += Math.cos(angle) * distance;
        if (pointIsSafe(p)) return { point: p, anchor };
      }
      return null;
    }

    function freePoint() {
      for (let attempt = 0; attempt < 80; attempt++) {
        const p = new THREE.Vector3(random(-6.8, 6.8), 0, random(-6.8, 6.8));
        if (pointIsSafe(p)) return p;
      }
      return null;
    }

    function addEntity(mesh: THREE.Group, point = freePoint()) {
      if (!point) return null;
      mesh.position.copy(point);
      scene.add(mesh);
      const s = shadow(scene, 0.55, point.x, point.z);
      const entity: Entity = {
        mesh,
        scatter: 0,
        shadow: s,
        lift: 0,
        timer: 0,
        heading: random(0, Math.PI * 2),
        phase: random(0, 10),
        age: 0,
        lifetime: Infinity,
        retiring: 0,
      };
      mesh.rotation.y = entity.heading;
      entities.push(entity);
      return entity;
    }

    function spawnAnimal(kind: Animal, point = freePoint(), special = false) {
      if (!point) return null;
      const { mesh, legs } = models.animal(kind, special);
      const animal = addEntity(mesh, point)!;
      animal.animal = kind;
      animal.special = special;
      animal.legs = legs;
      return animal;
    }

    function spawnHerd() {
      if (entities.filter(e => e.animal && e.animal !== 'gunner').length >= COW_CAP) return;
      const kind = chooseAnimal(pressure.level);
      const leader = spawnAnimal(kind);
      if (!leader || kind !== 'sheep') return;
      leader.flock = ++flockId;
      const p = leader.mesh.position;
      // Start the flock together without spawning a lamb in the beam or in debris.
      for (let n = 0; n < 2; n++) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const angle = random(0, Math.PI * 2);
          const pt = new THREE.Vector3(p.x + Math.sin(angle), 0, p.z + Math.cos(angle));
          if (!pointIsSafe(pt, 0.85)) continue;
          const sheep = spawnAnimal('sheep', pt)!;
          sheep.flock = leader.flock;
          sheep.heading = leader.heading;
          break;
        }
      }
    }

    function spawnHealer(placement = healerPoint()) {
      if (!placement) return null;
      const healer = spawnAnimal('cow', placement.point, true)!;
      healer.anchor = placement.anchor;
      return healer;
    }

    function spawnObstacle(kind: ObstacleKind | null = null) {
      if (entities.filter((e) => !e.animal).length >= pressure.obstacleCap) return null;
      if (
        kind !== 'hay' &&
        entities.filter((e) => !e.animal && e.kind !== 'hay').length >=
          pressure.obstacleCap - pressure.hayCap
      ) {
        return null;
      }
      const kinds: readonly ObstacleKind[] = ['rock', 'stump', 'crate'];
      const resolvedKind = kind || pick(kinds, Math.random);
      const { mesh, roller } = makeObstacle(resolvedKind);
      const obstacle = addEntity(mesh);
      if (obstacle) {
        obstacle.kind = resolvedKind;
        obstacle.roller = roller;
        obstacle.lifetime = (resolvedKind === 'hay' ? HAY_LIFETIME : DEBRIS_LIFETIME) + random(-3, 3);
      }
      return obstacle;
    }

    function spawnHay() {
      if (entities.filter((e) => e.kind === 'hay').length >= pressure.hayCap) return;
      const hay = spawnObstacle('hay');
      if (hay) {
        hay.heading = Math.atan2(-hay.mesh.position.x, -hay.mesh.position.z) + random(-0.4, 0.4);
        setStatus('Rolling hay! Watch your flight path.');
        if (elapsed > 0) audio.playHaySpawn();
      }
    }

    function syncHud() {
      onState({
        score,
        health,
        level: pressure.level,
        abductions,
        nextLevelAt: pressure.nextLevelAt,
        combo,
      });
    }

    function removeEntity(index: number) {
      const e = entities[index];
      scene.remove(e.mesh, e.shadow);
      for (const cow of entities) if (cow.anchor === e) cow.anchor = null;
      entities.splice(index, 1);
    }

    function collect(index: number) {
      const e = entities[index];
      removeEntity(index);
      if (e.egg) {
        // The egg goes off under the hull: blast there and knock the UFO off balance.
        eggBlast(ufo.position.x, ufo.position.y - 0.6, ufo.position.z);
        ufo.rotation.x += random(-0.5, 0.5);
        ufo.rotation.z += random(-0.5, 0.5);
        damage(DAMAGE, 'Egg bomb aboard! Give fresh eggs a wide berth.');
        return;
      }
      if (!e.animal) {
        damage(DAMAGE, 'Hazard aboard! Fly away to drop debris.');
        return;
      }
      combo = elapsed <= chainUntil ? Math.min(MAX_COMBO, combo + 1) : 1;
      chainUntil = elapsed + CHAIN_WINDOW;
      const points = POINTS[e.animal] * combo;
      score += points;
      if (++abductions >= pressure.nextLevelAt) {
        pressure = difficultyAt(pressure.level + 1);
        audio.playLevelUp();
      }
      if (e.special) {
        health = Math.min(MAX_HEALTH, health + HEAL);
        setStatus(`Healer aboard! +${HEAL} hull · +${points} points`);
        audio.playHealCollect();
      } else {
        const name = e.animal === 'gunner' ? 'Bazooka cow' : e.animal[0].toUpperCase() + e.animal.slice(1);
        setStatus(`${name} aboard! +${points}`);
        if (e.animal === 'cow' || e.animal === 'gunner') audio.playCowCollect();
        else audio.playAnimalCollect(e.animal);
      }
      if (combo > 1) audio.playCombo(combo);
      bursts.spawn(ufo.position, e.special ? 0xffb8d7 : 0xffefaf);
      syncHud();
    }

    function eggBlast(x: number, y: number, z: number) {
      blastWave.position.set(x, y, z);
      blastWave.scale.setScalar(0.3);
      blastWave.visible = true;
      blastAge = 0;
      bursts.spawn(blastWave.position, 0xffe9a8);
      bursts.spawn(blastWave.position, 0xfff6e0);
      bursts.spawn(blastWave.position, 0xff8c2f);
      audio.playMortarImpact();
    }

    function damage(amount: number, text: string) {
      if (ended) return;
      health = Math.max(0, health - amount);
      combo = 1;
      chainUntil = -1;
      flash = 0.55;
      setStatus(`${text} −${amount} hull`);
      audio.playDamage();
      bursts.spawn(ufo.position, 0xe68a65);
      syncHud();
      if (health === 0) {
        ended = true;
        writeStorage(SAVE_KEY, '');
        audio.setActive(false);
        audio.playGameOver();
        onState({ ended: true });
      }
    }

    function reset() {
      while (entities.length) removeEntity(entities.length - 1);
      bursts.clear();
      blastWave.visible = false;
      health = MAX_HEALTH;
      score = elapsed = cowTimer = obstacleTimer = flash = 0;
      specialTimer = hayTimer = 0;
      abductions = 0;
      pressure = difficultyAt(1);
      threats.reset();
      combo = 1;
      chainUntil = -1;
      flockId = 0;
      ended = false;
      setPaused(false);
      player.set(0, 0, 0);
      target.copy(player);
      camFocus.set(0, 0, 0);
      camera.position.copy(CAM_OFFSET);
      camera.lookAt(camFocus);
      camera.updateMatrixWorld();
      ufo.position.set(0, HOVER, 0);
      ufo.rotation.set(0, 0, 0);
      onState({ ended: false });
      for (let i = 0; i < 7; i++) spawnObstacle();
      spawnHealer();
      for (let i = 0; i < 9; i++) spawnHerd();
      syncHud();
      setStatus(
        audio.isLocked()
          ? 'Steer to explore · Tap or click for sound'
          : 'Beam on. Gather animals, drop hazards.',
      );
    }

    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointer = new THREE.Vector2();
    function worldPointFromPointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return null;
      groundHit.set(clamp(groundHit.x), 0, clamp(groundHit.z));
      return groundHit;
    }

    renderer.domElement.addEventListener(
      'pointermove',
      (event) => {
        if (paused || ended || stickActive || event.pointerType !== 'mouse') return;
        const point = worldPointFromPointer(event);
        if (point) target.copy(point);
      },
      { signal },
    );

    if (audio.isLocked()) {
      for (const eventName of ['pointerdown', 'touchend', 'keydown', 'click']) {
        window.addEventListener(eventName, audio.unlock, { capture: true, signal: gate.signal });
      }
    }

    function toggleMute() {
      const muted = audio.setMuted(!audio.isMuted());
      onState({ muted });
      if (!muted) audio.playUiClick(true);
    }

    function togglePause() {
      if (ended) return;
      if (!audio.isMuted()) audio.unlock();
      setPaused(!paused);
      audio.playUiClick(!paused);
    }

    function restart() {
      if (!audio.isMuted()) audio.unlock();
      reset();
      audio.playUiClick(true);
    }

    window.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat || !isGameKey(event)) return;
        if (event.key.toLowerCase() === 'm') {
          toggleMute();
          return;
        }
        if (event.key !== 'Escape' || ended) return;
        event.preventDefault();
        togglePause();
      },
      { signal },
    );

    function resize() {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const portrait = aspect < 1.15;
      const viewWidth = portrait
        ? Math.min(20, Math.max(13.8, 15.2 * aspect))
        : Math.max(23.5, 18.5 * aspect);
      const viewHeight = viewWidth / aspect;
      followStrength = portrait ? 0.62 : 0;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.near = 0.1;
      camera.far = 100;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(viewport);
    add(() => resizeObserver.disconnect());
    const SAVE_KEY = 'pasture-patrol-save-v1';

    function saveRun() {
      if (ended || elapsed <= 0) return;
      const savedEntities = [];
      for (const e of entities) {
        if (e.retiring > 0 || e.egg) continue;
        if (e.animal) {
          savedEntities.push({
            t: 'a',
            k: e.animal,
            s: !!e.special,
            x: e.mesh.position.x,
            z: e.mesh.position.z,
            h: e.heading,
            l: e.lift,
          });
        } else if (e.kind) {
          savedEntities.push({
            t: 'o',
            k: e.kind,
            x: e.mesh.position.x,
            z: e.mesh.position.z,
            h: e.heading,
            l: e.lift,
          });
        }
      }
      writeStorage(
        SAVE_KEY,
        JSON.stringify({
          v: 1,
          health,
          score,
          abductions,
          level: pressure.level,
          combo,
          chainLeft: Math.max(0, chainUntil - elapsed),
          elapsed,
          px: player.x,
          pz: player.z,
          entities: savedEntities,
        }),
      );
    }

    function restoreRun(): boolean {
      const raw = readStorage(SAVE_KEY);
      if (!raw) return false;
      try {
        const s = JSON.parse(raw);
        if (!s || s.v !== 1 || typeof s.score !== 'number' || typeof s.health !== 'number' || s.health <= 0 || !Array.isArray(s.entities)) {
          return false;
        }
        reset();
        while (entities.length) removeEntity(entities.length - 1);
        health = Math.min(MAX_HEALTH, Math.max(1, s.health));
        score = Math.max(0, s.score);
        abductions = Math.max(0, s.abductions || 0);
        pressure = difficultyAt(Math.max(1, s.level || 1));
        combo = Math.max(1, Math.min(MAX_COMBO, s.combo || 1));
        elapsed = Math.max(0, s.elapsed || 0);
        chainUntil = s.chainLeft > 0 ? elapsed + s.chainLeft : -1;
        player.set(clamp(s.px || 0), 0, clamp(s.pz || 0));
        target.copy(player);
        camFocus.copy(player);
        camera.position.copy(camFocus).add(CAM_OFFSET);
        camera.lookAt(camFocus);
        camera.updateMatrixWorld();
        ufo.position.set(player.x, HOVER, player.z);
        for (const item of s.entities) {
          const pt = new THREE.Vector3(clamp(item.x || 0), 0, clamp(item.z || 0));
          if (item.t === 'a' && item.k) {
            const spawned = spawnAnimal(item.k as Animal, pt, !!item.s);
            if (spawned) {
              spawned.heading = item.h || 0;
              spawned.lift = item.l || 0;
            }
          } else if (item.t === 'o' && item.k) {
            const { mesh, roller } = makeObstacle(item.k as ObstacleKind);
            const obs = addEntity(mesh, pt);
            if (obs) {
              obs.kind = item.k as ObstacleKind;
              obs.roller = roller;
              obs.heading = item.h || 0;
              obs.lift = item.l || 0;
              obs.lifetime = (obs.kind === 'hay' ? HAY_LIFETIME : DEBRIS_LIFETIME) + random(-3, 3);
            }
          }
        }
        syncHud();
        setPaused(true);
        setStatus('Patrol resumed');
        return true;
      } catch {
        return false;
      }
    }

    resize();
    if (!restoreRun()) reset();
    onLeavePage(scope, saveRun);

    const clock = new THREE.Clock();
    document.addEventListener(
      'visibilitychange',
      () => {
        clock.getDelta();
        if (document.hidden) setPaused(true);
      },
      { signal },
    );

    function steerAroundNeighbors(cow: Entity) {
      let x = Math.sin(cow.heading);
      let z = Math.cos(cow.heading);
      const p = cow.mesh.position;
      // A kick-ready goat charges debris instead of avoiding it.
      const chargesDebris = cow.animal === 'goat' && cow.trickWait !== undefined && cow.trickWait <= 0;
      for (const other of entities) {
        if (other === cow || other.lift > 0 || other.retiring > 0) continue;
        if (chargesDebris && !other.animal && other.kind !== 'hay') continue;
        const dx = p.x - other.mesh.position.x;
        const dz = p.z - other.mesh.position.z;
        const distance = Math.hypot(dx, dz);
        const flockmate = cow.flock !== undefined && cow.flock === other.flock;
        if (flockmate && distance > 1 && !cow.scatter) {
          const pull = Math.min(2, distance - 1) / distance;
          x -= dx * pull;
          z -= dz * pull;
        }
        const radius = flockmate ? 0.92 : other.animal ? 1.9 : 1.6;
        if (distance > 0.001 && distance < radius) {
          const strength = (1 - distance / radius) * 2.8;
          x += (dx / distance) * strength;
          z += (dz / distance) * strength;
        }
      }
      if (Math.hypot(x, z) > 0.01) cow.heading = Math.atan2(x, z);
    }

    function separateGroundedCows(dt: number) {
      const grounded = entities.filter((e) => e.lift === 0 && !e.retiring);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < grounded.length; i++) {
          for (let j = i + 1; j < grounded.length; j++) {
            const a = grounded[i];
            const b = grounded[j];
            const aw = a.animal ? 1 : 0;
            const bw = b.animal ? 1 : 0;
            if (!aw && !bw) continue;
            const ap = a.mesh.position;
            const bp = b.mesh.position;
            let dx = ap.x - bp.x;
            let dz = ap.z - bp.z;
            const distance = Math.hypot(dx, dz);
            const spacing = a.flock && a.flock === b.flock ? 0.86 : aw && bw ? COW_SPACING : 1.05;
            if (distance >= spacing) continue;
            if (distance < 0.001) {
              const angle = (i * 17 + j * 31) * 2.39996;
              dx = Math.sin(angle);
              dz = Math.cos(angle);
            } else {
              dx /= distance;
              dz /= distance;
            }
            const push = Math.min(spacing - distance, dt * 4) / (aw + bw);
            ap.x = clamp(ap.x + dx * push * aw);
            ap.z = clamp(ap.z + dz * push * aw);
            bp.x = clamp(bp.x - dx * push * bw);
            bp.z = clamp(bp.z - dz * push * bw);
          }
        }
      }
      for (const e of grounded) e.shadow.position.set(e.mesh.position.x, 0.12, e.mesh.position.z);
    }

    // Every so often a goat kicks debris at the UFO: a calm goat walks up to nearby debris, a fleeing one runs
    // for debris ahead of it and kicks anything it bumps. Returns the debris the goat is heading for.
    function goatTarget(goat: Entity, dt: number, fleeing: boolean) {
      if ((goat.trickWait = (goat.trickWait ?? random(3, 5)) - dt) > 0) return undefined;
      const p = goat.mesh.position;
      let best: Entity | undefined;
      let bestDistance = fleeing ? 4 : 5;
      for (const e of entities) {
        if (e.animal || e.kind === 'hay' || e.lift > 0 || e.retiring || e.slide) continue;
        const ox = e.mesh.position.x - p.x;
        const oz = e.mesh.position.z - p.z;
        const distance = Math.hypot(ox, oz);
        if (fleeing && distance > 1.2 && ox * (p.x - player.x) + oz * (p.z - player.z) <= 0) continue;
        if (distance < bestDistance) {
          best = e;
          bestDistance = distance;
        }
      }
      if (!best) {
        // A fleeing goat stays ready to kick the next debris it bumps into.
        if (!fleeing) goat.trickWait = 2;
        return undefined;
      }
      if (bestDistance > 1.2) return best;
      const h = best.mesh.position;
      // Aim the slide to stop where the UFO is now.
      const reach = Math.min(6, Math.hypot(player.x - h.x, player.z - h.z));
      best.heading = Math.atan2(player.x - h.x, player.z - h.z);
      best.slide = Math.sqrt(2 * SLIDE_DRAG * reach);
      goat.trickWait = random(4, 7);
      bursts.spawn(h, 0xb48a5a);
      audio.playHayBounce();
      setStatus('Goat kick! Debris incoming.');
      return undefined;
    }

    function layEgg(chicken: Entity, dt: number) {
      if (pressure.eggCap === 0) return;
      if ((chicken.trickWait = (chicken.trickWait ?? random(2, 6)) - dt) > 0) return;
      chicken.trickWait = random(pressure.eggGap, pressure.eggGap + 4);
      if (entities.filter((e) => e.egg).length >= pressure.eggCap) return;
      // Lay right at the hen's tail; she stops for a beat so it reads as hers.
      const c = chicken.mesh.position;
      const point = new THREE.Vector3(clamp(c.x - Math.sin(chicken.heading) * 0.35), 0, clamp(c.z - Math.cos(chicken.heading) * 0.35));
      chicken.pause = 0.45;
      // Scale a child so the shared lift/despawn code can keep driving the root's scale.
      const mesh = new THREE.Group();
      const model = models.miniature('egg');
      model.scale.setScalar(1.5);
      mesh.add(model);
      const egg = addEntity(mesh, point)!;
      egg.egg = true;
      egg.lifetime = random(3.2, 4.2);
      bursts.spawn(point, 0xfff6e0);
      audio.playAnimalCollect('chicken');
      setStatus('Egg bomb! It is light, so do not graze it.');
    }

    function moveAnimal(e: Entity, dx: number, dz: number, d: number, dt: number) {
      if (e.aiming) return;
      if (e.pause) {
        e.pause = Math.max(0, e.pause - dt);
        return;
      }
      const p = e.mesh.position;
      e.timer -= dt;
      e.scatter = Math.max(0, e.scatter - dt);
      const scared = d < FLEE_RADIUS;
      if (scared && !e.wasScared && e.animal === 'cow' && e.age > 0.3) audio.playCowStartle();
      e.wasScared = scared;
      if (!e.scatter) {
        const debris = e.animal === 'goat' ? goatTarget(e, dt, scared) : undefined;
        if (e.animal === 'chicken') layEgg(e, dt);
        if (debris) {
          e.heading = Math.atan2(debris.mesh.position.x - p.x, debris.mesh.position.z - p.z);
        } else if (scared) {
          e.heading = Math.atan2(-dx, -dz) + Math.sin(elapsed * 4 + e.phase) * 0.65;
        } else if (e.timer <= 0) {
          e.heading += random(-1.8, 1.8);
          e.timer = random(0.8, 2.5);
        }
        if (!scared && e.special && e.anchor) {
          const ax = e.anchor.mesh.position.x - p.x;
          const az = e.anchor.mesh.position.z - p.z;
          const dist = Math.hypot(ax, az);
          if (dist > 2) e.heading = Math.atan2(ax, az);
          else if (dist < 1.5) e.heading = Math.atan2(-ax, -az);
        }
        steerAroundNeighbors(e);
      }
      if (Math.abs(p.x) > 6.6 && Math.sin(e.heading) * p.x > 0) e.heading = -e.heading;
      if (Math.abs(p.z) > 6.6 && Math.cos(e.heading) * p.z > 0) e.heading = Math.PI - e.heading;
      const pace = e.animal === 'chicken' ? 1.45 : e.animal === 'pig' ? 0.78 : 1;
      const speed = pace * (scared || e.scatter ? pressure.fleeSpeed : COW_SPEED * (e.special ? 0.28 : 0.55));
      p.x = clamp(p.x + Math.sin(e.heading) * speed * dt);
      p.z = clamp(p.z + Math.cos(e.heading) * speed * dt);
      const turn = e.heading - e.mesh.rotation.y;
      e.mesh.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 7);
      p.y += Math.abs(Math.sin(elapsed * (scared ? 15 : 9) + e.phase)) * 0.045;
      if (e.legs) {
        for (const leg of e.legs) leg.mesh.rotation.x = Math.sin(elapsed * 10 + leg.phase + e.phase) * 0.3;
      }
    }

    function update(dt: number) {
      elapsed += dt;
      if (combo > 1 && elapsed > chainUntil) {
        combo = 1;
        onState({ combo });
      }
      flash = Math.max(0, flash - dt);
      if (elapsed > statusUntil && statusText !== IDLE_STATUS) {
        statusText = IDLE_STATUS;
        onState({ status: statusText });
      }
      if (stickActive) {
        const mag = Math.hypot(stickX, stickY);
        if (mag > STICK_DEADZONE) {
          // Squared response: small pushes creep for precise beaming, full tilt still crosses the field.
          const t = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
          // Movement chases `target` at 7× its distance, so this offset yields the stick speed.
          const reach = (STICK_SPEED * t * t) / 7 / mag;
          const wx = (stickX + stickY) * Math.SQRT1_2;
          const wz = (stickY - stickX) * Math.SQRT1_2;
          target.set(clamp(player.x + wx * reach), 0, clamp(player.z + wz * reach));
        } else {
          target.copy(player);
        }
      }
      movement.copy(target).sub(player);
      const distance = movement.length();
      const speedNorm = distance > 0.01 ? Math.min(1, (distance * 7) / UFO_SPEED) : 0;
      if (distance > 0.01) {
        player.addScaledVector(movement.normalize(), Math.min(distance * 7 * dt, UFO_SPEED * dt));
      }
      camFocus.x = THREE.MathUtils.lerp(camFocus.x, player.x * followStrength, Math.min(1, dt * 5));
      camFocus.z = THREE.MathUtils.lerp(camFocus.z, player.z * followStrength, Math.min(1, dt * 5));
      camera.position.copy(camFocus).add(CAM_OFFSET);
      camera.lookAt(camFocus);
      camera.updateMatrixWorld();
      ufo.position.set(player.x, HOVER + Math.sin(elapsed * 3) * 0.08, player.z);
      ufo.rotation.x = THREE.MathUtils.lerp(ufo.rotation.x, movement.z * Math.min(distance, 1) * 0.12, dt * 8);
      ufo.rotation.z = THREE.MathUtils.lerp(ufo.rotation.z, -movement.x * Math.min(distance, 1) * 0.12, dt * 8);
      ufo.rotation.y += dt * 0.25;
      beam.position.set(player.x, HOVER / 2, player.z);
      beamMaterial.color.setHex(flash > 0 ? 0xff8064 : 0xc4ffb0);
      beamMaterial.opacity = 0.14 + Math.sin(elapsed * 4) * 0.025;
      ring.position.set(player.x, 0.13, player.z);
      ringMaterial.color.setHex(flash > 0 ? 0xff8064 : 0xf2ffbc);
      playerShadow.position.set(player.x, 0.12, player.z);

      let maxCowLift = 0;
      let maxHazardLift = 0;
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        const p = e.mesh.position;
        e.age += dt;
        const dx = player.x - p.x;
        const dz = player.z - p.z;
        const d = Math.hypot(dx, dz);
        if (e.egg && e.age >= e.lifetime && e.lift === 0) {
          eggBlast(p.x, 0.3, p.z);
          removeEntity(i);
          continue;
        }
        if (!e.animal && !e.retiring && e.age >= e.lifetime && e.lift === 0 && d > SUCTION_RADIUS + 0.6) {
          e.retiring = Number.EPSILON;
        }
        if (e.retiring) {
          e.retiring += dt;
          const scale = Math.max(0, 1 - e.retiring / DESPAWN_DURATION);
          e.mesh.scale.setScalar(scale);
          e.shadow.scale.setScalar(0.55 * scale);
          if (e.retiring >= DESPAWN_DURATION) removeEntity(i);
          continue;
        }
        if (d < SUCTION_RADIUS + (e.egg ? EGG_GRAB_BONUS : 0) && e.age > 0.7) {
          const liftSpeed = e.egg ? EGG_LIFT_SPEED : e.animal === 'pig' ? 0.83 : e.animal ? COW_LIFT_SPEED : pressure.hazardLift;
          e.lift = Math.min(1, e.lift + dt * liftSpeed);
          e.wasScared = false;
          if (e.animal) maxCowLift = Math.max(maxCowLift, e.lift);
          else maxHazardLift = Math.max(maxHazardLift, e.lift);
          p.x += dx * dt * 3;
          p.z += dz * dt * 3;
          p.y = e.lift * (HOVER - 0.4);
          e.mesh.rotation.y += dt * 4 * e.lift;
          e.mesh.scale.setScalar(1 - e.lift * 0.55);
          if (e.lift >= 1) {
            collect(i);
            if (ended) break;
            continue;
          }
        } else {
          e.lift = Math.max(0, e.lift - dt * 2.5);
          p.y = e.lift * (HOVER - 0.4);
          e.mesh.scale.setScalar(1 - e.lift * 0.55);
          if (e.egg && e.lift === 0) {
            // Pop in as it is laid, then tick faster as the fuse runs out.
            const fuse = e.lifetime - e.age;
            const pulse = 1 + 0.12 * Math.abs(Math.sin(e.age * (fuse < 1.2 ? 22 : 8)));
            e.mesh.scale.setScalar(pulse * Math.min(1, e.age / 0.25));
          }
          if (e.animal && e.lift === 0) {
            moveAnimal(e, dx, dz, d, dt);
          } else if (e.kind === 'hay' && e.lift === 0) {
            p.x += Math.sin(e.heading) * pressure.haySpeed * dt;
            p.z += Math.cos(e.heading) * pressure.haySpeed * dt;
            let bounced = false;
            if (Math.abs(p.x) > 6.8) {
              p.x = Math.sign(p.x) * 6.8;
              e.heading = -e.heading;
              bounced = true;
            }
            if (Math.abs(p.z) > 6.8) {
              p.z = Math.sign(p.z) * 6.8;
              e.heading = Math.PI - e.heading;
              bounced = true;
            }
            if (bounced) audio.playHayBounce();
            e.mesh.rotation.y = e.heading;
            if (e.roller) e.roller.rotation.x += (pressure.haySpeed * dt) / 0.48;
          } else if (e.slide && e.lift === 0) {
            p.x = clamp(p.x + Math.sin(e.heading) * e.slide * dt);
            p.z = clamp(p.z + Math.cos(e.heading) * e.slide * dt);
            e.mesh.rotation.y += e.slide * dt * 2;
            e.slide = Math.max(0, e.slide - SLIDE_DRAG * dt);
          }
        }
        e.shadow.position.set(p.x, 0.12, p.z);
        e.shadow.scale.setScalar(Math.max(0.15, 0.55 * (1 - e.lift)));
      }

      if (!ended) threats.update(dt, pressure.level);
      audio.update(dt, {
        speedNorm,
        cowLift: ended ? 0 : maxCowLift,
        hazardLift: ended ? 0 : maxHazardLift,
      });
      if (!ended) separateGroundedCows(dt);
      if (blastWave.visible) {
        blastAge += dt;
        blastWave.scale.setScalar(0.3 + blastAge * 5);
        blastWave.material.opacity = 0.6 * Math.max(0, 1 - blastAge / 0.4);
        blastWave.visible = blastAge < 0.4;
      }
      bursts.update(dt);
      if (ended) return;
      cowTimer += dt;
      obstacleTimer += dt;
      specialTimer += dt;
      hayTimer += dt;
      if (cowTimer >= COW_INTERVAL) {
        cowTimer = 0;
        spawnHerd();
      }
      if (hayTimer >= pressure.hayInterval) {
        hayTimer = 0;
        spawnHay();
      }
      if (obstacleTimer >= pressure.obstacleInterval) {
        obstacleTimer = 0;
        spawnObstacle();
      }
      if (specialTimer >= pressure.healerInterval) {
        specialTimer = entities.some(e => e.special) || spawnHealer() ? 0 : pressure.healerInterval - 1;
      }
    }

    let rafId = 0;
    let saveAccum = 0;
    add(() => cancelAnimationFrame(rafId));
    function animate() {
      if (signal.aborted) return;
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      if (document.hidden) return;
      if (!ended && !paused) {
        update(dt);
        saveAccum += dt;
        if (saveAccum >= 2) {
          saveAccum = 0;
          saveRun();
        }
      }
      renderer.render(scene, camera);
    }
    animate();

    return {
      toggleMute,
      togglePause,
      restart,
      setStickInput,
      destroy: dispose,
    };
  });
}
