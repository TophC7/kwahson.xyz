import type { ProjectEntry } from '../../lib/types';
import Preview from './Preview.svelte';

export const bammi: ProjectEntry = {
  slug: 'bammi',
  title: 'Bammi',
  description:
    'Claim irregular territories and fill neighbor-counted pies until they burst into chain reactions, solo against AI or pass-and-play.',
  category: 'game',
  tags: ['Strategy', 'SVG', 'AI'],
  year: 2026,
  preview: Preview,
  load: () => import('./Bammi.svelte'),
};
