import { COLS, ROWS, ENTITY_KINDS, ITEMS, MAX_EGGS, OVERHEAL, POWER_PER_TURN, type Difficulty } from './data';
import { maxHp, tileIndex, tileOf, type Dir, type Entity, type GameState } from './rules';
import { createGame } from './scenario';

export const SAVE_VERSION = 5;
const STORAGE_KEY = 'pasture-tactics-save';
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const PHASES = ['player', 'won', 'lost'] as const;
const BOARD_SIZE = ROWS * COLS;
const ENTITY_BYTES = 6;

export function encodeSave(state: GameState): string {
  const { seed } = state;
  const bytes = [
    SAVE_VERSION, DIFFICULTIES.indexOf(state.difficulty), seed >>> 24, (seed >>> 16) & 255, (seed >>> 8) & 255, seed & 255,
    // ponytail: one byte caps the turn at 255; widen it in a new version for longer campaigns.
    Math.min(state.turn, 255), state.power, PHASES.indexOf(state.phase), state.nextId,
    state.items.length, ...state.items.map((i) => i.charges), state.traps.length, ...state.traps.map(tileIndex),
    state.entities.length,
  ];
  for (const e of state.entities) {
    const flags = +e.shield | (+e.moved << 1) | (+e.acted << 2) | (+e.placed << 3);
    bytes.push(e.id, ENTITY_KINDS.indexOf(e.kind), tileIndex(e), e.hp, flags, e.dir);
  }
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string | null {
  if (/[^\w-]/.test(code) || code.length % 4 === 1) return null;
  return atob(code.replaceAll('-', '+').replaceAll('_', '/'));
}

export function decodeSave(code: string): GameState | { restart: { seed: number; difficulty: Difficulty } } | null {
  // Six header bytes form a complete base64 block, recoverable even from a damaged payload.
  const header = fromBase64Url(code.slice(0, 8));
  if (header?.length !== 6) return null;
  const difficulty = DIFFICULTIES[header.charCodeAt(1)];
  if (!difficulty) return null;
  const seed = ((header.charCodeAt(2) << 24) | (header.charCodeAt(3) << 16) | (header.charCodeAt(4) << 8) | header.charCodeAt(5)) >>> 0;
  const restart = { restart: { seed, difficulty } };
  if (header.charCodeAt(0) !== SAVE_VERSION) return restart;
  // At most one entity per tile, four items, and MAX_EGGS traps.
  if (code.length > Math.ceil((13 + 4 + MAX_EGGS + ENTITY_BYTES * BOARD_SIZE) * 4 / 3)) return restart;
  const payload = fromBase64Url(code.slice(8));
  if (!payload || payload.length < 7) return restart;
  let pos = 0;
  const byte = () => payload.charCodeAt(pos++);
  const turn = byte(), power = byte(), phase = PHASES[byte()], nextId = byte(), itemCount = byte();
  if (!turn || power > POWER_PER_TURN || !phase) return restart;
  const state = createGame(seed, difficulty);
  if (itemCount !== state.items.length || pos + itemCount + 2 > payload.length) return restart;
  for (const item of state.items) {
    item.charges = byte();
    if (item.charges > ITEMS[item.kind].charges) return restart;
  }
  const trapCount = byte();
  if (trapCount > MAX_EGGS || pos + trapCount + 1 > payload.length) return restart;
  const trapTiles = new Set<number>();
  for (let i = 0; i < trapCount; i++) {
    const tile = byte();
    if (tile >= BOARD_SIZE || trapTiles.has(tile)) return restart;
    trapTiles.add(tile);
    state.traps.push(tileOf(tile));
  }
  const entityCount = byte();
  if (entityCount > BOARD_SIZE || pos + entityCount * ENTITY_BYTES !== payload.length) return restart;
  const ids = new Set<number>(), occupied = new Set<number>();
  state.entities.length = 0;
  for (let i = 0; i < entityCount; i++) {
    const id = byte(), kind = ENTITY_KINDS[byte()], tile = byte(), hp = byte(), flags = byte(), dir = byte();
    if (!id || !kind || tile >= BOARD_SIZE || id >= nextId || ids.has(id) || occupied.has(tile) || flags > 15 || dir > 3) return restart;
    ids.add(id);
    occupied.add(tile);
    const e: Entity = {
      id, kind, ...tileOf(tile), hp,
      shield: !!(flags & 1), moved: !!(flags & 2), acted: !!(flags & 4), placed: !!(flags & 8),
      dir: dir as Dir,
    };
    const max = maxHp(e);
    if (max === null ? hp !== 0 : hp < 1 || hp > max + OVERHEAL) return restart;
    state.entities.push(e);
  }
  state.turn = turn;
  state.power = power;
  state.phase = phase;
  state.nextId = nextId;
  return state;
}

export function readStoredCode(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}
