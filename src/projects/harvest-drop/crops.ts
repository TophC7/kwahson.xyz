import type { MiniatureId } from '../../lib/miniatures';

export type HarvestCropId = Extract<
  MiniatureId,
  | 'pea'
  | 'blueberry'
  | 'strawberry'
  | 'lemon'
  | 'garlic'
  | 'turnip'
  | 'apple'
  | 'carrot'
  | 'corn'
  | 'cauliflower'
  | 'watermelon'
  | 'pumpkin'
>;

type CropCollider =
  | { kind: 'circle'; radius: number }
  | { kind: 'polygon'; verts: readonly [number, number][] };

export interface CropDef {
  tier: number;
  id: HarvestCropId;
  name: string;
  colorHex: number;
  accentCss: string;
  score: number;
  droppable: boolean;
  dropWeight: number;
  /** Default spawn angle in radians (gives elongated crops a natural slight tilt). */
  spawnAngle: number;
  collider: CropCollider;
  /** Exact vertical collider range & symmetric half-extents for spawn clamping & mesh fitting. */
  minY: number;
  maxY: number;
  halfW: number;
  halfH: number;
}

function regularOvalVerts(rx: number, ry: number, sides: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides + Math.PI / sides;
    out.push([Number((Math.cos(a) * rx).toFixed(4)), Number((Math.sin(a) * ry).toFixed(4))]);
  }
  return out;
}

function scaledVerts(raw: readonly [number, number][], scale: number): [number, number][] {
  return raw.map(([x, y]) => [Number((x * scale).toFixed(4)), Number((y * scale).toFixed(4))]);
}

function extentsFromCollider(c: CropCollider): { minY: number; maxY: number; halfW: number; halfH: number } {
  if (c.kind === 'circle') {
    return { minY: -c.radius, maxY: c.radius, halfW: c.radius, halfH: c.radius };
  }
  let maxX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of c.verts) {
    maxX = Math.max(maxX, Math.abs(x));
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minY, maxY, halfW: maxX, halfH: Math.max(Math.abs(minY), Math.abs(maxY)) };
}

interface RawCropSpec {
  id: HarvestCropId;
  name: string;
  colorHex: number;
  accentCss: string;
  score: number;
  dropWeight: number;
  spawnAngle?: number;
  collider: CropCollider;
}

