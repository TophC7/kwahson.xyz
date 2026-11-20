import * as THREE from 'three';
import { createAudio } from './audio';

// All gameplay tuning is here. Distances are in world units, time in seconds.
const HALF = 7.5;
const UFO_SPEED = 9;
const COW_SPEED = 1.05;
const SUCTION_RADIUS = 1.55;
const COW_LIFT_SPEED = 1.55;
const HAZARD_LIFT_SPEED = 1.1;
const MAX_HEALTH = 100;
const DAMAGE = 20;
const HEAL = 25;
const COW_CAP = 13;
const OBSTACLE_CAP = 9;
const DEBRIS_LIFETIME = 28;
const HAY_LIFETIME = 18;
const DESPAWN_DURATION = 1.2;
const COW_SPACING = 1.15;
const COW_INTERVAL = 1.8;
const OBSTACLE_INTERVAL = 4;
const SPECIAL_INTERVAL = 12;
const SCORE_PER_LEVEL = 8;
export const MAX_LEVEL = 5;
const HAY_INTERVAL = 10;
const FLEE_RADIUS = 4.3;
const HOVER = 2.8;

const DIFFICULTY_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const level = i + 1;
  return Object.freeze({
    level,
    obstacleCap: OBSTACLE_CAP + i * 2,
    obstacleInterval: OBSTACLE_INTERVAL - i * 0.6,
    hayInterval: HAY_INTERVAL - i,
    hayCap: Math.min(4, level + 1),
    haySpeed: 1.6 + i * 0.3,
    fleeSpeed: 2.4 + i * 0.25,
  });
});

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number) => THREE.MathUtils.clamp(v, -HALF + 0.5, HALF - 0.5);

type ObstacleKind = 'hay' | 'rock' | 'stump' | 'crate';

interface CowLeg {
  mesh: THREE.Mesh;
  phase: number;
}

interface Entity {
  mesh: THREE.Group;
  type: 'cow' | 'obstacle';
  special: boolean;
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
}

interface BurstEffect {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export interface PastureHudState {
  score: number;
  health: number;
  level: number;
  status: string;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  legends: {
    cow: string;
    healer: string;
    hazards: string;
  };
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
    viewport.appendChild(renderer.domElement);
    cleanups.push(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });
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
    scene.add(new THREE.HemisphereLight(0xfff8e8, 0x709675, 2.4));
    const sun = new THREE.DirectionalLight(0xffedd0, 3);
    sun.position.set(-5, 12, 7);
    scene.add(sun);

