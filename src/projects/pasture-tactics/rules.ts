import {
  COLS, ROWS, CROP_COUNT, HOLD_TURNS, MAX_EGGS, OVERHEAL, POWER_PER_TURN, HEROES, ENEMIES, PROPS, ITEMS, SPROUT_KINDS,
  type Difficulty, type EntityKind, type HeroKind, type EnemyKind, type ItemKind, type PropKind,
} from './data';

export type Dir = 0 | 1 | 2 | 3;
export interface Tile { x: number; y: number }
export interface Entity extends Tile {
  id: number; kind: EntityKind; hp: number; shield: boolean; moved: boolean; acted: boolean;
  placed: boolean; dir: Dir;
}
interface Wave { turn: number; kind: EnemyKind; x: number }
export interface GameState {
  seed: number; difficulty: Difficulty; objective: 'hold' | 'rout'; turn: number; power: number;
  phase: 'player' | 'won' | 'lost'; entities: Entity[]; traps: Tile[];
  items: { kind: ItemKind; charges: number }[]; waves: Wave[]; nextId: number;
}
export type Action =
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'skill'; id: number; x: number; y: number }
  | { type: 'item'; id: number; item: ItemKind; x: number; y: number }
  | { type: 'wait'; id: number }
  | { type: 'endTurn' };
export type GameEvent =
  | { t: 'move'; id: number; path: Tile[]; style: 'walk' | 'fly' | 'charge' | 'leap' | 'slide' }
  | { t: 'skill'; id: number; dir: Dir; x: number; y: number }
  | { t: 'item'; id: number; item: ItemKind; x: number; y: number }
  | { t: 'damage'; id: number; amount: number; hp: number }
  | { t: 'heal'; id: number; amount: number; hp: number }
  | { t: 'shield'; id: number }
  | { t: 'block'; id: number }
  | { t: 'heavy'; id: number }
  | { t: 'bump'; id: number; dir: Dir; blockerId: number | null }
  | { t: 'ko'; id: number }
  | { t: 'spawn'; entity: Entity; how: 'place' | 'land' }
  | { t: 'split'; id: number; into: Entity[] }
  | { t: 'egg'; x: number; y: number; on: boolean }
  | { t: 'eggHit'; x: number; y: number; id: number }
  | { t: 'phase'; phase: 'enemy' | 'player' }
  | { t: 'end'; result: 'won' | 'lost' };

export type Hero = Entity & { kind: HeroKind };
type Enemy = Entity & { kind: EnemyKind };
type MoveStyle = Extract<GameEvent, { t: 'move' }>['style'];
interface Resolution { state: GameState; events: GameEvent[] }
export const isHero = (e: Entity): e is Hero => Object.hasOwn(HEROES, e.kind);
export const isEnemy = (e: Entity): e is Enemy => Object.hasOwn(ENEMIES, e.kind);
const DIRS: readonly Dir[] = [0, 1, 2, 3];
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const SIZE = COLS * ROWS;
export const tileIndex = (p: Tile) => p.y * COLS + p.x;
export const tileOf = (i: number): Tile => ({ x: i % COLS, y: Math.floor(i / COLS) });
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const inside = (p: Tile) => p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS;
const offset = (p: Tile, d: Dir, n = 1): Tile => ({ x: p.x + DX[d] * n, y: p.y + DY[d] * n });
const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const aligned = (a: Tile, b: Tile) => a.x === b.x || a.y === b.y;
function facing(e: Entity, p: Tile): Dir {
  if (same(e, p)) return e.dir;
  if (Math.abs(p.x - e.x) > Math.abs(p.y - e.y)) return p.x > e.x ? 1 : 3;
  return p.y > e.y ? 2 : 0;
}

