import { mulberry32, pick } from '../src/lib/rng';
import {
  COLS, ROWS, CROP_COUNT, ENEMIES, ENEMY_KINDS, HEROES, HERO_KINDS, ITEMS, ITEM_KINDS,
  MAX_EGGS, OVERHEAL, POWER_PER_TURN, cost, unitCost,
} from '../src/projects/pasture-tactics/data';
import {
  apply, createEntity, danger, isHero, maxHp, moveTargets, skillTargets, stars, tileIndex, type Action, type GameState,
} from '../src/projects/pasture-tactics/rules';
import { createGame } from '../src/projects/pasture-tactics/scenario';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/projects/pasture-tactics/save';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const difficulties = ['easy', 'medium', 'hard'] as const;
const byId = (s: GameState, id: number) => s.entities.find(e => e.id === id);

function blank(): GameState {
  return {
    seed: 1, difficulty: 'medium', objective: 'rout', turn: 1, power: POWER_PER_TURN,
    phase: 'player', entities: [], traps: [], items: [], waves: [], nextId: 1,
  };
}

// 1. Prices match the hero budget, item power and published enemy costs.
for (const k of HERO_KINDS) assert(unitCost(HEROES[k]) === 10, `${k}: hero budget`);
for (const k of ITEM_KINDS) {
  assert(Math.abs(cost(ITEMS[k].parts) - 2 * ITEMS[k].power) <= 1, `${k}: item budget`);
}
const enemyCosts = {
  visitor: 6, sprouts: 13, scout: 7, brute: 9, lobber: 9, saucer: 11, redSprout: 6.5, yellowSprout: 6, blueSprout: 8,
};
for (const k of ENEMY_KINDS) assert(unitCost(ENEMIES[k]) === enemyCosts[k], `${k}: enemy budget`);

function shove(withRock: boolean) {
  const s = blank();
  const cow = createEntity(s, 'cow', 3, 4);
  const visitor = createEntity(s, 'visitor', 3, 3);
  if (withRock) createEntity(s, 'rock', 3, 2);
  const { state, events } = apply(s, { type: 'skill', id: cow.id, x: 3, y: 3 });
  return { visitor: byId(state, visitor.id), events };
}

// 2. Shoving into rock hurts without displacing the visitor.
{
  const { visitor, events } = shove(true);
  assert(visitor?.x === 3 && visitor.y === 3 && visitor.hp === 1, 'Blocked Shove: position or HP');
  assert(events.some(e => e.t === 'bump'), 'Blocked Shove: missing bump');
}

// 3. Shoving onto open ground moves the visitor without damage.
{
  const { visitor } = shove(false);
  assert(visitor?.x === 3 && visitor.y === 2 && visitor.hp === 2, 'Free Shove: position or HP');
}

// A visitor closes the gap and hits in one phase.
{
  const s = blank(), visitor = createEntity(s, 'visitor', 2, 1), cow = createEntity(s, 'cow', 2, 4);
  const { state, events } = apply(s, { type: 'endTurn' });
  const move = events.findIndex(e => e.t === 'move' && e.id === visitor.id);
  const zap = events.findIndex(e => e.t === 'skill' && e.id === visitor.id && e.name === 'Zap');
  assert(move >= 0 && zap > move && byId(state, cow.id)?.hp === cow.hp - 1, 'Visitor must move then Zap');
}

// A surviving trio splits around blockers, loses knocked-out members from the back, and its sprouts act at once.
{
  const s = blank();
  const trio = createEntity(s, 'sprouts', 3, 3);
  trio.hp = 2;
  createEntity(s, 'rock', 2, 3);
  const cow = createEntity(s, 'cow', 5, 3);
  const { state, events } = apply(s, { type: 'endTurn' });
  const split = events.find(e => e.t === 'split');
  assert(split?.t === 'split' && split.id === trio.id, 'Trio did not split');
  assert(split.into.map(e => e.kind).join() === 'redSprout,yellowSprout', 'Split members or order');
  assert(!state.entities.some(e => e.kind === 'sprouts'), 'Trio survived its split');
  const ids = new Set(split.into.map(e => e.id));
  assert(events.some(e => e.t === 'skill' && ids.has(e.id)), 'Split sprouts did not act');
  assert(byId(state, cow.id)!.hp < cow.hp, 'Split sprouts did not reach the cow');
}

