import { DIFFICULTIES, generateBoard, type BoardTile, type Difficulty, type GeneratedBoard } from './board';
import { TILE_DESIGNS } from './deck';

const SAVE_VERSION = 1;
const DIFF_KEYS = Object.keys(DIFFICULTIES) as Difficulty[];
const DESIGN_IDS: string[] = TILE_DESIGNS.map((d) => d.id);

export interface MoojongSave {
  board: GeneratedBoard;
  elapsedSec: number;
  hintsUsed: number;
  reshufflesUsed: number;
}

export function encodeMoojongSave(
  board: GeneratedBoard,
  elapsedSec: number,
  hintsUsed: number,
  reshufflesUsed: number,
): string {
  const diffIdx = Math.max(0, DIFF_KEYS.indexOf(board.difficulty));
  const clampedSec = Math.min(65535, Math.max(0, Math.floor(elapsedSec)));
  const bytes = [
    SAVE_VERSION,
    diffIdx,
    board.portrait ? 1 : 0,
    (board.seed >>> 24) & 255,
    (board.seed >>> 16) & 255,
    (board.seed >>> 8) & 255,
    board.seed & 255,
    (clampedSec >>> 8) & 255,
    clampedSec & 255,
    Math.min(255, hintsUsed),
    Math.min(255, reshufflesUsed),
  ];

  if (reshufflesUsed === 0) {
    const bitBytes = new Uint8Array(Math.ceil(board.tiles.length / 8));
    for (let i = 0; i < board.tiles.length; i++) {
      if (board.tiles[i].removed) bitBytes[i >> 3] |= 1 << (i & 7);
    }
    for (const b of bitBytes) bytes.push(b);
  } else {
    const active = board.tiles.filter((t) => !t.removed);
    bytes.push(active.length);
    for (const t of active) {
      const designIdx = DESIGN_IDS.indexOf(t.designId);
      bytes.push(
        t.id,
        Math.min(255, Math.max(0, t.gx + 20)),
        Math.min(255, Math.max(0, t.gy + 20)),
        Math.min(255, Math.max(0, t.gz)),
        Math.max(0, designIdx),
      );
    }
  }

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeMoojongSave(code: string): MoojongSave | null {
  if (!code || /[^\w-]/.test(code) || code.length % 4 === 1) return null;
  let raw: string;
  try {
    raw = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    return null;
  }
  if (raw.length < 11) return null;
  let pos = 0;
  const byte = () => raw.charCodeAt(pos++);
  const version = byte();
  if (version !== SAVE_VERSION) return null;
  const difficulty = DIFF_KEYS[byte()];
  if (!difficulty) return null;
  const portrait = byte() === 1;
  const seed = ((byte() << 24) | (byte() << 16) | (byte() << 8) | byte()) >>> 0;
  const elapsedSec = (byte() << 8) | byte();
  const hintsUsed = byte();
  const reshufflesUsed = byte();

  const board = generateBoard(difficulty, seed, portrait);
  if (reshufflesUsed === 0) {
    const expectedBitBytes = Math.ceil(board.tiles.length / 8);
    if (pos + expectedBitBytes !== raw.length) return null;
    for (let i = 0; i < board.tiles.length; i++) {
      const b = raw.charCodeAt(pos + (i >> 3));
      if ((b & (1 << (i & 7))) !== 0) board.tiles[i].removed = true;
    }
  } else {
    if (pos >= raw.length) return null;
    const activeCount = byte();
    if (pos + activeCount * 5 !== raw.length) return null;
    const byId = new Map<number, BoardTile>();
    for (const t of board.tiles) {
      t.removed = true;
      byId.set(t.id, t);
    }
    for (let i = 0; i < activeCount; i++) {
      const id = byte();
      const gx = byte() - 20;
      const gy = byte() - 20;
      const gz = byte();
      const designId = DESIGN_IDS[byte()];
      const tile = byId.get(id);
      if (!tile || !designId) return null;
      tile.removed = false;
      tile.gx = gx;
      tile.gy = gy;
      tile.gz = gz;
      tile.designId = designId;
    }
  }

  return { board, elapsedSec, hintsUsed, reshufflesUsed };
}
