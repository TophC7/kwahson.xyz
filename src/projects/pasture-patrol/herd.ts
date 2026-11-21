import * as THREE from 'three';
import { attachBazooka } from '../../lib/bazookaCow';
import { buildMiniature, type MiniatureId, type StudioBuilder } from '../../lib/miniatures';

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
  const templates = new Map<MiniatureId, THREE.Group>();
  function miniature(id: MiniatureId) {
    let template = templates.get(id);
    if (!template) {
      template = buildMiniature(studio, id);
      templates.set(id, template);
    }
    return template.clone();
  }
  function animal(kind: Animal, special = false) {
    if (kind !== 'cow' && kind !== 'gunner') return { mesh: miniature(kind), legs: undefined };
    const model = studio.kit.makeCow({ special });
    if (kind === 'gunner') attachBazooka(model.mesh, miniature('corn'), studio.kit);
    return model;
  }
  return { miniature, animal };
}
