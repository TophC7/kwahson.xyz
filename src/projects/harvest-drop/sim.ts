import * as planck from 'planck';
import { mulberry32, pickWeighted, randomSeed } from '../../lib/rng';
import { CROPS, MAX_TIER, PUMPKIN_POOF_BONUS, cropByTier, type CropDef } from './crops';

export const CRATE_HALF_W = 3.35;
export const CRATE_HEIGHT = 8.15;
export const DANGER_Y = 6.9;
export const DROP_Y = 7.9;
export const DANGER_LIMIT = 2.5;
export const MAX_POWERUP_SLOTS = 2;
export const PINEAPPLE_BLAST_RADIUS = 1.75;
export const INITIAL_DROP_TIER = 3; // Pea, Blueberry, Strawberry
export const MAX_DROPPABLE_TIER = CROPS.reduce((m, c) => (c.droppable ? Math.max(m, c.tier) : m), 1);
export const DROP_UNLOCK_SCORES: Readonly<Record<number, number>> = {
  4: 450,  // Lemon
  5: 1350, // Garlic Bulb
  6: 2800, // Turnip
};

export const ALL_POWERUP_KINDS = ['abduct', 'shake', 'grow', 'sweep', 'pineapple'] as const;
export type PowerupKind = (typeof ALL_POWERUP_KINDS)[number];

export interface PowerupMeta {
  name: string;
  shortName: string;
  hint: string;
  description: string;
  needsTarget: boolean;
  accentCss: string;
}

export const POWERUP_DEFS: Record<PowerupKind, PowerupMeta> = {
  abduct: {
    name: 'UFO Abduct',
    shortName: 'Abduct',
    hint: 'Pick 1 crop',
    description: 'Beam any one crop out of the crate.',
    needsTarget: true,
    accentCss: '#72d9b8',
  },
  shake: {
    name: 'Crate Shake',
    shortName: 'Shake',
    hint: 'Rattle bin',
    description: 'Rattle the crate to settle jams and spark merges.',
    needsTarget: false,
    accentCss: '#e5b84b',
  },
  grow: {
    name: 'Bumper Grow',
    shortName: 'Grow +1',
    hint: 'Upgrade T1-10',
    description: 'Promote any Tier 1-10 crop up one tier.',
    needsTarget: true,
    accentCss: '#92cf68',
  },
  sweep: {
    name: 'Compost Sweep',
    shortName: 'Sweep',
    hint: 'Clear T1-2',
    description: 'Clear all Peas & Blueberries from the crate.',
    needsTarget: false,
    accentCss: '#8cb7e8',
  },
  pineapple: {
    name: 'Pineapple Bomb',
    shortName: 'Bomb',
    hint: 'Blast cluster',
    description: 'Throw a spiky pineapple bomb to blast crops in a small radius.',
    needsTarget: true,
    accentCss: '#e59a32',
  },
};

export function clampCratePoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(-CRATE_HALF_W + 0.25, Math.min(CRATE_HALF_W - 0.25, x)),
    y: Math.max(0.2, Math.min(CRATE_HEIGHT - 0.2, y)),
  };
}

function clampCropPos(x: number, y: number, def: CropDef): { x: number; y: number } {
  return {
    x: Math.max(-CRATE_HALF_W + def.halfW + 0.05, Math.min(CRATE_HALF_W - def.halfW - 0.05, x)),
    y: Math.max(def.halfH + 0.04, y),
  };
}

function canGrowCrop(tier: number): boolean {
  return tier < MAX_TIER - 1;
}

export interface CropBodyState {
  id: number;
  tier: number;
  x: number;
  y: number;
  angle: number;
  popTimer: number;
}

export type SimEvent =
  | { type: 'drop'; tier: number }
  | { type: 'merge'; tier: number; x: number; y: number; points: number; combo: number }
  | { type: 'pumpkin-poof'; x: number; y: number; points: number }
  | { type: 'powerup-awarded'; kind: PowerupKind }
  | { type: 'powerup-used'; kind: PowerupKind; x?: number; y?: number; tier?: number; cleared?: number; points?: number }
  | { type: 'drop-cap-upgraded'; newMaxTier: number }
  | { type: 'gameover' };