export function createEntity(state: GameState, kind: EntityKind, x: number, y: number, placed = false): Entity {
  const e: Entity = { id: state.nextId++, kind, x, y, hp: 0, shield: false, moved: false, acted: false, placed, dir: 2 };
  e.hp = maxHp(e) ?? 0;
  if (isHero(e)) e.dir = 0;
  state.entities.push(e);
  return e;
}
export function entityAt(state: GameState, x: number, y: number): Entity | undefined {
  return state.entities.find(e => e.x === x && e.y === y);
}
export function teamOf(e: Entity): 'herd' | 'sky' | 'neutral' {
  if (isEnemy(e)) return 'sky';
  return isHero(e) || e.kind === 'barn' || e.kind === 'crop' || e.placed ? 'herd' : 'neutral';
}
export function maxHp(e: Entity): number | null {
  if (isHero(e)) return HEROES[e.kind].hp;
  if (isEnemy(e)) return ENEMIES[e.kind].hp;
  return PROPS[e.kind as PropKind].hp;
}
const pushable = (e: Entity) => isHero(e) || isEnemy(e) || PROPS[e.kind as PropKind].pushable;
const heavy = (e: Entity) => isHero(e) && !!HEROES[e.kind].parts.heavy;
const hasEgg = (s: GameState, p: Tile) => s.traps.some(t => same(t, p));
const plantable = (s: GameState, p: Tile) => inside(p) && !entityAt(s, p.x, p.y) && !hasEgg(s, p);
function activeHero(s: GameState, id: number): Hero | undefined {
  const e = s.entities.find(e => e.id === id);
  return s.phase === 'player' && e && isHero(e) ? e : undefined;
}

// The actor is deliberately absent: candidate moves and attacks see its old square as empty.
type Board = (Entity | undefined)[];
function boardWithout(s: GameState, actor: Entity): Board {
  const board = new Array<Entity | undefined>(SIZE);
  for (const e of s.entities) if (e !== actor) board[tileIndex(e)] = e;
  return board;
}
interface Reach { ends: number[]; steps: Int8Array; parent: Int8Array }
function reachable(e: Hero | Enemy, board: Board): Reach {
  const { move, fly } = isHero(e) ? HEROES[e.kind] : ENEMIES[e.kind];
  const start = tileIndex(e), queue = [start], ends = [start];
  const parent = new Int8Array(SIZE).fill(-1), steps = new Int8Array(SIZE).fill(-1);
  steps[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (steps[i] === move) continue;
    const p = tileOf(i);
    for (const d of DIRS) {
      const next = offset(p, d), j = tileIndex(next);
      if (!inside(next) || steps[j] >= 0 || (!fly && board[j])) continue;
      parent[j] = i;
      steps[j] = steps[i] + 1;
      queue.push(j);
      if (!board[j]) ends.push(j);
    }
  }
  return { ends, steps, parent };
}
function pathTo(reach: Reach, dest: number): Tile[] {
  const path: Tile[] = [];
  for (let i = dest; reach.parent[i] !== -1; i = reach.parent[i]) path.push(tileOf(i));
  return path.reverse();
}
export function moveTargets(state: GameState, id: number): (Tile & { steps: number })[] {
  const e = activeHero(state, id);
  if (!e || e.moved) return [];
  const reach = reachable(e, boardWithout(state, e));
  return reach.ends.slice(1).map(i => ({ ...tileOf(i), steps: reach.steps[i] }));
}