    // Shared resources keep restarts and spawning memory-stable.
    const geometry = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 12, 8),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
      cone: new THREE.ConeGeometry(1, 1, 8),
      rock: new THREE.IcosahedronGeometry(1, 0),
      disc: new THREE.CircleGeometry(1, 32),
      ring: new THREE.RingGeometry(0.95, 1, 48),
    };
    const materials = new Map<number, THREE.MeshStandardMaterial>();
    cleanups.push(() => {
      for (const geo of Object.values(geometry)) geo.dispose();
      for (const mat of materials.values()) mat.dispose();
    });

    function material(color: number) {
      let mat = materials.get(color);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
        materials.set(color, mat);
      }
      return mat;
    }

    function part(
      parent: THREE.Object3D,
      kind: keyof typeof geometry,
      color: number,
      scale: [number, number, number],
      position: [number, number, number] = [0, 0, 0],
      mat: THREE.Material | null = null,
    ) {
      const mesh = new THREE.Mesh(geometry[kind], mat || material(color));
      mesh.scale.set(...scale);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    }

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x29482e,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    cleanups.push(() => shadowMaterial.dispose());

    function shadow(parent: THREE.Object3D, size: number, x = 0, z = 0, aspect = 1) {
      const mesh = part(parent, 'disc', 0, [size, size * aspect, 1], [x, 0.12, z], shadowMaterial);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }

    const land = new THREE.Group();
    scene.add(land);
    part(land, 'box', 0xa16d4e, [16, 0.75, 16], [0, -0.53, 0]);
    part(land, 'box', 0x739c52, [16.12, 0.25, 16.12], [0, -0.08, 0]);
    part(land, 'box', 0x9acb6b, [15.8, 0.08, 15.8], [0, 0.035, 0]);
    for (let x = -7; x <= 7; x += 2) {
      for (let z = -7; z <= 7; z += 2) {
        if ((x + z) % 4 === 0) part(land, 'box', 0x94c365, [1.98, 0.01, 1.98], [x, 0.08, z]);
      }
    }
    for (let i = -8; i <= 8; i += 2) {
      for (const [x, z] of [
        [i, -8],
        [-8, i],
        [8, i],
        [i, 8],
      ]) {
        part(land, 'box', 0xf3e6bd, [0.12, 0.55, 0.12], [x, 0.3, z]);
        part(land, 'sphere', 0xfff1cf, [0.11, 0.08, 0.11], [x, 0.59, z]);
      }
    }
    for (const z of [-8, 8]) part(land, 'box', 0xe0cf9e, [16, 0.08, 0.08], [0, 0.35, z]);
    for (const x of [-8, 8]) part(land, 'box', 0xe0cf9e, [0.08, 0.08, 16], [x, 0.35, 0]);
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

    function makeCow({ special = false } = {}) {
      const cow = new THREE.Group();
      const legs: CowLeg[] = [];
      const white = special ? 0xffd8e5 : 0xfff8e7;
      const patch = special ? 0xe87fa8 : 0x39413c;
      part(cow, 'box', white, [0.64, 0.48, 0.96], [0, 0.57, 0]);
      part(cow, 'box', patch, [0.65, 0.22, 0.3], [0, 0.69, -0.19]);
      part(cow, 'box', patch, [0.12, 0.24, 0.3], [0.28, 0.48, 0.24]);
      for (const x of [-0.22, 0.22]) {
        for (const z of [-0.3, 0.3]) {
          const leg = part(cow, 'box', white, [0.14, 0.3, 0.14], [x, 0.22, z]);
          legs.push({ mesh: leg, phase: x * z > 0 ? 0 : Math.PI });
          part(cow, 'box', patch, [0.15, 0.1, 0.15], [x, 0.1, z]);
        }
      }
      part(cow, 'box', white, [0.56, 0.46, 0.43], [0, 0.77, 0.55]);
      part(cow, 'box', 0xf1ada6, [0.57, 0.21, 0.2], [0, 0.63, 0.79]);
      for (const x of [-0.18, 0.18]) {
        part(cow, 'sphere', 0x293d37, [0.038, 0.047, 0.025], [x, 0.84, 0.772]);
        part(cow, 'sphere', 0xbb797a, [0.025, 0.025, 0.015], [x * 0.7, 0.66, 0.895]);
        part(cow, 'cone', 0xe5c493, [0.07, 0.2, 0.07], [x, 1.06, 0.54]);
        const ear = part(cow, 'box', patch, [0.24, 0.09, 0.14], [x * 2, 0.89, 0.53]);
        ear.rotation.z = x > 0 ? 0.25 : -0.25;
      }
      const tail = part(cow, 'cylinder', white, [0.025, 0.4, 0.025], [0, 0.55, -0.61]);
      tail.rotation.x = -0.65;
      part(cow, 'sphere', patch, [0.06, 0.09, 0.06], [0, 0.38, -0.72]);
      if (special) {
        part(cow, 'box', 0xfff7dd, [0.35, 0.1, 0.1], [0, 1.45, 0]);
        part(cow, 'box', 0xfff7dd, [0.1, 0.35, 0.1], [0, 1.45, 0]);
      }
      return { mesh: cow, legs };
    }

    function makeUfo() {
      const group = new THREE.Group();
      part(group, 'sphere', 0xc3e2d2, [1.05, 0.23, 1.05]);
      part(group, 'cylinder', 0x3d7167, [0.82, 0.13, 0.82], [0, -0.1, 0]);
      part(group, 'sphere', 0x5eaea4, [0.6, 0.43, 0.6], [0, 0.2, 0]);
      part(group, 'sphere', 0xc7f6dc, [0.18, 0.08, 0.1], [-0.22, 0.5, 0.25]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        part(group, 'sphere', 0xffdc76, [0.1, 0.07, 0.1], [Math.sin(a) * 0.85, 0.12, Math.cos(a) * 0.85]);
      }
      part(group, 'cylinder', 0x3d7167, [0.025, 0.3, 0.025], [0, 0.68, 0]);
      part(group, 'sphere', 0xffb870, [0.09, 0.09, 0.09], [0, 0.88, 0]);
      return group;
    }

    function makeObstacle(kind: ObstacleKind) {
      const group = new THREE.Group();
      let roller: THREE.Group | undefined;
      if (kind === 'hay') {
        roller = new THREE.Group();
        roller.position.y = 0.48;
        group.add(roller);
        const bale = part(roller, 'cylinder', 0xe6b853, [0.48, 0.82, 0.48]);
        bale.rotation.z = Math.PI / 2;
        for (const x of [-0.27, 0.27]) {
          const strap = part(roller, 'cylinder', 0xa77a38, [0.495, 0.06, 0.495], [x, 0, 0]);
          strap.rotation.z = Math.PI / 2;
        }
        for (const x of [-0.42, 0.42]) {
          const end = part(roller, 'cylinder', 0xffdc7f, [0.34, 0.02, 0.34], [x, 0, 0]);
          end.rotation.z = Math.PI / 2;
          part(roller, 'box', 0xc3933e, [0.025, 0.07, 0.58], [x * 1.03, 0, 0]);
        }
      } else if (kind === 'rock') {
        part(group, 'rock', 0x87949b, [0.56, 0.6, 0.5], [0, 0.4, 0]);
        part(group, 'rock', 0xa4adb0, [0.28, 0.3, 0.27], [0.35, 0.18, 0.15]);
      } else if (kind === 'stump') {
        part(group, 'cylinder', 0x966a49, [0.42, 0.62, 0.42], [0, 0.36, 0]);
        part(group, 'cylinder', 0xe4bf83, [0.36, 0.025, 0.36], [0, 0.68, 0]);
        part(group, 'cylinder', 0xb58958, [0.22, 0.028, 0.22], [0, 0.69, 0]);
        part(group, 'cylinder', 0xe4bf83, [0.13, 0.03, 0.13], [0, 0.7, 0]);
      } else {
        part(group, 'box', 0xc88c52, [0.74, 0.73, 0.74], [0, 0.4, 0]);
        for (const x of [-0.26, 0.26]) part(group, 'box', 0xf0cb85, [0.1, 0.78, 0.79], [x, 0.4, 0]);
        const brace = part(group, 'box', 0xf0cb85, [0.8, 0.1, 0.04], [0, 0.4, 0.39]);
        brace.rotation.z = Math.PI / 4;
      }
      return { mesh: group, roller };
    }

    function renderLegendPreviews() {
      const previewScene = new THREE.Scene();
      previewScene.add(new THREE.HemisphereLight(0xfff8e8, 0x709675, 2.4), sun.clone());
      const previewCamera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 30);
      previewCamera.position.set(4, 3, 5);
      previewCamera.lookAt(0, 0.65, 0);
      renderer.setSize(128, 128, false);

      const cowModel = makeCow({ special: false }).mesh;
      previewScene.add(cowModel);
      renderer.render(previewScene, previewCamera);
      const cow = renderer.domElement.toDataURL('image/png');
      previewScene.remove(cowModel);

      const healerModel = makeCow({ special: true }).mesh;
      previewScene.add(healerModel);
      renderer.render(previewScene, previewCamera);
      const healer = renderer.domElement.toDataURL('image/png');
      previewScene.remove(healerModel);

      const hazardsGroup = new THREE.Group();
      (['rock', 'stump', 'crate', 'hay'] as ObstacleKind[]).forEach((kind, i) => {
        const model = makeObstacle(kind).mesh;
        model.position.x = (i - 1.5) * 1.12;
        model.rotation.y = -0.3;
        hazardsGroup.add(model);
      });
      previewScene.add(hazardsGroup);
      previewCamera.left = -2.4;
      previewCamera.right = 2.4;
      previewCamera.top = 1.2;
      previewCamera.bottom = -1.2;
      previewCamera.position.set(0, 3.4, 6);
      previewCamera.lookAt(0, 0.4, 0);
      previewCamera.updateProjectionMatrix();
      renderer.setSize(256, 128, false);
      renderer.render(previewScene, previewCamera);
      const hazards = renderer.domElement.toDataURL('image/png');

      onState({ legends: { cow, healer, hazards } });
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
    cleanups.push(() => {
      beamGeometry.dispose();
      beamMaterial.dispose();
      ringMaterial.dispose();
    });
    const ring = part(scene, 'ring', 0, [SUCTION_RADIUS, SUCTION_RADIUS, 1], [0, 0.12, 0], ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    const playerShadow = shadow(scene, 0.8, 0, 0, 0.7);

    const entities: Entity[] = [];
    const effects: BurstEffect[] = [];
    let health = MAX_HEALTH;
    let score = 0;
    let elapsed = 0;
    let cowTimer = 0;
    let obstacleTimer = 0;
    let specialTimer = 0;
    let hayTimer = 0;
    let ended = false;
    let statusText = '';
    let statusUntil = 0;
    let flash = 0;
    let lastLevel = 1;
    let paused = false;

    let unlockAbort: AbortController | null = null;
    const audio = createAudio({
      onUnlock: () => {
        unlockAbort?.abort();
        unlockAbort = null;
        if (!audio.isMuted() && !ended && !paused && (statusText.includes('sound') || elapsed < 3)) {
          setStatus('Audio on. Beam ready.');
        }
      },
    });
    cleanups.push(() => audio.destroy());
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

    function difficulty() {
      const index = Math.min(MAX_LEVEL - 1, Math.floor(score / SCORE_PER_LEVEL));
      return DIFFICULTY_LEVELS[index];
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
          e.type === 'obstacle' &&
          e.kind !== 'hay' &&
          e.lift === 0 &&
          !e.retiring &&
          e.lifetime - e.age > 8,
      );
      for (let attempt = 0; attempt < 100 && anchors.length; attempt++) {
        const anchor = anchors[Math.floor(Math.random() * anchors.length)];
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

    function addEntity(
      mesh: THREE.Group,
      type: 'cow' | 'obstacle',
      special = false,
      point: THREE.Vector3 | null = null,
    ) {
      const p = point || freePoint();
      if (!p) return null;
      mesh.position.copy(p);
      scene.add(mesh);
      const s = shadow(scene, 0.55, p.x, p.z);
      const entity: Entity = {
        mesh,
        type,
        special,
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

    function spawnCow(special = false, presetPlacement: { point: THREE.Vector3; anchor: Entity } | null = null) {
      if (entities.filter((e) => e.type === 'cow').length >= COW_CAP) return null;
      const placement = special ? presetPlacement ?? healerPoint() : null;
      if (special && !placement) return null;
      const { mesh, legs } = makeCow({ special });
      const cow = addEntity(mesh, 'cow', special, placement?.point ?? null);
      if (cow) {
        cow.legs = legs;
        if (placement) cow.anchor = placement.anchor;
      }
      return cow;
    }

    function spawnObstacle(kind: ObstacleKind | null = null) {
      const pressure = difficulty();
      if (entities.filter((e) => e.type === 'obstacle').length >= pressure.obstacleCap) return null;
      if (
        kind !== 'hay' &&
        entities.filter((e) => e.type === 'obstacle' && e.kind !== 'hay').length >=
          pressure.obstacleCap - pressure.hayCap
      ) {
        return null;
      }
      const kinds: ObstacleKind[] = ['rock', 'stump', 'crate'];
      const resolvedKind = kind || kinds[Math.floor(Math.random() * kinds.length)];
      const { mesh, roller } = makeObstacle(resolvedKind);
      const obstacle = addEntity(mesh, 'obstacle');
      if (obstacle) {
        obstacle.kind = resolvedKind;
        obstacle.roller = roller;
        obstacle.lifetime = (resolvedKind === 'hay' ? HAY_LIFETIME : DEBRIS_LIFETIME) + random(-3, 3);
      }
      return obstacle;
    }

    function spawnHay() {
      if (entities.filter((e) => e.kind === 'hay').length >= difficulty().hayCap) return;
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
        level: difficulty().level,
      });
    }

    function burst(position: THREE.Vector3, color: number) {
      for (let i = 0; i < 9; i++) {
        const mesh = part(scene, 'box', color, [0.1, 0.1, 0.1], [position.x, position.y, position.z]);
        effects.push({
          mesh,
          velocity: new THREE.Vector3(random(-2, 2), random(1, 3), random(-2, 2)),
          life: 0.65,
        });
      }
    }

    function removeEntity(index: number) {
      const e = entities[index];
      scene.remove(e.mesh, e.shadow);
      for (const cow of entities) if (cow.anchor === e) cow.anchor = null;
      entities.splice(index, 1);
    }

    function collect(index: number) {
      const e = entities[index];
      if (e.type === 'cow') {
        score++;
        const nextLevel = difficulty().level;
        if (e.special) {
          health = Math.min(MAX_HEALTH, health + HEAL);
          setStatus('Sweet! +25 hull health');
          audio.playHealCollect();
        } else {
          setStatus('Another happy passenger! +1');
          audio.playCowCollect();
        }
        if (nextLevel > lastLevel) {
          lastLevel = nextLevel;
          audio.playLevelUp();
        }
        burst(ufo.position, e.special ? 0xffb8d7 : 0xffefaf);
      } else {
        health = Math.max(0, health - DAMAGE);
        flash = 0.55;
        setStatus('Ouch! Keep hazards out of the beam.');
        audio.playDamage();
        burst(ufo.position, 0xe68a65);
      }
      removeEntity(index);
      syncHud();
      if (health === 0) {
        ended = true;
        audio.setActive(false);
        audio.playGameOver();
        onState({ ended: true });
      }
    }

    function reset() {
      while (entities.length) removeEntity(entities.length - 1);
      for (const effect of effects) scene.remove(effect.mesh);
      effects.length = 0;
      health = MAX_HEALTH;
      score = elapsed = cowTimer = obstacleTimer = flash = 0;
      specialTimer = hayTimer = 0;
      lastLevel = 1;
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
      spawnCow(true);
      for (let i = 0; i < 9; i++) spawnCow();
      syncHud();
      setStatus(
        audio.isLocked()
          ? 'Steer to explore · Tap or click for sound'
          : 'Beam on. Gather cows, drop hazards.',
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
      const gate = new AbortController();
      unlockAbort = gate;
      cleanups.push(() => gate.abort());
      const onGesture = () => {
        if (!audio.isMuted()) audio.unlock(true);
      };
      for (const eventName of ['pointerdown', 'touchend', 'keydown', 'click']) {
        window.addEventListener(eventName, onGesture, { capture: true, signal: gate.signal });
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
        if (event.repeat) return;
        if (event.key.toLowerCase() === 'm' && !event.metaKey && !event.ctrlKey && !event.altKey) {
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
    cleanups.push(() => resizeObserver.disconnect());
    resize();
    reset();

    const clock = new THREE.Clock();
    document.addEventListener(
      'visibilitychange',
      () => {
        clock.getDelta();
        audio.setHidden(document.hidden);
        if (document.hidden) setPaused(true);
      },
      { signal },
    );

    function steerAroundNeighbors(cow: Entity) {
      let x = Math.sin(cow.heading);
      let z = Math.cos(cow.heading);
      const p = cow.mesh.position;
      for (const other of entities) {
        if (other === cow || other.lift > 0 || other.retiring > 0) continue;
        const dx = p.x - other.mesh.position.x;
        const dz = p.z - other.mesh.position.z;
        const distance = Math.hypot(dx, dz);
        const radius = other.type === 'cow' ? 1.9 : 1.6;
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
            const aw = a.type === 'cow' ? 1 : 0;
            const bw = b.type === 'cow' ? 1 : 0;
            if (!aw && !bw) continue;
            const ap = a.mesh.position;
            const bp = b.mesh.position;
            let dx = ap.x - bp.x;
            let dz = ap.z - bp.z;
            const distance = Math.hypot(dx, dz);
            const spacing = aw && bw ? COW_SPACING : 1.05;
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

    function update(dt: number) {
      elapsed += dt;
      const pressure = difficulty();
      flash = Math.max(0, flash - dt);
      if (elapsed > statusUntil && statusText !== 'Beam on. Watch what you pick up.') {
        statusText = 'Beam on. Watch what you pick up.';
        onState({ status: statusText });
      }
      if (stickActive) {
        const mag = Math.hypot(stickX, stickY);
        if (mag > 0.06) {
          const wx = (stickX + stickY) * Math.SQRT1_2;
          const wz = (stickY - stickX) * Math.SQRT1_2;
          target.set(clamp(player.x + wx * 1.5), 0, clamp(player.z + wz * 1.5));
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
        if (e.type === 'obstacle' && !e.retiring && e.age >= e.lifetime && e.lift === 0 && d > SUCTION_RADIUS + 0.6) {
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
        if (d < SUCTION_RADIUS && e.age > 0.7) {
          e.lift = Math.min(1, e.lift + dt * (e.type === 'cow' ? COW_LIFT_SPEED : HAZARD_LIFT_SPEED));
          e.wasScared = false;
          if (e.type === 'cow') maxCowLift = Math.max(maxCowLift, e.lift);
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
          if (e.type === 'cow' && e.lift === 0) {
            e.timer -= dt;
            if (e.timer <= 0) {
              e.heading += random(-1.8, 1.8);
              e.timer = random(0.8, 2.5);
            }
            const scared = d < FLEE_RADIUS;
            if (scared && !e.wasScared && e.age > 0.3) audio.playCowStartle();
            e.wasScared = scared;
            if (scared) e.heading = Math.atan2(-dx, -dz) + Math.sin(elapsed * 4 + e.phase) * 0.65;
            else if (e.special && e.anchor) {
              const ax = e.anchor.mesh.position.x - p.x;
              const az = e.anchor.mesh.position.z - p.z;
              const anchorDist = Math.hypot(ax, az);
              if (anchorDist > 2) e.heading = Math.atan2(ax, az);
              else if (anchorDist < 1.5) e.heading = Math.atan2(-ax, -az);
            }
            steerAroundNeighbors(e);
            if (Math.abs(p.x) > 6.6 && Math.sin(e.heading) * p.x > 0) e.heading = -e.heading;
            if (Math.abs(p.z) > 6.6 && Math.cos(e.heading) * p.z > 0) e.heading = Math.PI - e.heading;
            const speed = scared ? pressure.fleeSpeed : COW_SPEED * (e.special ? 0.28 : 0.55);
            p.x += Math.sin(e.heading) * speed * dt;
            p.z += Math.cos(e.heading) * speed * dt;
            if (Math.abs(p.x) > 6.9 || Math.abs(p.z) > 6.9) {
              e.heading = Math.atan2(-p.x, -p.z) + random(-0.5, 0.5);
              p.x = clamp(p.x);
              p.z = clamp(p.z);
            }
            const turn = Math.atan2(
              Math.sin(e.heading - e.mesh.rotation.y),
              Math.cos(e.heading - e.mesh.rotation.y),
            );
            e.mesh.rotation.y += turn * Math.min(1, dt * 7);
            p.y += Math.abs(Math.sin(elapsed * (scared ? 15 : 9) + e.phase)) * 0.045;
            if (e.legs) {
              for (const leg of e.legs) {
                leg.mesh.rotation.x = Math.sin(elapsed * 10 + leg.phase + e.phase) * 0.3;
              }
            }
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
          }
        }
        e.shadow.position.set(p.x, 0.12, p.z);
        e.shadow.scale.setScalar(Math.max(0.15, 0.55 * (1 - e.lift)));
      }

      audio.update(dt, {
        speedNorm,
        cowLift: ended ? 0 : maxCowLift,
        hazardLift: ended ? 0 : maxHazardLift,
      });
      if (!ended) separateGroundedCows(dt);
      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.life -= dt;
        effect.velocity.y -= dt * 5;
        effect.mesh.position.addScaledVector(effect.velocity, dt);
        effect.mesh.rotation.x += dt * 4;
        effect.mesh.scale.setScalar(Math.max(0, effect.life) * 0.18);
        if (effect.life <= 0) {
          scene.remove(effect.mesh);
          effects.splice(i, 1);
        }
      }
      if (ended) return;
      cowTimer += dt;
      obstacleTimer += dt;
      specialTimer += dt;
      hayTimer += dt;
      if (cowTimer >= COW_INTERVAL) {
        cowTimer = 0;
        spawnCow();
      }
      if (hayTimer >= pressure.hayInterval) {
        hayTimer = 0;
        spawnHay();
      }
      if (obstacleTimer >= pressure.obstacleInterval) {
        obstacleTimer = 0;
        spawnObstacle();
      }
      if (specialTimer >= SPECIAL_INTERVAL) {
        if (!entities.some((e) => e.special)) {
          const placement = healerPoint();
          if (placement) {
            const cowCount = entities.filter((e) => e.type === 'cow').length;
            if (cowCount >= COW_CAP) {
              const normal = entities.findIndex((e) => e.type === 'cow' && !e.special && e.lift === 0);
              if (normal >= 0) removeEntity(normal);
            }
            if (spawnCow(true, placement)) specialTimer = 0;
            else specialTimer = SPECIAL_INTERVAL - 1;
          } else {
            specialTimer = SPECIAL_INTERVAL - 1;
          }
        } else {
          specialTimer = 0;
        }
      }
    }

    let rafId = 0;
    cleanups.push(() => cancelAnimationFrame(rafId));
    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      if (document.hidden) return;
      if (!ended && !paused) update(dt);
      renderer.render(scene, camera);
    }
    animate();

    return {
      toggleMute,
      togglePause,
      restart,
      setStickInput,
      destroy: runCleanups,
    };
  } catch (err) {
    runCleanups();
    throw err;
  }
}
