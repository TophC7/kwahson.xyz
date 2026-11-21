import { generateRoom, verifyRoom } from '../src/projects/corn-shots/generator';
import {
  BOARD_HALF_H,
  BOARD_HALF_W,
  PREVIEW_BOUNCES,
  SHELL_RADIUS,
  cloneRoomState,
  reflectDir,
  spawnShell,
  stepShell,
  traceRay,
  type RoomState,
} from '../src/projects/corn-shots/physics';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(`Corn Shots check failed: ${msg}`);
  }
}

// 1. Analytic reflection preserves unit speed and exact normal bounce angles
{
  const pairs: Array<[[number, number], [number, number], [number, number]]> = [
    [[1, 0], [-1, 0], [-1, 0]],
    [[Math.SQRT1_2, Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2]],
    [[Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]],
  ];
  for (const [[dx, dz], [nx, nz], [ex, ez]] of pairs) {
    const out = reflectDir(dx, dz, nx, nz);
    const len = Math.hypot(out.x, out.z);
    assert(Math.abs(len - 1) < 1e-6, `reflected vector not unit length: ${len}`);
    assert(Math.abs(out.x - ex) < 1e-6 && Math.abs(out.z - ez) < 1e-6, `unexpected bounce vector (${out.x}, ${out.z}) != (${ex}, ${ez})`);
  }

  // Empty box corner bounce stays inside board bounds
  const emptyBox: RoomState = {
    cow: { x: -3, z: 0, radius: 0.62 },
    obstacles: [],
    targets: [],
    pumpkins: [],
  };
  const ray = traceRay(-3, 0, 0.72, emptyBox, 0, 4);
  assert(ray.bounces === 4, `expected 4 border bounces, got ${ray.bounces}`);
  const preview = traceRay(-3, 0, 0.72, emptyBox, 0, PREVIEW_BOUNCES);
  assert(preview.bounces === 2 && preview.segments.length <= 3, `expected <= 3 preview segments, got ${preview.segments.length}`);
  for (const seg of ray.segments) {
    assert(Math.abs(seg.bx) <= BOARD_HALF_W - SHELL_RADIUS + 1e-3, `segment bx out of bounds: ${seg.bx}`);
    assert(Math.abs(seg.bz) <= BOARD_HALF_H - SHELL_RADIUS + 1e-3, `segment bz out of bounds: ${seg.bz}`);
  }
}

// 2. Verify 100 generated rooms (varying seeds & roomIndex 1..10) + stepped shell vs traceRay parity
const ROOM_COUNT = 100;
let movingCount = 0;
let totalPar = 0;

for (let i = 0; i < ROOM_COUNT; i++) {
  const seed = 4100 + i * 7919;
  const roomIndex = (i % 10) + 1;
  const generated = generateRoom(seed, roomIndex);

  assert(generated.state.targets.length >= 1, `seed ${seed} room ${roomIndex}: zero targets`);
  assert(generated.par >= 1 && generated.par <= 3, `seed ${seed} room ${roomIndex}: invalid par ${generated.par}`);
  assert(generated.ammo === generated.par + 1, `seed ${seed} room ${roomIndex}: expected ammo ${generated.par + 1}, got ${generated.ammo}`);
  assert(generated.windowDeg >= 1.5, `seed ${seed} room ${roomIndex}: window too narrow (${generated.windowDeg})`);

  const recheck = verifyRoom(generated.state);
  assert(recheck !== null, `seed ${seed} room ${roomIndex}: generated room failed verifyRoom recheck`);

  totalPar += generated.par;
  if (generated.hasMovingObstacle) {
    movingCount++;
    continue; // Moving obstacles advance in real time during shell flight; check static parity on static rooms below
  }

  // Verify stepped shell reproduces the exact target + pumpkin hits predicted by traceRay along hintYaw
  const predicted = traceRay(generated.state.cow.x, generated.state.cow.z, generated.hintYaw, generated.state, 0);
  const simRoom = cloneRoomState(generated.state);
  const shell = spawnShell(simRoom.cow.x, simRoom.cow.z, generated.hintYaw);

  const actualKilledTargets = new Set<string>();
  const actualPoppedPumpkins = new Set<string>();

  for (let step = 0; step < 300 && shell.alive; step++) {
    const events = stepShell(shell, simRoom, 1 / 60, 0);
    for (const ev of events) {
      if (ev.type === 'target-kill') actualKilledTargets.add(ev.id);
      if (ev.type === 'pumpkin-boom') actualPoppedPumpkins.add(ev.id);
    }
  }

  assert(!shell.alive || predicted.hitTargetIds.length === 0, `seed ${seed} room ${roomIndex}: shell still alive after 5s`);
  assert(
    actualKilledTargets.size === predicted.hitTargetIds.length &&
      predicted.hitTargetIds.every((id) => actualKilledTargets.has(id)),
    `seed ${seed} room ${roomIndex}: traceRay predicted targets [${predicted.hitTargetIds}] != stepShell [${[...actualKilledTargets]}]`,
  );
  assert(
    actualPoppedPumpkins.size === predicted.hitPumpkinIds.length &&
      predicted.hitPumpkinIds.every((id) => actualPoppedPumpkins.has(id)),
    `seed ${seed} room ${roomIndex}: traceRay predicted pumpkins [${predicted.hitPumpkinIds}] != stepShell [${[...actualPoppedPumpkins]}]`,
  );
}

console.log(
  `Corn Shots check passed: ${ROOM_COUNT} rooms verified (avg par ${(totalPar / ROOM_COUNT).toFixed(2)}, ${movingCount} moving-obstacle rooms), reflection & traceRay/stepShell parity 100%.`,
);