function targets(test: (p: Tile) => boolean): Tile[] {
  const result: Tile[] = [];
  for (let i = 0; i < SIZE; i++) {
    const p = tileOf(i);
    if (test(p)) result.push(p);
  }
  return result;
}
const foe = (e: Entity | undefined): e is Entity => !!e && teamOf(e) !== 'herd' && maxHp(e) !== null;
// `over` raises the cap past max HP (Mend's bonus).
const healable = (e: Entity | undefined, over = 0) => !!e && teamOf(e) === 'herd' && maxHp(e) !== null && e.hp < maxHp(e)! + over;
export function skillTargets(state: GameState, id: number): Tile[] {
  const e = activeHero(state, id);
  if (!e || e.acted) return [];
  if (e.kind === 'goat') {
    const result: Tile[] = [];
    for (const d of DIRS) {
      for (let p = offset(e, d); inside(p); p = offset(p, d)) {
        const t = entityAt(state, p.x, p.y);
        if (!t) continue;
        if (foe(t)) result.push(p);
        break;
      }
    }
    return result;
  }
  return targets(p => {
    const n = distance(e, p), t = entityAt(state, p.x, p.y);
    switch (e.kind) {
      // Shove only moves its target, so a Heavy one is no target at all.
      case 'cow': return n === 1 && !!t && pushable(t) && !heavy(t);
      case 'pig': return n === 1 && foe(t);
      case 'duck': return n === 1;
      case 'healer': return n <= 3 && healable(t, OVERHEAL);
      case 'bee': return n > 0 && n <= 3 && aligned(e, p) && foe(t);
      case 'cat': {
        if (n !== 1 || !foe(t)) return false;
        const far = offset(p, facing(e, p));
        return inside(far) && !entityAt(state, far.x, far.y);
      }
      case 'hen': return n > 0 && n <= 2 && plantable(state, p);
      case 'sheep': return n <= 2 && !!t && teamOf(t) === 'herd' && !t.shield;
      default: return false;
    }
  });
}
export function itemTargets(state: GameState, id: number, item: ItemKind): Tile[] {
  const e = activeHero(state, id), stock = state.items.find(slot => slot.kind === item);
  if (!e || e.acted || !stock || stock.charges <= 0 || state.power < ITEMS[item].power) return [];
  return targets(p => {
    const n = distance(e, p), t = entityAt(state, p.x, p.y);
    switch (item) {
      case 'honey': return n <= 1 && healable(t);
      case 'apple': return n <= 1 && !!t && isHero(t) && t.moved;
      case 'bale': case 'decoy': return n > 0 && n <= 2 && plantable(state, p);
      case 'can': return n > 0 && n <= 2 && aligned(e, p) && plantable(state, p);
      case 'pumpkin': return n > 0 && n <= 3 && aligned(e, p) && foe(t);
      case 'tractor': return n === 1 && (!t || teamOf(t) === 'herd' || foe(t));
    }
  });
}

