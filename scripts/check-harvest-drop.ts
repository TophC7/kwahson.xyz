import { CROPS, MAX_TIER, PUMPKIN_POOF_BONUS, cropByTier, type CropDef } from '../src/projects/harvest-drop/crops';
import {
  CRATE_HALF_W,
  DANGER_Y,
  INITIAL_DROP_TIER,
  MAX_DROPPABLE_TIER,
  createHarvestSim,
  type PowerupKind,
} from '../src/projects/harvest-drop/sim';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(`Harvest Drop check failed: ${msg}`);
  }
}

function cropArea(c: CropDef): number {
  if (c.collider.kind === 'circle') {
    return Math.PI * c.collider.radius * c.collider.radius;
  }
  const v = c.collider.verts;
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) * 0.5;
}

// 1. Crop ladder size order, convexity, and CCW winding invariants
assert(CROPS.length === 12, `expected 12 crop tiers, got ${CROPS.length}`);
for (let i = 0; i < CROPS.length; i++) {
  const c = CROPS[i];
  assert(c.tier === i + 1, `tier mismatch at index ${i}`);
  if (i > 0) {
    const area = cropArea(c);
    const prevArea = cropArea(CROPS[i - 1]);
    assert(
      area > prevArea * 1.25,
      `tier ${c.tier} (${c.name}) area ${area.toFixed(3)} not sufficiently larger than tier ${i} (${prevArea.toFixed(3)})`,
    );
  }
  if (c.collider.kind === 'polygon') {
    const v = c.collider.verts;
    assert(v.length >= 3 && v.length <= 8, `${c.name} vertex count ${v.length} outside Box2D [3..8]`);
    for (let j = 0; j < v.length; j++) {
      const [ax, ay] = v[j];
      const [bx, by] = v[(j + 1) % v.length];
      const [cx, cy] = v[(j + 2) % v.length];
      const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      assert(cross > 1e-6, `${c.name} polygon not strictly CCW convex at vertex ${j} (cross=${cross})`);
    }
  }
}

// Two Prize Pumpkins fit side-by-side inside crate width
const maxCrop = cropByTier(MAX_TIER);
assert(
  maxCrop.halfW * 4 < CRATE_HALF_W * 2,
  `two Prize Pumpkins (${(maxCrop.halfW * 4).toFixed(2)}) exceed crate width (${CRATE_HALF_W * 2})`,
);

// 2. Max-tier (Prize Pumpkin) poof invariant
{
  const sim = createHarvestSim(42, [
    { tier: MAX_TIER, x: -1.2, y: 2.0 },
    { tier: MAX_TIER, x: 1.2, y: 2.0 },
  ]);
  let poofed = false;
  for (let f = 0; f < 40; f++) {
    const evs = sim.step(1 / 60);
    if (evs.some((e) => e.type === 'pumpkin-poof')) poofed = true;
  }
  assert(poofed, 'expected two overlapping Prize Pumpkins to trigger pumpkin-poof');
  assert(sim.pumpkinsHarvested === 1, `expected pumpkinsHarvested=1, got ${sim.pumpkinsHarvested}`);
  assert(sim.score === PUMPKIN_POOF_BONUS, `expected score=${PUMPKIN_POOF_BONUS}, got ${sim.score}`);
  assert(sim.maxDropTier === 5, `expected score=${PUMPKIN_POOF_BONUS} to auto-unlock Garlic Bulb (T5), got ${sim.maxDropTier}`);
  assert(sim.getCrops().length === 0, `expected crate cleared after pumpkin poof, found ${sim.getCrops().length}`);
}

// 3. Drop, physics settling, merges, Pea-Strawberry start, and automatic drop-cap unlocks (<= Turnip)
{
  const sim = createHarvestSim(133742);
  assert(
    sim.maxDropTier === INITIAL_DROP_TIER,
    `expected initial maxDropTier=${INITIAL_DROP_TIER}, got ${sim.maxDropTier}`,
  );
  assert(
    sim.currentTier <= INITIAL_DROP_TIER && sim.nextTier <= INITIAL_DROP_TIER,
    'expected initial drops to stay within Pea..Strawberry',
  );
  let totalMerges = 0;
  let capUpgrades = 0;
  let awardedKinds = new Set<PowerupKind>();
  let usedKinds = new Set<PowerupKind>();

  // Drop crops across several columns to trigger merges, auto drop-cap unlocks, and tool awards
  for (let d = 0; d < 120 && sim.phase === 'playing'; d++) {
    const col = ((d % 5) - 2) * 0.95;
    const dropEvents = sim.drop(col);
    assert(dropEvents.length === 1 && dropEvents[0].type === 'drop', `expected drop event at step ${d}`);
    assert(
      sim.currentTier <= sim.maxDropTier && sim.nextTier <= sim.maxDropTier,
      `rolled tier exceeded maxDropTier=${sim.maxDropTier}`,
    );

    // Step 0.75s between drops
    for (let f = 0; f < 45 && sim.phase === 'playing'; f++) {
      const evs = sim.step(1 / 60);
      for (const ev of evs) {
        if (ev.type === 'merge') totalMerges++;
        if (ev.type === 'powerup-awarded') awardedKinds.add(ev.kind);
        if (ev.type === 'drop-cap-upgraded') capUpgrades++;
      }
    }

    // Exercise held tools as soon as earned
    for (let slot = sim.heldPowerups.length - 1; slot >= 0; slot--) {
      const kind = sim.heldPowerups[slot];
      if (!sim.canUseTool(kind)) continue;
      const crops = sim.getCrops();
      const target = crops.find((c) => sim.isValidPowerupTarget(kind, c.id));
      const evs = sim.useTool(
        kind,
        kind === 'pineapple' ? { slot, point: { x: 0, y: 1.5 } } : { slot, cropId: target?.id },
      );
      assert(
        evs.some((e) => e.type === 'powerup-used' && e.kind === kind),
        `failed to activate earned tool ${kind}`,
      );
      if (evs.some((e) => e.type === 'drop-cap-upgraded')) capUpgrades++;
      assert(sim.maxDropTier <= MAX_DROPPABLE_TIER, `maxDropTier exceeded Turnip (${MAX_DROPPABLE_TIER})`);
      usedKinds.add(kind);
    }
  }

  assert(totalMerges >= 5, `expected >= 5 merges in active run, got ${totalMerges}`);
  assert(capUpgrades >= 1 && sim.maxDropTier > INITIAL_DROP_TIER, 'expected automatic drop-cap unlock');
  assert(sim.score > 0, `expected positive score, got ${sim.score}`);
  assert(awardedKinds.size >= 1, 'expected at least 1 tool awarded');
  assert(usedKinds.size >= 1, 'expected at least 1 tool exercised');

  // Verify all crops remain strictly inside crate horizontal bounds and above floor
  for (const c of sim.getCrops()) {
    assert(Math.abs(c.x) <= CRATE_HALF_W + 0.05, `crop ${c.id} escaped horizontally: x=${c.x}`);
    assert(c.y >= -0.05, `crop ${c.id} fell through floor: y=${c.y}`);
  }
}

