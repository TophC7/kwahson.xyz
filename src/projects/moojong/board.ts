import { mulberry32, pick, shuffle } from '../../lib/rng';
import { buildDeckPairs, TILE_DESIGN_MAP, TOTAL_TILES } from './deck';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyConfig {
  label: string;
  tagline: string;
  minInitialMoves: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: 'Easy',
    tagline: 'Wide 2-layer meadow, plenty of open edges',
    minInitialMoves: 7,
  },
  medium: {
    label: 'Medium',
    tagline: 'Balanced 4-layer classic pasture stacks',
    minInitialMoves: 5,
  },
  hard: {
    label: 'Hard',
    tagline: 'Tall 5-6 layer towers with deep locks',
    minInitialMoves: 3,
  },
};

/** Half-tile integer grid slot. Tile spans [gx, gx + 2) x [gy, gy + 2) on layer gz. */
export interface Slot {
  gx: number;
  gy: number;
  gz: number;
}

export interface BoardTile extends Slot {
  id: number;
  designId: string;
  removed: boolean;
}

export interface GeneratedBoard {
  difficulty: Difficulty;
  seed: number;
  portrait: boolean;
  layoutName: string;
  tiles: BoardTile[];
}

export type BlockReason = 'free' | 'above' | 'sides';

function slotKey(s: Slot): string {
  return `${s.gx},${s.gy},${s.gz}`;
}

function slotsOverlapXY(a: Slot, b: Slot): boolean {
  return Math.abs(a.gx - b.gx) < 2 && Math.abs(a.gy - b.gy) < 2;
}

export function getBlockReason(target: Slot, active: readonly Slot[]): BlockReason {
  let blockedLeft = false;
  let blockedRight = false;

  for (let i = 0; i < active.length; i++) {
    const other = active[i];
    if (other === target) continue;
    if (other.gz > target.gz && slotsOverlapXY(target, other)) {
      return 'above';
    }
    if (other.gz === target.gz && Math.abs(other.gy - target.gy) < 2) {
      if (other.gx === target.gx - 2) blockedLeft = true;
      else if (other.gx === target.gx + 2) blockedRight = true;
    }
  }

  return blockedLeft && blockedRight ? 'sides' : 'free';
}

export function isSlotFree(target: Slot, active: readonly Slot[]): boolean {
  return getBlockReason(target, active) === 'free';
}

export function getActiveTiles(tiles: readonly BoardTile[]): BoardTile[] {
  return tiles.filter((t) => !t.removed);
}

function getFreeTiles(tiles: readonly BoardTile[]): BoardTile[] {
  const active = getActiveTiles(tiles);
  return active.filter((t) => isSlotFree(t, active));
}

export function findValidMoves(tiles: readonly BoardTile[]): [BoardTile, BoardTile][] {
  const free = getFreeTiles(tiles);
  const moves: [BoardTile, BoardTile][] = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (canTilesMatch(free[i], free[j])) moves.push([free[i], free[j]]);
    }
  }
  return moves;
}

export function canTilesMatch(a: BoardTile, b: BoardTile): boolean {
  if (a.id === b.id || a.removed || b.removed) return false;
  const da = TILE_DESIGN_MAP.get(a.designId);
  const db = TILE_DESIGN_MAP.get(b.designId);
  return Boolean(da && db && da.matchKey === db.matchKey);
}

// ---------------------------------------------------------------------------
// Procedural symmetric layout generator (exact 144 slots, physically supported)
// ---------------------------------------------------------------------------

interface LayoutSpec {
  name: string;
  slots: Slot[];
}

function hasOverlapOnLayer(candidate: Slot, occupied: readonly Slot[]): boolean {
  for (const s of occupied) {
    if (s.gz === candidate.gz && slotsOverlapXY(s, candidate)) return true;
  }
  return false;
}

