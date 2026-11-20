import type { ProjectEntry } from '../../lib/types';
import Preview from './Preview.svelte';

export const pasturePatrol: ProjectEntry = {
  slug: 'pasture-patrol',
  title: 'Pasture Patrol',
  description:
    'Steer a hovering saucer over an isometric meadow, abduct wandering cows, snag healer cows, and keep hazards out of your tractor beam.',
  category: 'game',
  tags: ['Three.js', 'Web Audio', '3D'],
  year: 2026,
  preview: Preview,
  load: () => import('./PasturePatrol.svelte'),
};
