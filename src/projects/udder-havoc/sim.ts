import { mulberry32, pick, pickWeighted } from '../../lib/rng';
import {
  DAYTIMES,
  ENEMY_TYPES,
  LAYOUTS,
  POWERUPS,
  SEASONS,
  type ArenaLayout,
  type BossKind,
  type DayTime,
  type EnemyKind,
  type PowerupId,
  type Season,
} from './data';

export const ARENA_HALF = 12.2;
const COW_RADIUS = 0.56;
const CHARGE_FULL_SEC = 0.72;
const CHARGE_MIN_RELEASE = 0.22;

export type ObstacleModelKind = 'hay' | 'crate' | 'rock' | 'stump' | 'corn-wall' | 'barn' | 'silo' | 'well';

export interface SimObstacle {
  id: number;
  kind: ObstacleModelKind;
  x: number;
  z: number;
  radius: number;
  yaw: number;
}

export interface SimEnemy {
  id: number;
  kind: EnemyKind;
  bossKind?: BossKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  dmg: number;
  xp: number;
  score: number;
  phase: number;
  actionTimer: number;
  dashVx: number;
  dashVz: number;
  dashTime: number;
  lockTimer: number;
  lockX: number;
  lockZ: number;
  flash: number;
  spawnGrace: number;
}

export interface SimProjectile {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  pierce: number;
  bounces: number;
  life: number;
  gold: boolean;
  popcorn: boolean;
  hitIds: number[];
}

export interface SimBeam {
  id: number;
  x: number;
  z: number;
  radius: number;
  timer: number;
  duration: number;
  damage: number;
  kind: 'tractor' | 'mortar' | 'enemyMortar' | 'slam';
}

interface SimMine {
  id: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  life: number;
}

interface SimGuardBee {
  id: number;
  x: number;
  z: number;
  angle: number;
  cooldown: number;
}

export interface SimPickup {
  id: number;
  kind: 'xp' | 'healer';
  x: number;
  z: number;
  vx: number;
  vz: number;
  value: number;
  life: number;
}

type SimEvent =
  | { type: 'fire'; x: number; z: number; dx: number; dz: number; gold: boolean }
  | { type: 'backblast'; x: number; z: number; dx: number; dz: number }
  | { type: 'hit'; x: number; z: number; color: number; count: number; crit: boolean }
  | { type: 'kill'; x: number; z: number; kind: EnemyKind }
  | { type: 'milk'; x: number; z: number; radius: number }
  | { type: 'mortar'; x: number; z: number }
  | { type: 'plasma'; x: number; z: number }
  | { type: 'beam'; x: number; z: number }
  | { type: 'slam'; x: number; z: number; radius: number }
  | { type: 'sniper'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'hurt'; x: number; z: number; amount: number }
  | { type: 'xp'; x: number; z: number }
  | { type: 'heal'; x: number; z: number }
  | { type: 'levelup'; level: number }
  | { type: 'boss'; x: number; z: number; bossKind: BossKind }
  | { type: 'gameover' };

export interface SimInput {
  moveX: number;
  moveZ: number;
  aimDirX: number;
  aimDirZ: number;
  hasManualAim: boolean;
  charging: boolean;
}

export interface SimOptions {
  season?: Season;
  daytime?: DayTime;
  layout?: ArenaLayout;
}

export interface SimState {
  seed: number;
  season: Season;
  daytime: DayTime;
  layout: ArenaLayout;
  rng: () => number;
  nextId: number;
  elapsed: number;
  wave: number;
  score: number;
  kills: number;
  directorCredits: number;
  spawnTimer: number;
  nextBossAt: number;
  bossIndex: number;
  healerTimer: number;
  trailTimer: number;
  beePhase: number;
  player: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    heading: number;
    aimX: number;
    aimZ: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    nextXp: number;
    fireTimer: number;
    charge: number;
    wasCharging: boolean;
    invuln: number;
    dashInvuln: number;
  };
  powerups: Record<PowerupId, number>;
  pendingChoices: PowerupId[] | null;
  ended: boolean;
  obstacles: SimObstacle[];
  enemies: SimEnemy[];
  projectiles: SimProjectile[];
  beams: SimBeam[];
  mines: SimMine[];
  guardBees: SimGuardBee[];
  pickups: SimPickup[];
  events: SimEvent[];
}

function emptyPowerups(): Record<PowerupId, number> {
  return {
    butter: 0,
    double: 0,
    popcorn: 0,
    goldsight: 0,
    milk: 0,
    pumpkin: 0,
    homing: 0,
    healer: 0,
    backblast: 0,
    ricochet: 0,
    bees: 0,
    trail: 0,
    magnet: 0,
  };
}