function isSupported(candidate: Slot, occupied: readonly Slot[]): boolean {
  if (candidate.gz === 0) return true;
  let supporters = 0;
  let aligned = false;
  for (const s of occupied) {
    if (s.gz === candidate.gz - 1 && slotsOverlapXY(s, candidate)) {
      supporters++;
      if (s.gx === candidate.gx && s.gy === candidate.gy) aligned = true;
    }
  }
  // Directly stacked on a tile below OR bridging at least 2 tiles below.
  return aligned || supporters >= 2;
}

function symmetricGroup(gx: number, gy: number, gz: number): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s: Slot = { gx: gx * sx, gy: gy * sy, gz };
      const k = slotKey(s);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
  }
  return out;
}

function canAddGroup(group: Slot[], occupied: readonly Slot[]): boolean {
  for (let i = 0; i < group.length; i++) {
    const a = group[i];
    if (hasOverlapOnLayer(a, occupied)) return false;
    if (!isSupported(a, occupied)) return false;
    for (let j = i + 1; j < group.length; j++) {
      if (slotsOverlapXY(a, group[j])) return false;
    }
  }
  return true;
}

interface ArchetypeParams {
  name: string;
  halfCols: number; // grid extent in tile units from center
  halfRows: number;
  /** Target slots per layer (soft guide; trimmed/padded to exact 144). */
  layerTargets: number[];
  /** Whether layer z uses even-parity (0) or odd-parity (1) coordinates. */
  parity: (gz: number) => [number, number];
  /** Structural mask returning true if (gx, gy, gz) belongs in this silhouette. */
  mask: (ax: number, ay: number, gz: number) => boolean;
}

