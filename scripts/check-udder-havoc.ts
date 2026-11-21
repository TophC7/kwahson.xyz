import { DAYTIMES, ENEMY_TYPES, LAYOUTS, POWERUPS, SEASONS } from '../src/projects/udder-havoc/data';
import { applyPowerup, createSimState, getStats, stepSim } from '../src/projects/udder-havoc/sim';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// 1. Recoil velocity opposes aim direction and player stays inside arena bounds.
{
  const sim = createSimState(4242);
  sim.player.fireTimer = 0.01;
  stepSim(sim, { moveX: 0, moveZ: 0, aimDirX: 1, aimDirZ: 0, hasManualAim: true, charging: false }, 0.04);
  assert(sim.projectiles.length >= 1, 'Expected shot projectile');
  assert(sim.player.vx < -1, `Expected negative X recoil velocity, got ${sim.player.vx}`);
}

// 1b. Golden charged shot grants dash i-frames and protects against recoiling into enemies.
{
  const sim = createSimState(777);
  sim.enemies = [{
    id: 999,
    kind: 'visitor',
    x: -1.35,
    z: 0,
    vx: 0,
    vz: 0,
    hp: 50,
    maxHp: 50,
    radius: 0.45,
    speed: 0,
    dmg: 15,
    xp: 4,
    score: 10,
    phase: 0,
    actionTimer: 99,
    dashVx: 0,
    dashVz: 0,
    dashTime: 0,
    lockTimer: 0,
    lockX: 0,
    lockZ: 0,
    flash: 0,
    spawnGrace: 0,
  }];
  // Charge fully, then release facing +X so recoil blasts cow -X right onto the enemy.
  for (let i = 0; i < 20; i++) {
    stepSim(sim, { moveX: 0, moveZ: 0, aimDirX: 1, aimDirZ: 0, hasManualAim: true, charging: true }, 0.05);
  }
  stepSim(sim, { moveX: 0, moveZ: 0, aimDirX: 1, aimDirZ: 0, hasManualAim: true, charging: false }, 0.05);
  assert(sim.player.dashInvuln > 0.3, `Expected golden dashInvuln > 0.3, got ${sim.player.dashInvuln}`);
  for (let i = 0; i < 4; i++) {
    stepSim(sim, { moveX: 0, moveZ: 0, aimDirX: 1, aimDirZ: 0, hasManualAim: true, charging: false }, 0.05);
  }
  assert(sim.player.hp === 100, `Expected 0 contact damage during golden recoil dash, got HP ${sim.player.hp}`);
}

// 2. Powerup stacking scales stats deterministically without invalid values.
{
  const sim = createSimState(9001);
  const base = getStats(sim);
  for (const p of POWERUPS) applyPowerup(sim, p.id);
  for (const p of POWERUPS) applyPowerup(sim, p.id);
  const stacked = getStats(sim);
  assert(stacked.volleyCount === base.volleyCount + 2, 'Double Cob stacking mismatch');
  assert(stacked.popcornCount === 4, `Expected 4 popcorn splits at 2 stacks, got ${stacked.popcornCount}`);
  assert(stacked.drag < base.drag, 'Butter Hooves should reduce friction drag');
  assert(sim.player.maxHp === 140, `Expected maxHp 140 after 2 Healer stacks, got ${sim.player.maxHp}`);
  assert(sim.guardBees.length === 4, `Expected 4 orbiting Guard Bees at 2 stacks, got ${sim.guardBees.length}`);
  assert(stacked.chainBounces === 2, `Expected 2 Chain Cob bounces, got ${stacked.chainBounces}`);
  assert(!('bee' in ENEMY_TYPES), 'Bees are friends, not enemies');
}

// 3. Multi-minute simulation runs cleanly without NaNs or runaway arrays.
{
  const sim = createSimState(1337);
  let upgrades = 0;
  for (let step = 0; step < 3600; step++) {
    if (sim.pendingChoices) {
      applyPowerup(sim, sim.pendingChoices[0]);
      upgrades++;
    }
    sim.player.hp = sim.player.maxHp; // Keep cow alive to stress 180s director escalation.
    const t = step * 0.05;
    stepSim(
      sim,
      {
        moveX: Math.cos(t * 0.7),
        moveZ: Math.sin(t * 0.9),
        aimDirX: 0,
        aimDirZ: 0,
        hasManualAim: false,
        charging: step % 120 >= 100 && step % 120 < 118,
      },
      0.05,
    );
  }
  assert(Number.isFinite(sim.player.x) && Number.isFinite(sim.player.z), 'Player coords became non-finite');
  assert(sim.wave >= 6, `Expected wave >= 6 after 180s, got ${sim.wave}`);
  assert(sim.kills > 0 && upgrades > 0, `Expected kills (${sim.kills}) and upgrades (${upgrades})`);
  assert(sim.enemies.length <= 80, `Enemy cap exceeded: ${sim.enemies.length}`);
}

// 4. Seasons, daytimes, layouts, and splitter hatch all validate cleanly.
{
  for (const season of SEASONS) {
    for (const daytime of DAYTIMES) {
      for (const layout of LAYOUTS) {
        const s = createSimState(101, { season, daytime, layout });
        assert(s.obstacles.length >= 6, `Expected obstacles for ${layout}`);
      }
    }
  }

  // Killing a Hive Egg with Explosive Milk + Popcorn Split must leave 3 live sprouts.
  const sim = createSimState(5150);
  applyPowerup(sim, 'milk');
  applyPowerup(sim, 'milk');
  applyPowerup(sim, 'popcorn');
  sim.enemies = [{
    id: 900,
    kind: 'splitter',
    x: 2.2,
    z: 0,
    vx: 0,
    vz: 0,
    hp: 10,
    maxHp: 28,
    radius: 0.52,
    speed: 0,
    dmg: 8,
    xp: 12,
    score: 26,
    phase: 0,
    actionTimer: 99,
    dashVx: 0,
    dashVz: 0,
    dashTime: 0,
    lockTimer: 0,
    lockX: 0,
    lockZ: 0,
    flash: 0,
    spawnGrace: 0,
  }];
  sim.player.fireTimer = 0.01;
  for (let i = 0; i < 6; i++) {
    stepSim(sim, { moveX: 0, moveZ: 0, aimDirX: 1, aimDirZ: 0, hasManualAim: true, charging: false }, 0.04);
  }
  const sprouts = sim.enemies.filter(e => e.kind === 'sprout' && e.hp > 0);
  assert(sprouts.length === 3, `Expected 3 surviving hatched sprouts, got ${sprouts.length}`);
}

console.log('Udder Havoc sim checks passed!');