// 4. Overflow / Game Over test: non-matching stack exceeding DANGER_Y triggers danger & gameover
{
  const sim = createHarvestSim(98765, [
    { tier: 11, x: -1.7, y: 1.3 },
    { tier: 11, x: 1.7, y: 1.3 },
    { tier: 10, x: -1.7, y: 3.7 },
    { tier: 10, x: 1.7, y: 3.7 },
    { tier: 11, x: -1.7, y: 6.1 },
    { tier: 11, x: 1.7, y: 6.1 },
    { tier: 12, x: 0, y: 8.1 },
  ]);
  let sawDanger = false;
  let reachedGameOver = false;

  for (let f = 0; f < 300 && sim.phase === 'playing'; f++) {
    const evs = sim.step(1 / 60);
    if (sim.dangerProgress > 0) sawDanger = true;
    if (evs.some((e) => e.type === 'gameover')) reachedGameOver = true;
  }

  assert(sawDanger, `expected overflow danger timer to climb above DANGER_Y=${DANGER_Y}`);
  assert(reachedGameOver && sim.phase === 'gameover', 'expected overflowing stack to trigger gameover');
}

// 5. Pineapple Bomb blast radius check: clears clustered crops near target while sparing distant crops
{
  const sim = createHarvestSim(555, [
    { tier: 1, x: -2.8, y: 0.4 },
    { tier: 1, x: 0.0, y: 0.4 },
    { tier: 2, x: 0.8, y: 0.4 },
    { tier: 1, x: 2.8, y: 0.4 },
  ]);
  const evs = sim.useTool('pineapple', { point: { x: 0.2, y: 0.4 } });
  assert(
    evs.some((e) => e.type === 'powerup-used' && e.kind === 'pineapple' && e.cleared === 2),
    'expected pineapple bomb at center to break the 2 nearby crops and spare far corner crops',
  );
  assert(sim.getCrops().length === 2, `expected 2 distant crops remaining, got ${sim.getCrops().length}`);
}

// 6. Direct tool checks for abduct, shake, grow, sweep (independent of RNG)
{
  const sim = createHarvestSim(777, [
    { tier: 1, x: -1.5, y: 0.4 },
    { tier: 2, x: 0.0, y: 0.4 },
    { tier: 4, x: 1.5, y: 0.4 },
  ]);
  const initial = sim.getCrops();
  const growEvs = sim.useTool('grow', { cropId: initial[2].id });
  assert(
    growEvs.some((e) => e.type === 'powerup-used' && e.kind === 'grow' && e.tier === 5) &&
      !growEvs.some((e) => e.type === 'merge'),
    'expected grow to promote crop without synthetic merge event',
  );
  const sweepEvs = sim.useTool('sweep');
  assert(
    sweepEvs.some((e) => e.type === 'powerup-used' && e.kind === 'sweep' && e.cleared === 2),
    'expected sweep to clear Peas & Blueberries',
  );
  const shakeEvs = sim.useTool('shake');
  assert(shakeEvs.some((e) => e.type === 'powerup-used' && e.kind === 'shake'), 'expected shake event');
  const remaining = sim.getCrops();
  const abductEvs = sim.useTool('abduct', { cropId: remaining[0].id });
  assert(
    abductEvs.some((e) => e.type === 'powerup-used' && e.kind === 'abduct') && sim.getCrops().length === 0,
    'expected abduct to remove target crop',
  );
}

console.log(
  `Harvest Drop check passed: 12-tier crop ladder convex & strictly increasing, merges, tools, Pineapple Bomb, Seed Unlock cap, and overflow gameover verified.`,
);
