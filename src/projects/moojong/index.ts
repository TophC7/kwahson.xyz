import type { ProjectEntry } from '../../lib/types';
import Preview from './Preview.svelte';

export const moojong: ProjectEntry = {
  slug: 'moojong',
  title: 'Moojong',
  description:
    'A 3D Pasture Patrol Mahjong Solitaire board with 42 low-poly meadow miniatures, guaranteed-solvable procedural stacks, and three difficulty tiers.',
  category: 'game',
  tags: ['Three.js', 'Mahjong', 'Web Audio'],
  year: 2026,
  preview: Preview,
  load: () => import('./Moojong.svelte'),
};