// Chain conducts through every animal lined up behind the first.
{
  const s = blank();
  createEntity(s, 'yellowSprout', 0, 3);
  const cow = createEntity(s, 'cow', 1, 3), sheep = createEntity(s, 'sheep', 2, 3);
  const { state } = apply(s, { type: 'endTurn' });
  assert(byId(state, cow.id)?.hp === cow.hp - 1 && byId(state, sheep.id)?.hp === sheep.hp - 1, 'Chain must hit the whole line');
}

// Mend overheals a full-health friend; the bonus soaks a hit, then expires when the next turn starts.
{
  let s = blank();
  const healer = createEntity(s, 'healer', 3, 7), cow = createEntity(s, 'cow', 3, 4);
  createEntity(s, 'visitor', 3, 1);
  s = apply(s, { type: 'skill', id: healer.id, x: 3, y: 4 }).state;
  assert(byId(s, cow.id)?.hp === cow.hp + OVERHEAL, 'Mend did not overheal');
  const { state, events } = apply(s, { type: 'endTurn' });
  assert(events.some(e => e.t === 'damage' && e.id === cow.id && e.hp === cow.hp + OVERHEAL - 1), 'Bonus HP did not soak the hit');
  assert(byId(state, cow.id)?.hp === cow.hp, 'Bonus HP outlived the enemy phase');
}

// Landing beside a target is not an action; the enemy can attack on its next turn.
{
  const s = blank();
  createEntity(s, 'cow', 0, 1);
  s.waves.push({ turn: 1, kind: 'visitor', x: 0 });
  const { state, events } = apply(s, { type: 'endTurn' });
  const spawn = events.find(e => e.t === 'spawn' && e.how === 'land');
  assert(spawn?.t === 'spawn', 'Missing wave landing');
  assert(!events.some(e => e.t === 'skill' && e.id === spawn.entity.id), 'Visitor attacked on landing');
  assert(apply(state, { type: 'endTurn' }).events.some(e => e.t === 'skill' && e.id === spawn.entity.id), 'Landed visitor never acted');
}

// 5. A ground visitor pushed onto the hen’s egg takes two damage and consumes it.
{
  let s = blank();
  const hen = createEntity(s, 'hen', 2, 2);
  const cow = createEntity(s, 'cow', 3, 4);
  const visitor = createEntity(s, 'visitor', 3, 3);
  s = apply(s, { type: 'skill', id: hen.id, x: 3, y: 2 }).state;
  assert(s.traps.some(t => t.x === 3 && t.y === 2), 'Egg not laid on target');
  const { state, events } = apply(s, { type: 'skill', id: cow.id, x: 3, y: 3 });
  assert(events.some(e => e.t === 'damage' && e.id === visitor.id && e.amount === 2), 'Egg damage');
  assert(!byId(state, visitor.id) && !state.traps.length, 'Egg did not resolve');
}

// 6. Wool absorbs a Zap and the shield is spent.
{
  let s = blank();
  const sheep = createEntity(s, 'sheep', 2, 4);
  const cow = createEntity(s, 'cow', 3, 4);
  createEntity(s, 'visitor', 3, 3);
  s = apply(s, { type: 'skill', id: sheep.id, x: 3, y: 4 }).state;
  assert(byId(s, cow.id)?.shield, 'Wool did not shield cow');
  s = apply(s, { type: 'endTurn' }).state;
  const target = byId(s, cow.id);
  assert(target?.hp === cow.hp && target.shield === false, 'Zap did not consume shield without damage');
}

{
  const s = blank(), visitor = createEntity(s, 'visitor', 3, 3);
  const threat = danger(s);
  assert(threat.length === COLS * ROWS, 'Danger grid size');
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const distance = Math.abs(visitor.x - x) + Math.abs(visitor.y - y);
    assert(threat[tileIndex({ x, y })] === (distance <= 4 ? 1 : 0), `Visitor danger at (${x},${y})`);
  }
}

{
  const s = blank();
  createEntity(s, 'cow', COLS - 1, ROWS - 1);
  createEntity(s, 'visitor', 0, 0);
  createEntity(s, 'crop', 0, 1);
  const { state } = apply(s, { type: 'endTurn' });
  assert(state.phase === 'player' && !state.entities.some(e => e.kind === 'crop'), 'Last crop is score, not a loss');
  assert(stars(state) === 0, 'Unfinished games have no stars');
  state.phase = 'won';
  for (let count = 0; count <= CROP_COUNT; count++) {
    assert(stars(state) === (count === CROP_COUNT ? 3 : count >= 2 ? 2 : 1), `Stars for ${count} crops`);
    if (count < CROP_COUNT) createEntity(state, 'crop', count, 1);
  }
}

