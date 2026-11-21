export const BOARD_HALF_W = 6.0;
export const BOARD_HALF_H = 5.0;
export const SHELL_RADIUS = 0.22;
export const SHELL_SPEED = 18.0;
export const MAX_BOUNCES = 4;
export const PREVIEW_BOUNCES = 2; // Helper sightline previews up to 3 segments (shot + 2 bounces)
export const PUMPKIN_BLAST_RADIUS = 2.65;
export const SHIELD_HALF_ARC = Math.PI / 3; // 120 deg front arc

export interface Vec2 {
  x: number;
  z: number;
}

export type ObstacleKind = 'crate' | 'crates' | 'hay' | 'tractor' | 'rock' | 'stump' | 'blade' | 'slider';

export interface ObstacleDef {
  id: string;
  kind: ObstacleKind;
  x: number;
  z: number;
  angle: number;
  halfLen: number;
  radius: number;
  // Moving obstacle parameters (optional)
  spinSpeed?: number; // rad/s around (x, z) for 'blade'
  slideAxisX?: number;
  slideAxisZ?: number;
  slideAmp?: number;
  slideSpeed?: number; // rad/s
  phaseOffset?: number;
}

export type TargetKind = 'visitor' | 'scout' | 'shield';

export interface TargetState {
  id: string;
  kind: TargetKind;
  x: number;
  z: number;
  radius: number;
  facing: number; // yaw angle; +Z is (sin(yaw), cos(yaw))
  shielded: boolean;
  alive: boolean;
}

export interface PumpkinState {
  id: string;
  x: number;
  z: number;
  radius: number;
  alive: boolean;
}

export interface RoomState {
  cow: { x: number; z: number; radius: number };
  obstacles: ObstacleDef[];
  targets: TargetState[];
  pumpkins: PumpkinState[];
}

export type HitKind = 'border' | ObstacleKind | 'shield' | 'target' | 'pumpkin';

export interface RaySegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hitKind: HitKind | null;
  hitId: string | null;
  nx: number;
  nz: number;
}

export interface RayTraceResult {
  segments: RaySegment[];
  bounces: number;
  endPoint: Vec2;
  hitTargetIds: string[];
  hitPumpkinIds: string[];
  shieldHitIds: string[];
  bouncedObstacleIds: string[];
}

export interface ActiveShell {
  x: number;
  z: number;
  dx: number;
  dz: number;
  bounces: number;
  maxBounces: number;
  travelled: number;
  alive: boolean;
}

export type ShellEvent =
  | { type: 'bounce'; kind: 'border' | ObstacleKind | 'shield'; id: string | null; x: number; z: number; nx: number; nz: number; bounceIndex: number }
  | { type: 'target-kill'; id: string; x: number; z: number; viaPumpkin: boolean }
  | { type: 'pumpkin-boom'; id: string; x: number; z: number }
  | { type: 'shield-shatter'; id: string; x: number; z: number }
  | { type: 'expire'; x: number; z: number };

interface ObstaclePose {
  id: string;
  kind: ObstacleKind;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  angle: number;
  radius: number;
}

interface SweepHit {
  dist: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  kind: HitKind;
  id: string | null;
}