function buildObstacles(layout: ArenaLayout, rng: () => number): { obstacles: SimObstacle[]; startZ: number } {
  const obstacles: SimObstacle[] = [];
  let id = 1;
  const push = (kind: ObstacleModelKind, x: number, z: number, radius: number, yaw = 0) => {
    obstacles.push({ id: id++, kind, x, z, radius, yaw });
  };

  if (layout === 'cornrows') {
    for (const rx of [-5.8, -2.1, 2.1, 5.8]) {
      const zShift = rx > 0 ? 1.5 : -1.5;
      for (const rz of [-4.2, -2.8, 2.8, 4.2]) {
        push('corn-wall', rx, rz + zShift, 0.6, Math.PI / 2);
      }
    }
    push('hay', -8.6, 0, 0.72, 0.4);
    push('hay', 8.6, 0, 0.72, 1.1);
    return { obstacles, startZ: 0 };
  }

  if (layout === 'barnyard') {
    push('barn', 0, -0.6, 1.45, 0);
    push('silo', 2.15, -1.1, 0.9, 0.3);
    for (const [x, z] of [[-5.6, -4.8], [5.6, -4.8], [-5.6, 4.8], [5.6, 4.8]]) {
      push(rng() < 0.5 ? 'hay' : 'crate', x, z, 0.7, rng() * Math.PI);
    }
    return { obstacles, startZ: 3.4 };
  }

  if (layout === 'stonering') {
    const corners = [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]];
    for (const [cx, cz] of corners) {
      push('well', cx, cz, 0.85, rng() * Math.PI);
      push('rock', cx + (cx > 0 ? -1.4 : 1.4), cz, 0.62, rng() * Math.PI);
    }
    return { obstacles, startZ: 0 };
  }

  // Open Meadow
  const kinds: ObstacleModelKind[] = ['hay', 'crate', 'rock', 'stump'];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const dist = 5.4 + rng() * 3.8;
    const kind = kinds[i % kinds.length];
    push(kind, Math.cos(angle) * dist, Math.sin(angle) * dist, kind === 'hay' ? 0.72 : 0.62, rng() * Math.PI * 2);
  }
  return { obstacles, startZ: 0 };
}

export function createSimState(seed: number, options: SimOptions = {}): SimState {
  const rng = mulberry32(seed);
  const season = options.season ?? pick(SEASONS, rng);
  const daytime = options.daytime ?? pick(DAYTIMES, rng);
  const layout = options.layout ?? pick(LAYOUTS, rng);
  const { obstacles, startZ } = buildObstacles(layout, rng);

  const state: SimState = {
    seed,
    season,
    daytime,
    layout,
    rng,
    nextId: obstacles.length + 1,
    elapsed: 0,
    wave: 1,
    score: 0,
    kills: 0,
    directorCredits: 2,
    spawnTimer: 1.1,
    nextBossAt: ENEMY_TYPES.boss.unlockSec,
    bossIndex: 0,
    healerTimer: 14,
    trailTimer: 0,
    beePhase: 0,
    player: {
      x: 0,
      z: startZ,
      vx: 0,
      vz: 0,
      heading: 0,
      aimX: 0,
      aimZ: 1,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      nextXp: 14,
      fireTimer: 0.25,
      charge: 0,
      wasCharging: false,
      invuln: 0,
      dashInvuln: 0,
    },
    powerups: emptyPowerups(),
    pendingChoices: null,
    ended: false,
    obstacles,
    enemies: [],
    projectiles: [],
    beams: [],
    mines: [],
    guardBees: [],
    pickups: [],
    events: [],
  };
  for (let i = 0; i < 3; i++) spawnEnemy(state, 'visitor');
  return state;
}

function norm(x: number, z: number): [number, number, number] {
  const len = Math.hypot(x, z);
  return len > 1e-5 ? [x / len, z / len, len] : [0, 1, 0];
}

function pointToSegmentDistSq(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return (px - x1) ** 2 + (pz - z1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

function clampArena(pos: { x: number; z: number; vx: number; vz: number }, radius: number, bounce = 0.25) {
  const limit = ARENA_HALF - radius;
  if (pos.x < -limit) {
    pos.x = -limit;
    if (pos.vx < 0) pos.vx = -pos.vx * bounce;
  } else if (pos.x > limit) {
    pos.x = limit;
    if (pos.vx > 0) pos.vx = -pos.vx * bounce;
  }
  if (pos.z < -limit) {
    pos.z = -limit;
    if (pos.vz < 0) pos.vz = -pos.vz * bounce;
  } else if (pos.z > limit) {
    pos.z = limit;
    if (pos.vz > 0) pos.vz = -pos.vz * bounce;
  }
}

function resolveObstaclePush(entity: { x: number; z: number; vx: number; vz: number }, radius: number, obstacles: SimObstacle[]) {
  for (const obs of obstacles) {
    const dx = entity.x - obs.x;
    const dz = entity.z - obs.z;
    const minDist = radius + obs.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist) continue;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const nz = dz / d;
    entity.x = obs.x + nx * minDist;
    entity.z = obs.z + nz * minDist;
    const vn = entity.vx * nx + entity.vz * nz;
    if (vn < 0) {
      entity.vx -= vn * nx * 1.1;
      entity.vz -= vn * nz * 1.1;
    }
  }
}

const BOSS_ROTATION: readonly BossKind[] = ['harvester', 'strider', 'queen'];

function spawnEnemyAt(
  state: SimState,
  kind: EnemyKind,
  x: number,
  z: number,
  opts: { bossKind?: BossKind; vx?: number; vz?: number; spawnGrace?: number } = {},
) {
  const def = ENEMY_TYPES[kind];
  const id = state.nextId++;
  const scale = 1 + Math.max(0, state.elapsed - 20) / 70 + 0.08 * (state.wave - 1);
  let hpMult = kind === 'boss' ? 1 + (state.wave - 1) * 0.35 : scale;
  let speedMult = 1 + Math.min(0.45, state.elapsed / 320);
  if (kind === 'sprout') {
    const variant = id % 3;
    if (variant === 0) speedMult *= 1.24; // red: fast rusher
    else if (variant === 2) hpMult *= 1.5; // blue: sturdier mini-tank
  }
  state.enemies.push({
    id,
    kind,
    bossKind: opts.bossKind,
    x: Math.max(-ARENA_HALF + 0.6, Math.min(ARENA_HALF - 0.6, x)),
    z: Math.max(-ARENA_HALF + 0.6, Math.min(ARENA_HALF - 0.6, z)),
    vx: opts.vx ?? 0,
    vz: opts.vz ?? 0,
    hp: Math.round(def.baseHp * hpMult),
    maxHp: Math.round(def.baseHp * hpMult),
    radius: def.radius,
    speed: def.speed * speedMult,
    dmg: def.contactDmg,
    xp: def.xp,
    score: def.score,
    phase: state.rng() * Math.PI * 2,
    actionTimer: 1.8 + state.rng() * 1.6,
    dashVx: 0,
    dashVz: 0,
    dashTime: 0,
    lockTimer: 0,
    lockX: 0,
    lockZ: 0,
    flash: 0,
    spawnGrace: opts.spawnGrace ?? 0,
  });
}

function spawnEnemy(state: SimState, kind: EnemyKind) {
  const edge = Math.floor(state.rng() * 4);
  const span = ARENA_HALF - 0.8;
  const along = (state.rng() * 2 - 1) * span;
  let x = along;
  let z = span;
  if (edge === 0) { x = along; z = -span; }
  else if (edge === 1) { x = span; z = along; }
  else if (edge === 2) { x = along; z = span; }
  else { x = -span; z = along; }

  if (kind === 'sprout') {
    for (let i = 0; i < 3; i++) {
      spawnEnemyAt(state, 'sprout', x + (i - 1) * 0.55, z + (state.rng() - 0.5) * 0.5);
    }
    return;
  }
  if (kind === 'boss') {
    const bossKind = BOSS_ROTATION[state.bossIndex % BOSS_ROTATION.length];
    state.bossIndex += 1;
    spawnEnemyAt(state, 'boss', x, z, { bossKind });
    return;
  }
  spawnEnemyAt(state, kind, x, z);
}

function spawnHealerCow(state: SimState) {
  const angle = state.rng() * Math.PI * 2;
  const dist = 4 + state.rng() * 5;
  state.pickups.push({
    id: state.nextId++,
    kind: 'healer',
    x: Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, Math.cos(angle) * dist)),
    z: Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, Math.sin(angle) * dist)),
    vx: (state.rng() - 0.5) * 0.8,
    vz: (state.rng() - 0.5) * 0.8,
    value: 25 + state.powerups.healer * 8,
    life: 24,
  });
}

