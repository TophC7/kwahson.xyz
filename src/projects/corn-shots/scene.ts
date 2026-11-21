import * as THREE from 'three';
import {
  BAZOOKA_MUZZLE_LOCAL,
  SIGHT_GOLD,
  SIGHT_MINT,
  buildBazookaCow,
  createSightBeams,
  wrapCornShell,
} from '../../lib/bazookaCow';
import { createBoardCamera, type Insets } from '../../lib/boardCamera';
import { createBursts } from '../../lib/bursts';
import { isGameKey } from '../../lib/hotkeys';
import { createModelCache, createStudioBuilder, fitModel, type MiniatureId } from '../../lib/miniatures';
import { createPastureKit } from '../../lib/pastureKit';
import { addTableLights, buildPastureTable, createPastureRenderer } from '../../lib/pastureTable';
import { randomSeed } from '../../lib/rng';
import { scoped } from '../../lib/scope';
import { createCornAudio } from './audio';
import { generateRoom, type GeneratedRoom, type RoomArchetype } from './generator';
import {
  BOARD_HALF_H,
  BOARD_HALF_W,
  PREVIEW_BOUNCES,
  PUMPKIN_BLAST_RADIUS,
  SHIELD_HALF_ARC,
  cloneRoomState,
  obstaclePoseAt,
  spawnShell,
  stepShell,
  traceRay,
  yawForDir,
  type ActiveShell,
  type ObstacleDef,
  type PumpkinState,
  type RoomState,
  type TargetState,
} from './physics';

export interface CornHudState {
  seed: number;
  roomIndex: number;
  archetype: RoomArchetype;
  par: number;
  shotsUsed: number;
  ammoLeft: number;
  totalPar: number;
  totalShots: number;
  targetsLeft: number;
  targetsTotal: number;
  predictedBounces: number;
  aimDeg: number;
  hasMovingObstacle: boolean;
  phase: 'aiming' | 'flying' | 'cleared' | 'failed';
  muted: boolean;
  zoomed: boolean;
  canUndo: boolean;
  status: string;
}

export interface CornController {
  fire(): void;
  nudgeAim(deltaDeg: number): void;
  setAimDeg(deg: number): void;
  undo(): void;
  retryRoom(): void;
  nextRoom(): void;
  newSeed(seed?: number): void;
  toggleMute(): void;
  resetView(): void;
  destroy(): void;
}

const GROUND_Y = 0.088;
const SHOT_Y = GROUND_Y + 0.72;
const MUZZLE_ORIGIN = new THREE.Vector3(...BAZOOKA_MUZZLE_LOCAL);
const UP = new THREE.Vector3(0, 1, 0);

function initialSeedFromUrl(): { seed: number; room: number } {
  const params = new URLSearchParams(window.location.search);
  const rawSeed = Number(params.get('seed'));
  const rawRoom = Number(params.get('room'));
  return {
    seed: Number.isFinite(rawSeed) && rawSeed > 0 ? Math.floor(rawSeed) >>> 0 : randomSeed(),
    room: Number.isFinite(rawRoom) && rawRoom >= 1 ? Math.floor(rawRoom) : 1,
  };
}