export function dirForYaw(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function yawForDir(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function normalize2(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  return len > 1e-9 ? { x: x / len, z: z / len } : { x: 0, z: 1 };
}

export function reflectDir(dx: number, dz: number, nx: number, nz: number): Vec2 {
  const dot = dx * nx + dz * nz;
  return normalize2(dx - 2 * dot * nx, dz - 2 * dot * nz);
}

export function obstaclePoseAt(obs: ObstacleDef, time: number): ObstaclePose {
  const phase = obs.phaseOffset ?? 0;
  let cx = obs.x;
  let cz = obs.z;
  let angle = obs.angle;
  if (obs.kind === 'blade' && obs.spinSpeed) {
    angle = obs.angle + time * obs.spinSpeed + phase;
  } else if (obs.kind === 'slider' && obs.slideAmp && obs.slideSpeed) {
    const offset = Math.sin(time * obs.slideSpeed + phase) * obs.slideAmp;
    cx += (obs.slideAxisX ?? 0) * offset;
    cz += (obs.slideAxisZ ?? 1) * offset;
  }
  const ux = Math.sin(angle);
  const uz = Math.cos(angle);
  return {
    id: obs.id,
    kind: obs.kind,
    ax: cx - ux * obs.halfLen,
    az: cz - uz * obs.halfLen,
    bx: cx + ux * obs.halfLen,
    bz: cz + uz * obs.halfLen,
    cx,
    cz,
    angle,
    radius: obs.radius,
  };
}

function intersectCircleEntry(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  r: number,
): number | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = fx * dx + fz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) {
    // Already touching/inside cap; only escape if moving inward.
    return b < 0 ? 1e-5 : null;
  }
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 1e-6 ? t : null;
}

function intersectSegment(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  px: number,
  pz: number,
  qx: number,
  qz: number,
): number | null {
  const sx = qx - px;
  const sz = qz - pz;
  const denom = dx * sz - dz * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const rx = px - ox;
  const rz = pz - oz;
  const t = (rx * sz - rz * sx) / denom;
  const u = (rx * dz - rz * dx) / denom;
  if (t > 1e-6 && u >= 0 && u <= 1) return t;
  return null;
}