function chooseUpgradePool(state: SimState): PowerupId[] {
  const pool = POWERUPS.map(p => p.id);
  const picks: PowerupId[] = [];
  while (picks.length < 3 && pool.length > 0) {
    const idx = Math.floor(state.rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

export function applyPowerup(state: SimState, id: PowerupId) {
  state.powerups[id] += 1;
  if (id === 'healer') {
    state.player.maxHp += 20;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 15);
    spawnHealerCow(state);
    state.events.push({ type: 'heal', x: state.player.x, z: state.player.z });
  } else if (id === 'bees') {
    const targetCount = state.powerups.bees * 2;
    while (state.guardBees.length < targetCount) {
      state.guardBees.push({
        id: state.nextId++,
        x: state.player.x,
        z: state.player.z,
        angle: 0,
        cooldown: 0,
      });
    }
  }
  state.pendingChoices = null;
}

export function getStats(state: SimState) {
  const p = state.powerups;
  return {
    moveAccel: 31 * Math.pow(1.18, p.butter),
    drag: Math.max(2.6, 6.2 * Math.pow(0.86, p.butter)),
    fireInterval: Math.max(0.14, 0.48 * Math.pow(0.84, p.goldsight)),
    chargeDuration: Math.max(0.32, CHARGE_FULL_SEC * Math.pow(0.82, p.goldsight)),
    volleyCount: 1 + p.double,
    recoilImpulse: 5.4 * (1 + 0.16 * p.double + 0.08 * p.butter),
    cobDamage: 20 + 4 * p.goldsight,
    cobSpeed: 16.5,
    popcornCount: p.popcorn > 0 ? 2 + (p.popcorn - 1) * 2 : 0,
    goldPierce: 3 + p.goldsight * 2,
    chainBounces: p.ricochet,
    milkRadius: p.milk > 0 ? 2.1 + 0.45 * (p.milk - 1) : 0,
    milkDamage: p.milk > 0 ? 11 + 7 * (p.milk - 1) : 0,
    pumpkinChance: p.pumpkin > 0 ? Math.min(0.65, 0.18 + 0.12 * (p.pumpkin - 1)) : 0,
    homingTurn: p.homing > 0 ? 4.2 + 2.4 * (p.homing - 1) : 0,
    backblastRange: p.backblast > 0 ? 3.2 + 0.55 * (p.backblast - 1) : 0,
    backblastDamage: p.backblast > 0 ? 12 + 8 * (p.backblast - 1) : 0,
    beeDamage: p.bees > 0 ? 12 + 5 * (p.bees - 1) : 0,
    trailDamage: p.trail > 0 ? 14 + 8 * (p.trail - 1) : 0,
    magnetRadius: 3.2 + p.butter * 0.35 + p.magnet * 2.4,
    xpMult: 1 + p.magnet * 0.15,
  };
}

function fireVolley(state: SimState, gold: boolean, chargeRatio: number) {
  const stats = getStats(state);
  const pl = state.player;
  const baseAngle = Math.atan2(pl.aimZ, pl.aimX);
  const count = gold ? Math.max(1, Math.ceil(stats.volleyCount / 2)) : stats.volleyCount;
  const spreadStep = 0.14;
  const muzzleX = pl.x + pl.aimX * 0.68;
  const muzzleZ = pl.z + pl.aimZ * 0.68;

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spreadStep;
    const a = baseAngle + offset;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const speed = gold ? stats.cobSpeed * 1.45 : stats.cobSpeed;
    const mult = gold ? 1.8 + 1.4 * chargeRatio : 1;
    state.projectiles.push({
      id: state.nextId++,
      x: muzzleX,
      z: muzzleZ,
      vx: dx * speed,
      vz: dz * speed,
      radius: gold ? 0.46 : 0.34,
      damage: Math.round(stats.cobDamage * mult),
      pierce: gold ? stats.goldPierce : 0,
      bounces: stats.chainBounces,
      life: gold ? 1.35 : 1.15,
      gold,
      popcorn: false,
      hitIds: [],
    });
  }

  const recoilScale = gold ? 1.55 + 1.1 * chargeRatio : 1;
  pl.vx -= pl.aimX * stats.recoilImpulse * recoilScale;
  pl.vz -= pl.aimZ * stats.recoilImpulse * recoilScale;
  if (gold || chargeRatio >= CHARGE_MIN_RELEASE) {
    pl.dashInvuln = Math.max(pl.dashInvuln, gold ? 0.55 : 0.28);
  }
  state.events.push({ type: 'fire', x: muzzleX, z: muzzleZ, dx: pl.aimX, dz: pl.aimZ, gold });

  if (stats.backblastDamage > 0) {
    const bx = -pl.aimX;
    const bz = -pl.aimZ;
    const range = stats.backblastRange * (gold ? 1.35 : 1);
    const dmg = Math.round(stats.backblastDamage * (gold ? 1.75 : 1));
    state.events.push({ type: 'backblast', x: pl.x + bx * 0.7, z: pl.z + bz * 0.7, dx: bx, dz: bz });
    for (const e of state.enemies) {
      const dx = e.x - pl.x;
      const dz = e.z - pl.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius || d < 0.001) continue;
      const dot = (dx / d) * bx + (dz / d) * bz;
      if (dot > 0.35) {
        damageEnemy(state, e, dmg, (dx / d) * 7.5, (dz / d) * 7.5, gold);
      }
    }
  }
}