function damage(r: Resolution, e: Entity, n: number) {
  if (maxHp(e) === null) return;
  if (e.shield) {
    e.shield = false;
    r.events.push({ t: 'block', id: e.id });
    return;
  }
  e.hp = Math.max(0, e.hp - n);
  r.events.push({ t: 'damage', id: e.id, amount: n, hp: e.hp });
  if (!e.hp) {
    r.state.entities.splice(r.state.entities.indexOf(e), 1);
    r.events.push({ t: 'ko', id: e.id });
  }
}
function heal(r: Resolution, e: Entity, over = 0) {
  const amount = Math.min(2, maxHp(e)! + over - e.hp);
  e.hp += amount;
  r.events.push({ t: 'heal', id: e.id, amount, hp: e.hp });
}
function triggerEgg(r: Resolution, e: Entity) {
  const i = r.state.traps.findIndex(p => same(p, e));
  const [p] = r.state.traps.splice(i, 1);
  r.events.push({ t: 'eggHit', ...p, id: e.id }, { t: 'egg', ...p, on: false });
  damage(r, e, 2);
}
// Paths exclude the origin. A walker stops on its first egg; a forced slide can continue if it survives.
function travel(r: Resolution, e: Entity, path: Tile[], style: MoveStyle): boolean {
  const groundedEnemy = isEnemy(e) && !ENEMIES[e.kind].fly;
  let segment: Tile[] = [];
  for (const p of path) {
    e.dir = facing(e, p);
    e.x = p.x; e.y = p.y;
    segment.push(p);
    if (groundedEnemy && hasEgg(r.state, p)) {
      r.events.push({ t: 'move', id: e.id, path: segment, style });
      segment = [];
      triggerEgg(r, e);
      if (!e.hp || style === 'walk') return true;
    }
  }
  if (segment.length) r.events.push({ t: 'move', id: e.id, path: segment, style });
  return false;
}
function displace(r: Resolution, e: Entity, d: Dir, dest = offset(e, d)) {
  if (!pushable(e)) return;
  if (heavy(e)) {
    r.events.push({ t: 'heavy', id: e.id });
    return;
  }
  const blocker = entityAt(r.state, dest.x, dest.y);
  if (inside(dest) && !blocker) {
    travel(r, e, [dest], 'slide');
  } else {
    r.events.push({ t: 'bump', id: e.id, dir: d, blockerId: blocker?.id ?? null });
    damage(r, e, 1);
    if (blocker) damage(r, blocker, 1);
  }
}
function spawn(r: Resolution, kind: EntityKind, p: Tile, how: 'place' | 'land') {
  const e = createEntity(r.state, kind, p.x, p.y, how === 'place');
  r.events.push({ t: 'spawn', entity: { ...e }, how });
}
function crossRow(p: Tile, d: Dir): Tile[] {
  const side = DIRS[(d + 1) % 4];
  return [p, offset(p, side), offset(p, side, -1)];
}
function useSkill(r: Resolution, e: Hero, p: Tile) {
  const d = facing(e, p), t = entityAt(r.state, p.x, p.y)!;
  e.dir = d;
  r.events.push({ t: 'skill', id: e.id, dir: d, x: p.x, y: p.y });
  switch (e.kind) {
    case 'cow': displace(r, t, d); break;
    case 'pig': damage(r, t, 2); break;
    case 'duck': {
      for (const q of crossRow(p, d)) {
        const hit = entityAt(r.state, q.x, q.y);
        if (hit) displace(r, hit, d);
      }
      break;
    }
    case 'healer': heal(r, t, OVERHEAL); break;
    case 'bee': damage(r, t, 1); break;
    case 'goat': {
      const path: Tile[] = [];
      for (let q = offset(e, d); !same(q, p); q = offset(q, d)) path.push(q);
      travel(r, e, path, 'charge');
      damage(r, t, 2);
      if (t.hp > 0) displace(r, t, d);
      break;
    }
    case 'cat': travel(r, e, [offset(p, d)], 'leap'); damage(r, t, 1); break;
    case 'hen': {
      if (r.state.traps.length === MAX_EGGS) r.events.push({ t: 'egg', ...r.state.traps.shift()!, on: false });
      const trap = { x: p.x, y: p.y };
      r.state.traps.push(trap);
      r.events.push({ t: 'egg', ...trap, on: true });
      break;
    }
    case 'sheep': t.shield = true; r.events.push({ t: 'shield', id: t.id }); break;
  }
}
function useItem(r: Resolution, e: Hero, item: ItemKind, p: Tile) {
  const s = r.state, d = facing(e, p), t = entityAt(s, p.x, p.y)!;
  e.dir = d;
  s.power -= ITEMS[item].power;
  s.items.find(slot => slot.kind === item)!.charges--;
  r.events.push({ t: 'item', id: e.id, item, x: p.x, y: p.y });
  switch (item) {
    case 'honey': heal(r, t); break;
    case 'apple': t.moved = false; break;
    case 'bale': spawn(r, 'hay', p, 'place'); break;
    case 'decoy': spawn(r, 'scarecrow', p, 'place'); break;
    case 'can': {
      for (const q of crossRow(p, d)) {
        if (plantable(s, q)) spawn(r, 'corn', q, 'place');
      }
      break;
    }
    case 'pumpkin': damage(r, t, 2); break;
    case 'tractor': {
      for (let n = Math.max(COLS, ROWS) - 1; n >= 1; n--) {
        const q = offset(e, d, n), hit = entityAt(s, q.x, q.y);
        if (!foe(hit)) continue;
        damage(r, hit, 2);
        if (hit.hp > 0) displace(r, hit, d);
      }
      break;
    }
  }
}

function attackTiles(kind: EnemyKind, p: Tile, d: Dir, board: Board): Tile[] {
  if (kind === 'lobber') {
    const center = offset(p, d, 3);
    return inside(center) ? [center, ...DIRS.map(side => offset(center, side)).filter(inside)] : [];
  }
  if (kind === 'redSprout') return [offset(p, d), offset(p, d, 2)].filter(inside);
  if (kind === 'yellowSprout') {
    // The shock conducts through every occupied tile in an unbroken line.
    const line: Tile[] = [];
    for (let q = offset(p, d); inside(q); q = offset(q, d)) {
      line.push(q);
      if (!board[tileIndex(q)]) break;
    }
    return line;
  }
  if (kind === 'scout' || kind === 'saucer' || kind === 'blueSprout') {
    const line: Tile[] = [];
    const reach = kind === 'scout' ? 4 : 3;
    for (let n = 1; n <= reach; n++) {
      const q = offset(p, d, n);
      if (!inside(q)) break;
      line.push(q);
      if (board[tileIndex(q)]) break;
    }
    return line;
  }
  const q = offset(p, d);
  return inside(q) ? [q] : [];
}