interface InternalCrop {
  id: number;
  tier: number;
  body: planck.Body;
  fixture: planck.Fixture;
  grace: number;
  popTimer: number;
}

export interface HarvestSim {
  readonly score: number;
  readonly combo: number;
  readonly pumpkinsHarvested: number;
  readonly currentTier: number;
  readonly nextTier: number;
  readonly maxDropTier: number;
  readonly nextUnlockScore: number | null;
  readonly dangerProgress: number;
  readonly phase: 'playing' | 'gameover';
  readonly heldPowerups: readonly PowerupKind[];
  getCrops(): CropBodyState[];
  getCropById(id: number): CropBodyState | undefined;
  clampDropX(x: number, tier?: number): number;
  canDrop(): boolean;
  drop(x: number): SimEvent[];
  step(dt: number): SimEvent[];
  canUseTool(kind: PowerupKind): boolean;
  isValidPowerupTarget(kind: PowerupKind, cropId: number): boolean;
  useTool(
    kind: PowerupKind,
    target?: { slot?: number; cropId?: number; point?: { x: number; y: number } },
  ): SimEvent[];
  reset(newSeed?: number): void;
}

const FIXED_DT = 1 / 60;
const VEL_ITERS = 10;
const POS_ITERS = 6;
const GRAVITY = -18.5;