function sweepFirstHit(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  maxDist: number,
  state: RoomState,
  time: number,
  shellRadius = SHELL_RADIUS,
): SweepHit | null {
  let best: SweepHit | null = null;
  const consider = (hit: SweepHit) => {
    if (hit.dist <= maxDist && (!best || hit.dist < best.dist)) {
      best = hit;
    }
  };

  // 1. Outer pasture fence walls
  const minX = -BOARD_HALF_W + shellRadius;
  const maxX = BOARD_HALF_W - shellRadius;
  const minZ = -BOARD_HALF_H + shellRadius;
  const maxZ = BOARD_HALF_H - shellRadius;

  if (dx < -1e-7) {
    const t = Math.max(1e-5, (minX - ox) / dx);
    consider({ dist: t, x: ox + dx * t, z: oz + dz * t, nx: 1, nz: 0, kind: 'border', id: 'west' });
  } else if (dx > 1e-7) {
    const t = Math.max(1e-5, (maxX - ox) / dx);
    consider({ dist: t, x: ox + dx * t, z: oz + dz * t, nx: -1, nz: 0, kind: 'border', id: 'east' });
  }
  if (dz < -1e-7) {
    const t = Math.max(1e-5, (minZ - oz) / dz);
    consider({ dist: t, x: ox + dx * t, z: oz + dz * t, nx: 0, nz: 1, kind: 'border', id: 'north' });
  } else if (dz > 1e-7) {
    const t = Math.max(1e-5, (maxZ - oz) / dz);
    consider({ dist: t, x: ox + dx * t, z: oz + dz * t, nx: 0, nz: -1, kind: 'border', id: 'south' });
  }

  // 2. Native pasture obstacles: OBBs (crate, crates, hay, tractor, slider), circles (rock, stump), capsules (blade)
  for (const obs of state.obstacles) {
    const pose = obstaclePoseAt(obs, time);

    if (pose.kind === 'rock' || pose.kind === 'stump') {
      const totalR = pose.radius + shellRadius;
      const t = intersectCircleEntry(ox, oz, dx, dz, pose.cx, pose.cz, totalR);
      if (t !== null) {
        const hx = ox + dx * t;
        const hz = oz + dz * t;
        const n = normalize2(hx - pose.cx, hz - pose.cz);
        consider({ dist: t, x: hx, z: hz, nx: n.x, nz: n.z, kind: pose.kind, id: pose.id });
      }
      continue;
    }

    if (pose.kind !== 'blade') {
      // Exact Minkowski-rounded oriented box in obstacle local space
      const sin = Math.sin(pose.angle);
      const cos = Math.cos(pose.angle);
      const relX = ox - pose.cx;
      const relZ = oz - pose.cz;
      // Rotate world -> local (note world +Z rotated by yaw angle -> (sin, cos))
      const lx = relX * cos - relZ * sin;
      const lz = relX * sin + relZ * cos;
      const ldx = dx * cos - dz * sin;
      const ldz = dx * sin + dz * cos;

      const hx = pose.radius;
      const hz = obs.halfLen;
      const rx = hx + shellRadius;
      const rz = hz + shellRadius;

      let bestLocal: { dist: number; nx: number; nz: number } | null = null;
      const tryLocal = (t: number | null, nx: number, nz: number) => {
        if (t === null || t <= 1e-6) return;
        if (!bestLocal || t < bestLocal.dist) bestLocal = { dist: t, nx, nz };
      };

      // Left / right flat faces (|lx| = hx + shellRadius, |lz| <= hz)
      if (ldx > 1e-7) {
        const t = (-rx - lx) / ldx;
        const hitZ = lz + ldz * t;
        if (Math.abs(hitZ) <= hz) tryLocal(t, -1, 0);
      } else if (ldx < -1e-7) {
        const t = (rx - lx) / ldx;
        const hitZ = lz + ldz * t;
        if (Math.abs(hitZ) <= hz) tryLocal(t, 1, 0);
      }

      // Front / back flat faces (|lz| = hz + shellRadius, |lx| <= hx)
      if (ldz > 1e-7) {
        const t = (-rz - lz) / ldz;
        const hitX = lx + ldx * t;
        if (Math.abs(hitX) <= hx) tryLocal(t, 0, -1);
      } else if (ldz < -1e-7) {
        const t = (rz - lz) / ldz;
        const hitX = lx + ldx * t;
        if (Math.abs(hitX) <= hx) tryLocal(t, 0, 1);
      }

      // 4 rounded corners of radius shellRadius
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const cx = sx * hx;
          const cz = sz * hz;
          const t = intersectCircleEntry(lx, lz, ldx, ldz, cx, cz, shellRadius);
          if (t !== null) {
            const hxHit = lx + ldx * t;
            const hzHit = lz + ldz * t;
            if ((hxHit - cx) * sx >= -1e-5 && (hzHit - cz) * sz >= -1e-5) {
              const n = normalize2(hxHit - cx, hzHit - cz);
              tryLocal(t, n.x, n.z);
            }
          }
        }
      }

      if (bestLocal !== null) {
        const hitLocal = bestLocal as { dist: number; nx: number; nz: number };
        // Rotate local normal back to world space
        const wnx = hitLocal.nx * cos + hitLocal.nz * sin;
        const wnz = -hitLocal.nx * sin + hitLocal.nz * cos;
        consider({
          dist: hitLocal.dist,
          x: ox + dx * hitLocal.dist,
          z: oz + dz * hitLocal.dist,
          nx: wnx,
          nz: wnz,
          kind: pose.kind,
          id: pose.id,
        });
      }
      continue;
    }

    const totalR = pose.radius + shellRadius;
    const vx = pose.bx - pose.ax;
    const vz = pose.bz - pose.az;
    const segLen = Math.hypot(vx, vz);

    if (segLen > 1e-5) {
      const ux = vx / segLen;
      const uz = vz / segLen;
      const nx = -uz;
      const nz = ux;

      for (const side of [1, -1]) {
        const snx = nx * side;
        const snz = nz * side;
        if (dx * snx + dz * snz >= -1e-6) continue;
        const t = intersectSegment(
          ox,
          oz,
          dx,
          dz,
          pose.ax + snx * totalR,
          pose.az + snz * totalR,
          pose.bx + snx * totalR,
          pose.bz + snz * totalR,
        );
        if (t !== null) {
          consider({
            dist: t,
            x: ox + dx * t,
            z: oz + dz * t,
            nx: snx,
            nz: snz,
            kind: pose.kind,
            id: pose.id,
          });
        }
      }

      for (const [cx, cz, sign] of [
        [pose.ax, pose.az, -1],
        [pose.bx, pose.bz, 1],
      ] as const) {
        const t = intersectCircleEntry(ox, oz, dx, dz, cx, cz, totalR);
        if (t !== null) {
          const hx = ox + dx * t;
          const hz = oz + dz * t;
          if (((hx - cx) * ux + (hz - cz) * uz) * sign >= -1e-5) {
            const n = normalize2(hx - cx, hz - cz);
            consider({ dist: t, x: hx, z: hz, nx: n.x, nz: n.z, kind: pose.kind, id: pose.id });
          }
        }
      }
    } else {
      const t = intersectCircleEntry(ox, oz, dx, dz, pose.cx, pose.cz, totalR);
      if (t !== null) {
        const hx = ox + dx * t;
        const hz = oz + dz * t;
        const n = normalize2(hx - pose.cx, hz - pose.cz);
        consider({ dist: t, x: hx, z: hz, nx: n.x, nz: n.z, kind: pose.kind, id: pose.id });
      }
    }
  }

  // 3. Pumpkins
  for (const p of state.pumpkins) {
    if (!p.alive) continue;
    const totalR = p.radius + shellRadius;
    const t = intersectCircleEntry(ox, oz, dx, dz, p.x, p.z, totalR);
    if (t !== null) {
      const hx = ox + dx * t;
      const hz = oz + dz * t;
      const n = normalize2(hx - p.x, hz - p.z);
      consider({ dist: t, x: hx, z: hz, nx: n.x, nz: n.z, kind: 'pumpkin', id: p.id });
    }
  }

  // 4. Alien Targets (with directional front shield check)
  for (const tgt of state.targets) {
    if (!tgt.alive) continue;
    const totalR = tgt.radius + shellRadius;
    const t = intersectCircleEntry(ox, oz, dx, dz, tgt.x, tgt.z, totalR);
    if (t !== null) {
      const hx = ox + dx * t;
      const hz = oz + dz * t;
      const n = normalize2(hx - tgt.x, hz - tgt.z);
      let kind: HitKind = 'target';
      if (tgt.shielded) {
        const f = dirForYaw(tgt.facing);
        if (n.x * f.x + n.z * f.z >= Math.cos(SHIELD_HALF_ARC)) {
          kind = 'shield';
        }
      }
      consider({ dist: t, x: hx, z: hz, nx: n.x, nz: n.z, kind, id: tgt.id });
    }
  }

  return best;
}