function damageEnemy(state: SimState, enemy: SimEnemy, dmg: number, knockX: number, knockZ: number, crit = false) {
  if (enemy.spawnGrace > 0) return;
  enemy.hp -= dmg;
  enemy.flash = 0.12;
  const kScale = enemy.kind === 'boss' ? 0.22 : enemy.kind === 'brute' ? 0.45 : 1;
  enemy.vx += knockX * kScale;
  enemy.vz += knockZ * kScale;
  state.events.push({
    type: 'hit',
    x: enemy.x,
    z: enemy.z,
    color: crit ? 0xffe469 : 0xfff0aa,
    count: crit ? 10 : 6,
    crit,
  });
}

function hurtPlayer(state: SimState, amount: number) {
  const pl = state.player;
  if (pl.invuln > 0 || pl.dashInvuln > 0) return;
  pl.hp = Math.max(0, pl.hp - amount);
  pl.invuln = 0.85;
  state.events.push({ type: 'hurt', x: pl.x, z: pl.z, amount });
}

function grantXp(state: SimState, amount: number) {
  const pl = state.player;
  pl.xp += amount;
  while (pl.xp >= pl.nextXp) {
    pl.xp -= pl.nextXp;
    pl.level += 1;
    pl.nextXp = Math.round(pl.nextXp * 1.32 + 10);
    state.pendingChoices = chooseUpgradePool(state);
    state.events.push({ type: 'levelup', level: pl.level });
    break;
  }
}

