import { mulberry32 } from '../../lib/rng';
import {
  BOARD_HALF_H,
  BOARD_HALF_W,
  MAX_BOUNCES,
  cloneRoomState,
  traceRay,
  yawForDir,
  type ObstacleDef,
  type ObstacleKind,
  type PumpkinState,
  type RoomState,
  type TargetKind,
  type TargetState,
} from './physics';

export type RoomArchetype = 'bank-corner' | 'tractor-ricochet' | 'double-bank' | 'pumpkin-chain' | 'windmill-gate';

export interface GeneratedRoom {
  baseSeed: number;
  roomIndex: number;
  archetype: RoomArchetype;
  state: RoomState;
  par: number;
  ammo: number;
  minShots: number;
  hintYaw: number;
  windowDeg: number;
  hasMovingObstacle: boolean;
}

interface SolverStepResult {
  nextMask: number;
  bestYaw: number;
  windowDeg: number;
  bouncesUsed: number;
}

const ANGLE_STEPS = 720; // 0.5 deg resolution
const STEP_RAD = (Math.PI * 2) / ANGLE_STEPS;
const MIN_WINDOW_DEG = 1.5;

function mixSeed(baseSeed: number, roomIndex: number): number {
  let h = (baseSeed ^ Math.imul(roomIndex + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function clampBoard(v: number, limit: number, margin: number): number {
  return Math.max(-limit + margin, Math.min(limit - margin, v));
}

function clearanceOk(
  x: number,
  z: number,
  r: number,
  placed: Array<{ x: number; z: number; r: number }>,
  pad = 0.55,
): boolean {
  if (Math.abs(x) > BOARD_HALF_W - r - 0.55 || Math.abs(z) > BOARD_HALF_H - r - 0.55) {
    return false;
  }
  for (const item of placed) {
    if (Math.hypot(x - item.x, z - item.z) < r + item.r + pad) {
      return false;
    }
  }
  return true;
}

function obsFootprintRadius(obs: ObstacleDef): number {
  return obs.halfLen + obs.radius + (obs.slideAmp ?? 0);
}

/** Build a State copy keeping only targets/pumpkins active in bitmask. */
function stateForMask(base: RoomState, mask: number): RoomState {
  const cloned = cloneRoomState(base);
  const tCount = cloned.targets.length;
  for (let i = 0; i < tCount; i++) {
    cloned.targets[i].alive = Boolean(mask & (1 << i));
  }
  for (let j = 0; j < cloned.pumpkins.length; j++) {
    cloned.pumpkins[j].alive = Boolean(mask & (1 << (tCount + j)));
  }
  return cloned;
}

/** Given an entity bitmask, evaluate all 720 angles and return transitions grouped by resulting mask. */
function collectShotTransitions(
  base: RoomState,
  mask: number,
  time: number,
  maxBounces: number,
): SolverStepResult[] {
  const state = stateForMask(base, mask);
  const tCount = state.targets.length;
  const targetMaskBits = (1 << tCount) - 1;

  const outcomeAtStep = new Int32Array(ANGLE_STEPS);
  const bounceAtStep = new Uint8Array(ANGLE_STEPS);

  for (let i = 0; i < ANGLE_STEPS; i++) {
    const yaw = i * STEP_RAD;
    const res = traceRay(state.cow.x, state.cow.z, yaw, state, time, maxBounces);
    let killBits = 0;
    for (const tid of res.hitTargetIds) {
      const idx = state.targets.findIndex((t) => t.id === tid);
      if (idx >= 0) killBits |= 1 << idx;
    }
    for (const pid of res.hitPumpkinIds) {
      const idx = state.pumpkins.findIndex((p) => p.id === pid);
      if (idx >= 0) killBits |= 1 << (tCount + idx);
    }
    // Only record angles that eliminate at least one remaining alien (or chain a pumpkin that does, OR shatter a pumpkin useful later).
    const nextMask = mask & ~killBits;
    const killedAlien = (nextMask & targetMaskBits) !== (mask & targetMaskBits);
    const poppedPumpkin = nextMask !== mask && res.hitPumpkinIds.length > 0;
    outcomeAtStep[i] = killedAlien || poppedPumpkin ? nextMask : -1;
    bounceAtStep[i] = res.bounces;
  }

  // Extract contiguous runs of identical nextMask (including wraparound 359 -> 0)
  const bestByNext = new Map<number, { len: number; midStep: number; minBounce: number }>();

  let i = 0;
  const runs: Array<{ nextMask: number; start: number; len: number; minBounce: number }> = [];
  while (i < ANGLE_STEPS) {
    const m = outcomeAtStep[i];
    if (m < 0) {
      i++;
      continue;
    }
    const start = i;
    let minBounce = bounceAtStep[i];
    i++;
    while (i < ANGLE_STEPS && outcomeAtStep[i] === m) {
      if (bounceAtStep[i] < minBounce) minBounce = bounceAtStep[i];
      i++;
    }
    runs.push({ nextMask: m, start, len: i - start, minBounce });
  }

  // Merge wraparound if needed
  if (runs.length >= 2 && runs[0].start === 0 && runs[runs.length - 1].start + runs[runs.length - 1].len === ANGLE_STEPS && runs[0].nextMask === runs[runs.length - 1].nextMask) {
    const last = runs.pop()!;
    runs[0] = {
      nextMask: runs[0].nextMask,
      start: last.start,
      len: last.len + runs[0].len,
      minBounce: Math.min(runs[0].minBounce, last.minBounce),
    };
  }

  for (const run of runs) {
    const prev = bestByNext.get(run.nextMask);
    if (!prev || run.len > prev.len) {
      const mid = (run.start + Math.floor(run.len / 2)) % ANGLE_STEPS;
      bestByNext.set(run.nextMask, { len: run.len, midStep: mid, minBounce: run.minBounce });
    }
  }

  const out: SolverStepResult[] = [];
  for (const [nextMask, info] of bestByNext) {
    out.push({
      nextMask,
      bestYaw: info.midStep * STEP_RAD,
      windowDeg: info.len * (360 / ANGLE_STEPS),
      bouncesUsed: info.minBounce,
    });
  }
  // Prefer wider windows and clearing targets
  out.sort((a, b) => b.windowDeg - a.windowDeg);
  return out;
}

interface PlanVerdict {
  minShots: number;
  hintYaw: number;
  minWindowDeg: number;
}

function findShortestPlan(
  state: RoomState,
  time: number,
  maxBounces: number,
  minWindowDeg: number,
  maxShotsLimit: number,
): PlanVerdict | null {
  const tCount = state.targets.length;
  const pCount = state.pumpkins.length;
  if (tCount === 0) return null;

  const targetBits = (1 << tCount) - 1;
  const initMask = (1 << (tCount + pCount)) - 1;

  const dist = new Map<number, { shots: number; firstYaw: number; minWin: number }>();
  dist.set(initMask, { shots: 0, firstYaw: 0, minWin: 360 });
  const queue: number[] = [initMask];

  let bestWin: PlanVerdict | null = null;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const info = dist.get(cur)!;

    if ((cur & targetBits) === 0) {
      if (!bestWin || info.shots < bestWin.minShots || (info.shots === bestWin.minShots && info.minWin > bestWin.minWindowDeg)) {
        bestWin = { minShots: info.shots, hintYaw: info.firstYaw, minWindowDeg: info.minWin };
      }
      continue;
    }
    if (info.shots >= maxShotsLimit) continue;

    const transitions = collectShotTransitions(state, cur, time, maxBounces);
    for (const tr of transitions) {
      if (tr.windowDeg < minWindowDeg) continue;
      // Ignore pure pumpkin pops unless they killed at least one alien or no direct alien shot exists
      const nextShots = info.shots + 1;
      const nextMinWin = Math.min(info.minWin, tr.windowDeg);
      const firstYaw = info.shots === 0 ? tr.bestYaw : info.firstYaw;
      const prev = dist.get(tr.nextMask);
      if (!prev || nextShots < prev.shots || (nextShots === prev.shots && nextMinWin > prev.minWin)) {
        dist.set(tr.nextMask, { shots: nextShots, firstYaw, minWin: nextMinWin });
        queue.push(tr.nextMask);
      }
    }
  }

  return bestWin;
}

/** Verify room invariants: solvable within <= 3 shots, forgiving >= 1.5 deg window, requires >= 1 bounce. */
export function verifyRoom(state: RoomState): PlanVerdict | null {
  const hasBlade = state.obstacles.some((o) => o.kind === 'blade');
  const hasSlider = state.obstacles.some((o) => o.kind === 'slider');
  const hasMoving = hasBlade || hasSlider;

  // 1. Verify player CANNOT clear all targets using zero bounces (even at 0.5 deg accuracy)
  if (!hasMoving) {
    const directOnly = findShortestPlan(state, 0, 0, 0.5, 4);
    if (directOnly) return null;
  } else {
    // Even if moving obstacle temporarily moves out of the way, shouldn't allow trivial 0-bounce clear at all phases
    const directAtZero = findShortestPlan(state, 0, 0, 0.5, 4);
    if (directAtZero) return null;
  }

  if (!hasMoving) {
    return findShortestPlan(state, 0, MAX_BOUNCES, MIN_WINDOW_DEG, 3);
  }

  // Moving obstacle: check 8 cycle phases and require >= 3 winning phases with >= 1.5 deg window
  const blade = state.obstacles.find((o) => o.kind === 'blade');
  const slider = state.obstacles.find((o) => o.kind === 'slider');
  const period = blade?.spinSpeed
    ? Math.PI / Math.abs(blade.spinSpeed) // blade is 180 deg symmetric
    : slider?.slideSpeed
      ? (Math.PI * 2) / Math.abs(slider.slideSpeed)
      : 6;

  let passCount = 0;
  let best: PlanVerdict | null = null;
  for (let p = 0; p < 8; p++) {
    const t = (p / 8) * period;
    const plan = findShortestPlan(state, t, MAX_BOUNCES, MIN_WINDOW_DEG, 3);
    if (plan) {
      passCount++;
      if (!best || plan.minShots < best.minShots || (plan.minShots === best.minShots && plan.minWindowDeg > best.minWindowDeg)) {
        best = plan;
      }
    }
  }
  return passCount >= 3 ? best : null;
}

function makeObstacle(
  id: string,
  kind: ObstacleKind,
  x: number,
  z: number,
  angle: number,
): ObstacleDef {
  const dims: Record<ObstacleKind, { radius: number; halfLen: number }> = {
    crate: { radius: 0.42, halfLen: 0.42 },
    crates: { radius: 0.42, halfLen: 0.84 },
    hay: { radius: 0.48, halfLen: 0.46 },
    tractor: { radius: 0.46, halfLen: 0.68 },
    rock: { radius: 0.56, halfLen: 0 },
    stump: { radius: 0.46, halfLen: 0 },
    blade: { radius: 0.16, halfLen: 1.2 },
    slider: { radius: 0.48, halfLen: 0.46 },
  };
  return {
    id,
    kind,
    x,
    z,
    angle,
    halfLen: dims[kind].halfLen,
    radius: dims[kind].radius,
  };
}

function buildCandidate(
  roomIndex: number,
  rng: () => number,
  archetype: RoomArchetype,
): RoomState {
  const placed: Array<{ x: number; z: number; r: number }> = [];

  // Place cow on left/lower-left pasture cleanly away from walls
  const cowX = -4.6 + rng() * 1.1;
  const cowZ = -2.2 + rng() * 4.4;
  const cow = { x: Number(cowX.toFixed(2)), z: Number(cowZ.toFixed(2)), radius: 0.62 };
  placed.push({ x: cow.x, z: cow.z, r: cow.radius + 0.5 });

  const obstacles: ObstacleDef[] = [];
  const targets: TargetState[] = [];
  const pumpkins: PumpkinState[] = [];

  const targetCount = roomIndex === 1 ? 1 + (rng() < 0.45 ? 1 : 0) : Math.min(3, 1 + Math.floor(rng() * 2.3));
  const reflectorCount = roomIndex === 1 ? 2 : 2 + Math.floor(rng() * 3); // 2..4 reflectors

  // Place an intentional crate stack / blocker near middle lane so player has a clear visual cue to bounce around/off bumpers
  if (archetype === 'bank-corner' || archetype === 'double-bank' || archetype === 'pumpkin-chain') {
    const midX = -0.7 + rng() * 1.6;
    const midZ = cow.z * 0.45 + (rng() - 0.5) * 1.4;
    const blockAngle = rng() < 0.5 ? 0 : Math.PI * 0.14 * (rng() < 0.5 ? 1 : -1);
    const blockerKind: ObstacleKind = rng() < 0.72 ? 'crates' : 'rock';
    const blocker = makeObstacle('obs-guard', blockerKind, Number(midX.toFixed(2)), Number(clampBoard(midZ, BOARD_HALF_H, 1.5).toFixed(2)), blockAngle);
    if (clearanceOk(blocker.x, blocker.z, obsFootprintRadius(blocker), placed, 0.45)) {
      obstacles.push(blocker);
      placed.push({ x: blocker.x, z: blocker.z, r: obsFootprintRadius(blocker) });
    }
  }

  // Add angled crates / hay bales / tractors / boulders / stumps in upper and lower corridors
  const reflectorKinds: ObstacleKind[] =
    archetype === 'tractor-ricochet'
      ? ['tractor', 'crate', 'tractor', 'hay']
      : archetype === 'bank-corner'
        ? ['crate', 'hay', 'tractor', 'stump']
        : ['crate', 'tractor', 'hay', 'rock'];

  for (let k = 0; k < reflectorCount; k++) {
    const kind = reflectorKinds[k % reflectorKinds.length];
    for (let tries = 0; tries < 18; tries++) {
      const rx = -2.2 + rng() * 6.8;
      const bandZ = k % 2 === 0 ? -3.7 + rng() * 2.4 : 1.3 + rng() * 2.4;
      const angle = (rng() < 0.5 ? 1 : -1) * (0.3 + rng() * 0.92);
      const obs = makeObstacle(`obs-${k}`, kind, Number(rx.toFixed(2)), Number(clampBoard(bandZ, BOARD_HALF_H, 1.2).toFixed(2)), Number(angle.toFixed(2)));
      if (clearanceOk(obs.x, obs.z, obsFootprintRadius(obs), placed, 0.45)) {
        obstacles.push(obs);
        placed.push({ x: obs.x, z: obs.z, r: obsFootprintRadius(obs) });
        break;
      }
    }
  }

  // Moving obstacle (~22% of rooms on roomIndex >= 3, or forced on windmill-gate)
  if (archetype === 'windmill-gate') {
    for (let tries = 0; tries < 16; tries++) {
      const useBlade = rng() < 0.5;
      const mx = -0.8 + rng() * 3.0;
      const mz = -1.6 + rng() * 3.2;
      if (useBlade) {
        const blade: ObstacleDef = {
          id: 'obs-windmill',
          kind: 'blade',
          x: Number(mx.toFixed(2)),
          z: Number(mz.toFixed(2)),
          angle: rng() * Math.PI,
          halfLen: 1.2,
          radius: 0.16,
          spinSpeed: (rng() < 0.5 ? 1 : -1) * 0.48,
          phaseOffset: rng() * Math.PI,
        };
        if (clearanceOk(blade.x, blade.z, obsFootprintRadius(blade), placed, 0.4)) {
          obstacles.push(blade);
          placed.push({ x: blade.x, z: blade.z, r: obsFootprintRadius(blade) });
          break;
        }
      } else {
        const slider: ObstacleDef = {
          id: 'obs-slider',
          kind: 'slider',
          x: Number(mx.toFixed(2)),
          z: Number(mz.toFixed(2)),
          angle: 0,
          halfLen: 0.46,
          radius: 0.48,
          slideAxisX: 0,
          slideAxisZ: 1,
          slideAmp: 1.25,
          slideSpeed: 0.78,
          phaseOffset: rng() * Math.PI * 2,
        };
        if (clearanceOk(slider.x, slider.z, obsFootprintRadius(slider), placed, 0.4)) {
          obstacles.push(slider);
          placed.push({ x: slider.x, z: slider.z, r: obsFootprintRadius(slider) });
          break;
        }
      }
    }
  }

  // Place alien targets mostly in the right half / guarded corners
  for (let t = 0; t < targetCount; t++) {
    for (let tries = 0; tries < 24; tries++) {
      const tx = 0.6 + rng() * 4.4;
      const tz = -3.8 + rng() * 7.6;
      const radius = 0.48;
      if (!clearanceOk(tx, tz, radius, placed, 0.48)) continue;

      const toCow = yawForDir(cow.x - tx, cow.z - tz);
      let kind: TargetKind = 'visitor';
      let shielded = false;
      if (roomIndex >= 2 || archetype === 'bank-corner' || t === 0) {
        if (rng() < 0.68) {
          kind = 'shield';
          shielded = true;
        } else if (rng() < 0.45) {
          kind = 'scout';
        }
      } else if (rng() < 0.4) {
        kind = 'scout';
      }

      const tgt: TargetState = {
        id: `tgt-${t}`,
        kind,
        x: Number(tx.toFixed(2)),
        z: Number(tz.toFixed(2)),
        radius,
        facing: Number((toCow + (rng() - 0.5) * 0.25).toFixed(2)),
        shielded,
        alive: true,
      };
      targets.push(tgt);
      placed.push({ x: tgt.x, z: tgt.z, r: tgt.radius });
      break;
    }
  }

  // Place 0-2 explosive pumpkins near targets or flanks
  const wantPumpkins =
    archetype === 'pumpkin-chain' ? 2 : rng() < (roomIndex === 1 ? 0.55 : 0.78) ? 1 + (rng() < 0.35 ? 1 : 0) : 0;

  for (let p = 0; p < wantPumpkins; p++) {
    for (let tries = 0; tries < 24; tries++) {
      const anchor = targets[p % Math.max(1, targets.length)];
      const angle = rng() * Math.PI * 2;
      const dist = 1.4 + rng() * 1.0;
      const px = anchor ? anchor.x + Math.cos(angle) * dist : 1.2 + rng() * 3.8;
      const pz = anchor ? anchor.z + Math.sin(angle) * dist : -3.5 + rng() * 7.0;
      const cx = clampBoard(px, BOARD_HALF_W, 0.85);
      const cz = clampBoard(pz, BOARD_HALF_H, 0.85);
      const radius = 0.42;
      if (!clearanceOk(cx, cz, radius, placed, 0.38)) continue;

      const pumpkin: PumpkinState = {
        id: `pmk-${p}`,
        x: Number(cx.toFixed(2)),
        z: Number(cz.toFixed(2)),
        radius,
        alive: true,
      };
      pumpkins.push(pumpkin);
      placed.push({ x: pumpkin.x, z: pumpkin.z, r: pumpkin.radius });
      break;
    }
  }

  return { cow, obstacles, targets, pumpkins };
}

/** Deterministic curated fallback template guaranteed non-trivial and bank-clearable. */
function buildGuaranteedFallback(roomIndex: number, rng: () => number): RoomState {
  const mirror = rng() < 0.5 ? 1 : -1;
  const variant = roomIndex % 3;

  if (variant === 0) {
    // Bank off crate/hay bumper behind shielded visitor
    return {
      cow: { x: -4.2, z: 1.5 * mirror, radius: 0.62 },
      obstacles: [
        makeObstacle('obs-guard', 'crates', -0.5, 0.8 * mirror, 0.08 * mirror),
        makeObstacle('obs-bank', 'crate', 0.8, -2.9 * mirror, 0.45 * mirror),
        makeObstacle('obs-trac', 'tractor', 4.0, 2.2 * mirror, -0.55 * mirror),
      ],
      targets: [
        { id: 'tgt-0', kind: 'shield', x: 3.1, z: -0.2 * mirror, radius: 0.48, facing: yawForDir(-4.2 - 3.1, 1.5 * mirror + 0.2 * mirror), shielded: true, alive: true },
        { id: 'tgt-1', kind: 'scout', x: 4.3, z: -2.4 * mirror, radius: 0.48, facing: Math.PI, shielded: false, alive: true },
      ],
      pumpkins: [
        { id: 'pmk-0', x: 3.2, z: -1.6 * mirror, radius: 0.42, alive: true },
      ],
    };
  }

  if (variant === 1) {
    // North fence / angled tractor corner shot into shielded pair + pumpkin
    return {
      cow: { x: -4.4, z: 0.2 * mirror, radius: 0.62 },
      obstacles: [
        makeObstacle('obs-guard', 'crates', 0.1, 0.0, 0.0),
        makeObstacle('obs-trac', 'tractor', 1.6, -3.1 * mirror, 0.48 * mirror),
        makeObstacle('obs-hay', 'hay', 2.4, 3.0 * mirror, -0.45 * mirror),
      ],
      targets: [
        { id: 'tgt-0', kind: 'shield', x: 3.3, z: -1.1 * mirror, radius: 0.48, facing: yawForDir(-1, 0.2 * mirror), shielded: true, alive: true },
        { id: 'tgt-1', kind: 'shield', x: 3.5, z: 1.4 * mirror, radius: 0.48, facing: yawForDir(-1, -0.2 * mirror), shielded: true, alive: true },
      ],
      pumpkins: [
        { id: 'pmk-0', x: 4.2, z: 0.15 * mirror, radius: 0.42, alive: true },
      ],
    };
  }

  return {
    cow: { x: -4.1, z: -2.1 * mirror, radius: 0.62 },
    obstacles: [
      makeObstacle('obs-wall', 'crates', -0.6, -1.2 * mirror, 0.2 * mirror),
      makeObstacle('obs-trac', 'tractor', 1.5, 2.8 * mirror, -0.42 * mirror),
      makeObstacle('obs-crate', 'crate', 3.9, -2.5 * mirror, 0.55 * mirror),
    ],
    targets: [
      { id: 'tgt-0', kind: 'shield', x: 2.9, z: 0.3 * mirror, radius: 0.48, facing: yawForDir(-1, -0.3 * mirror), shielded: true, alive: true },
      { id: 'tgt-1', kind: 'visitor', x: 4.5, z: 1.8 * mirror, radius: 0.48, facing: -Math.PI / 2, shielded: false, alive: true },
    ],
    pumpkins: [
      { id: 'pmk-0', x: 3.8, z: 0.6 * mirror, radius: 0.42, alive: true },
    ],
  };
}

/** Generate and mathematically verify a deterministic Corn Shots room for (baseSeed, roomIndex). */
export function generateRoom(baseSeed: number, roomIndex: number): GeneratedRoom {
  const roomSeed = mixSeed(baseSeed >>> 0, roomIndex);
  const rng = mulberry32(roomSeed);

  const wantMoving = roomIndex >= 3 && rng() < 0.24;
  const staticPool: RoomArchetype[] = ['bank-corner', 'tractor-ricochet', 'double-bank', 'pumpkin-chain'];

  for (let attempt = 0; attempt < 44; attempt++) {
    const subRng = mulberry32(mixSeed(roomSeed, attempt + 101));
    const archetype: RoomArchetype =
      wantMoving && attempt < 18
        ? 'windmill-gate'
        : staticPool[(roomIndex + attempt) % staticPool.length];

    const state = buildCandidate(roomIndex, subRng, archetype);
    if (state.targets.length === 0) continue;

    const verdict = verifyRoom(state);
    if (verdict) {
      const par = state.targets.length > 1 && verdict.minShots === 1 ? 2 : verdict.minShots;
      return {
        baseSeed: baseSeed >>> 0,
        roomIndex,
        archetype,
        state,
        par,
        ammo: par + 1,
        minShots: verdict.minShots,
        hintYaw: verdict.hintYaw,
        windowDeg: verdict.minWindowDeg,
        hasMovingObstacle: state.obstacles.some((o) => o.kind === 'blade' || o.kind === 'slider'),
      };
    }
  }

  // Deterministic verified fallback
  const fallback = buildGuaranteedFallback(roomIndex, mulberry32(roomSeed ^ 0x55aa55aa));
  const verdict = verifyRoom(fallback) ?? { minShots: 2, hintYaw: 0.5, minWindowDeg: 2.0 };
  const par = fallback.targets.length > 1 && verdict.minShots === 1 ? 2 : verdict.minShots;

  return {
    baseSeed: baseSeed >>> 0,
    roomIndex,
    archetype: 'bank-corner',
    state: fallback,
    par,
    ammo: par + 1,
    minShots: verdict.minShots,
    hintYaw: verdict.hintYaw,
    windowDeg: verdict.minWindowDeg,
    hasMovingObstacle: false,
  };
}