function syncUrl(seed: number, roomIndex: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('room', String(roomIndex));
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function mountCornShots({
  viewport,
  chrome,
  insets,
  onState,
}: {
  viewport: HTMLElement;
  chrome: Element[];
  insets: () => Insets;
  onState: (patch: Partial<CornHudState>) => void;
}): CornController {
  return scoped((scope) => {
    const { signal, add, dispose } = scope;
    const renderer = createPastureRenderer(viewport, scope, { shadows: true });

    const kit = createPastureKit();
    const studio = createStudioBuilder(kit);
    const audio = createCornAudio();
    add(kit.dispose, studio.dispose, audio.destroy);

    const scene = new THREE.Scene();
    const tableGroup = new THREE.Group();
    const propsGroup = new THREE.Group();
    const effectsGroup = new THREE.Group();
    scene.add(tableGroup, propsGroup, effectsGroup);
    add(addTableLights(scene, 10).dispose);

    buildPastureTable(kit, tableGroup, {
      cx: 0,
      cz: 0,
      spanX: BOARD_HALF_W * 2,
      spanZ: BOARD_HALF_H * 2,
      checker: true,
    });

    const modelFor = createModelCache(studio);

    const dangerRingMat = new THREE.MeshStandardMaterial({
      color: 0xf08c4b,
      roughness: 0.85,
      flatShading: true,
      transparent: true,
      opacity: 0.16,
    });
    const shieldMat = new THREE.MeshStandardMaterial({
      color: SIGHT_MINT,
      emissive: SIGHT_MINT,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
      roughness: 0.25,
    });
    add(() => {
      dangerRingMat.dispose();
      shieldMat.dispose();
    });

    const bursts = createBursts(kit, effectsGroup);
    add(() => bursts.clear());

    const sightBeams = createSightBeams(kit, effectsGroup, PREVIEW_BOUNCES + 1);
    add(() => sightBeams.dispose());

    const pumpkinDangerRings = new Map<string, THREE.Mesh>();

    const cowActor = buildBazookaCow(kit, () => modelFor('corn'));
    cowActor.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    propsGroup.add(cowActor.mesh);

    const shellVisual = wrapCornShell(modelFor('corn'), 0.95);
    shellVisual.visible = false;
    effectsGroup.add(shellVisual);

    const camYaw = -Math.PI / 2;
    const camPitch = 0.9;
    const camDist = 24;
    const camOffset = new THREE.Vector3(
      Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      Math.sin(camPitch) * camDist,
      Math.cos(camYaw) * Math.cos(camPitch) * camDist,
    );
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SHOT_Y);
    const groundHit = new THREE.Vector3();

    interface Snapshot {
      state: RoomState;
      shotsUsed: number;
      ammoLeft: number;
      aimYaw: number;
    }

    const init = initialSeedFromUrl();
    let baseSeed = init.seed;
    let roomIndex = init.room;
    let totalPar = 0;
    let totalShots = 0;
    let currentGenerated!: GeneratedRoom;
    let roomState!: RoomState;
    let shotsUsed = 0;
    let ammoLeft = 0;
    let aimYaw = Math.PI / 2;
    let phase: CornHudState['phase'] = 'aiming';
    let activeShell: ActiveShell | null = null;
    let simTime = 0;
    let recoilKick = 0;
    let undoStack: Snapshot[] = [];
    let lastTickDeg = Math.round((aimYaw * 180) / Math.PI);
    let clearDelay = 0;

    // Room visual registries
    const obstacleMeshes = new Map<string, { group: THREE.Group; def: ObstacleDef; pulse: number }>();
    const targetMeshes = new Map<string, { group: THREE.Group; state: TargetState; shieldMesh?: THREE.Mesh }>();
    const pumpkinMeshes = new Map<string, { group: THREE.Group; state: PumpkinState }>();

    function disposeShieldGeos(): void {
      for (const { shieldMesh } of targetMeshes.values()) {
        shieldMesh?.geometry.dispose();
      }
    }
    add(disposeShieldGeos);

    function enableShadows(root: THREE.Object3D): void {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }

    function createCrateMesh(count: 1 | 2): THREE.Group {
      const g = new THREE.Group();
      const offsets = count === 2 ? [-0.42, 0.42] : [0];
      for (const zOff of offsets) {
        const crate = kit.makeObstacle('crate').mesh;
        crate.scale.setScalar(1.06);
        crate.position.set(0, -0.04, zOff);
        enableShadows(crate);
        g.add(crate);
      }
      return g;
    }

    function createNativeObstacleMesh(kind: 'hay' | 'rock' | 'stump'): THREE.Group {
      const g = new THREE.Group();
      const mesh = kit.makeObstacle(kind).mesh;
      const scale = kind === 'rock' ? 1.12 : kind === 'stump' ? 1.15 : 1.02;
      mesh.scale.setScalar(scale);
      enableShadows(mesh);
      g.add(mesh);
      return g;
    }

    function createTractorMesh(obs: ObstacleDef): THREE.Group {
      const g = new THREE.Group();
      const { model } = fitModel(modelFor('tractor'), obs.halfLen * 2);
      enableShadows(model);
      g.add(model);
      return g;
    }

    function createBladeMesh(obs: ObstacleDef): THREE.Group {
      const g = new THREE.Group();
      const hubPost = kit.part(g, 'cylinder', 0x805b3a, [0.18, 0.95, 0.18], [0, 0.47, 0]);
      kit.part(g, 'cylinder', 0xb85245, [0.22, 0.14, 0.22], [0, 0.96, 0]);
      const beam = kit.part(g, 'box', 0x9c724c, [0.16, 0.12, obs.halfLen * 2 + 0.24], [0, 0.72, 0]);
      const sailA = kit.part(g, 'box', 0xf4e6c2, [0.28, 0.34, obs.halfLen * 0.78], [0, 0.72, -obs.halfLen * 0.56]);
      const sailB = kit.part(g, 'box', 0xf4e6c2, [0.28, 0.34, obs.halfLen * 0.78], [0, 0.72, obs.halfLen * 0.56]);
      enableShadows(g);
      void hubPost;
      void beam;
      void sailA;
      void sailB;
      return g;
    }

    function rebuildRoomMeshes() {
      disposeShieldGeos();
      // Clear previous room objects except cowActor
      for (const { group } of obstacleMeshes.values()) propsGroup.remove(group);
      for (const { group } of targetMeshes.values()) propsGroup.remove(group);
      for (const { group } of pumpkinMeshes.values()) propsGroup.remove(group);
      for (const r of pumpkinDangerRings.values()) effectsGroup.remove(r);

      obstacleMeshes.clear();
      targetMeshes.clear();
      pumpkinMeshes.clear();
      pumpkinDangerRings.clear();

      cowActor.mesh.position.set(roomState.cow.x, GROUND_Y, roomState.cow.z);
      cowActor.mesh.rotation.y = aimYaw;

      for (const obs of roomState.obstacles) {
        let g: THREE.Group;
        if (obs.kind === 'tractor') g = createTractorMesh(obs);
        else if (obs.kind === 'blade') g = createBladeMesh(obs);
        else if (obs.kind === 'crates') g = createCrateMesh(2);
        else if (obs.kind === 'crate') g = createCrateMesh(1);
        else if (obs.kind === 'rock') g = createNativeObstacleMesh('rock');
        else if (obs.kind === 'stump') g = createNativeObstacleMesh('stump');
        else g = createNativeObstacleMesh('hay');

        if (obs.kind === 'slider' && obs.slideAmp) {
          const wrapper = new THREE.Group();
          kit.part(wrapper, 'box', 0x5c4632, [0.24, 0.04, obs.slideAmp * 2 + 0.8], [obs.x, GROUND_Y + 0.02, obs.z]);
          wrapper.add(g);
          propsGroup.add(wrapper);
          obstacleMeshes.set(obs.id, { group: g, def: obs, pulse: 0 });
        } else {
          propsGroup.add(g);
          obstacleMeshes.set(obs.id, { group: g, def: obs, pulse: 0 });
        }

        const pose = obstaclePoseAt(obs, simTime);
        g.position.set(pose.cx, GROUND_Y, pose.cz);
        g.rotation.y = pose.angle;
      }

      for (const tgt of roomState.targets) {
        const g = new THREE.Group();
        const miniId: MiniatureId = tgt.kind === 'scout' ? 'scout-pod' : 'alien';
        const { model } = fitModel(modelFor(miniId), 0.88);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = true;
        });
        g.add(model);

        let shieldMesh: THREE.Mesh | undefined;
        if (tgt.shielded) {
          // Curved mint barrier arc spanning front 120 deg in XZ around +Z
          const arcGeo = new THREE.CylinderGeometry(
            tgt.radius + 0.16,
            tgt.radius + 0.16,
            0.88,
            18,
            1,
            true,
            -SHIELD_HALF_ARC,
            SHIELD_HALF_ARC * 2,
          );
          shieldMesh = new THREE.Mesh(arcGeo, shieldMat);
          shieldMesh.position.y = 0.54;
          g.add(shieldMesh);
        }

        g.position.set(tgt.x, GROUND_Y, tgt.z);
        g.rotation.y = tgt.facing;
        propsGroup.add(g);
        targetMeshes.set(tgt.id, { group: g, state: tgt, shieldMesh });
      }

      for (const p of roomState.pumpkins) {
        const g = new THREE.Group();
        const { model } = fitModel(modelFor('pumpkin'), 0.86);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = true;
        });
        g.add(model);
        g.position.set(p.x, GROUND_Y, p.z);
        propsGroup.add(g);
        pumpkinMeshes.set(p.id, { group: g, state: p });

        const dangerRing = kit.part(
          effectsGroup,
          'ring',
          0xf08c4b,
          [PUMPKIN_BLAST_RADIUS - 0.05, 0.04, PUMPKIN_BLAST_RADIUS + 0.03],
          [p.x, GROUND_Y + 0.02, p.z],
          dangerRingMat,
        );
        dangerRing.rotation.x = -Math.PI / 2;
        pumpkinDangerRings.set(p.id, dangerRing);
      }
    }

    function clearRoomMeshesCleanly() {
      // Remove any slider rail wrappers cleanly too
      for (let i = propsGroup.children.length - 1; i >= 0; i--) {
        const child = propsGroup.children[i];
        if (child !== cowActor.mesh) propsGroup.remove(child);
      }
      rebuildRoomMeshes();
    }

    function pushHud(statusOverride?: string) {
      const targetsLeft = roomState.targets.filter((t) => t.alive).length;
      const trace = phase === 'aiming' ? traceRay(roomState.cow.x, roomState.cow.z, aimYaw, roomState, simTime, PREVIEW_BOUNCES) : null;
      const deg = ((aimYaw * 180) / Math.PI + 360) % 360;

      onState({
        seed: baseSeed,
        roomIndex,
        archetype: currentGenerated.archetype,
        par: currentGenerated.par,
        shotsUsed,
        ammoLeft,
        totalPar,
        totalShots,
        targetsLeft,
        targetsTotal: roomState.targets.length,
        predictedBounces: trace ? trace.bounces : 0,
        aimDeg: Number(deg.toFixed(1)),
        hasMovingObstacle: currentGenerated.hasMovingObstacle,
        phase,
        muted: audio.isMuted(),
        canUndo: undoStack.length > 0 && phase !== 'flying' && phase !== 'cleared',
        status:
          statusOverride ??
          (phase === 'cleared'
            ? `Room cleared in ${shotsUsed} (Par ${currentGenerated.par})`
            : phase === 'failed'
              ? 'Out of corn shells — Undo or Retry Room'
              : 'Move to aim, left-click to fire'),
      });
    }

    function loadRoom(nextSeed: number, nextRoomIndex: number, resetTotals: boolean) {
      baseSeed = nextSeed >>> 0;
      roomIndex = Math.max(1, nextRoomIndex);
      if (resetTotals) {
        totalPar = 0;
        totalShots = 0;
      }
      syncUrl(baseSeed, roomIndex);
      currentGenerated = generateRoom(baseSeed, roomIndex);
      roomState = cloneRoomState(currentGenerated.state);
      shotsUsed = 0;
      ammoLeft = currentGenerated.ammo;
      aimYaw = yawForDir(-roomState.cow.x, -roomState.cow.z);
      phase = 'aiming';
      activeShell = null;
      shellVisual.visible = false;
      undoStack = [];
      clearDelay = 0;
      simTime = 0;
      clearRoomMeshesCleanly();
      pushHud();
    }

    function updateSightPreview() {
      if (phase !== 'aiming') {
        sightBeams.hideFrom(0);
        for (const [pid, r] of pumpkinDangerRings) {
          const p = roomState.pumpkins.find((item) => item.id === pid);
          r.visible = Boolean(p?.alive);
        }
        return;
      }

      const trace = traceRay(roomState.cow.x, roomState.cow.z, aimYaw, roomState, simTime, PREVIEW_BOUNCES);
      const muzzleWorld = MUZZLE_ORIGIN.clone().applyAxisAngle(UP, aimYaw).add(cowActor.mesh.position);

      for (let i = 0; i < trace.segments.length; i++) {
        const seg = trace.segments[i];
        const from =
          i === 0
            ? new THREE.Vector3(muzzleWorld.x, SHOT_Y, muzzleWorld.z)
            : new THREE.Vector3(seg.ax, SHOT_Y, seg.az);
        const to = new THREE.Vector3(seg.bx, SHOT_Y, seg.bz);
        sightBeams.setSegment(i, from, to, 0.058, false);
      }
      sightBeams.hideFrom(trace.segments.length);

      for (const [pid, ring] of pumpkinDangerRings) {
        const p = roomState.pumpkins.find((item) => item.id === pid);
        ring.visible = Boolean(p?.alive);
      }
    }

    function syncVisualVisibility() {
      for (const [tid, entry] of targetMeshes) {
        const t = roomState.targets.find((item) => item.id === tid);
        entry.group.visible = Boolean(t?.alive);
        if (entry.shieldMesh) entry.shieldMesh.visible = Boolean(t?.alive && t.shielded);
      }
      for (const [pid, entry] of pumpkinMeshes) {
        const p = roomState.pumpkins.find((item) => item.id === pid);
        entry.group.visible = Boolean(p?.alive);
      }
    }

    function setAimYaw(nextYaw: number, playTick = false) {
      aimYaw = nextYaw;
      cowActor.mesh.rotation.y = aimYaw;
      const deg = Math.round(((aimYaw * 180) / Math.PI + 360) % 360);
      if (playTick && deg !== lastTickDeg) {
        lastTickDeg = deg;
        audio.playAimTick();
      }
      pushHud();
    }

    const aimRaycaster = new THREE.Raycaster();

    function aimAtClientPoint(clientX: number, clientY: number) {
      if (phase !== 'aiming') return;
      camera.setRay(aimRaycaster, clientX, clientY);
      if (aimRaycaster.ray.intersectPlane(groundPlane, groundHit)) {
        const dx = groundHit.x - roomState.cow.x;
        const dz = groundHit.z - roomState.cow.z;
        if (Math.hypot(dx, dz) > 0.25) {
          setAimYaw(yawForDir(dx, dz), true);
        }
      }
    }

    let hudZoomed = false;

    const camera = createBoardCamera({
      viewport,
      renderer,
      offset: camOffset,
      pad: { x: 1.8, z: 1.5 },
      maxZoom: 2.2,
      chrome,
      insets,
      signal,
      onHover(x, y, event) {
        if (phase !== 'aiming' || event.pointerType !== 'mouse' || event.shiftKey) return;
        aimAtClientPoint(x, y);
      },
      onPress(e) {
        audio.unlock();
        if (phase !== 'aiming') return;
        if (!hudZoomed && !e.shiftKey && e.pointerType !== 'mouse') {
          aimAtClientPoint(e.clientX, e.clientY);
        }
      },
      onDrag(dx, _dy, event) {
        if (phase !== 'aiming') return;
        if (event.shiftKey) {
          setAimYaw(aimYaw + dx * 0.0022, true);
        } else {
          aimAtClientPoint(event.clientX, event.clientY);
        }
      },
      onTap(x, y, event) {
        if (phase !== 'aiming') return;
        if (event.pointerType === 'mouse' && event.button === 0) {
          if (!event.shiftKey) aimAtClientPoint(x, y);
          fire();
        } else {
          aimAtClientPoint(x, y);
        }
      },
      onZoomedChange(zoomed) {
        hudZoomed = zoomed;
        onState({ zoomed });
      },
    });
    camera.setBounds(
      {
        minX: -BOARD_HALF_W - 0.5,
        maxX: BOARD_HALF_W + 0.5,
        maxY: 1.5,
        minZ: -BOARD_HALF_H - 0.5,
        maxZ: BOARD_HALF_H + 0.5,
      },
      0.4,
    );

    const fire = () => {
      audio.unlock();
      if (phase !== 'aiming' || ammoLeft <= 0) return;
      undoStack.push({
        state: cloneRoomState(roomState),
        shotsUsed,
        ammoLeft,
        aimYaw,
      });
      shotsUsed++;
      ammoLeft--;
      activeShell = spawnShell(roomState.cow.x, roomState.cow.z, aimYaw);
      shellVisual.visible = true;
      recoilKick = 1;
      phase = 'flying';
      audio.playFire();
      pushHud('Corn shell away…');
    };

    window.addEventListener(
      'keydown',
      (e) => {
        if (!isGameKey(e)) return;
        const step = e.shiftKey ? 0.1 : 0.75;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          if (phase === 'aiming') setAimYaw(aimYaw + (step * Math.PI) / 180, true);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          if (phase === 'aiming') setAimYaw(aimYaw - (step * Math.PI) / 180, true);
        } else if (e.key === ' ' || e.key === 'Enter') {
          if (e.repeat) return;
          e.preventDefault();
          if (phase === 'aiming') fire();
          else if (phase === 'cleared') controller.nextRoom();
        } else if (e.key === 'r' || e.key === 'R') {
          if (e.repeat) return;
          e.preventDefault();
          controller.retryRoom();
        } else if (e.key === 'z' || e.key === 'Z') {
          if (e.repeat) return;
          e.preventDefault();
          controller.undo();
        }
      },
      { signal },
    );

    const controller: CornController = {
      fire,
      nudgeAim(deltaDeg) {
        audio.unlock();
        if (phase !== 'aiming') return;
        setAimYaw(aimYaw + (deltaDeg * Math.PI) / 180, true);
      },
      setAimDeg(deg) {
        if (phase !== 'aiming') return;
        setAimYaw((deg * Math.PI) / 180, false);
      },
      undo() {
        audio.unlock();
        const prev = undoStack.pop();
        if (!prev || phase === 'flying' || phase === 'cleared') return;
        roomState = prev.state;
        shotsUsed = prev.shotsUsed;
        ammoLeft = prev.ammoLeft;
        aimYaw = prev.aimYaw;
        phase = 'aiming';
        activeShell = null;
        shellVisual.visible = false;
        cowActor.mesh.rotation.y = aimYaw;
        syncVisualVisibility();
        pushHud('Rewound last shot');
      },
      retryRoom() {
        audio.unlock();
        loadRoom(baseSeed, roomIndex, false);
      },
      nextRoom() {
        audio.unlock();
        if (phase !== 'cleared') return;
        loadRoom(baseSeed, roomIndex + 1, false);
      },
      newSeed(seed?: number) {
        audio.unlock();
        const chosen = seed !== undefined && Number.isFinite(seed) && seed > 0 ? Math.floor(seed) >>> 0 : randomSeed();
        loadRoom(chosen, 1, true);
      },
      toggleMute() {
        audio.setMuted(!audio.isMuted());
        pushHud();
      },
      resetView: camera.resetView,
      destroy: dispose,
    };

    loadRoom(init.seed, init.room, true);
    camera.refit();

    let prev = performance.now();
    let raf = 0;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
      prev = now;
      simTime += dt;

      // Update animated obstacles & shield/target idle bob
      for (const [id, entry] of obstacleMeshes) {
        const pose = obstaclePoseAt(entry.def, simTime);
        entry.group.position.x = pose.cx;
        entry.group.position.z = pose.cz;
        entry.group.rotation.y = pose.angle;
        if (entry.pulse > 0) {
          entry.pulse = Math.max(0, entry.pulse - dt * 6);
          const s = 1 + Math.sin(entry.pulse * Math.PI) * 0.1;
          entry.group.scale.set(s, 1 / Math.sqrt(s), s);
        } else {
          entry.group.scale.set(1, 1, 1);
        }
        // Keep obstacle reference synced if anything inspects id
        void id;
      }

      if (recoilKick > 0) {
        recoilKick = Math.max(0, recoilKick - dt * 5);
        const dirX = Math.sin(aimYaw);
        const dirZ = Math.cos(aimYaw);
        cowActor.mesh.position.set(
          roomState.cow.x - dirX * recoilKick * 0.24,
          GROUND_Y,
          roomState.cow.z - dirZ * recoilKick * 0.24,
        );
      } else {
        cowActor.mesh.position.set(roomState.cow.x, GROUND_Y, roomState.cow.z);
      }

      // Step flying corn shell
      if (phase === 'flying' && activeShell) {
        const events = stepShell(activeShell, roomState, dt, simTime);
        shellVisual.position.set(activeShell.x, SHOT_Y, activeShell.z);
        shellVisual.rotation.set(0, yawForDir(activeShell.dx, activeShell.dz), simTime * 14);

        for (const ev of events) {
          if (ev.type === 'bounce') {
            audio.playRicochet(ev.bounceIndex, ev.kind);
            bursts.spawn(
              new THREE.Vector3(ev.x, SHOT_Y, ev.z),
              ev.kind === 'shield' ? SIGHT_MINT : SIGHT_GOLD,
              6,
            );
            if (ev.id && obstacleMeshes.has(ev.id)) {
              obstacleMeshes.get(ev.id)!.pulse = 1;
            }
          } else if (ev.type === 'pumpkin-boom') {
            audio.playPumpkinBoom();
            bursts.spawn(new THREE.Vector3(ev.x, 0.5, ev.z), 0xf08c4b, 18);
          } else if (ev.type === 'target-kill') {
            audio.playTargetPop();
            bursts.spawn(new THREE.Vector3(ev.x, 0.65, ev.z), 0x85e88b, 12);
          } else if (ev.type === 'expire') {
            bursts.spawn(new THREE.Vector3(ev.x, SHOT_Y, ev.z), 0xe6d690, 5);
          }
        }

        if (events.length > 0) syncVisualVisibility();

        if (!activeShell.alive) {
          activeShell = null;
          shellVisual.visible = false;
          const remaining = roomState.targets.filter((t) => t.alive).length;
          if (remaining === 0) {
            phase = 'cleared';
            totalPar += currentGenerated.par;
            totalShots += shotsUsed;
            clearDelay = 0.25;
            audio.playRoomClear(shotsUsed < currentGenerated.par);
            pushHud();
          } else if (ammoLeft <= 0) {
            phase = 'failed';
            audio.playOutOfAmmo();
            pushHud();
          } else {
            phase = 'aiming';
            pushHud();
          }
        }
      }

      if (clearDelay > 0) clearDelay = Math.max(0, clearDelay - dt);

      updateSightPreview();
      bursts.update(dt);
      camera.update(dt);
      renderer.render(scene, camera.camera);
    }

    raf = requestAnimationFrame(frame);
    add(() => cancelAnimationFrame(raf));

    return controller;
  });
}