// Members take the trio's tile in SPROUT_KINDS order, then free neighbours west, east, south, north; any without room are lost.
const SPLIT_DIRS: readonly Dir[] = [3, 1, 2, 0];
function splitPlan(s: GameState, group: Enemy): Enemy[] {
  const tiles: Tile[] = [group, ...SPLIT_DIRS.map(d => offset(group, d)).filter(q => inside(q) && !entityAt(s, q.x, q.y))];
  return SPROUT_KINDS.slice(0, group.hp).flatMap((kind, i) => tiles[i] ? [{ ...group, kind, hp: 1, x: tiles[i].x, y: tiles[i].y }] : []);
}
function split(r: Resolution, group: Enemy): Enemy[] {
  const s = r.state, plan = splitPlan(s, group);
  s.entities.splice(s.entities.indexOf(group), 1);
  const members = plan.map(({ kind }) => createEntity(s, kind, group.x, group.y) as Enemy);
  for (const m of members) m.dir = group.dir;
  r.events.push({ t: 'split', id: group.id, into: members.map(m => ({ ...m })) });
  members.forEach((m, i) => { if (i) travel(r, m, [{ x: plan[i].x, y: plan[i].y }], 'leap'); });
  return members;
}

function addReach(state: GameState, e: Enemy, move: Set<number>, attack: Set<number>) {
  const board = boardWithout(state, e);
  for (const i of reachable(e, board).ends) {
    move.add(i);
    for (const d of DIRS) for (const q of attackTiles(e.kind, tileOf(i), d, board)) attack.add(tileIndex(q));
  }
}
export function enemyReach(state: GameState, id: number): { move: Tile[]; attack: Tile[] } {
  const e = state.entities.find(t => t.id === id);
  if (!e || !isEnemy(e)) return { move: [], attack: [] };
  const move = new Set<number>(), attack = new Set<number>();
  if (e.kind === 'sprouts') {
    // A trio threatens what its members can do right after splitting.
    const members = splitPlan(state, e);
    const after = { ...state, entities: [...state.entities.filter(t => t !== e), ...members] };
    for (const m of members) addReach(after, m, move, attack);
  } else {
    addReach(state, e, move, attack);
  }
  return { move: Array.from(move, tileOf), attack: Array.from(attack, tileOf) };
}

export function danger(state: GameState): number[] {
  const damage = new Array<number>(SIZE).fill(0);
  for (const e of state.entities) {
    if (!isEnemy(e)) continue;
    for (const q of enemyReach(state, e.id).attack) damage[tileIndex(q)] += ENEMIES[e.kind].damage;
  }
  return damage;
}

function attack(r: Resolution, e: Enemy, d: Dir, board: Board) {
  const tiles = attackTiles(e.kind, e, d, board);
  const target = e.kind === 'lobber' ? tiles[0] : tiles[tiles.length - 1];
  e.dir = d;
  r.events.push({ t: 'skill', id: e.id, dir: d, x: target.x, y: target.y });
  for (const q of tiles) {
    const hit = board[tileIndex(q)];
    if (!hit) continue;
    if (e.kind === 'saucer' && distance(e, hit) > 1 && pushable(hit)) {
      displace(r, hit, d, offset(e, d));
      if (!hit.hp) continue;
    }
    damage(r, hit, ENEMIES[e.kind].damage);
    if ((e.kind === 'brute' || e.kind === 'blueSprout') && hit.hp > 0) displace(r, hit, d);
  }
}

