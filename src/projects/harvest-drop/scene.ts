import * as THREE from 'three';
import { createBursts } from '../../lib/bursts';
import type { Insets } from '../../lib/boardCamera';
import { isGameKey } from '../../lib/hotkeys';
import { createModelCache, createStudioBuilder } from '../../lib/miniatures';
import { createPastureKit } from '../../lib/pastureKit';
import { addTableLights, createPastureRenderer } from '../../lib/pastureTable';
import { randomSeed } from '../../lib/rng';
import { scoped } from '../../lib/scope';
import { createHarvestAudio } from './audio';
import { cropByTier } from './crops';
import { buildHarvestCrate, bakeCropIcons, createCropMeshFactory } from './models';
import {
  ALL_POWERUP_KINDS,
  CRATE_HALF_W,
  CRATE_HEIGHT,
  DANGER_Y,
  DROP_Y,
  INITIAL_DROP_TIER,
  PINEAPPLE_BLAST_RADIUS,
  POWERUP_DEFS,
  clampCratePoint,
  createHarvestSim,
  type PowerupKind,
  type SimEvent,
} from './sim';

export interface HarvestHudState {
  score: number;
  bestScore: number;
  combo: number;
  pumpkinsHarvested: number;
  bestPumpkins: number;
  currentTier: number;
  nextTier: number;
  maxDropTier: number;
  nextUnlockScore: number | null;
  highestTierSeen: number;
  capUpgradeAlert: { tier: number; name: string } | null;
  toolAlertSlot: number | null;
  dangerProgress: number;
  phase: 'playing' | 'gameover';
  heldPowerups: PowerupKind[];
  canUseSlot: boolean[];
  targetingSlot: number | null;
  devAllTools: boolean;
  muted: boolean;
  status: string;
}

