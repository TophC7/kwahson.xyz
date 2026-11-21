import { buildBazookaCow } from '../../lib/bazookaCow';
import { createModelCache, type StudioBuilder } from '../../lib/miniatures';

export type Animal = 'cow' | 'chicken' | 'sheep' | 'goat' | 'pig' | 'gunner';
export const POINTS: Record<Animal, number> = { cow: 1, chicken: 1, sheep: 1, goat: 2, pig: 3, gunner: 4 };

export function chooseAnimal(level: number): Animal {
  const r = Math.random();
  if (r < 0.23) return 'chicken';
  if (r < 0.42 && level >= 2) return 'sheep';
  if (r < 0.62 && level >= 2) return 'goat';
  if (r < 0.8 && level >= 3) return 'pig';
  return 'cow';
}

export function createHerdModels(studio: StudioBuilder) {
  // Custom miniature geometries belong to the studio; build each once, even across restarts.
  const miniature = createModelCache(studio);
  function animal(kind: Animal, special = false) {
    if (kind === 'cow') return studio.kit.makeCow({ special });
    if (kind === 'gunner') return buildBazookaCow(studio.kit, () => miniature('corn'), { special });
    return { mesh: miniature(kind), legs: undefined };
  }
  return { miniature, animal };
}