export function createHarvestSim(
  initialSeed = randomSeed(),
  initialCrops: ReadonlyArray<{ tier: number; x: number; y: number }> = [],
): HarvestSim {
  let seed = initialSeed >>> 0;
  let rng = mulberry32(seed);

  let world!: planck.World;
  const crops = new Map<number, InternalCrop>();
  const bodyToId = new Map<planck.Body, number>();
  let pendingCollisions: Array<[number, number]> = [];

  let nextId = 1;
  let score = 0;
  let combo = 0;
  let comboIdleTimer = 0;
  let pumpkinsHarvested = 0;
  let mergesSinceAward = 0;
  let currentTier = 1;
  let nextTier = 1;
  let maxDropTier = INITIAL_DROP_TIER;
  let dropCooldown = 0;
  let dangerTime = 0;
  let phase: 'playing' | 'gameover' = 'playing';
  let accumulator = 0;
  const heldPowerups: PowerupKind[] = [];

  function rollDroppableTier(): number {
    const entries: Array<readonly [number, number]> = [];
    for (const c of CROPS) {
      if (c.droppable && c.tier <= maxDropTier) entries.push([c.tier, c.dropWeight]);
    }
    return pickWeighted(entries, rng);
  }

  function buildWorld(): void {
    world = new planck.World(planck.Vec2(0, GRAVITY));
    crops.clear();
    bodyToId.clear();
    pendingCollisions = [];

    const crate = world.createBody({ type: 'static' });
    const wallOpts: planck.FixtureOpt = { friction: 0.38, restitution: 0.08 };

    // Floor (top at y = 0)
    crate.createFixture(planck.Box(CRATE_HALF_W + 1.0, 0.5, planck.Vec2(0, -0.5), 0), wallOpts);
    // Left & right walls extending above drop line
    const wallHalfH = CRATE_HEIGHT * 0.65;
    crate.createFixture(
      planck.Box(0.5, wallHalfH, planck.Vec2(-CRATE_HALF_W - 0.5, wallHalfH - 0.5), 0),
      wallOpts,
    );
    crate.createFixture(
      planck.Box(0.5, wallHalfH, planck.Vec2(CRATE_HALF_W + 0.5, wallHalfH - 0.5), 0),
      wallOpts,
    );
    // Subtle corner bevels so tiny peas never lodge permanently in 90-degree corners
    crate.createFixture(
      planck.Polygon([
        planck.Vec2(-CRATE_HALF_W, 0),
        planck.Vec2(-CRATE_HALF_W + 0.16, 0),
        planck.Vec2(-CRATE_HALF_W, 0.16),
      ]),
      wallOpts,
    );
    crate.createFixture(
      planck.Polygon([
        planck.Vec2(CRATE_HALF_W, 0),
        planck.Vec2(CRATE_HALF_W, 0.16),
        planck.Vec2(CRATE_HALF_W - 0.16, 0),
      ]),
      wallOpts,
    );

    world.on('begin-contact', (contact) => {
      const aId = bodyToId.get(contact.getFixtureA().getBody());
      const bId = bodyToId.get(contact.getFixtureB().getBody());
      if (aId === undefined || bId === undefined || aId === bId) return;
      const a = crops.get(aId);
      const b = crops.get(bId);
      if (a && b && a.tier === b.tier) {
        pendingCollisions.push([aId, bId]);
      }
    });
  }

  function makeShape(def: CropDef): planck.Shape {
    if (def.collider.kind === 'circle') {
      return planck.Circle(def.collider.radius);
    }
    return planck.Polygon(def.collider.verts.map(([x, y]) => planck.Vec2(x, y)));
  }

  function clampDropX(x: number, tier = currentTier): number {
    const def = cropByTier(tier);
    const pad = def.halfW + 0.08;
    return Math.max(-CRATE_HALF_W + pad, Math.min(CRATE_HALF_W - pad, x));
  }

  function spawnCrop(
    tier: number,
    x: number,
    y: number,
    opts: { angle?: number; vx?: number; vy?: number; grace?: number; pop?: boolean } = {},
  ): InternalCrop {
    const def = cropByTier(tier);
    const body = world.createBody({
      type: 'dynamic',
      position: planck.Vec2(x, y),
      angle: opts.angle ?? def.spawnAngle,
      linearDamping: 0.14,
      angularDamping: 0.36,
      bullet: tier <= 2,
    });
    const fixture = body.createFixture(makeShape(def), {
      density: 1.0 + tier * 0.06,
      friction: 0.42,
      restitution: 0.10,
    });
    if (opts.vx || opts.vy) {
      body.setLinearVelocity(planck.Vec2(opts.vx ?? 0, opts.vy ?? 0));
    }

    const id = nextId++;
    const entry: InternalCrop = {
      id,
      tier,
      body,
      fixture,
      grace: opts.grace ?? 1.35,
      popTimer: opts.pop ? 0.16 : 0,
    };
    crops.set(id, entry);
    bodyToId.set(body, id);
    return entry;
  }

  function removeCrop(id: number): void {
    const entry = crops.get(id);
    if (!entry) return;
    crops.delete(id);
    bodyToId.delete(entry.body);
    world.destroyBody(entry.body);
  }

  function pickPowerupKind(): PowerupKind | null {
    let lowTierCount = 0;
    let growableCount = 0;
    for (const c of crops.values()) {
      if (c.tier <= 2) lowTierCount++;
      if (canGrowCrop(c.tier)) growableCount++;
    }
    const totalCount = crops.size;

    const raw: Array<readonly [PowerupKind, number]> = [
      ['abduct', totalCount >= 3 ? 28 : 10],
      ['shake', totalCount >= 5 ? 30 : 12],
      ['grow', growableCount > 0 ? 26 : 0],
      ['sweep', lowTierCount >= 3 ? 28 : 4],
      ['pineapple', totalCount >= 4 ? 9 : 0],
    ];

    // Prefer variety if already holding one slot; filter weight > 0 before pickWeighted
    const entries = raw
      .map(([kind, w]) => [kind, heldPowerups.includes(kind) ? w * 0.25 : w] as const)
      .filter(([, w]) => w > 0);
    return entries.length > 0 ? pickWeighted(entries, rng) : null;
  }

  function checkAutoDropUnlock(events: SimEvent[]): void {
    while (maxDropTier < MAX_DROPPABLE_TIER) {
      const needed = DROP_UNLOCK_SCORES[maxDropTier + 1];
      if (needed === undefined || score < needed) break;
      maxDropTier++;
      nextTier = maxDropTier;
      events.push({ type: 'drop-cap-upgraded', newMaxTier: maxDropTier });
    }
  }

  function maybeAwardPowerup(resultingTier: number, activeCombo: number, events: SimEvent[]): void {
    mergesSinceAward++;
    if (heldPowerups.length >= MAX_POWERUP_SLOTS) return;
    if (mergesSinceAward < 4) return;

    const tierBonus = resultingTier >= 6 ? 0.10 : resultingTier >= 4 ? 0.055 : 0.015;
    const comboBonus = activeCombo >= 2 ? 0.09 * (activeCombo - 1) : 0;
    const pityBonus = Math.max(0, mergesSinceAward - 4) * 0.032;
    const chance = mergesSinceAward >= 18 ? 1 : Math.min(0.50, tierBonus + comboBonus + pityBonus);

    if (rng() < chance) {
      const kind = pickPowerupKind();
      if (kind) {
        heldPowerups.push(kind);
        mergesSinceAward = 0;
        events.push({ type: 'powerup-awarded', kind });
      }
    }
  }

  function resolveMerges(events: SimEvent[]): void {
    if (pendingCollisions.length === 0) return;
    const pairs = pendingCollisions;
    pendingCollisions = [];
    const consumed = new Set<number>();

    for (const [aId, bId] of pairs) {
      if (consumed.has(aId) || consumed.has(bId)) continue;
      const a = crops.get(aId);
      const b = crops.get(bId);
      if (!a || !b || a.tier !== b.tier) continue;

      consumed.add(aId);
      consumed.add(bId);

      const posA = a.body.getPosition();
      const posB = b.body.getPosition();
      const mx = (posA.x + posB.x) * 0.5;
      const my = (posA.y + posB.y) * 0.5;
      const tier = a.tier;

      removeCrop(aId);
      removeCrop(bId);

      combo++;
      comboIdleTimer = 0;
      const comboMult = 1 + Math.min(4, combo - 1) * 0.5;

      if (tier >= MAX_TIER) {
        // Two Prize Pumpkins poof away for a massive harvest bonus!
        const pts = Math.round(PUMPKIN_POOF_BONUS * comboMult);
        score += pts;
        pumpkinsHarvested++;
        events.push({ type: 'pumpkin-poof', x: mx, y: my, points: pts });
      } else {
        const nextCrop = cropByTier(tier + 1);
        const { x: clampedX, y: clampedY } = clampCropPos(mx, my, nextCrop);
        const spawned = spawnCrop(nextCrop.tier, clampedX, clampedY, {
          vy: 1.35,
          grace: 0.75,
          pop: true,
        });

        // Gentle radial nudge to immediate neighbors so the bigger crop settles cleanly
        for (const other of crops.values()) {
          if (other.id === spawned.id) continue;
          const op = other.body.getPosition();
          const dx = op.x - clampedX;
          const dy = op.y - clampedY;
          const dist = Math.hypot(dx, dy);
          const reach = nextCrop.halfW + cropByTier(other.tier).halfW + 0.55;
          if (dist > 0.01 && dist < reach) {
            const strength = (1 - dist / reach) * 1.35;
            other.body.applyLinearImpulse(
              planck.Vec2((dx / dist) * strength, Math.max(0.2, (dy / dist) * strength)),
              op,
              true,
            );
          }
        }

        const pts = Math.round(nextCrop.score * comboMult);
        score += pts;
        events.push({
          type: 'merge',
          tier: nextCrop.tier,
          x: clampedX,
          y: clampedY,
          points: pts,
          combo,
        });
      }
      checkAutoDropUnlock(events);
      maybeAwardPowerup(Math.min(MAX_TIER, tier + 1), combo, events);
    }
  }

  function reset(newSeed?: number): void {
    if (newSeed !== undefined) seed = newSeed >>> 0;
    rng = mulberry32(seed);
    nextId = 1;
    score = 0;
    combo = 0;
    comboIdleTimer = 0;
    pumpkinsHarvested = 0;
    mergesSinceAward = 0;
    maxDropTier = INITIAL_DROP_TIER;
    dropCooldown = 0;
    dangerTime = 0;
    accumulator = 0;
    phase = 'playing';
    heldPowerups.length = 0;
    buildWorld();
    currentTier = rollDroppableTier();
    nextTier = rollDroppableTier();
  }

  reset(seed);
  for (const item of initialCrops) {
    spawnCrop(item.tier, item.x, item.y, { grace: 1.4 });
  }

  function canDrop(): boolean {
    return phase === 'playing' && dropCooldown <= 0;
  }

  function drop(x: number): SimEvent[] {
    if (!canDrop()) return [];
    const tier = currentTier;
    const def = cropByTier(tier);
    const spawnX = clampDropX(x, tier);
    const spawnY = Math.min(DROP_Y, CRATE_HEIGHT - def.halfH * 0.25);

    spawnCrop(tier, spawnX, spawnY, { vy: -1.2, grace: 1.4 });
    dropCooldown = 0.42;
    combo = 0;
    comboIdleTimer = 0;
    currentTier = nextTier;
    nextTier = rollDroppableTier();

    return [{ type: 'drop', tier }];
  }

  function step(dt: number): SimEvent[] {
    const events: SimEvent[] = [];
    if (phase !== 'playing') return events;

    const clampedDt = Math.min(0.05, Math.max(0, dt));
    if (dropCooldown > 0) dropCooldown = Math.max(0, dropCooldown - clampedDt);

    accumulator += clampedDt;
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      world.step(FIXED_DT, VEL_ITERS, POS_ITERS);
      resolveMerges(events);

      for (const c of crops.values()) {
        if (c.grace > 0) c.grace = Math.max(0, c.grace - FIXED_DT);
        if (c.popTimer > 0) c.popTimer = Math.max(0, c.popTimer - FIXED_DT);
      }

      comboIdleTimer += FIXED_DT;
      if (comboIdleTimer > 1.35) combo = 0;
    }

    // Check overflow against danger line using exact fixture AABBs
    let anyDanger = false;
    for (const c of crops.values()) {
      const aabb = c.fixture.getAABB(0);
      const vy = c.body.getLinearVelocity().y;
      if (c.grace <= 0 && aabb.upperBound.y > DANGER_Y && Math.abs(vy) < 4.2) {
        anyDanger = true;
        break;
      }
    }

    if (anyDanger) {
      dangerTime = Math.min(DANGER_LIMIT, dangerTime + clampedDt);
      if (dangerTime >= DANGER_LIMIT) {
        phase = 'gameover';
        events.push({ type: 'gameover' });
      }
    } else if (dangerTime > 0) {
      dangerTime = Math.max(0, dangerTime - clampedDt * 2.2);
    }

    return events;
  }

  function isValidPowerupTarget(kind: PowerupKind, cropId: number): boolean {
    const target = crops.get(cropId);
    if (!target) return false;
    if (kind === 'abduct') return true;
    if (kind === 'grow') return canGrowCrop(target.tier);
    return false;
  }

  function canUseTool(kind: PowerupKind): boolean {
    if (phase !== 'playing') return false;
    if (kind === 'abduct' || kind === 'shake' || kind === 'pineapple') return crops.size > 0;
    if (kind === 'grow') {
      for (const c of crops.values()) {
        if (canGrowCrop(c.tier)) return true;
      }
      return false;
    }
    if (kind === 'sweep') {
      for (const c of crops.values()) {
        if (c.tier <= 2) return true;
      }
      return false;
    }
    return false;
  }

  function useTool(
    kind: PowerupKind,
    target?: { slot?: number; cropId?: number; point?: { x: number; y: number } },
  ): SimEvent[] {
    if (!canUseTool(kind)) return [];
    const consumeSlot =
      target?.slot !== undefined && heldPowerups[target.slot] === kind ? target.slot : undefined;
    const consume = () => {
      if (consumeSlot !== undefined) heldPowerups.splice(consumeSlot, 1);
    };
    const events: SimEvent[] = [];

    if (kind === 'pineapple') {
      if (!target?.point) return [];
      const { x: tx, y: ty } = clampCratePoint(target.point.x, target.point.y);

      const toDestroy: number[] = [];
      for (const c of crops.values()) {
        const pos = c.body.getPosition();
        const hitReach = PINEAPPLE_BLAST_RADIUS + cropByTier(c.tier).halfW * 0.35;
        if (Math.hypot(pos.x - tx, pos.y - ty) <= hitReach) {
          toDestroy.push(c.id);
        }
      }
      for (const id of toDestroy) removeCrop(id);

      // Shockwave impulse on nearby surviving crops
      const shockReach = PINEAPPLE_BLAST_RADIUS + 1.5;
      for (const c of crops.values()) {
        const pos = c.body.getPosition();
        const dx = pos.x - tx;
        const dy = pos.y - ty;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01 && dist < shockReach) {
          const mass = c.body.getMass();
          const strength = (1 - dist / shockReach) * 4.2 * mass;
          c.body.applyLinearImpulse(
            planck.Vec2((dx / dist) * strength, Math.max(1.2 * mass, (dy / dist) * strength)),
            pos,
            true,
          );
        }
      }

      consume();
      dangerTime = Math.max(0, dangerTime - 0.75);
      events.push({ type: 'powerup-used', kind, x: tx, y: ty, cleared: toDestroy.length });
      return events;
    }

    if (kind === 'abduct') {
      if (target?.cropId === undefined || !crops.has(target.cropId)) return [];
      const crop = crops.get(target.cropId)!;
      const pos = crop.body.getPosition();
      const tier = crop.tier;
      const tx = pos.x;
      const ty = pos.y;
      removeCrop(target.cropId);
      consume();
      dangerTime = Math.max(0, dangerTime - 0.6);
      events.push({ type: 'powerup-used', kind, x: tx, y: ty, tier });
      return events;
    }

    if (kind === 'grow') {
      if (target?.cropId === undefined || !isValidPowerupTarget('grow', target.cropId)) return [];
      const crop = crops.get(target.cropId)!;
      const pos = crop.body.getPosition();
      const nextCrop = cropByTier(crop.tier + 1);
      const { x: tx, y: ty } = clampCropPos(pos.x, pos.y, nextCrop);
      const angle = crop.body.getAngle();
      removeCrop(target.cropId);
      spawnCrop(nextCrop.tier, tx, ty, { angle, vy: 1.2, grace: 0.9, pop: true });
      consume();
      score += nextCrop.score;
      events.push({ type: 'powerup-used', kind, x: tx, y: ty, tier: nextCrop.tier, points: nextCrop.score });
      checkAutoDropUnlock(events);
      return events;
    }

    if (kind === 'shake') {
      consume();
      for (const c of crops.values()) {
        const pos = c.body.getPosition();
        const mass = c.body.getMass();
        const sideDir = pos.x < 0 ? 1 : -1;
        const ix = (sideDir * 1.4 + (rng() - 0.5) * 2.2) * mass;
        const iy = (3.4 + rng() * 1.8) * mass;
        c.body.applyLinearImpulse(planck.Vec2(ix, iy), pos, true);
        c.body.applyAngularImpulse((rng() - 0.5) * 1.4 * mass, true);
      }
      events.push({ type: 'powerup-used', kind });
      return events;
    }

    if (kind === 'sweep') {
      const toRemove: number[] = [];
      for (const c of crops.values()) {
        if (c.tier <= 2) toRemove.push(c.id);
      }
      if (toRemove.length === 0) return [];
      for (const id of toRemove) removeCrop(id);
      consume();
      dangerTime = Math.max(0, dangerTime - 0.5);
      events.push({ type: 'powerup-used', kind, cleared: toRemove.length });
      return events;
    }

    return events;
  }

  function toState(c: InternalCrop): CropBodyState {
    const pos = c.body.getPosition();
    return {
      id: c.id,
      tier: c.tier,
      x: pos.x,
      y: pos.y,
      angle: c.body.getAngle(),
      popTimer: c.popTimer,
    };
  }

  return {
    get score() {
      return score;
    },
    get combo() {
      return combo;
    },
    get pumpkinsHarvested() {
      return pumpkinsHarvested;
    },
    get currentTier() {
      return currentTier;
    },
    get nextTier() {
      return nextTier;
    },
    get maxDropTier() {
      return maxDropTier;
    },
    get nextUnlockScore() {
      return maxDropTier < MAX_DROPPABLE_TIER ? (DROP_UNLOCK_SCORES[maxDropTier + 1] ?? null) : null;
    },
    get dangerProgress() {
      return dangerTime / DANGER_LIMIT;
    },
    get phase() {
      return phase;
    },
    get heldPowerups() {
      return heldPowerups;
    },
    getCrops() {
      return Array.from(crops.values(), toState);
    },
    getCropById(id) {
      const c = crops.get(id);
      return c ? toState(c) : undefined;
    },
    clampDropX,
    canDrop,
    drop,
    step,
    canUseTool,
    isValidPowerupTarget,
    useTool,
    reset,
  };
}
