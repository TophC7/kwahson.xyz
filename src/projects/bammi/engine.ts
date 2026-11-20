export type LayoutKey = 'regular' | 'medium' | 'mega';
export type GameMode = 'friend' | 'computer';
export type Player = 0 | 1;

export interface BoardSizeSpec {
  w: number;
  count: number;
  maxArea: number;
  label: string;
}

export interface Region {
  id: number;
  owner: Player | null;
  count: number;
  cap: number;
  path: string;
  neighbors: number[];
  x: number;
  y: number;
}

export interface Board {
  w: number;
  h: number;
  regions: Region[];
  borderPath: string;
}

export const BOARD_SIZES: Record<LayoutKey, BoardSizeSpec> = {
  regular: { w: 5, count: 10, maxArea: 8, label: 'Small' },
  medium: { w: 8, count: 30, maxArea: 10, label: 'Med' },
  mega: { w: 12, count: 77, maxArea: 12, label: 'Huge' },
};

function slicePath(index: number, cap: number, radius = 0.3): string {
  const a = -Math.PI / 2 + (index * 2 * Math.PI) / cap;
  const b = a + (2 * Math.PI) / cap;
  return `M0 0 L${radius * Math.cos(a)} ${radius * Math.sin(a)} A${radius} ${radius} 0 0 1 ${radius * Math.cos(b)} ${radius * Math.sin(b)} Z`;
}

export const SLICE_PATHS: Record<number, readonly string[]> = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => {
    const cap = i + 2;
    return [cap, Array.from({ length: cap }, (_, s) => slicePath(s, cap, 0.3))];
  }),
);

function hasHole(cells: [number, number][]): boolean {
  const occupied = new Set(cells.map(([x, y]) => `${x},${y}`));
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const left = Math.min(...xs) - 1;
  const right = Math.max(...xs) + 1;
  const top = Math.min(...ys) - 1;
  const bottom = Math.max(...ys) + 1;
  const queue: [number, number][] = [[left, top]];
  const seen = new Set([`${left},${top}`]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      const key = `${nx},${ny}`;
      if (nx < left || nx > right || ny < top || ny > bottom || occupied.has(key) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen.size + occupied.size !== (right - left + 1) * (bottom - top + 1);
}

function shuffled<T>(values: T[], rng: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function generateIds(size: BoardSizeSpec, rng: () => number): number[] {
  const { w, count, maxArea } = size;
  if (!Number.isInteger(w) || w < 2) {
    throw new Error('Invalid board width.');
  }
  const h = w;

  for (let attempt = 0; attempt < 40; attempt++) {
    let ids = Array.from({ length: w * h }, (_, i) => i);
    let remaining = ids.length;

    while (remaining > count) {
      const groups = new Map<number, number[]>();
      const neighbors = new Map<number, Set<number>>();
      const addNeighbor = (a: number, b: number) => {
        let sa = neighbors.get(a);
        if (!sa) {
          sa = new Set();
          neighbors.set(a, sa);
        }
        sa.add(b);
      };

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        let list = groups.get(id);
        if (!list) {
          list = [];
          groups.set(id, list);
        }
        list.push(i);
        if (!neighbors.has(id)) neighbors.set(id, new Set());

        const x = i % w;
        const y = Math.floor(i / w);
        if (x + 1 < w && ids[i + 1] !== id) {
          addNeighbor(id, ids[i + 1]);
          addNeighbor(ids[i + 1], id);
        }
        if (y + 1 < h && ids[i + w] !== id) {
          addNeighbor(id, ids[i + w]);
          addNeighbor(ids[i + w], id);
        }
      }

      const edges: [number, number][] = [];
      for (const [id, ns] of neighbors) {
        for (const other of ns) {
          if (id < other) edges.push([id, other]);
        }
      }

      let merged = false;
      for (const [a, b] of shuffled(edges, rng)) {
        const cells = [...groups.get(a)!, ...groups.get(b)!];
        if (cells.length > maxArea) continue;
        const affected = new Set([...neighbors.get(a)!, ...neighbors.get(b)!]);
        affected.delete(a);
        affected.delete(b);
        if (affected.size < 2 || affected.size > 9) continue;
        if (
          [...affected].some(
            (id) => neighbors.get(id)!.has(a) && neighbors.get(id)!.has(b) && neighbors.get(id)!.size <= 2,
          )
        ) {
          continue;
        }
        if (hasHole(cells.map((i) => [i % w, Math.floor(i / w)] as [number, number]))) continue;
        ids = ids.map((id) => (id === b ? a : id));
        remaining--;
        merged = true;
        break;
      }
      if (!merged) break;
    }

    if (remaining !== count) continue;
    const labels = new Map<number, number>();
    return ids.map((id) => {
      if (!labels.has(id)) labels.set(id, labels.size);
      return labels.get(id)!;
    });
  }

  throw new Error('Could not generate a valid board. Please try New game again.');
}

export function createBoard(size: BoardSizeSpec, rng: () => number = Math.random): Board {
  const ids = generateIds(size, rng);
  const w = size.w;
  const h = ids.length / w;
  const cellsByRegion: [number, number][][] = Array.from({ length: size.count }, () => []);
  const regions: Region[] = Array.from({ length: size.count }, (_, id) => ({
    id,
    owner: null,
    count: 0,
    cap: 0,
    path: '',
    neighbors: [],
    x: 0,
    y: 0,
  }));

  let borderPath = '';
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const r = regions[id];
    const x = i % w;
    const y = Math.floor(i / w);
    cellsByRegion[id].push([x, y]);
    r.path += `M${x} ${y}h1v1h-1Z`;

    if (x + 1 < w && ids[i + 1] !== id) {
      borderPath += `M${x + 1} ${y}v1`;
      const other = regions[ids[i + 1]];
      if (!r.neighbors.includes(other.id)) r.neighbors.push(other.id);
      if (!other.neighbors.includes(id)) other.neighbors.push(id);
    }
    if (y + 1 < h && ids[i + w] !== id) {
      borderPath += `M${x} ${y + 1}h1`;
      const other = regions[ids[i + w]];
      if (!r.neighbors.includes(other.id)) r.neighbors.push(other.id);
      if (!other.neighbors.includes(id)) other.neighbors.push(id);
    }
  }

  for (let id = 0; id < regions.length; id++) {
    const r = regions[id];
    const cells = cellsByRegion[id];
    r.cap = r.neighbors.length;
    const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c[1], 0) / cells.length;
    const cellSet = new Set(cells.map(([x, y]) => `${x},${y}`));
    const score = ([x, y]: [number, number]) =>
      (
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const
      ).filter(([a, b]) => cellSet.has(`${a},${b}`)).length *
        10 -
      Math.hypot(x - cx, y - cy);
    const anchor = cells.reduce((best, c) => (score(c) > score(best) ? c : best));
    r.x = anchor[0] + 0.5;
    r.y = anchor[1] + 0.5;
  }

  return { w, h, regions, borderPath };
}