// 7. Saves resume a played turn exactly; malformed and outdated links have distinct fallbacks.
{
  let s = createGame(4242, 'medium');
  for (const e of s.entities) {
    if (!isHero(e)) continue;
    const first = moveTargets(s, e.id)[0];
    if (first) s = apply(s, { type: 'move', id: e.id, x: first.x, y: first.y }).state;
  }
  s = apply(s, { type: 'endTurn' }).state;
  const code = encodeSave(s);
  assert(JSON.stringify(decodeSave(code)) === JSON.stringify(s), 'Save round trip');
  assert(decodeSave('!!') === null, 'Malformed save should have no usable header');
  const bytes = Buffer.from(code, 'base64url');
  bytes[0] = SAVE_VERSION - 1;
  const old = decodeSave(bytes.toString('base64url'));
  assert(old && 'restart' in old && old.restart.seed === 4242 && old.restart.difficulty === 'medium', 'Version restart');
}

// 8. The same seed and difficulty reconstruct the same scenario.
for (const seed of [1, 4242, 900001]) {
  for (const difficulty of difficulties) {
    const first = createGame(seed, difficulty);
    const crops = first.entities.filter(e => e.kind === 'crop');
    assert(crops.length === CROP_COUNT && crops.every(e => e.y === ROWS - 3 || e.y === ROWS - 2), 'Generated crop rows or count');
    const second = createGame(seed, difficulty);
    assert(JSON.stringify(first) === JSON.stringify(second), `Nondeterministic scenario: ${difficulty} #${seed}`);
  }
}

// 9. Play seeded random moves and skills, checking invariants after every action.
function checkState(s: GameState, bonus: boolean) {
  const at = `${s.difficulty} #${s.seed} turn ${s.turn}`;
  const occupied = new Set<number>();
  for (const e of s.entities) {
    assert(e.x >= 0 && e.x < COLS && e.y >= 0 && e.y < ROWS, `${at}: off-board entity (${e.x},${e.y})`);
    const tile = tileIndex(e);
    assert(!occupied.has(tile), `${at}: shared tile (${e.x},${e.y})`);
    occupied.add(tile);
    const max = maxHp(e);
    const limit = max === null ? 0 : max + (bonus ? OVERHEAL : 0);
    assert(max === null || (e.hp >= 1 && e.hp <= limit), `${at}: ${e.kind} #${e.id} HP ${e.hp}/${max}`);
  }
  assert(s.power >= 0 && s.power <= POWER_PER_TURN, `${at}: power ${s.power}`);
  assert(s.items.every(i => i.charges >= 0), `${at}: negative charges`);
  assert(s.traps.length <= MAX_EGGS, `${at}: too many eggs`);
}

for (const difficulty of difficulties) {
  const stats = { hold: { wins: 0, games: 0 }, rout: { wins: 0, games: 0 } };
  for (let seed = 1; seed <= 300; seed++) {
    const rng = mulberry32(seed ^ 0x914ac5);
    let s = createGame(seed, difficulty);
    checkState(s, false);
    function act(action: Action) {
      s = apply(s, action).state;
      // Bonus HP must be gone once a new player turn starts.
      checkState(s, action.type !== 'endTurn' || s.phase !== 'player');
    }
    for (let n = 0; n < 30 && s.phase === 'player'; n++) {
      for (const e of s.entities) {
        if (!isHero(e)) continue;
        if (s.phase !== 'player') break;
        const moves = moveTargets(s, e.id);
        if (moves.length) {
          const { x, y } = pick(moves, rng);
          act({ type: 'move', id: e.id, x, y });
        }
        if (s.phase !== 'player') break;
        const targets = skillTargets(s, e.id);
        if (targets.length) {
          const { x, y } = pick(targets, rng);
          act({ type: 'skill', id: e.id, x, y });
        }
      }
      if (s.phase === 'player') act({ type: 'endTurn' });
    }
    const record = stats[s.objective];
    record.games++;
    if (s.phase === 'won') record.wins++;
  }
  for (const [objective, { wins, games }] of Object.entries(stats)) {
    console.log(`${difficulty} ${objective}: ${wins}/${games} wins (${(100 * wins / games).toFixed(1)}%)`);
  }
}
console.log('tactics checks passed');