// Obstacles score nothing: enemies break one only when it blocks their route (see breachDirection).
function value(e: Entity, damage: number): number {
  if (e.kind === 'scarecrow') return 6;
  if (e.kind === 'barn') return 4;
  if (e.kind === 'crop') return 2;
  if (isHero(e)) return 3 + (damage >= e.hp ? 2 : 0);
  if (isEnemy(e)) return -4;
  return 0;
}
function bestAttack(e: Enemy, p: Tile, board: Board): { score: number; dir: Dir } {
  let score = -Infinity, dir: Dir = 0;
  for (const d of DIRS) {
    const tiles = attackTiles(e.kind, p, d, board);
    if (!tiles.length) continue;
    let sum = 0;
    for (const q of tiles) {
      const hit = board[tileIndex(q)];
      if (hit) sum += value(hit, ENEMIES[e.kind].damage);
    }
    if (sum > score) { score = sum; dir = d; }
  }
  return { score, dir };
}
// Multi-source Dijkstra; a linear minimum scan avoids a heap and stale entries on a small board.
function goalDistances(s: GameState, board: Board): Float64Array {
  const dist = new Float64Array(SIZE).fill(Infinity), done = new Uint8Array(SIZE);
  for (const e of s.entities) {
    if (e.kind === 'crop' || e.kind === 'scarecrow' || (s.objective === 'hold' ? e.kind === 'barn' : isHero(e))) dist[tileIndex(e)] = 0;
  }
  for (;;) {
    let i = -1, min = Infinity;
    for (let j = 0; j < SIZE; j++) if (!done[j] && dist[j] < min) { i = j; min = dist[j]; }
    if (i < 0) return dist;
    done[i] = 1;
    const p = tileOf(i);
    for (const d of DIRS) {
      const q = offset(p, d), j = tileIndex(q);
      if (!inside(q) || done[j]) continue;
      const occupant = board[j];
      if (occupant && maxHp(occupant) === null) continue;
      dist[j] = Math.min(dist[j], min + (occupant ? 3 : 1));
    }
  }
}
// The direction of a breakable obstacle standing on every shortest route to the goal, if this enemy's attack can hit it.
function breachDirection(e: Enemy, board: Board, dist: Float64Array): Dir | null {
  let best = Infinity, open = false, blocked: Dir | null = null;
  for (const d of DIRS) {
    const q = offset(e, d), j = tileIndex(q);
    if (!inside(q) || dist[j] >= dist[tileIndex(e)] || dist[j] > best) continue;
    const occupant = board[j];
    const obstacle = !!occupant && !isHero(occupant) && !isEnemy(occupant) && maxHp(occupant) !== null
      && occupant.kind !== 'barn' && occupant.kind !== 'crop' && occupant.kind !== 'scarecrow';
    if (dist[j] < best) { best = dist[j]; open = !obstacle; blocked = obstacle ? d : null; }
    else if (obstacle) blocked ??= d;
    else open = true;
  }
  if (open || blocked === null) return null;
  const target = offset(e, blocked);
  return attackTiles(e.kind, e, blocked, board).some(t => same(t, target)) ? blocked : null;
}
function actEnemy(r: Resolution, e: Enemy) {
  const board = boardWithout(r.state, e), reach = reachable(e, board);
  // Sorting by the secondary keys lets strict score/distance comparisons retain the right tie.
  reach.ends.sort((a, b) => reach.steps[a] - reach.steps[b] || a - b);
  let dest = reach.ends[0], best = bestAttack(e, e, board);
  for (let j = 1; j < reach.ends.length; j++) {
    const i = reach.ends[j], option = bestAttack(e, tileOf(i), board);
    if (option.score > best.score) { dest = i; best = option; }
  }
  let dist: Float64Array | null = null;
  if (best.score < 1) {
    dist = goalDistances(r.state, board);
    dest = reach.ends[0];
    for (const i of reach.ends) if (dist[i] < dist[dest]) dest = i;
  }
  const stopped = travel(r, e, pathTo(reach, dest), ENEMIES[e.kind].fly ? 'fly' : 'walk');
  if (!e.hp) return;
  if (stopped || dist) best = bestAttack(e, e, board);
  // Flyers pass over obstacles, so they never need to break one.
  const dir = best.score > 0 ? best.dir : dist && !ENEMIES[e.kind].fly ? breachDirection(e, board, dist) : null;
  if (dir !== null) attack(r, e, dir, board);
}
function landing(s: GameState, x: number): Tile | undefined {
  for (let y = 0; y <= 1; y++) {
    for (let delta = 0; delta < COLS; delta++) {
      const left = x - delta, right = x + delta;
      if (left >= 0 && !entityAt(s, left, y)) return { x: left, y };
      if (delta && right < COLS && !entityAt(s, right, y)) return { x: right, y };
    }
  }
}
function checkResult(r: Resolution, checkpoint: 'action' | 'attacks' | 'landings'): boolean {
  const s = r.state;
  if (!s.entities.some(isHero) || (s.objective === 'hold' && !s.entities.some(e => e.kind === 'barn'))) s.phase = 'lost';
  else if (checkpoint === 'attacks') return false;
  else if (s.objective === 'hold') {
    if (checkpoint === 'landings' && s.turn >= HOLD_TURNS) s.phase = 'won';
  } else {
    const firstPending = checkpoint === 'landings' ? s.turn + 1 : s.turn;
    if (!s.entities.some(isEnemy) && !s.waves.some(w => w.turn >= firstPending)) s.phase = 'won';
  }
  if (s.phase === 'player') return false;
  r.events.push({ t: 'end', result: s.phase });
  return true;
}
function endTurn(r: Resolution) {
  const s = r.state;
  r.events.push({ t: 'phase', phase: 'enemy' });
  for (const e of s.entities.filter(isEnemy).sort((a, b) => a.id - b.id)) {
    if (!e.hp) continue;
    // A trio that survived until now splits, and each sprout acts on its own straight away.
    for (const actor of e.kind === 'sprouts' ? split(r, e) : [e]) {
      if (actor.hp) actEnemy(r, actor);
      if (checkResult(r, 'attacks')) return;
    }
  }
  for (const w of s.waves) {
    if (w.turn !== s.turn) continue;
    const p = landing(s, w.x);
    if (p) spawn(r, w.kind, p, 'land');
  }
  if (checkResult(r, 'landings')) return;
  s.turn++;
  s.power = POWER_PER_TURN;
  for (const e of s.entities) {
    if (isHero(e)) e.moved = e.acted = false;
    // Mend's bonus HP lasts through one enemy phase.
    const max = maxHp(e);
    if (max !== null && e.hp > max) e.hp = max;
  }
  r.events.push({ t: 'phase', phase: 'player' });
}

