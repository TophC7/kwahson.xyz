import { mulberry32, pick, pickWeighted, shuffle } from '../../lib/rng';
import {
  COLS, ROWS, CROP_COUNT, ENEMIES, ENEMY_KINDS, HERO_KINDS, ITEMS, ITEM_KINDS, POWER_PER_TURN, SALT, THREAT, unitCost,
  type Difficulty, type EnemyKind, type EntityKind, type HeroKind,
} from './data';
import { createEntity, entityAt, maxHp, tileIndex, tileOf, type GameState } from './rules';

const STRIKERS: Partial<Record<HeroKind, true>> = { bee: true, goat: true, cat: true, hen: true };
const PROP_WEIGHTS = [['rock', 3], ['stump', 2], ['silo', 1], ['hay', 2], ['crate', 2]] as const;
const ENEMY_WEIGHTS = ENEMY_KINDS.filter((kind) => ENEMIES[kind].weight > 0).map((kind) => [kind, ENEMIES[kind].weight] as const);
const ENEMY_COST = Object.fromEntries(ENEMY_KINDS.map((k) => [k, unitCost(ENEMIES[k])])) as Record<EnemyKind, number>;
const CENTER = Math.floor((COLS - 1) / 2), BACK = ROWS - 1, FRONT = BACK - 1;
const HERO_STARTS = {
  hold: [[CENTER - 1, FRONT], [CENTER + 1, FRONT], [CENTER - 2, BACK], [CENTER + 2, BACK]],
  rout: [[CENTER, FRONT], [CENTER + 1, FRONT], [CENTER - 1, FRONT], [CENTER + 2, FRONT]],
} as const;

function hasPassage(state: GameState): boolean {
  // Only indestructible props count as walls for the scenario connectivity check.
  const blocked = new Uint8Array(COLS * ROWS);
  for (const e of state.entities) if (maxHp(e) === null) blocked[tileIndex(e)] = 1;
  const queue = [CENTER];
  blocked[CENTER] = 1;
  function visit(tile: number) {
    if (!blocked[tile]) {
      blocked[tile] = 1;
      queue.push(tile);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i];
    if (tile === FRONT * COLS + CENTER) return true;
    if (tile % COLS > 0) visit(tile - 1);
    if (tile % COLS < COLS - 1) visit(tile + 1);
    if (tile >= COLS) visit(tile - COLS);
    if (tile < (ROWS - 1) * COLS) visit(tile + COLS);
  }
  return false;
}

export function createGame(seed: number, difficulty: Difficulty): GameState {
  const rng = mulberry32((seed ^ SALT[difficulty]) >>> 0);
  const objective = rng() < 0.5 ? 'hold' : 'rout';
  const heroCount = pick([2, 3, 3, 4, 4], rng);
  const order = shuffle([...HERO_KINDS], rng);
  const heroes = order.slice(0, heroCount);
  if (!heroes.some((k) => STRIKERS[k])) heroes[heroCount - 1] = order.find((k) => STRIKERS[k])!;
  const items = shuffle([...ITEM_KINDS], rng).slice(0, 6 - heroCount);
  if (!heroes.includes('healer') && !items.includes('honey')) items[items.length - 1] = 'honey';

  const state: GameState = {
    seed: seed >>> 0, difficulty, objective, turn: 1, power: POWER_PER_TURN, phase: 'player',
    entities: [], traps: [], items: items.map((kind) => ({ kind, charges: ITEMS[kind].charges })),
    waves: [], nextId: 1,
  };
  if (objective === 'hold') createEntity(state, 'barn', CENTER, BACK);
  heroes.forEach((kind, i) => {
    const [x, y] = HERO_STARTS[objective][i];
    createEntity(state, kind, x, y);
  });

  const freeRows = (start: number, end: number) => Array.from({ length: COLS * (end - start + 1) }, (_, i) => COLS * start + i)
    .filter(i => { const { x, y } = tileOf(i); return !entityAt(state, x, y); });
  const place = (kind: EntityKind, pool: number[]) => {
    const { x, y } = tileOf(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    createEntity(state, kind, x, y);
  };
  const cropRows = freeRows(FRONT - 1, FRONT);
  for (let i = 0; i < CROP_COUNT; i++) place('crop', cropRows);

  const propCount = 5 + Math.floor(rng() * 4);
  const pasture = freeRows(2, FRONT - 1);
  for (let i = 0; i < propCount; i++) place(pickWeighted(PROP_WEIGHTS, rng), pasture);
  while (!hasPassage(state)) {
    let i = state.entities.length - 1;
    while (maxHp(state.entities[i]) !== null) i--;
    state.entities.splice(i, 1);
  }

  let remaining = Math.round(heroCount * 10 * THREAT[difficulty]);
  let saucersLeft = difficulty === 'easy' ? 1 : 2;
  const raid: EnemyKind[] = [];
  while (remaining > 0) {
    const candidates = ENEMY_WEIGHTS.filter(([k]) => ENEMY_COST[k] <= remaining && (k !== 'saucer' || saucersLeft > 0));
    if (!candidates.length) break;
    const kind = pickWeighted(candidates, rng);
    raid.push(kind);
    remaining -= ENEMY_COST[kind];
    if (kind === 'saucer') saucersLeft--;
  }
  const initialCount = Math.max(1, Math.ceil(raid.length * 0.55));
  const landingZone = freeRows(0, 1);
  for (const kind of raid.slice(0, initialCount)) place(kind, landingZone);
  const waveTurns = objective === 'hold' ? [2, 3, 4, 5] : [2, 3, 4];
  state.waves = raid.slice(initialCount).map((kind, i) => ({ turn: waveTurns[i % waveTurns.length], kind, x: Math.floor(rng() * COLS) }));
  return state;
}