export function stepSim(state: SimState, input: SimInput, rawDt: number) {
  state.events.length = 0;
  if (state.ended || state.pendingChoices) return;

  const dt = Math.min(0.05, Math.max(0, rawDt));
  if (dt <= 0) return;

  const stats = getStats(state);
  const pl = state.player;

  state.elapsed += dt;
  state.wave = 1 + Math.floor(state.elapsed / 30);
  if (pl.invuln > 0) pl.invuln = Math.max(0, pl.invuln - dt);
  if (pl.dashInvuln > 0) pl.dashInvuln = Math.max(0, pl.dashInvuln - dt);

  // 1. Player move + friction
  const [mx, mz, mLen] = norm(input.moveX, input.moveZ);
  if (mLen > 0.05) {
    const throttle = Math.min(1, mLen);
    pl.vx += mx * stats.moveAccel * throttle * dt;
    pl.vz += mz * stats.moveAccel * throttle * dt;
  }
  const damp = Math.exp(-stats.drag * dt);
  pl.vx *= damp;
  pl.vz *= damp;
  pl.x += pl.vx * dt;
  pl.z += pl.vz * dt;
  resolveObstaclePush(pl, COW_RADIUS, state.obstacles);
  clampArena(pl, COW_RADIUS, 0.35);

  if (stats.trailDamage > 0) {
    state.trailTimer -= dt;
    const speed = Math.hypot(pl.vx, pl.vz);
    if (state.trailTimer <= 0 && (speed > 4.1 || pl.dashInvuln > 0) && state.mines.length < 24) {
      state.trailTimer = 0.22;
      state.mines.push({
        id: state.nextId++,
        x: pl.x,
        z: pl.z,
        radius: 1.05,
        damage: stats.trailDamage,
        life: 6,
      });
    }
  }

  // 2. Aiming
  if (input.hasManualAim && (Math.abs(input.aimDirX) > 0.01 || Math.abs(input.aimDirZ) > 0.01)) {
    const [ax, az] = norm(input.aimDirX, input.aimDirZ);
    pl.aimX = ax;
    pl.aimZ = az;
  } else if (state.enemies.length > 0) {
    let best = state.enemies[0];
    let bestD2 = Infinity;
    for (const e of state.enemies) {
      const d2 = (e.x - pl.x) ** 2 + (e.z - pl.z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    const [ax, az] = norm(best.x - pl.x, best.z - pl.z);
    pl.aimX = ax;
    pl.aimZ = az;
  } else if (mLen > 0.1) {
    pl.aimX = mx;
    pl.aimZ = mz;
  }
  pl.heading = Math.atan2(pl.aimX, pl.aimZ);

  // 3. Firing & Charge Blast
  if (input.charging) {
    pl.charge = Math.min(1, pl.charge + dt / stats.chargeDuration);
    pl.wasCharging = true;
  } else {
    if (pl.wasCharging && pl.charge >= CHARGE_MIN_RELEASE) {
      fireVolley(state, pl.charge >= 0.85, pl.charge);
      pl.fireTimer = stats.fireInterval * 0.7;
    }
    pl.charge = 0;
    pl.wasCharging = false;

    pl.fireTimer -= dt;
    if (pl.fireTimer <= 0 && (state.enemies.length > 0 || input.hasManualAim)) {
      pl.fireTimer = stats.fireInterval;
      fireVolley(state, false, 0);
    }
  }

  // 4. Enemy Director
  const creditsPerSec = 0.45 + state.elapsed * 0.038 + (state.wave - 1) * 0.25;
  state.directorCredits += creditsPerSec * dt;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.enemies.length < 75) {
    const options: [EnemyKind, number][] = [['visitor', 6]];
    if (state.elapsed >= ENEMY_TYPES.skimmer.unlockSec) options.push(['skimmer', 4]);
    if (state.elapsed >= ENEMY_TYPES.sprout.unlockSec) options.push(['sprout', 3.5]);
    if (state.elapsed >= ENEMY_TYPES.splitter.unlockSec) options.push(['splitter', 2.5]);
    if (state.elapsed >= ENEMY_TYPES.brute.unlockSec) options.push(['brute', 2.2]);
    if (state.elapsed >= ENEMY_TYPES.sniper.unlockSec) options.push(['sniper', 2.2]);
    if (state.elapsed >= ENEMY_TYPES.lobber.unlockSec) options.push(['lobber', 2]);
    if (state.elapsed >= ENEMY_TYPES.saucer.unlockSec) options.push(['saucer', 2]);
    let spawned = 0;
    while (spawned < 3 && state.enemies.length < 75) {
      const kind = pickWeighted(options, state.rng);
      const cost = kind === 'sprout' ? ENEMY_TYPES.sprout.cost * 3 : ENEMY_TYPES[kind].cost;
      if (cost > state.directorCredits) break;
      state.directorCredits -= cost;
      spawnEnemy(state, kind);
      spawned++;
    }
    state.spawnTimer = Math.max(0.6, 1.75 - state.elapsed * 0.005);
  }

  if (state.elapsed >= state.nextBossAt) {
    spawnEnemy(state, 'boss');
    const boss = state.enemies[state.enemies.length - 1];
    state.events.push({ type: 'boss', x: boss.x, z: boss.z, bossKind: boss.bossKind ?? 'harvester' });
    state.nextBossAt += 90;
  }

  state.healerTimer -= dt;
  if (state.healerTimer <= 0) {
    spawnHealerCow(state);
    state.healerTimer = Math.max(12, 24 - state.powerups.healer * 2.5);
  }

  // 5. Update Projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const pr = state.projectiles[i];
    pr.life -= dt;
    if (pr.life <= 0) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (stats.homingTurn > 0 && state.enemies.length > 0) {
      let nearest: SimEnemy | null = null;
      let bestD2 = 64;
      for (const e of state.enemies) {
        if (pr.hitIds.includes(e.id)) continue;
        const d2 = (e.x - pr.x) ** 2 + (e.z - pr.z) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          nearest = e;
        }
      }
      if (nearest) {
        const speed = Math.hypot(pr.vx, pr.vz);
        const curA = Math.atan2(pr.vz, pr.vx);
        const targetA = Math.atan2(nearest.z - pr.z, nearest.x - pr.x);
        let diff = targetA - curA;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), stats.homingTurn * dt);
        const nextA = curA + step;
        pr.vx = Math.cos(nextA) * speed;
        pr.vz = Math.sin(nextA) * speed;
      }
    }

    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;

    if (Math.abs(pr.x) > ARENA_HALF + 0.6 || Math.abs(pr.z) > ARENA_HALF + 0.6) {
      state.projectiles.splice(i, 1);
      continue;
    }

    let consumed = false;
    for (const e of state.enemies) {
      if (e.spawnGrace > 0 || pr.hitIds.includes(e.id)) continue;
      const dx = e.x - pr.x;
      const dz = e.z - pr.z;
      const hitR = pr.radius + e.radius;
      if (dx * dx + dz * dz > hitR * hitR) continue;

      pr.hitIds.push(e.id);
      const [kx, kz] = norm(pr.vx, pr.vz);
      damageEnemy(state, e, pr.damage, kx * (pr.gold ? 6.5 : 3.4), kz * (pr.gold ? 6.5 : 3.4), pr.gold);

      if (!pr.popcorn && stats.popcornCount > 0) {
        const baseA = Math.atan2(pr.vz, pr.vx);
        for (let k = 0; k < stats.popcornCount; k++) {
          const a = baseA + (state.rng() - 0.5) * 1.9 + Math.PI * (k % 2 === 0 ? 0.35 : -0.35);
          state.projectiles.push({
            id: state.nextId++,
            x: pr.x,
            z: pr.z,
            vx: Math.cos(a) * 12.5,
            vz: Math.sin(a) * 12.5,
            radius: 0.24,
            damage: Math.max(8, Math.round(stats.cobDamage * 0.55)),
            pierce: 0,
            bounces: 0,
            life: 0.55,
            gold: false,
            popcorn: true,
            hitIds: [e.id],
          });
        }
      }

      if (!pr.popcorn && stats.pumpkinChance > 0 && state.rng() < stats.pumpkinChance) {
        state.beams.push({
          id: state.nextId++,
          x: e.x,
          z: e.z,
          radius: 1.9,
          timer: 0.45,
          duration: 0.45,
          damage: Math.round(stats.cobDamage * 1.9),
          kind: 'mortar',
        });
      }

      if (pr.pierce > 0) {
        pr.pierce -= 1;
      } else if (!pr.popcorn && pr.bounces > 0) {
        let nextTarget: SimEnemy | null = null;
        let bestD2 = 56;
        for (const cand of state.enemies) {
          if (cand.hp <= 0 || pr.hitIds.includes(cand.id)) continue;
          const d2 = (cand.x - pr.x) ** 2 + (cand.z - pr.z) ** 2;
          if (d2 < bestD2) {
            bestD2 = d2;
            nextTarget = cand;
          }
        }
        if (nextTarget) {
          pr.bounces -= 1;
          const speed = Math.hypot(pr.vx, pr.vz);
          const [bx, bz] = norm(nextTarget.x - pr.x, nextTarget.z - pr.z);
          pr.vx = bx * speed;
          pr.vz = bz * speed;
        } else {
          consumed = true;
          break;
        }
      } else {
        consumed = true;
        break;
      }
    }
    if (consumed) state.projectiles.splice(i, 1);
  }

  // 5b. Guard Bees orbit & sting
  if (state.guardBees.length > 0) {
    state.beePhase += dt * 3.4;
    const count = state.guardBees.length;
    const orbitR = 1.75;
    for (let i = 0; i < count; i++) {
      const bee = state.guardBees[i];
      bee.angle = state.beePhase + (i / count) * Math.PI * 2;
      bee.x = pl.x + Math.cos(bee.angle) * orbitR;
      bee.z = pl.z + Math.sin(bee.angle) * orbitR;
      if (bee.cooldown > 0) {
        bee.cooldown = Math.max(0, bee.cooldown - dt);
        continue;
      }
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - bee.x;
        const dz = e.z - bee.z;
        const r = e.radius + 0.48;
        if (dx * dx + dz * dz <= r * r) {
          const [kx, kz] = norm(dx, dz);
          damageEnemy(state, e, stats.beeDamage, kx * 3.5, kz * 3.5, false);
          bee.cooldown = 0.35;
          break;
        }
      }
    }
  }

  // 5c. Sizzling Trail mines
  for (let i = state.mines.length - 1; i >= 0; i--) {
    const m = state.mines[i];
    m.life -= dt;
    if (m.life <= 0) {
      state.mines.splice(i, 1);
      continue;
    }
    let triggered = false;
    for (const e of state.enemies) {
      const dx = e.x - m.x;
      const dz = e.z - m.z;
      const r = e.radius + 0.42;
      if (dx * dx + dz * dz <= r * r) {
        triggered = true;
        break;
      }
    }
    if (!triggered) continue;
    state.events.push({ type: 'mortar', x: m.x, z: m.z });
    for (const e of state.enemies) {
      const dx = e.x - m.x;
      const dz = e.z - m.z;
      if (dx * dx + dz * dz <= (m.radius + e.radius) ** 2) {
        const [kx, kz] = norm(dx, dz);
        damageEnemy(state, e, m.damage, kx * 4.5, kz * 4.5, true);
      }
    }
    state.mines.splice(i, 1);
  }

  // 6. Update Beams, Plasma Mortars & Slams
  for (let i = state.beams.length - 1; i >= 0; i--) {
    const b = state.beams[i];
    b.timer -= dt;
    if (b.timer > 0) continue;

    if (b.kind === 'mortar') {
      state.events.push({ type: 'mortar', x: b.x, z: b.z });
      for (const e of state.enemies) {
        const dx = e.x - b.x;
        const dz = e.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= b.radius * b.radius) {
          const [kx, kz] = norm(dx, dz);
          damageEnemy(state, e, b.damage, kx * 5.5, kz * 5.5, true);
        }
      }
    } else {
      if (b.kind === 'enemyMortar') state.events.push({ type: 'plasma', x: b.x, z: b.z });
      else if (b.kind === 'slam') state.events.push({ type: 'slam', x: b.x, z: b.z, radius: b.radius });
      else state.events.push({ type: 'beam', x: b.x, z: b.z });

      const d2 = (pl.x - b.x) ** 2 + (pl.z - b.z) ** 2;
      if (d2 <= (b.radius + COW_RADIUS * 0.7) ** 2) {
        hurtPlayer(state, b.damage);
      }
    }
    state.beams.splice(i, 1);
  }

  // 7. Process Kills, Splitter Hatches & Milk Blast
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hp > 0) continue;

    state.kills += 1;
    state.score += e.score;
    state.events.push({ type: 'kill', x: e.x, z: e.z, kind: e.kind });

    if (stats.milkRadius > 0) {
      state.events.push({ type: 'milk', x: e.x, z: e.z, radius: stats.milkRadius });
      for (const other of state.enemies) {
        if (other.id === e.id || other.hp <= 0) continue;
        const dx = other.x - e.x;
        const dz = other.z - e.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= stats.milkRadius * stats.milkRadius) {
          const [kx, kz] = norm(dx, dz);
          damageEnemy(state, other, stats.milkDamage, kx * 6.0, kz * 6.0, false);
        }
      }
    }

    if (e.kind === 'splitter' && state.enemies.length < 72) {
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2 + state.rng() * 0.4;
        spawnEnemyAt(state, 'sprout', e.x + Math.cos(a) * 0.75, e.z + Math.sin(a) * 0.75, {
          vx: Math.cos(a) * 4.5,
          vz: Math.sin(a) * 4.5,
          spawnGrace: 0.35,
        });
      }
    }

    const gemCount = e.kind === 'boss' ? 8 : 1;
    const gemVal = Math.max(1, Math.round(e.xp / gemCount));
    for (let g = 0; g < gemCount; g++) {
      const a = state.rng() * Math.PI * 2;
      const kick = g === 0 && gemCount === 1 ? 0 : 1.5 + state.rng() * 2;
      state.pickups.push({
        id: state.nextId++,
        kind: 'xp',
        x: e.x,
        z: e.z,
        vx: Math.cos(a) * kick,
        vz: Math.sin(a) * kick,
        value: gemVal,
        life: 32,
      });
    }
    if (e.kind === 'boss') spawnHealerCow(state);
    state.enemies.splice(i, 1);
  }

  // 8. Move Enemies & Contact Damage
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.spawnGrace > 0) e.spawnGrace = Math.max(0, e.spawnGrace - dt);
    e.phase += dt * 4.5;

    const [tx, tz, dist] = norm(pl.x - e.x, pl.z - e.z);
    if (e.kind === 'skimmer') {
      if (e.dashTime > 0) {
        e.dashTime -= dt;
        e.vx = e.dashVx;
        e.vz = e.dashVz;
      } else {
        const weave = Math.sin(e.phase) * 0.65;
        e.actionTimer -= dt;
        e.vx = e.vx * 0.85 + (tx - tz * weave) * e.speed * 0.15;
        e.vz = e.vz * 0.85 + (tz + tx * weave) * e.speed * 0.15;
        if (e.actionTimer <= 0 && dist < 8) {
          e.dashVx = tx * e.speed * 2.35;
          e.dashVz = tz * e.speed * 2.35;
          e.dashTime = 0.36;
          e.actionTimer = 2.5 + state.rng();
        }
      }
    } else if (e.kind === 'sprout' && e.id % 3 === 1) {
      // Yellow sprout zig-zag flanker
      const zig = Math.sin(e.phase * 1.4) * 0.7;
      e.vx = e.vx * 0.84 + (tx - tz * zig) * e.speed * 0.16;
      e.vz = e.vz * 0.84 + (tz + tx * zig) * e.speed * 0.16;
    } else if (e.kind === 'sniper') {
      if (e.lockTimer > 0) {
        e.vx *= 0.8;
        e.vz *= 0.8;
        e.lockTimer -= dt;
        if (e.lockTimer <= 0) {
          state.events.push({ type: 'sniper', x1: e.x, z1: e.z, x2: e.lockX, z2: e.lockZ });
          if (pointToSegmentDistSq(pl.x, pl.z, e.x, e.z, e.lockX, e.lockZ) <= (COW_RADIUS + 0.18) ** 2) {
            hurtPlayer(state, 12);
          }
          e.actionTimer = 2.8 + state.rng();
        }
      } else {
        const moveScale = dist > 8.5 ? 1 : dist < 6 ? -0.55 : 0.1;
        e.vx = e.vx * 0.86 + tx * moveScale * e.speed * 0.14;
        e.vz = e.vz * 0.86 + tz * moveScale * e.speed * 0.14;
        e.actionTimer -= dt;
        if (e.actionTimer <= 0 && dist < 12) {
          e.lockTimer = 1.05;
          e.lockX = e.x + tx * 14;
          e.lockZ = e.z + tz * 14;
        }
      }
    } else if (e.kind === 'lobber') {
      const moveScale = dist > 6.5 ? 1 : dist < 4.5 ? -0.4 : 0.1;
      e.vx = e.vx * 0.88 + tx * moveScale * e.speed * 0.12;
      e.vz = e.vz * 0.88 + tz * moveScale * e.speed * 0.12;
      e.actionTimer -= dt;
      if (e.actionTimer <= 0 && dist < 12) {
        e.actionTimer = 3.1 + state.rng() * 0.8;
        state.beams.push({
          id: state.nextId++,
          x: pl.x + pl.vx * 0.2,
          z: pl.z + pl.vz * 0.2,
          radius: 1.35,
          timer: 1.2,
          duration: 1.2,
          damage: 11,
          kind: 'enemyMortar',
        });
      }
    } else if (e.kind === 'saucer') {
      const moveScale = dist > 5.6 ? 1 : -0.35;
      e.vx = e.vx * 0.9 + (tx * moveScale - tz * 0.7) * e.speed * 0.1;
      e.vz = e.vz * 0.9 + (tz * moveScale + tx * 0.7) * e.speed * 0.1;
      e.actionTimer -= dt;
      if (e.actionTimer <= 0) {
        e.actionTimer = 3.2;
        state.beams.push({
          id: state.nextId++,
          x: pl.x + pl.vx * 0.25,
          z: pl.z + pl.vz * 0.25,
          radius: 1.45,
          timer: 1.25,
          duration: 1.25,
          damage: 12,
          kind: 'tractor',
        });
      }
    } else if (e.kind === 'boss') {
      const bk = e.bossKind ?? 'harvester';
      const desired = bk === 'strider' ? 3.8 : 5.2;
      const moveScale = dist > desired ? 1 : -0.25;
      const strafe = bk === 'strider' ? 0.25 : 0.65;
      e.vx = e.vx * 0.9 + (tx * moveScale - tz * strafe) * e.speed * 0.1;
      e.vz = e.vz * 0.9 + (tz * moveScale + tx * strafe) * e.speed * 0.1;
      e.actionTimer -= dt;
      if (e.actionTimer <= 0) {
        if (bk === 'harvester') {
          e.actionTimer = 2.5;
          for (const spread of [-1.4, 1.4]) {
            state.beams.push({
              id: state.nextId++,
              x: pl.x + pl.vx * 0.25 - tz * spread,
              z: pl.z + pl.vz * 0.25 + tx * spread,
              radius: 1.7,
              timer: 1.15,
              duration: 1.15,
              damage: 16,
              kind: 'tractor',
            });
          }
          if (state.enemies.length < 70) spawnEnemy(state, 'skimmer');
        } else if (bk === 'strider') {
          e.actionTimer = 2.4;
          if (dist < 4.8) {
            state.beams.push({
              id: state.nextId++,
              x: e.x,
              z: e.z,
              radius: 3.4,
              timer: 1.0,
              duration: 1.0,
              damage: 18,
              kind: 'slam',
            });
          } else {
            for (const off of [-1.8, 0, 1.8]) {
              state.beams.push({
                id: state.nextId++,
                x: pl.x + tz * off,
                z: pl.z - tx * off,
                radius: 1.4,
                timer: 1.15,
                duration: 1.15,
                damage: 14,
                kind: 'enemyMortar',
              });
            }
          }
        } else {
          // queen
          e.actionTimer = 2.7;
          for (let q = 0; q < 4; q++) {
            const a = (q / 4) * Math.PI * 2 + e.phase;
            state.beams.push({
              id: state.nextId++,
              x: Math.max(-ARENA_HALF + 1.5, Math.min(ARENA_HALF - 1.5, pl.x + Math.cos(a) * 2.2)),
              z: Math.max(-ARENA_HALF + 1.5, Math.min(ARENA_HALF - 1.5, pl.z + Math.sin(a) * 2.2)),
              radius: 1.35,
              timer: 1.15,
              duration: 1.15,
              damage: 14,
              kind: 'enemyMortar',
            });
          }
          if (state.enemies.length < 68) {
            spawnEnemyAt(state, state.rng() < 0.5 ? 'splitter' : 'sniper', e.x + 1.1, e.z);
          }
        }
      }
    } else {
      e.vx = e.vx * 0.85 + tx * e.speed * 0.15;
      e.vz = e.vz * 0.85 + tz * e.speed * 0.15;
    }

    for (let j = i + 1; j < state.enemies.length; j++) {
      const o = state.enemies[j];
      const sx = e.x - o.x;
      const sz = e.z - o.z;
      const minD = e.radius + o.radius;
      const d2 = sx * sx + sz * sz;
      if (d2 > 0 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        const push = (minD - d) * 4 * dt;
        const nx = sx / d;
        const nz = sz / d;
        e.x += nx * push;
        e.z += nz * push;
        o.x -= nx * push;
        o.z -= nz * push;
      }
    }

    e.x += e.vx * dt;
    e.z += e.vz * dt;
    if (e.kind !== 'saucer' && e.kind !== 'boss' && e.kind !== 'skimmer' && e.kind !== 'sniper') {
      resolveObstaclePush(e, e.radius, state.obstacles);
    }
    clampArena(e, e.radius, 0.2);

    const cdx = pl.x - e.x;
    const cdz = pl.z - e.z;
    const cDist = COW_RADIUS + e.radius * 0.88;
    if (cdx * cdx + cdz * cdz < cDist * cDist) {
      const [kx, kz] = norm(cdx, cdz);
      if (pl.dashInvuln > 0) {
        if (e.kind !== 'boss') {
          e.vx -= kx * 8.5;
          e.vz -= kz * 8.5;
        }
      } else if (pl.invuln <= 0) {
        hurtPlayer(state, e.dmg);
        pl.vx += kx * 6.5;
        pl.vz += kz * 6.5;
      }
    }
  }

  // 9. Update Pickups
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) {
      state.pickups.splice(i, 1);
      continue;
    }
    const dx = pl.x - pk.x;
    const dz = pl.z - pk.z;
    const d2 = dx * dx + dz * dz;

    if (pk.kind === 'healer') {
      if (Math.abs(pk.x) > ARENA_HALF - 1) pk.vx *= -1;
      if (Math.abs(pk.z) > ARENA_HALF - 1) pk.vz *= -1;
      if (state.powerups.magnet > 0 && d2 < stats.magnetRadius * stats.magnetRadius) {
        const [mxp, mzp] = norm(dx, dz);
        pk.x += mxp * 2.8 * dt;
        pk.z += mzp * 2.8 * dt;
      }
      pk.x += pk.vx * dt;
      pk.z += pk.vz * dt;
      if (d2 < (COW_RADIUS + 0.55) ** 2) {
        pl.hp = Math.min(pl.maxHp, pl.hp + pk.value);
        state.events.push({ type: 'heal', x: pk.x, z: pk.z });
        state.pickups.splice(i, 1);
      }
      continue;
    }

    pk.vx *= Math.exp(-5 * dt);
    pk.vz *= Math.exp(-5 * dt);
    if (d2 < stats.magnetRadius * stats.magnetRadius) {
      const [mxp, mzp, d] = norm(dx, dz);
      const pull = 10 + (1 - d / stats.magnetRadius) * 14;
      pk.vx = mxp * pull;
      pk.vz = mzp * pull;
    }
    pk.x += pk.vx * dt;
    pk.z += pk.vz * dt;
    if (d2 < (COW_RADIUS + 0.38) ** 2) {
      state.events.push({ type: 'xp', x: pk.x, z: pk.z });
      grantXp(state, Math.round(pk.value * stats.xpMult));
      state.pickups.splice(i, 1);
    }
  }

  if (pl.hp <= 0) {
    pl.hp = 0;
    state.ended = true;
    state.events.push({ type: 'gameover' });
  }
}