export function ownsAll(state: Region[], player: Player): boolean {
  return state.every((r) => r.owner === player);
}

// A full pie is stable. It bursts only when count exceeds its number of neighbors.
function explodeRegion(state: Region[], id: number, player: Player) {
  const r = state[id];
  r.count -= r.cap;
  r.owner = player;
  for (const n of r.neighbors) {
    state[n].owner = player;
    state[n].count++;
  }
}

export function* playMove(state: Region[], id: number, player: Player): Generator<number> {
  const start = state[id];
  start.owner = player;
  start.count++;
  const queue = start.count > start.cap ? [id] : [];

  while (queue.length && !ownsAll(state, player)) {
    const index = queue.shift()!;
    const source = state[index];
    if (source.count <= source.cap) continue;
    explodeRegion(state, index, player);
    for (const n of source.neighbors) {
      if (state[n].count > state[n].cap) queue.push(n);
    }
    if (source.count > source.cap) queue.push(index);
    yield index;
  }
}

export function chooseComputerMove(regions: Region[]): number | null {
  const options = regions.filter((r) => r.owner === null || r.owner === 1);
  if (!options.length) return null;

  let bestId = options[0].id;
  let bestScore = -Infinity;

  for (const option of options) {
    const state = regions.map((r) => ({ ...r }));
    let iterations = 0;
    let valid = true;

    for (const _ of playMove(state, option.id, 1)) {
      if (++iterations > 20000) {
        valid = false;
        break;
      }
    }

    const score = valid
      ? state.reduce((sum, r) => sum + (r.owner === 1 ? 12 + r.count / r.cap : r.owner === 0 ? -12 : 0), 0) +
        Math.random() * 0.7
      : -Infinity;

    if (score > bestScore) {
      bestScore = score;
      bestId = option.id;
    }
  }

  return bestId;
}