const ARCHETYPES: Record<Difficulty, ArchetypeParams[]> = {
  easy: [
      {
        name: 'Clover Meadow',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [96, 48],
        parity: () => [1, 1],
        mask: (ax, ay, gz) => {
          if (gz === 0) return !(ax >= 9 && ay >= 7) && !(ax === 1 && ay === 1);
          return ax <= 7 && ay <= 5 && !(ax === 1 && ay === 1);
        },
      },
      {
        name: 'Open Courtyard',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [96, 48],
        parity: () => [1, 1],
        mask: (ax, ay, gz) => {
          if (gz === 0) return !(ax <= 1 && ay <= 1);
          return ax <= 7 && ay <= 5 && !(ax <= 1 && ay <= 1);
        },
      },
      {
        name: 'Twin Pastures',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [92, 52],
        parity: () => [1, 1],
        mask: (ax, ay, gz) => {
          if (gz === 0) return ax >= 1 && !(ax === 1 && ay >= 5);
          return ax >= 3 && ax <= 9 && ay <= 5;
        },
      },
      {
        name: 'Sunlit Orchard',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [100, 44],
        parity: (gz) => (gz === 0 ? [1, 1] : [0, 0]),
        mask: (ax, ay, gz) => {
          if (gz === 0) return ax + ay <= 14;
          return ax <= 6 && ay <= 4;
        },
      },
  ],
  medium: [
      {
        name: 'Pasture Turtle',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [72, 42, 22, 8],
        parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
        mask: (ax, ay, gz) => {
          if (gz === 0) return !(ax >= 9 && ay >= 5);
          if (gz === 1) return ax <= 6 && ay <= 4;
          if (gz === 2) return ax <= 5 && ay <= 3;
          return ax <= 2 && ay <= 2;
        },
      },
      {
        name: 'Terraced Barn',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [72, 42, 22, 8],
        parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
        mask: (ax, ay, gz) => {
          if (gz === 0) return ax <= 9 && ay <= 7 && !(ax === 9 && ay === 7);
          if (gz === 1) return ax <= 6 && ay <= 4;
          if (gz === 2) return ax <= 5 && ay <= 3;
          return ax <= 2 && ay <= 2;
        },
      },
      {
        name: 'Twin Haystacks',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [74, 40, 22, 8],
        parity: () => [1, 1],
        mask: (ax, ay, gz) => {
          if (gz === 0) return !(ax === 1 && ay >= 5) && !(ax >= 9 && ay >= 7);
          if (gz === 1) return ax >= 3 && ax <= 9 && ay <= 5;
          if (gz === 2) return ax >= 3 && ax <= 7 && ay <= 3;
          return ax >= 5 && ax <= 7 && ay <= 1;
        },
      },
      {
        name: 'Crop Ring',
        halfCols: 9,
        halfRows: 7,
        layerTargets: [74, 42, 20, 8],
        parity: () => [1, 1],
        mask: (ax, ay, gz) => {
          if (gz === 0) return !(ax <= 1 && ay <= 1) && !(ax >= 9 && ay >= 7);
          if (gz === 1) return !(ax <= 1 && ay <= 1) && ax <= 7 && ay <= 5;
          if (gz === 2) return (ax === 5 && ay <= 3) || (ay === 3 && ax <= 5);
          return ax === 5 && ay <= 1;
        },
      },
  ],
  // Hard: tall, compact 5-6 layer stacks with staggered locking bridges
  hard: [
    {
      name: 'Sky Ziggurat',
      halfCols: 9,
      halfRows: 6,
      layerTargets: [56, 36, 24, 16, 8, 4],
      parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
      mask: (ax, ay, gz) => {
        if (gz === 0) return ax <= 9 && ay <= 5;
        if (gz === 1) return ax <= 6 && ay <= 4;
        if (gz === 2) return ax <= 5 && ay <= 3;
        if (gz === 3) return ax <= 4 && ay <= 2;
        if (gz === 4) return ax <= 3 && ay <= 1;
        return ax <= 2 && ay === 0;
      },
    },
    {
      name: 'Silo Towers',
      halfCols: 9,
      halfRows: 6,
      layerTargets: [52, 36, 24, 16, 12, 4],
      parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
      mask: (ax, ay, gz) => {
        if (gz === 0) return ax <= 9 && ay <= 5;
        if (gz === 1) return ax <= 6 && ay <= 4;
        if (gz === 2) return ax >= 1 && ax <= 5 && ay <= 3;
        if (gz === 3) return ax >= 2 && ax <= 4 && ay <= 2;
        if (gz === 4) return ax >= 1 && ax <= 3 && ay <= 1;
        return ax <= 2 && ay === 0;
      },
    },
    {
      name: 'Watcher Citadel',
      halfCols: 9,
      halfRows: 6,
      layerTargets: [56, 36, 26, 18, 8],
      parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
      mask: (ax, ay, gz) => {
        if (gz === 0) return ax <= 9 && ay <= 5 && !(ax === 9 && ay === 5);
        if (gz === 1) return ax <= 6 && ay <= 4;
        if (gz === 2) return ax <= 5 && ay <= 3;
        if (gz === 3) return ax <= 4 && ay <= 2;
        return ax <= 3 && ay <= 1;
      },
    },
    {
      name: 'Stepped Beacon',
      halfCols: 9,
      halfRows: 6,
      layerTargets: [54, 34, 24, 16, 10, 6],
      parity: (gz) => (gz % 2 === 0 ? [1, 1] : [0, 0]),
      mask: (ax, ay, gz) => {
        if (gz === 0) return ax <= 9 && ay <= 5 && ax + ay <= 12;
        if (gz === 1) return ax <= 6 && ay <= 4;
        if (gz === 2) return ax <= 5 && ay <= 3;
        if (gz === 3) return ax <= 4 && ay <= 2;
        if (gz === 4) return ax <= 3 && ay <= 1;
        return ax <= 2 && ay <= 2;
      },
    },
  ],
};

// Turn the same silhouettes lengthwise, stretching the center by two rows.
// The generator still checks support and solves left/right locks in the final orientation.
function portraitArchetype(spec: ArchetypeParams): ArchetypeParams {
  return {
    ...spec,
    halfCols: spec.halfRows,
    halfRows: spec.halfCols + 2,
    parity: (gz) => {
      const [px, py] = spec.parity(gz);
      return [py, px];
    },
    mask: (ax, ay, gz) => spec.mask(Math.max(ay % 2, ay - 2), ax, gz),
  };
}

