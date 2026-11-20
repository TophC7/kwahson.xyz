import type { Component } from 'svelte';

export type ProjectCategory = 'game' | 'tool' | '3d' | 'experiment';

export interface ProjectEntry {
  slug: string;
  title: string;
  description: string;
  category: ProjectCategory;
  tags: string[];
  year: number;
  preview?: Component;
  load: () => Promise<{ default: Component }>;
}
