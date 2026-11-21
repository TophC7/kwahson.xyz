import * as THREE from 'three';
import type { CowLeg, PastureKit } from './pastureKit';

export const BAZOOKA_CORN_POS: [number, number, number] = [0.36, 1.04, -0.6];
export const BAZOOKA_MUZZLE_LOCAL: [number, number, number] = [0.36, 1.04, 0.42];

export const SIGHT_MINT = 0xb6ffdb;
export const SIGHT_GOLD = 0xffe469;

/** Mount a corn-cob miniature straight along the cow's right shoulder, clear of the ear. */
export function attachBazooka(cow: THREE.Group, corn: THREE.Object3D, _kit?: PastureKit): THREE.Group {
  corn.rotation.set(Math.PI / 2, 0, 0);
  corn.position.set(...BAZOOKA_CORN_POS);
  cow.add(corn);
  return cow;
}

export function buildBazookaCow(
  kit: PastureKit,
  makeCorn: () => THREE.Object3D,
  options?: { special?: boolean },
): { mesh: THREE.Group; legs: CowLeg[] } {
  const model = kit.makeCow(options);
  attachBazooka(model.mesh, makeCorn(), kit);
  return model;
}

/** Wrap a miniature corn model so local +Z is point-first flight direction. */
export function wrapCornShell(corn: THREE.Object3D, scale = 0.9): THREE.Group {
  const pivot = new THREE.Group();
  corn.scale.setScalar(scale);
  corn.rotation.set(Math.PI / 2, 0, 0);
  pivot.add(corn);
  return pivot;
}

export interface SightBeams {
  setSegment(index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number, locked: boolean): void;
  hideFrom(startIndex: number): void;
  dispose(): void;
}

/** Pooled mint/gold laser beam segments shared across bazooka sightlines. */
export function createSightBeams(kit: PastureKit, parent: THREE.Object3D, maxSegments: number): SightBeams {
  const mintMat = new THREE.MeshBasicMaterial({ color: SIGHT_MINT, transparent: true, opacity: 0.85, depthWrite: false });
  const goldMat = new THREE.MeshBasicMaterial({ color: SIGHT_GOLD, transparent: true, opacity: 0.95, depthWrite: false });
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < maxSegments; i++) {
    const seg = kit.part(parent, 'box', 0, [1, 1, 1], [0, 0, 0], mintMat);
    seg.visible = false;
    segments.push(seg);
  }

  function setSegment(index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number, locked: boolean) {
    const seg = segments[index];
    if (!seg) return;
    const len = from.distanceTo(to);
    if (len < 0.001) {
      seg.visible = false;
      return;
    }
    seg.visible = true;
    seg.material = locked ? goldMat : mintMat;
    seg.position.copy(from).lerp(to, 0.5);
    seg.scale.set(thickness, thickness, len);
    seg.lookAt(to);
  }

  function hideFrom(startIndex: number) {
    for (let i = startIndex; i < segments.length; i++) segments[i].visible = false;
  }

  function dispose() {
    for (const seg of segments) parent.remove(seg);
    mintMat.dispose();
    goldMat.dispose();
  }

  return { setSegment, hideFrom, dispose };
}
