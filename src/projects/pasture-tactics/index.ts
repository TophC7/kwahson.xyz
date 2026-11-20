import type { ProjectEntry } from '../../lib/types';
import Preview from './Preview.svelte';

export const pastureTactics: ProjectEntry = {
  slug: 'pasture-tactics',
  title: 'Pasture Tactics',
  description:
    'A seeded turn-based skirmish on one board: a small herd with signature moves and shared items against telegraphing alien visitors.',
  category: 'game',
  tags: ['Three.js', 'Tactics', 'Web Audio'],
  year: 2026,
  preview: Preview,
  load: () => import('./PastureTactics.svelte'),
};