function generateSymmetricLayout(difficulty: Difficulty, rng: () => number, portrait: boolean): LayoutSpec {
  const archetype = pick(ARCHETYPES[difficulty], rng);
  const spec = portrait ? portraitArchetype(archetype) : archetype;
  const occupied: Slot[] = [];
  const groupsAdded: Slot[][] = [];

  // Small procedural jitter to make each round feel fresh while keeping symmetry
  const trimCorners = rng() < 0.55;
  const trimNotch = rng() < 0.45;

  function collectCandidates(gz: number, relaxMask: boolean): Slot[][] {
    const [px, py] = spec.parity(gz);
    const groups: Slot[][] = [];
    const maxX = relaxMask && !portrait ? spec.halfCols + 2 : spec.halfCols;
    const maxY = relaxMask && !portrait ? spec.halfRows + 2 : spec.halfRows;

    for (let ax = px; ax <= maxX; ax += 2) {
      for (let ay = py; ay <= maxY; ay += 2) {
        if (!relaxMask) {
          if (!spec.mask(ax, ay, gz)) continue;
          if (gz === 0 && trimCorners && ax >= spec.halfCols - 1 && ay >= spec.halfRows - 1) continue;
          if (gz === 0 && trimNotch && ax === px && ay >= spec.halfRows - 1) continue;
        }
        const g = symmetricGroup(ax, ay, gz);
        // Keep total parity strictly even by skipping single center tiles here
        // (center crowns can be added in vertical pairs if desired).
        if (g.length % 2 !== 0) continue;
        if (canAddGroup(g, occupied)) {
          groups.push(g);
        }
      }
    }
    return groups;
  }

  // Pass 1: fill each layer up to its target from bottom to top
  for (let gz = 0; gz < spec.layerTargets.length; gz++) {
    const target = spec.layerTargets[gz];

    let layerCount = 0;
    const candidates = collectCandidates(gz, false);

    // Prefer interior/central spots first so upper layers have rich support,
    // with a touch of randomness for fresh silhouettes every round.
    candidates.sort((a, b) => {
      const da = Math.abs(a[0].gx) * 0.7 + Math.abs(a[0].gy);
      const db = Math.abs(b[0].gx) * 0.7 + Math.abs(b[0].gy);
      return da - db + (rng() - 0.5) * 3.5;
    });

    for (const g of candidates) {
      if (occupied.length + g.length > TOTAL_TILES) continue;
      if (layerCount + g.length > target + 2) continue;
      if (!canAddGroup(g, occupied)) continue;
      occupied.push(...g);
      groupsAdded.push(g);
      layerCount += g.length;
    }
  }

  // Pass 2: if short of 144, add valid supported symmetric groups starting from preferred layers
  let safety = 0;
  while (occupied.length < TOTAL_TILES && safety++ < 40) {
    const need = TOTAL_TILES - occupied.length;
    let placed = false;

    for (const relax of [false, true]) {
      for (const gz of spec.layerTargets.keys()) {
        const candidates = shuffle(collectCandidates(gz, relax), rng).filter((g) => g.length <= need);
        // Prefer closer to center so we don't make stray detached islands
        candidates.sort((a, b) => {
          const da = Math.abs(a[0].gx) + Math.abs(a[0].gy);
          const db = Math.abs(b[0].gx) + Math.abs(b[0].gy);
          return da - db;
        });
        for (const g of candidates) {
          if (canAddGroup(g, occupied)) {
            occupied.push(...g);
            groupsAdded.push(g);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
    }

    // If we only need 2 tiles and only 4-tile groups fit, pop one top 4-tile group and retry with 2-tile groups
    if (!placed && need === 2 && groupsAdded.length > 0) {
      const idx = findRemovableGroupIndex(groupsAdded, occupied, 4);
      if (idx !== -1) {
        const removed = groupsAdded.splice(idx, 1)[0];
        const removeSet = new Set(removed.map(slotKey));
        for (let i = occupied.length - 1; i >= 0; i--) {
          if (removeSet.has(slotKey(occupied[i]))) occupied.splice(i, 1);
        }
      } else {
        break;
      }
    } else if (!placed) {
      break;
    }
  }

  return {
    name: spec.name,
    slots: occupied,
  };
}

function findRemovableGroupIndex(
  groups: Slot[][],
  occupied: readonly Slot[],
  size: number,
): number {
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g.length !== size) continue;
    const removeKeys = new Set(g.map(slotKey));
    const remaining = occupied.filter((s) => !removeKeys.has(slotKey(s)));
    // Ensure removing this group doesn't leave any upper tile unsupported
    const allStillSupported = remaining.every((s) => s.gz === 0 || isSupported(s, remaining));
    if (allStillSupported) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Guaranteed-solvable reverse-peel solver
// ---------------------------------------------------------------------------

/**
 * Peels all slots in pairs from the outside/top inward, producing a valid
 * removal order of slot index pairs. Returns null if the geometry deadlocks.
 */
function peelSlotPairs(
  slots: readonly Slot[],
  rng: () => number,
  attempts: number,
): [number, number][] | null {
  if (slots.length % 2 !== 0) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remainingIndices = slots.map((_, i) => i);
    const pairs: [number, number][] = [];
    let stuck = false;

    while (remainingIndices.length > 0) {
      const activeSlots = remainingIndices.map((idx) => slots[idx]);
      const freeLocal: number[] = [];
      for (let i = 0; i < activeSlots.length; i++) {
        if (isSlotFree(activeSlots[i], activeSlots)) {
          freeLocal.push(i);
        }
      }

      if (freeLocal.length < 2) {
        stuck = true;
        break;
      }

      // Weight selection gently toward higher-z tiles and outer tiles so buried
      // stacks unlock smoothly and the resulting puzzle has engaging depth.
      // Draws rng() per candidate, unlike lib/rng pickWeighted; swapping them changes every deal.
      const pickBiasedFree = (pool: number[]) => {
        const weights = pool.map((localIdx) => {
          const s = activeSlots[localIdx];
          return 1 + s.gz * 1.45 + rng() * 0.9;
        });
        let total = 0;
        for (const w of weights) total += w;
        let r = rng() * total;
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i];
          if (r <= 0) return pool[i];
        }
        return pool[pool.length - 1];
      };

      const firstLocal = pickBiasedFree(freeLocal);
      const restPool = freeLocal.filter((x) => x !== firstLocal);

      // Prefer a partner that isn't immediately adjacent to firstLocal when possible
      // so matching pairs spread visually across the board instead of sitting side-by-side.
      const firstSlot = activeSlots[firstLocal];
      const distantPool = restPool.filter((localIdx) => {
        const s = activeSlots[localIdx];
        return Math.hypot(s.gx - firstSlot.gx, s.gy - firstSlot.gy) >= 3.5;
      });
      const partnerPool = distantPool.length > 0 && rng() < 0.78 ? distantPool : restPool;
      const secondLocal = pickBiasedFree(partnerPool);

      const idA = remainingIndices[firstLocal];
      const idB = remainingIndices[secondLocal];
      pairs.push([idA, idB]);

      // Remove higher local index first so splicing preserves indices
      const hi = Math.max(firstLocal, secondLocal);
      const lo = Math.min(firstLocal, secondLocal);
      remainingIndices.splice(hi, 1);
      remainingIndices.splice(lo, 1);
    }

    if (!stuck) return pairs;
  }

  return null;
}