/** Collect all targets + chained pumpkins caught in a pumpkin blast. */
export function resolvePumpkinExplosion(
  pumpkinId: string,
  state: RoomState,
  mutate: boolean,
): { killedTargetIds: string[]; blastedPumpkinIds: string[] } {
  const pumpkin = state.pumpkins.find((p) => p.id === pumpkinId);
  if (!pumpkin) return { killedTargetIds: [], blastedPumpkinIds: [] };

  const visitedPumpkins = new Set<string>([pumpkinId]);
  const queue = [pumpkin];
  const killedTargets = new Set<string>();
  const blastedPumpkins: string[] = [pumpkinId];

  if (mutate) pumpkin.alive = false;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const tgt of state.targets) {
      if (!tgt.alive) continue;
      const d = Math.hypot(tgt.x - cur.x, tgt.z - cur.z);
      if (d <= PUMPKIN_BLAST_RADIUS + tgt.radius * 0.45) {
        killedTargets.add(tgt.id);
        if (mutate) {
          tgt.shielded = false;
          tgt.alive = false;
        }
      }
    }
    for (const other of state.pumpkins) {
      if (!other.alive || visitedPumpkins.has(other.id)) continue;
      const d = Math.hypot(other.x - cur.x, other.z - cur.z);
      if (d <= PUMPKIN_BLAST_RADIUS + other.radius) {
        visitedPumpkins.add(other.id);
        blastedPumpkins.push(other.id);
        if (mutate) other.alive = false;
        queue.push(other);
      }
    }
  }

  return {
    killedTargetIds: Array.from(killedTargets),
    blastedPumpkinIds: blastedPumpkins,
  };
}

