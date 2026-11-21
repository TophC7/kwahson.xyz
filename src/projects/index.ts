import type { Component } from 'svelte';
import BammiPreview from './bammi/Preview.svelte';
import CornShotsPreview from './corn-shots/Preview.svelte';
import MoojongPreview from './moojong/Preview.svelte';
import PasturePatrolPreview from './pasture-patrol/Preview.svelte';
import PastureTacticsPreview from './pasture-tactics/Preview.svelte';
import UdderHavocPreview from './udder-havoc/Preview.svelte';

export interface ProjectEntry {
  slug: string;
  title: string;
  description: string;
  category: 'game' | 'tool' | '3d' | 'experiment';
  tags: string[];
  year: number;
  preview: Component;
  load: () => Promise<{ default: Component }>;
}

export const projects: ProjectEntry[] = [
  {
    slug: 'udder-havoc',
    title: 'Udder Havoc',
    description:
      'Endless recoil-skating pasture shooter: surf kickback from your corn bazooka, dodge saucer beams, and stack chaotic farm powerups.',
    category: 'game',
    tags: ['Three.js', 'Arena', 'Web Audio'],
    year: 2026,
    preview: UdderHavocPreview,
    load: () => import('./udder-havoc/UdderHavoc.svelte'),
  },
  {
    slug: 'corn-shots',
    title: 'Corn Shots',
    description:
      'Seeded ricochet trick-shot puzzle shooter: bank explosive corn off hay bales and tractors behind shielded aliens to beat Par.',
    category: 'game',
    tags: ['Three.js', 'Ricochet', 'Puzzle'],
    year: 2026,
    preview: CornShotsPreview,
    load: () => import('./corn-shots/CornShots.svelte'),
  },
  {
    slug: 'pasture-tactics',
    title: 'Pasture Tactics',
    description:
      'A seeded turn-based skirmish on one board: a small herd with signature moves and shared items against telegraphing alien visitors.',
    category: 'game',
    tags: ['Three.js', 'Tactics', 'Web Audio'],
    year: 2026,
    preview: PastureTacticsPreview,
    load: () => import('./pasture-tactics/PastureTactics.svelte'),
  },
  {
    slug: 'moojong',
    title: 'Moojong',
    description:
      'A 3D Pasture Patrol Mahjong Solitaire board with 42 low-poly meadow miniatures, guaranteed-solvable procedural stacks, and three difficulty tiers.',
    category: 'game',
    tags: ['Three.js', 'Mahjong', 'Web Audio'],
    year: 2026,
    preview: MoojongPreview,
    load: () => import('./moojong/Moojong.svelte'),
  },
  {
    slug: 'pasture-patrol',
    title: 'Pasture Patrol',
    description:
      'Steer a hovering saucer over an isometric meadow, abduct wandering cows, snag healer cows, and keep hazards out of your tractor beam.',
    category: 'game',
    tags: ['Three.js', 'Web Audio', '3D'],
    year: 2026,
    preview: PasturePatrolPreview,
    load: () => import('./pasture-patrol/PasturePatrol.svelte'),
  },
  {
    slug: 'bammi',
    title: 'Bammi',
    description:
      'Claim irregular territories and fill neighbor-counted pies until they burst into chain reactions, solo against AI or pass-and-play.',
    category: 'game',
    tags: ['Strategy', 'SVG', 'AI'],
    year: 2026,
    preview: BammiPreview,
    load: () => import('./bammi/Bammi.svelte'),
  },
];