function dealTiles(slots: readonly Slot[], peeled: readonly [number, number][], rng: () => number): BoardTile[] {
  const deckPairs = buildDeckPairs(rng);
  const designIds = new Array<string>(slots.length);
  peeled.forEach(([a, b], i) => {
    designIds[a] = deckPairs[i][0].id;
    designIds[b] = deckPairs[i][1].id;
  });
  return slots.map((slot, id) => ({ id, gx: slot.gx, gy: slot.gy, gz: slot.gz, designId: designIds[id], removed: false }));
}

/**
 * Generates a difficulty-scaled Mahjong Solitaire board, solvable by construction:
 * tiles are dealt along a reverse-peel order.
 */
export function generateBoard(difficulty: Difficulty, seed: number, portrait: boolean): GeneratedBoard {
  const config = DIFFICULTIES[difficulty];
  const rng = mulberry32(seed);

  for (let attempt = 0; attempt < 36; attempt++) {
    const layout = generateSymmetricLayout(difficulty, rng, portrait);
    if (layout.slots.length !== TOTAL_TILES) continue;

    const peeled = peelSlotPairs(layout.slots, rng, 14);
    if (!peeled) continue;

    const tiles = dealTiles(layout.slots, peeled, rng);

    const initialMoves = findValidMoves(tiles).length;
    if (initialMoves < config.minInitialMoves && attempt < 24) continue;

    return {
      difficulty,
      seed,
      portrait,
      layoutName: layout.name,
      tiles,
    };
  }

  // Deterministic fallback: simple flat 12x12 grid is trivially 100% peelable
  const fallbackSlots: Slot[] = [];
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      fallbackSlots.push({
        gx: (col - 5.5) * 2,
        gy: (row - 5.5) * 2,
        gz: 0,
      });
    }
  }
  const peeled = peelSlotPairs(fallbackSlots, rng, 20)!;
  const tiles = dealTiles(fallbackSlots, peeled, rng);

  return {
    difficulty,
    seed,
    portrait,
    layoutName: 'Open Meadow',
    tiles,
  };
}