export interface HarvestController {
  readonly cropIcons: Record<number, string>;
  triggerPowerup(slotIndex: number): void;
  cancelTargeting(): void;
  setDevAllTools(enabled: boolean): void;
  restart(newSeed?: number): void;
  toggleMute(): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

const BEST_STORAGE_KEY = 'harvest-drop-best';

function loadBest(): { score: number; pumpkins: number } {
  try {
    const raw = window.localStorage.getItem(BEST_STORAGE_KEY);
    if (!raw) return { score: 0, pumpkins: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: Number.isFinite(parsed?.score) ? Math.max(0, Number(parsed.score)) : 0,
      pumpkins: Number.isFinite(parsed?.pumpkins) ? Math.max(0, Number(parsed.pumpkins)) : 0,
    };
  } catch {
    return { score: 0, pumpkins: 0 };
  }
}

function saveBest(score: number, pumpkins: number): void {
  try {
    window.localStorage.setItem(BEST_STORAGE_KEY, JSON.stringify({ score, pumpkins }));
  } catch {
    // Ignore storage errors
  }
}

export function mountHarvestDrop({
  viewport,
  chrome,
  insets,
  onState,
}: {
  viewport: HTMLElement;
  chrome: Element[];
  insets: () => Insets;
  onState: (patch: Partial<HarvestHudState>) => void;
}): HarvestController {
  return scoped((scope) => {
    const { signal, add, dispose } = scope;
    const renderer = createPastureRenderer(viewport, scope, { shadows: true });
    const kit = createPastureKit();
    const studio = createStudioBuilder(kit);
    const audio = createHarvestAudio();
    add(kit.dispose, studio.dispose, audio.destroy);

    const scene = new THREE.Scene();
    const worldGroup = new THREE.Group();
    const cropsGroup = new THREE.Group();
    const effectsGroup = new THREE.Group();
    scene.add(worldGroup, cropsGroup, effectsGroup);

    add(
      addTableLights(scene, 16, {
        sunPos: [-5, 16, 16],
        shadowSpan: 10,
      }).dispose,
    );

    const modelFor = createModelCache(studio);
    const cropIcons = bakeCropIcons(renderer, modelFor);
    const makeCropMesh = createCropMeshFactory(modelFor);

    const crate = buildHarvestCrate(kit, worldGroup, CRATE_HALF_W, CRATE_HEIGHT, DANGER_Y);
    add(crate.dispose);

    const bursts = createBursts(kit, effectsGroup);
    add(() => bursts.clear());

    // Aim dashed drop guide + ghost drop preview
    const plumbMat = new THREE.MeshBasicMaterial({
      color: 0xf4ecd0,
      transparent: true,
      opacity: 0.3,
    });
    const plumbLine = new THREE.Group();
    const dashCount = 11;
    for (let i = 0; i < dashCount; i++) {
      const y = 0.55 + (i / (dashCount - 1)) * (DROP_Y - 1.15);
      kit.part(plumbLine, 'box', 0xf4ecd0, [0.055, 0.34, 0.02], [0, y, 0], plumbMat);
    }
    plumbLine.position.set(0, 0, -0.45);
    effectsGroup.add(plumbLine);

    // Target highlight halo + explosion blast ring share one RingGeometry
    const ringGeo = new THREE.RingGeometry(0.83, 1.0, 32);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: 0x72d9b8,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const targetRing = new THREE.Mesh(ringGeo, targetRingMat);
    targetRing.visible = false;
    targetRing.position.z = 0.65;
    effectsGroup.add(targetRing);

    // Mini UFO + tractor beam animation for UFO Abduct powerup
    const ufoMesh = kit.makeUfo();
    ufoMesh.scale.setScalar(0.85);
    ufoMesh.visible = false;
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x8ff5cb,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamGeo = new THREE.ConeGeometry(0.95, 1, 16, 1, true);
    const ufoBeam = new THREE.Mesh(beamGeo, beamMat);
    ufoBeam.visible = false;
    effectsGroup.add(ufoMesh, ufoBeam);

    // Thrown 3D Pineapple Bomb + expanding explosion shockwave ring
    const pineappleProj = new THREE.Group();
    const pineModel = modelFor('pineapple');
    pineModel.position.y = -0.5;
    pineModel.scale.setScalar(1.1);
    pineappleProj.add(pineModel);
    pineappleProj.visible = false;
    const blastRingMat = new THREE.MeshBasicMaterial({
      color: 0xe59a32,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const blastRing = new THREE.Mesh(ringGeo, blastRingMat);
    blastRing.visible = false;
    blastRing.position.z = 0.65;
    effectsGroup.add(pineappleProj, blastRing);

    add(() => {
      plumbMat.dispose();
      ringGeo.dispose();
      targetRingMat.dispose();
      beamMat.dispose();
      beamGeo.dispose();
      blastRingMat.dispose();
    });

    const sim = createHarvestSim(randomSeed());
    const cropMeshes = new Map<number, THREE.Group>();

    type TargetingState =
      | { kind: 'pineapple'; uiSlot: number; simSlot?: number; aimPoint: { x: number; y: number } }
      | { kind: 'abduct' | 'grow'; uiSlot: number; simSlot?: number; hoveredCropId: number | null };

    let ghostTier = 0;
    let ghostMesh: THREE.Group | null = null;
    let aimX = 0;
    let paused = false;
    let devAllTools = false;
    let targeting: TargetingState | null = null;
    let statusText = '';
    let statusTimer = 0;
    let dangerTickAccum = 0;
    let lastPushedDanger = 0;
    let shakePulse = 0;
    let highestTierSeen = INITIAL_DROP_TIER;
    let capUpgradeAlert: { tier: number; name: string } | null = null;
    let capUpgradeTimer = 0;
    let toolAlertSlot: number | null = null;
    let toolAlertTimer = 0;

    let ufoAnim: { timer: number; tx: number; ty: number } | null = null;
    let pineAnim: {
      simSlot?: number;
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      timer: number;
      duration: number;
    } | null = null;
    let blastRingAnim: { timer: number; x: number; y: number } | null = null;

    const best = loadBest();
    let bestScore = best.score;
    let bestPumpkins = best.pumpkins;

    // Front-on orthographic camera centered on the crate
    const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.5, 60);
    const camPos = new THREE.Vector3(0, CRATE_HEIGHT * 0.52 + 1.45, 22);
    const camTarget = new THREE.Vector3(0, CRATE_HEIGHT * 0.52, 0);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    function refitCamera(): void {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);

      const { top, right, bottom, left } = insets();
      const availW = Math.max(120, width - left - right);
      const availH = Math.max(120, height - top - bottom);

      const spanW = CRATE_HALF_W * 2 + 2.2;
      const spanH = CRATE_HEIGHT + 2.6;
      const pxPerUnit = Math.min(availW / spanW, availH / spanH);

      const halfW = width / 2 / pxPerUnit;
      const halfH = height / 2 / pxPerUnit;
      const offX = (right - left) / 2 / pxPerUnit;
      const offY = (top - bottom) / 2 / pxPerUnit;

      camera.left = -halfW + offX;
      camera.right = halfW + offX;
      camera.top = halfH + offY;
      camera.bottom = -halfH + offY;
      camera.updateProjectionMatrix();
    }

    const observer = new ResizeObserver(refitCamera);
    observer.observe(viewport);
    for (const el of chrome) observer.observe(el);
    add(() => observer.disconnect());

    function setStatus(msg: string, duration = 2.4): void {
      statusText = msg;
      statusTimer = duration;
    }

    function clearTargeting(): void {
      targeting = null;
      targetRing.visible = false;
    }

    function syncGhost(): void {
      const showGhost = sim.phase === 'playing' && targeting === null;
      if (!showGhost) {
        if (ghostMesh) ghostMesh.visible = false;
        plumbLine.visible = false;
        return;
      }

      if (ghostTier !== sim.currentTier || !ghostMesh) {
        if (ghostMesh) effectsGroup.remove(ghostMesh);
        ghostTier = sim.currentTier;
        ghostMesh = makeCropMesh(ghostTier);
        ghostMesh.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = false;
        });
        effectsGroup.add(ghostMesh);
      }

      const def = cropByTier(sim.currentTier);
      aimX = sim.clampDropX(aimX, sim.currentTier);
      ghostMesh.visible = true;
      ghostMesh.position.set(aimX, DROP_Y, 0);
      ghostMesh.rotation.z = def.spawnAngle;
      ghostMesh.scale.setScalar(sim.canDrop() ? 1 : 0.72);

      plumbLine.visible = sim.canDrop();
      plumbLine.position.x = aimX;
    }

    function syncCropMeshes(): void {
      const live = sim.getCrops();
      const liveIds = new Set<number>();
      const hoveredId = targeting && targeting.kind !== 'pineapple' ? targeting.hoveredCropId : null;

      for (const c of live) {
        liveIds.add(c.id);
        let mesh = cropMeshes.get(c.id);
        if (!mesh) {
          mesh = makeCropMesh(c.tier);
          cropsGroup.add(mesh);
          cropMeshes.set(c.id, mesh);
        }
        mesh.position.set(c.x, c.y, 0);
        mesh.rotation.z = c.angle;

        if (c.popTimer > 0) {
          const t = 1 - c.popTimer / 0.16;
          const s = 0.72 + Math.sin(t * Math.PI * 0.85) * 0.38;
          mesh.scale.setScalar(s);
        } else if (hoveredId === c.id) {
          mesh.scale.setScalar(1.07);
        } else {
          mesh.scale.setScalar(1);
        }
      }

      for (const [id, mesh] of cropMeshes) {
        if (!liveIds.has(id)) {
          cropsGroup.remove(mesh);
          cropMeshes.delete(id);
        }
      }
    }

    function activeTools(): readonly PowerupKind[] {
      return devAllTools ? ALL_POWERUP_KINDS : sim.heldPowerups;
    }

    function pushHud(): void {
      if (sim.score > bestScore || sim.pumpkinsHarvested > bestPumpkins) {
        bestScore = Math.max(bestScore, sim.score);
        bestPumpkins = Math.max(bestPumpkins, sim.pumpkinsHarvested);
        saveBest(bestScore, bestPumpkins);
      }

      const held = [...activeTools()];
      const canUseSlot = held.map((k) => sim.canUseTool(k));
      lastPushedDanger = sim.dangerProgress;

      onState({
        score: sim.score,
        bestScore,
        combo: sim.combo,
        pumpkinsHarvested: sim.pumpkinsHarvested,
        bestPumpkins,
        currentTier: sim.currentTier,
        nextTier: sim.nextTier,
        maxDropTier: sim.maxDropTier,
        nextUnlockScore: sim.nextUnlockScore,
        highestTierSeen,
        capUpgradeAlert,
        toolAlertSlot,
        dangerProgress: sim.dangerProgress,
        phase: sim.phase,
        heldPowerups: held,
        canUseSlot,
        targetingSlot: targeting?.uiSlot ?? null,
        devAllTools,
        muted: audio.isMuted(),
        status: statusText,
      });
    }

    function handleEvents(events: SimEvent[]): void {
      for (const ev of events) {
        if (ev.type === 'drop') {
          audio.playDrop(ev.tier);
        } else if (ev.type === 'merge') {
          highestTierSeen = Math.max(highestTierSeen, ev.tier);
          audio.playMerge(ev.tier, ev.combo);
          const crop = cropByTier(ev.tier);
          bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.25), crop.colorHex, 10 + ev.tier);
          if (ev.combo >= 2) {
            setStatus(`${crop.name}! ${ev.combo}x Combo (+${ev.points})`, 1.8);
          } else if (ev.tier >= 7) {
            setStatus(`${crop.name} (+${ev.points})`, 1.8);
          }
        } else if (ev.type === 'pumpkin-poof') {
          audio.playPumpkinPoof();
          bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.35), 0xf6c93b, 26);
          bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.35), 0xe07628, 18);
          setStatus(`Prize Pumpkin Harvest! +${ev.points}`, 3.0);
        } else if (ev.type === 'powerup-awarded') {
          audio.playPowerupEarned();
          toolAlertSlot = Math.max(0, sim.heldPowerups.length - 1);
          toolAlertTimer = 7.0;
          setStatus(`New Tool: ${POWERUP_DEFS[ev.kind].name}!`, 2.4);
        } else if (ev.type === 'powerup-used') {
          audio.playPowerupUsed(ev.kind);
          toolAlertSlot = null;
          toolAlertTimer = 0;
          if (ev.kind === 'abduct' && ev.x !== undefined && ev.y !== undefined) {
            ufoAnim = { timer: 0.55, tx: ev.x, ty: ev.y };
            bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.3), 0x8ff5cb, 14);
            setStatus('UFO Abducted crop!', 1.6);
          } else if (ev.kind === 'grow' && ev.x !== undefined && ev.y !== undefined && ev.tier) {
            highestTierSeen = Math.max(highestTierSeen, ev.tier);
            bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.3), cropByTier(ev.tier).colorHex, 14);
            setStatus(`Bumper Grow -> ${cropByTier(ev.tier).name}!`, 1.8);
          } else if (ev.kind === 'shake') {
            shakePulse = 1;
            setStatus('Crate Shaken!', 1.5);
          } else if (ev.kind === 'sweep') {
            bursts.spawn(new THREE.Vector3(0, 2.0, 0.3), 0x8cb7e8, 18);
            setStatus(`Swept ${ev.cleared ?? 0} small crops!`, 1.8);
          } else if (ev.kind === 'pineapple' && ev.x !== undefined && ev.y !== undefined) {
            shakePulse = 0.75;
            blastRingAnim = { timer: 0.28, x: ev.x, y: ev.y };
            bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.35), 0xe59a32, 22);
            bursts.spawn(new THREE.Vector3(ev.x, ev.y, 0.35), 0x5ca64c, 12);
            setStatus(`Pineapple Boom! Broke ${ev.cleared ?? 0} crops`, 2.0);
          }
        } else if (ev.type === 'drop-cap-upgraded') {
          audio.playCapUpgraded();
          const unlocked = cropByTier(ev.newMaxTier);
          highestTierSeen = Math.max(highestTierSeen, ev.newMaxTier);
          capUpgradeAlert = { tier: ev.newMaxTier, name: unlocked.name };
          capUpgradeTimer = 3.4;
          bursts.spawn(new THREE.Vector3(aimX, DROP_Y, 0.35), unlocked.colorHex, 16);
          bursts.spawn(new THREE.Vector3(aimX, DROP_Y, 0.35), 0xf3c842, 12);
        } else if (ev.type === 'gameover') {
          audio.playGameOver();
          clearTargeting();
          setStatus('Crate Overflowed!', 3.0);
        }
      }
      if (events.length > 0) {
        syncGhost();
        pushHud();
      }
    }

    // Pointer input on viewport
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const playPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const planeHit = new THREE.Vector3();

    function clientToWorldXY(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(playPlane, planeHit)) return null;
      return { x: planeHit.x, y: planeHit.y };
    }

    function pickCropAt(wx: number, wy: number, kind: PowerupKind): number | null {
      let bestId: number | null = null;
      let bestDist = Infinity;
      for (const c of sim.getCrops()) {
        if (!sim.isValidPowerupTarget(kind, c.id)) continue;
        const def = cropByTier(c.tier);
        const reach = Math.max(def.halfW, def.halfH) + 0.35;
        const d = Math.hypot(c.x - wx, c.y - wy);
        if (d <= reach && d < bestDist) {
          bestDist = d;
          bestId = c.id;
        }
      }
      return bestId;
    }

    let pointerDown = false;
    let downX = 0;
    let downY = 0;
    const canvas = renderer.domElement;

    function clampCrateTarget(wx: number, wy: number): { x: number; y: number } | null {
      if (Math.abs(wx) > CRATE_HALF_W + 0.6 || wy < -0.5 || wy > CRATE_HEIGHT + 0.6) return null;
      return clampCratePoint(wx, wy);
    }

    function dropAtAim(): void {
      audio.unlock();
      if (paused || sim.phase !== 'playing' || targeting !== null || pineAnim) return;
      handleEvents(sim.drop(aimX));
    }

    function nudgeAim(dx: number): void {
      if (paused || sim.phase !== 'playing') return;
      aimX = sim.clampDropX(aimX + dx);
      syncGhost();
    }

    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (paused) return;
        const pt = clientToWorldXY(e.clientX, e.clientY);
        if (!pt) return;
        if (targeting) {
          if (targeting.kind === 'pineapple') {
            const clamped = clampCrateTarget(pt.x, pt.y);
            if (clamped) targeting.aimPoint = clamped;
          } else {
            targeting.hoveredCropId = pickCropAt(pt.x, pt.y, targeting.kind);
          }
          return;
        }
        aimX = sim.clampDropX(pt.x);
        syncGhost();
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerdown',
      (e) => {
        audio.unlock();
        if (paused) return;
        if (e.button === 2) {
          if (targeting !== null) {
            clearTargeting();
            statusText = '';
            statusTimer = 0;
            syncGhost();
            pushHud();
          }
          return;
        }
        pointerDown = true;
        downX = e.clientX;
        downY = e.clientY;
        const pt = clientToWorldXY(e.clientX, e.clientY);
        if (pt && targeting === null) {
          aimX = sim.clampDropX(pt.x);
          syncGhost();
        } else if (pt && targeting?.kind === 'pineapple') {
          const clamped = clampCrateTarget(pt.x, pt.y);
          if (clamped) targeting.aimPoint = clamped;
        }
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (!pointerDown || e.button !== 0) return;
        pointerDown = false;
        const pt = clientToWorldXY(e.clientX, e.clientY);
        if (!pt || paused || sim.phase !== 'playing' || pineAnim) return;

        if (targeting) {
          if (targeting.kind === 'pineapple') {
            const targetPt = clampCrateTarget(pt.x, pt.y);
            if (targetPt) {
              const simSlot = targeting.simSlot;
              clearTargeting();
              statusText = '';
              statusTimer = 0;
              pineAnim = {
                simSlot,
                sx: aimX,
                sy: DROP_Y + 0.25,
                tx: targetPt.x,
                ty: targetPt.y,
                timer: 0,
                duration: 0.3,
              };
              audio.playPineappleThrow();
              syncGhost();
              pushHud();
              return;
            }
          } else {
            const picked = pickCropAt(pt.x, pt.y, targeting.kind);
            if (picked !== null) {
              const { kind, simSlot } = targeting;
              clearTargeting();
              statusText = '';
              statusTimer = 0;
              handleEvents(sim.useTool(kind, { slot: simSlot, cropId: picked }));
              return;
            }
          }
          if (Math.hypot(e.clientX - downX, e.clientY - downY) < 12) {
            clearTargeting();
            setStatus('Cancelled targeting', 1.2);
            syncGhost();
            pushHud();
          }
          return;
        }

        aimX = sim.clampDropX(pt.x);
        dropAtAim();
      },
      { signal },
    );

    canvas.addEventListener(
      'pointercancel',
      () => {
        pointerDown = false;
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (e) => {
        if (!isGameKey(e)) return;
        if (e.key === 'Escape' && targeting !== null) {
          e.preventDefault();
          controller.cancelTargeting();
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          nudgeAim(-0.35);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          nudgeAim(0.35);
        } else if (e.key === ' ' || e.key === 'Enter') {
          if (e.repeat) return;
          e.preventDefault();
          if (sim.phase === 'playing') dropAtAim();
        } else if (e.key >= '1' && e.key <= '5') {
          if (!e.repeat) controller.triggerPowerup(Number(e.key) - 1);
        } else if (e.key === 'r' || e.key === 'R') {
          if (!e.repeat) controller.restart();
        } else if (e.key === 'm' || e.key === 'M') {
          if (!e.repeat) controller.toggleMute();
        }
      },
      { signal },
    );

    function resetRunVisuals(): void {
      for (const m of cropMeshes.values()) cropsGroup.remove(m);
      cropMeshes.clear();
      bursts.clear();
      clearTargeting();
      highestTierSeen = INITIAL_DROP_TIER;
      capUpgradeAlert = null;
      capUpgradeTimer = 0;
      toolAlertSlot = null;
      toolAlertTimer = 0;
      statusText = '';
      statusTimer = 0;
      dangerTickAccum = 0;
      lastPushedDanger = 0;
      shakePulse = 0;
      worldGroup.position.x = 0;
      worldGroup.rotation.z = 0;
      ufoAnim = null;
      ufoMesh.visible = false;
      ufoBeam.visible = false;
      pineAnim = null;
      pineappleProj.visible = false;
      blastRingAnim = null;
      blastRing.visible = false;
      aimX = 0;
    }

    const controller: HarvestController = {
      cropIcons,
      triggerPowerup(slotIndex) {
        audio.unlock();
        if (paused || sim.phase !== 'playing' || pineAnim) return;
        const kind = activeTools()[slotIndex];
        if (!kind || !sim.canUseTool(kind)) return;
        if (toolAlertSlot === slotIndex) {
          toolAlertSlot = null;
          toolAlertTimer = 0;
        }
        const simSlot = devAllTools ? undefined : slotIndex;

        if (!POWERUP_DEFS[kind].needsTarget) {
          clearTargeting();
          handleEvents(sim.useTool(kind, { slot: simSlot }));
          return;
        }

        if (targeting?.uiSlot === slotIndex) {
          clearTargeting();
          setStatus('Cancelled targeting', 1.2);
        } else if (kind === 'pineapple') {
          targeting = {
            kind: 'pineapple',
            uiSlot: slotIndex,
            simSlot,
            aimPoint: { x: aimX, y: CRATE_HEIGHT * 0.45 },
          };
        } else if (kind === 'abduct' || kind === 'grow') {
          targeting = {
            kind,
            uiSlot: slotIndex,
            simSlot,
            hoveredCropId: null,
          };
        }
        syncGhost();
        pushHud();
      },
      cancelTargeting() {
        if (targeting === null) return;
        clearTargeting();
        statusText = '';
        statusTimer = 0;
        syncGhost();
        pushHud();
      },
      setDevAllTools(enabled) {
        if (!import.meta.env.DEV) return;
        devAllTools = enabled;
        clearTargeting();
        statusText = '';
        statusTimer = 0;
        syncGhost();
        pushHud();
      },
      restart(newSeed?: number) {
        audio.unlock();
        resetRunVisuals();
        sim.reset(newSeed ?? randomSeed());
        syncGhost();
        pushHud();
      },
      toggleMute() {
        audio.setMuted(!audio.isMuted());
        pushHud();
      },
      setPaused(next) {
        paused = next;
      },
      destroy: dispose,
    };

    refitCamera();
    syncGhost();
    pushHud();

    let prev = performance.now();
    let raf = 0;
    let clock = 0;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
      prev = now;
      audio.updateMusic(dt, paused, sim.phase === 'gameover');

      if (!paused) {
        clock += dt;

        const evs = sim.step(dt);
        if (evs.length > 0) {
          handleEvents(evs);
        } else if (
          Math.abs(sim.dangerProgress - lastPushedDanger) > 0.015 ||
          (sim.dangerProgress === 0) !== (lastPushedDanger === 0)
        ) {
          lastPushedDanger = sim.dangerProgress;
          onState({ dangerProgress: sim.dangerProgress });
        }

        if (statusTimer > 0) {
          statusTimer -= dt;
          if (statusTimer <= 0 && statusText) {
            statusText = '';
            onState({ status: '' });
          }
        }

        if (capUpgradeTimer > 0) {
          capUpgradeTimer -= dt;
          if (capUpgradeTimer <= 0 && capUpgradeAlert) {
            capUpgradeAlert = null;
            onState({ capUpgradeAlert: null });
          }
        }

        if (toolAlertTimer > 0) {
          toolAlertTimer -= dt;
          if (toolAlertTimer <= 0 && toolAlertSlot !== null) {
            toolAlertSlot = null;
            onState({ toolAlertSlot: null });
          }
        }

        // Crate shake visual feedback
        if (shakePulse > 0) {
          shakePulse = Math.max(0, shakePulse - dt * 2.8);
          const amp = shakePulse * 0.22;
          worldGroup.position.x = Math.sin(clock * 55) * amp;
          worldGroup.rotation.z = Math.sin(clock * 42) * amp * 0.06;
        } else {
          worldGroup.position.x = 0;
          worldGroup.rotation.z = 0;
        }

        // Danger rope pulse & audio tick
        if (sim.dangerProgress > 0.02 && sim.phase === 'playing') {
          const pulse = 0.5 + 0.5 * Math.sin(clock * (6 + sim.dangerProgress * 12));
          crate.dangerMat.opacity = 0.55 + pulse * 0.42;
          crate.dangerMat.emissiveIntensity = 0.45 + pulse * 0.9;
          dangerTickAccum += dt;
          const interval = Math.max(0.22, 0.65 - sim.dangerProgress * 0.42);
          if (dangerTickAccum >= interval) {
            dangerTickAccum = 0;
            audio.playDangerTick(sim.dangerProgress);
          }
        } else {
          crate.dangerMat.opacity = 0.44;
          crate.dangerMat.emissiveIntensity = 0.2;
          dangerTickAccum = 0;
        }

        // Thrown 3D Pineapple Bomb flight arc -> detonate on arrival
        if (pineAnim) {
          pineAnim.timer += dt;
          const p = Math.min(1, pineAnim.timer / pineAnim.duration);
          const x = THREE.MathUtils.lerp(pineAnim.sx, pineAnim.tx, p);
          const y = THREE.MathUtils.lerp(pineAnim.sy, pineAnim.ty, p) + Math.sin(p * Math.PI) * 1.1;
          pineappleProj.visible = true;
          pineappleProj.position.set(x, y, 0.45);
          pineappleProj.rotation.z -= dt * 14;
          pineappleProj.rotation.y += dt * 6;
          if (p >= 1) {
            const done = pineAnim;
            pineAnim = null;
            pineappleProj.visible = false;
            handleEvents(sim.useTool('pineapple', { slot: done.simSlot, point: { x: done.tx, y: done.ty } }));
          }
        }

        // Expanding Pineapple explosion shockwave ring
        if (blastRingAnim) {
          blastRingAnim.timer -= dt;
          if (blastRingAnim.timer <= 0) {
            blastRingAnim = null;
            blastRing.visible = false;
          } else {
            const p = 1 - blastRingAnim.timer / 0.28;
            blastRing.visible = true;
            blastRing.position.set(blastRingAnim.x, blastRingAnim.y, 0.65);
            blastRing.scale.setScalar(THREE.MathUtils.lerp(0.45, PINEAPPLE_BLAST_RADIUS * 1.15, p));
            blastRingMat.opacity = (1 - p) * 0.85;
          }
        }

        // UFO Abduct flyover animation
        if (ufoAnim) {
          ufoAnim.timer -= dt;
          if (ufoAnim.timer <= 0) {
            ufoAnim = null;
            ufoMesh.visible = false;
            ufoBeam.visible = false;
          } else {
            const p = 1 - ufoAnim.timer / 0.55;
            const ufoY = CRATE_HEIGHT + 1.0 + Math.sin(p * Math.PI) * 0.4;
            ufoMesh.visible = true;
            ufoMesh.position.set(ufoAnim.tx, ufoY, 0.4);
            ufoMesh.rotation.y += dt * 4;

            const beamH = Math.max(0.5, ufoY - ufoAnim.ty);
            ufoBeam.visible = true;
            ufoBeam.position.set(ufoAnim.tx, ufoAnim.ty + beamH * 0.5, 0.25);
            ufoBeam.scale.set(1 - p * 0.45, beamH, 1 - p * 0.45);
            beamMat.opacity = (1 - p) * 0.42;
          }
        }

        // Subtle ghost bob
        if (ghostMesh && ghostMesh.visible) {
          ghostMesh.position.y = DROP_Y + Math.sin(clock * 4) * 0.04;
        }

        bursts.update(dt);
      }

      // Hover target ring in powerup targeting mode
      if (targeting?.kind === 'pineapple') {
        targetRingMat.color.setHex(0xe59a32);
        targetRing.visible = true;
        targetRing.position.set(targeting.aimPoint.x, targeting.aimPoint.y, 0.65);
        targetRing.scale.setScalar(PINEAPPLE_BLAST_RADIUS + Math.sin(clock * 8) * 0.05);
      } else if (targeting && targeting.hoveredCropId !== null) {
        targetRingMat.color.setHex(0x72d9b8);
        const hovered = sim.getCropById(targeting.hoveredCropId);
        if (hovered) {
          const def = cropByTier(hovered.tier);
          targetRing.visible = true;
          targetRing.position.set(hovered.x, hovered.y, 0.65);
          targetRing.scale.setScalar(Math.max(def.halfW, def.halfH) + 0.22 + Math.sin(clock * 8) * 0.05);
        } else {
          targetRing.visible = false;
        }
      } else {
        targetRing.visible = false;
      }

      syncCropMeshes();
      renderer.render(scene, camera);
    }

    raf = requestAnimationFrame(frame);
    add(() => cancelAnimationFrame(raf));

    return controller;
  });
}