export function stars(state: GameState): 0 | 1 | 2 | 3 {
  if (state.phase !== 'won') return 0;
  const crops = state.entities.filter(e => e.kind === 'crop').length;
  return crops === CROP_COUNT ? 3 : crops >= 2 ? 2 : 1;
}

export function apply(state: GameState, action: Action): Resolution {
  const r: Resolution = { state: structuredClone(state), events: [] }, s = r.state;
  if (s.phase !== 'player') throw new Error('illegal action');
  if (action.type === 'endTurn') { endTurn(r); return r; }
  const e = activeHero(s, action.id);
  if (!e) throw new Error('illegal action');
  if (action.type === 'move') {
    if (e.moved) throw new Error('illegal action');
    const reach = reachable(e, boardWithout(s, e));
    const dest = reach.ends.find(i => i !== tileIndex(e) && same(tileOf(i), action));
    if (dest === undefined) throw new Error('illegal action');
    travel(r, e, pathTo(reach, dest), HEROES[e.kind].fly ? 'fly' : 'walk');
    e.moved = true;
  } else {
    if (e.acted) throw new Error('illegal action');
    if (action.type === 'skill' && !skillTargets(s, e.id).some(p => same(p, action))) throw new Error('illegal action');
    if (action.type === 'item' && !itemTargets(s, e.id, action.item).some(p => same(p, action))) throw new Error('illegal action');
    e.acted = e.moved = true;
    if (action.type === 'skill') useSkill(r, e, action);
    else if (action.type === 'item') useItem(r, e, action.item, action);
    else if (action.type !== 'wait') throw new Error('illegal action');
  }
  checkResult(r, 'action');
  return r;
}