/**
 * Reshuffles ONLY the remaining tiles on the board while guaranteeing that the
 * resulting board is 100% solvable. If the remaining physical stack geometry is
 * itself unpeelable (e.g. two final tiles stacked directly vertically), it gently
 * settles upper tiles onto nearby ground slots so the player is never trapped.
 */
export function reshuffleRemaining(
  tiles: readonly BoardTile[],
  portrait: boolean,
): { tiles: BoardTile[]; flattened: boolean } {
  const next = tiles.map((t) => ({ ...t }));
  const active = next.filter((t) => !t.removed);
  if (active.length < 2) return { tiles: next, flattened: false };

  // Group remaining designs into valid matching pairs (exact same multiset of tiles!)
  const byMatchKey = new Map<string, string[]>();
  for (const t of active) {
    const design = TILE_DESIGN_MAP.get(t.designId);
    if (!design) continue;
    const bucket = byMatchKey.get(design.matchKey) ?? [];
    bucket.push(t.designId);
    byMatchKey.set(design.matchKey, bucket);
  }

  const remainingPairs: [string, string][] = [];
  for (const bucket of byMatchKey.values()) {
    shuffle(bucket, Math.random);
    for (let i = 0; i + 1 < bucket.length; i += 2) {
      remainingPairs.push([bucket[i], bucket[i + 1]]);
    }
  }
  shuffle(remainingPairs, Math.random);

  let peeled = peelSlotPairs(active, Math.random, 28);
  let flattened = false;

  if (!peeled) {
    // Rare unpeelable remaining stack geometry (e.g. 2 tiles stacked directly on top of each other).
    // Settle remaining tiles cleanly onto ground layer z = 0 in a compact centered grid.
    flattened = true;
    const cols = Math.ceil(Math.sqrt(active.length * (portrait ? 2 / 3 : 1)));
    const rows = Math.ceil(active.length / cols);
    active.forEach((tile, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      tile.gx = Math.round((col - (cols - 1) / 2) * 2);
      tile.gy = Math.round((row - (rows - 1) / 2) * 2);
      tile.gz = 0;
    });
    peeled = peelSlotPairs(active, Math.random, 28);
  }

  if (peeled) {
    for (let i = 0; i < peeled.length && i < remainingPairs.length; i++) {
      const [localA, localB] = peeled[i];
      active[localA].designId = remainingPairs[i][0];
      active[localB].designId = remainingPairs[i][1];
    }
  }

  return { tiles: next, flattened };
}
