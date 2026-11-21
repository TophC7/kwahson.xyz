import * as THREE from 'three';
import type { CowLeg, PastureKit } from './pastureKit';

const BAZOOKA_CORN_POS: [number, number, number] = [0.36, 1.04, -0.6];
export const BAZOOKA_MUZZLE_LOCAL: [number, number, number] = [0.36, 1.04, 0.42];

export const SIGHT_MINT = 0xb6ffdb;
export const SIGHT_GOLD = 0xffe469;

/** Mount a corn-cob miniature straight along the cow's right shoulder, clear of the ear. */
function attachBazooka(cow: THREE.Group, corn: THREE.Object3D): THREE.Group {
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
  attachBazooka(model.mesh, makeCorn());
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

export interface SightBeamOptions {
  color?: number;
  opacity?: number;
  lockedColor?: number;
  lockedOpacity?: number;
}

export interface SightBeams {
  setSegment(index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number, locked?: boolean): void;
  hideFrom(startIndex: number): void;
  dispose(): void;
}

/** Pooled laser beam segments shared across bazooka and sniper sightlines. */
export function createSightBeams(
  kit: PastureKit,
  parent: THREE.Object3D,
  initialSegments: number,
  opts: SightBeamOptions = {},
): SightBeams {
  const baseMat = new THREE.MeshBasicMaterial({
    color: opts.color ?? SIGHT_MINT,
    transparent: true,
    opacity: opts.opacity ?? 0.85,
    depthWrite: false,
  });
  const lockedMat = new THREE.MeshBasicMaterial({
    color: opts.lockedColor ?? SIGHT_GOLD,
    transparent: true,
    opacity: opts.lockedOpacity ?? 0.95,
    depthWrite: false,
  });
  const segments: THREE.Mesh[] = [];

  function allocSegment(): THREE.Mesh {
    const seg = kit.part(parent, 'box', 0, [1, 1, 1], [0, 0, 0], baseMat);
    seg.visible = false;
    segments.push(seg);
    return seg;
  }

  for (let i = 0; i < initialSegments; i++) allocSegment();

  function setSegment(index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number, locked = false) {
    while (segments.length <= index) allocSegment();
    const seg = segments[index];
    const len = from.distanceTo(to);
    if (len < 0.001) {
      seg.visible = false;
      return;
    }
    seg.visible = true;
    seg.material = locked ? lockedMat : baseMat;
    seg.position.copy(from).lerp(to, 0.5);
    seg.scale.set(thickness, thickness, len);
    seg.lookAt(to);
  }

  function hideFrom(startIndex: number) {
    for (let i = startIndex; i < segments.length; i++) segments[i].visible = false;
  }

  function dispose() {
    for (const seg of segments) parent.remove(seg);
    segments.length = 0;
    baseMat.dispose();
    lockedMat.dispose();
  }

  return { setSegment, hideFrom, dispose };
}