/** Exact analytic bounce prediction used by both the live laser preview and the room solver. */
export function traceRay(
  originX: number,
  originZ: number,
  yaw: number,
  state: RoomState,
  time = 0,
  maxBounces = MAX_BOUNCES,
): RayTraceResult {
  let ox = originX;
  let oz = originZ;
  let { x: dx, z: dz } = dirForYaw(yaw);
  let bounces = 0;

  const segments: RaySegment[] = [];
  const hitTargetIds: string[] = [];
  const hitPumpkinIds: string[] = [];
  const shieldHitIds: string[] = [];
  const bouncedObstacleIds: string[] = [];

  for (let step = 0; step <= maxBounces; step++) {
    const hit = sweepFirstHit(ox, oz, dx, dz, 40, state, time);
    if (!hit) {
      const ex = ox + dx * 20;
      const ez = oz + dz * 20;
      segments.push({ ax: ox, az: oz, bx: ex, bz: ez, hitKind: null, hitId: null, nx: 0, nz: 0 });
      return {
        segments,
        bounces,
        endPoint: { x: ex, z: ez },
        hitTargetIds,
        hitPumpkinIds,
        shieldHitIds,
        bouncedObstacleIds,
      };
    }

    segments.push({
      ax: ox,
      az: oz,
      bx: hit.x,
      bz: hit.z,
      hitKind: hit.kind,
      hitId: hit.id,
      nx: hit.nx,
      nz: hit.nz,
    });

    if (hit.kind === 'target' && hit.id) {
      hitTargetIds.push(hit.id);
      return {
        segments,
        bounces,
        endPoint: { x: hit.x, z: hit.z },
        hitTargetIds,
        hitPumpkinIds,
        shieldHitIds,
        bouncedObstacleIds,
      };
    }

    if (hit.kind === 'pumpkin' && hit.id) {
      const chain = resolvePumpkinExplosion(hit.id, state, false);
      hitPumpkinIds.push(...chain.blastedPumpkinIds);
      for (const tid of chain.killedTargetIds) {
        if (!hitTargetIds.includes(tid)) hitTargetIds.push(tid);
      }
      return {
        segments,
        bounces,
        endPoint: { x: hit.x, z: hit.z },
        hitTargetIds,
        hitPumpkinIds,
        shieldHitIds,
        bouncedObstacleIds,
      };
    }

    if (hit.kind === 'shield' && hit.id && !shieldHitIds.includes(hit.id)) {
      shieldHitIds.push(hit.id);
    } else if (hit.id && hit.kind !== 'border' && !bouncedObstacleIds.includes(hit.id)) {
      bouncedObstacleIds.push(hit.id);
    }

    if (bounces >= maxBounces) {
      return {
        segments,
        bounces,
        endPoint: { x: hit.x, z: hit.z },
        hitTargetIds,
        hitPumpkinIds,
        shieldHitIds,
        bouncedObstacleIds,
      };
    }

    bounces++;
    const nextDir = reflectDir(dx, dz, hit.nx, hit.nz);
    dx = nextDir.x;
    dz = nextDir.z;
    ox = Math.max(-BOARD_HALF_W + SHELL_RADIUS + 1e-4, Math.min(BOARD_HALF_W - SHELL_RADIUS - 1e-4, hit.x + hit.nx * 1e-4));
    oz = Math.max(-BOARD_HALF_H + SHELL_RADIUS + 1e-4, Math.min(BOARD_HALF_H - SHELL_RADIUS - 1e-4, hit.z + hit.nz * 1e-4));
  }

  return {
    segments,
    bounces,
    endPoint: { x: ox, z: oz },
    hitTargetIds,
    hitPumpkinIds,
    shieldHitIds,
    bouncedObstacleIds,
  };
}