const RAW_CROPS: readonly RawCropSpec[] = [
  {
    id: 'pea',
    name: 'Garden Pea',
    colorHex: 0x74cf46,
    accentCss: '#74cf46',
    score: 10,
    dropWeight: 30,
    collider: { kind: 'circle', radius: 0.22 },
  },
  {
    id: 'blueberry',
    name: 'Blueberry',
    colorHex: 0x3b59b5,
    accentCss: '#5273db',
    score: 20,
    dropWeight: 26,
    collider: { kind: 'circle', radius: 0.29 },
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    colorHex: 0xd9383a,
    accentCss: '#e54d4f',
    score: 35,
    dropWeight: 21,
    spawnAngle: 0.12,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.25, 0.30],
          [-0.25, 0.30],
          [-0.36, 0.08],
          [-0.18, -0.24],
          [0.0, -0.38],
          [0.18, -0.24],
          [0.36, 0.08],
        ],
        1.08,
      ),
    },
  },
  {
    id: 'lemon',
    name: 'Lemon',
    colorHex: 0xf2d338,
    accentCss: '#f2d338',
    score: 50,
    dropWeight: 16,
    spawnAngle: 0.35,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.12, 0.44],
          [-0.12, 0.44],
          [-0.34, 0.18],
          [-0.34, -0.18],
          [-0.12, -0.44],
          [0.12, -0.44],
          [0.34, -0.18],
          [0.34, 0.18],
        ],
        1.06,
      ),
    },
  },
  {
    id: 'garlic',
    name: 'Garlic Bulb',
    colorHex: 0xf5efe0,
    accentCss: '#f2ead4',
    score: 70,
    dropWeight: 11,
    spawnAngle: -0.1,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.14, 0.36],
          [-0.14, 0.36],
          [-0.44, 0.02],
          [-0.36, -0.28],
          [0.0, -0.36],
          [0.36, -0.28],
          [0.44, 0.02],
        ],
        1.26,
      ),
    },
  },
  {
    id: 'turnip',
    name: 'Turnip',
    colorHex: 0x99499e,
    accentCss: '#b667bc',
    score: 100,
    dropWeight: 8,
    spawnAngle: 0.08,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.26, 0.36],
          [-0.26, 0.36],
          [-0.46, 0.10],
          [-0.32, -0.22],
          [0.0, -0.42],
          [0.32, -0.22],
          [0.46, 0.10],
        ],
        1.44,
      ),
    },
  },
  {
    id: 'apple',
    name: 'Orchard Apple',
    colorHex: 0xcf453e,
    accentCss: '#df554e',
    score: 145,
    dropWeight: 0,
    collider: { kind: 'circle', radius: 0.68 },
  },
  {
    id: 'carrot',
    name: 'Carrot',
    colorHex: 0xe8762c,
    accentCss: '#ee863d',
    score: 210,
    dropWeight: 0,
    spawnAngle: -0.24,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.26, 0.78],
          [-0.26, 0.78],
          [-0.36, 0.58],
          [-0.14, -0.68],
          [0.0, -0.84],
          [0.14, -0.68],
          [0.36, 0.58],
        ],
        1.60,
      ),
    },
  },
  {
    id: 'corn',
    name: 'Sweet Corn',
    colorHex: 0xf3c842,
    accentCss: '#f3c842',
    score: 300,
    dropWeight: 0,
    spawnAngle: -0.22,
    collider: {
      kind: 'polygon',
      verts: scaledVerts(
        [
          [0.22, 0.86],
          [-0.22, 0.86],
          [-0.42, 0.54],
          [-0.46, -0.34],
          [-0.28, -0.82],
          [0.28, -0.82],
          [0.46, -0.34],
          [0.42, 0.54],
        ],
        1.43,
      ),
    },
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower',
    colorHex: 0xf5f0df,
    accentCss: '#ebe3c7',
    score: 430,
    dropWeight: 0,
    collider: { kind: 'polygon', verts: regularOvalVerts(1.21, 1.10, 8) },
  },
  {
    id: 'watermelon',
    name: 'Watermelon',
    colorHex: 0x2d7a3c,
    accentCss: '#46a658',
    score: 620,
    dropWeight: 0,
    collider: { kind: 'polygon', verts: regularOvalVerts(1.43, 1.29, 8) },
  },
  {
    id: 'pumpkin',
    name: 'Prize Pumpkin',
    colorHex: 0xe07628,
    accentCss: '#eb8838',
    score: 900,
    dropWeight: 0,
    collider: { kind: 'polygon', verts: regularOvalVerts(1.65, 1.45, 8) },
  },
];

export const CROPS: readonly CropDef[] = RAW_CROPS.map((spec, idx) => {
  const { minY, maxY, halfW, halfH } = extentsFromCollider(spec.collider);
  return {
    tier: idx + 1,
    id: spec.id,
    name: spec.name,
    colorHex: spec.colorHex,
    accentCss: spec.accentCss,
    score: spec.score,
    droppable: spec.dropWeight > 0,
    dropWeight: spec.dropWeight,
    spawnAngle: spec.spawnAngle ?? 0,
    collider: spec.collider,
    minY,
    maxY,
    halfW,
    halfH,
  };
});

export const MAX_TIER = CROPS.length;
export const PUMPKIN_POOF_BONUS = 2000;

export function cropByTier(tier: number): CropDef {
  return CROPS[Math.max(0, Math.min(CROPS.length - 1, tier - 1))];
}