/** Step an in-flight corn shell across dt using the exact swept collision kernel as traceRay. */
export function stepShell(
  shell: ActiveShell,
  state: RoomState,
  dt: number,
  time: number,
  speed = SHELL_SPEED,
): ShellEvent[] {
  const events: ShellEvent[] = [];
  if (!shell.alive || dt <= 0) return events;

  let remaining = speed * dt;
  let guard = 0;

  while (remaining > 1e-6 && shell.alive && guard++ < 8) {
    const hit = sweepFirstHit(shell.x, shell.z, shell.dx, shell.dz, remaining, state, time);
    if (!hit) {
      shell.x += shell.dx * remaining;
      shell.z += shell.dz * remaining;
      shell.travelled += remaining;
      remaining = 0;
      break;
    }

    shell.x = hit.x;
    shell.z = hit.z;
    shell.travelled += hit.dist;
    remaining -= hit.dist;

    if (hit.kind === 'target' && hit.id) {
      const tgt = state.targets.find((t) => t.id === hit.id);
      if (tgt && tgt.alive) {
        tgt.alive = false;
        events.push({ type: 'target-kill', id: tgt.id, x: tgt.x, z: tgt.z, viaPumpkin: false });
      }
      shell.alive = false;
      break;
    }

    if (hit.kind === 'pumpkin' && hit.id) {
      const res = resolvePumpkinExplosion(hit.id, state, true);
      for (const pid of res.blastedPumpkinIds) {
        const p = state.pumpkins.find((item) => item.id === pid);
        events.push({ type: 'pumpkin-boom', id: pid, x: p?.x ?? hit.x, z: p?.z ?? hit.z });
      }
      for (const tid of res.killedTargetIds) {
        const tgt = state.targets.find((item) => item.id === tid);
        if (tgt) {
          events.push({ type: 'target-kill', id: tgt.id, x: tgt.x, z: tgt.z, viaPumpkin: true });
        }
      }
      shell.alive = false;
      break;
    }

    if (shell.bounces >= shell.maxBounces) {
      shell.alive = false;
      events.push({ type: 'expire', x: shell.x, z: shell.z });
      break;
    }

    shell.bounces++;
    if (hit.kind !== 'target' && hit.kind !== 'pumpkin') {
      events.push({
        type: 'bounce',
        kind: hit.kind,
        id: hit.id,
        x: hit.x,
        z: hit.z,
        nx: hit.nx,
        nz: hit.nz,
        bounceIndex: shell.bounces,
      });
    }

    const nextDir = reflectDir(shell.dx, shell.dz, hit.nx, hit.nz);
    shell.dx = nextDir.x;
    shell.dz = nextDir.z;
    shell.x = Math.max(-BOARD_HALF_W + SHELL_RADIUS + 1e-4, Math.min(BOARD_HALF_W - SHELL_RADIUS - 1e-4, hit.x + hit.nx * 1e-4));
    shell.z = Math.max(-BOARD_HALF_H + SHELL_RADIUS + 1e-4, Math.min(BOARD_HALF_H - SHELL_RADIUS - 1e-4, hit.z + hit.nz * 1e-4));
  }

  return events;
}

export function spawnShell(cowX: number, cowZ: number, yaw: number): ActiveShell {
  const dir = dirForYaw(yaw);
  return {
    x: cowX,
    z: cowZ,
    dx: dir.x,
    dz: dir.z,
    bounces: 0,
    maxBounces: MAX_BOUNCES,
    travelled: 0,
    alive: true,
  };
}

export function cloneRoomState(state: RoomState): RoomState {
  return {
    cow: { ...state.cow },
    obstacles: state.obstacles.map((o) => ({ ...o })),
    targets: state.targets.map((t) => ({ ...t })),
    pumpkins: state.pumpkins.map((p) => ({ ...p })),
  };
}
