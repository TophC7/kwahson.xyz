import * as THREE from 'three';

export const PASTURE_HEMI_SKY = 0xfff8e8;
export const PASTURE_HEMI_GROUND = 0x709675;
export const PASTURE_SUN_COLOR = 0xffedd0;

export type ObstacleKind = 'hay' | 'rock' | 'stump' | 'crate';
export type PartKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'rock' | 'disc' | 'ring';

export interface CowLeg {
  mesh: THREE.Mesh;
  phase: number;
}

export interface PastureKit {
  part(
    parent: THREE.Object3D,
    kind: PartKind,
    color: number,
    scale: [number, number, number],
    position?: [number, number, number],
    mat?: THREE.Material | null,
  ): THREE.Mesh;
  makeCow(options?: { special?: boolean }): { mesh: THREE.Group; legs: CowLeg[] };
  makeUfo(): THREE.Group;
  makeObstacle(kind: ObstacleKind): { mesh: THREE.Group; roller?: THREE.Group };
  dispose(): void;
}

export function createPastureKit(): PastureKit {
  const geometry: Record<PartKind, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 8),
    rock: new THREE.IcosahedronGeometry(1, 0),
    disc: new THREE.CircleGeometry(1, 32),
    ring: new THREE.RingGeometry(0.95, 1, 48),
  };

  const materials = new Map<number, THREE.MeshStandardMaterial>();

  function material(color: number): THREE.MeshStandardMaterial {
    let mat = materials.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
      materials.set(color, mat);
    }
    return mat;
  }

  function part(
    parent: THREE.Object3D,
    kind: PartKind,
    color: number,
    scale: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
    mat: THREE.Material | null = null,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry[kind], mat || material(color));
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  function makeCow({ special = false } = {}) {
    const cow = new THREE.Group();
    const legs: CowLeg[] = [];
    const white = special ? 0xffd8e5 : 0xfff8e7;
    const patch = special ? 0xe87fa8 : 0x39413c;
    part(cow, 'box', white, [0.64, 0.48, 0.96], [0, 0.57, 0]);
    part(cow, 'box', patch, [0.65, 0.22, 0.3], [0, 0.69, -0.19]);
    part(cow, 'box', patch, [0.12, 0.24, 0.3], [0.28, 0.48, 0.24]);
    if (special) {
      // Dark-pink '+' patch flush on top of the healer cow's back (keeping all original patches)
      const crossColor = 0xb8386d;
      part(cow, 'box', crossColor, [0.4, 0.028, 0.13], [0, 0.816, -0.08]);
      part(cow, 'box', crossColor, [0.13, 0.028, 0.4], [0, 0.816, -0.08]);
    }
    for (const x of [-0.22, 0.22]) {
      for (const z of [-0.3, 0.3]) {
        const leg = part(cow, 'box', white, [0.14, 0.3, 0.14], [x, 0.22, z]);
        legs.push({ mesh: leg, phase: x * z > 0 ? 0 : Math.PI });
        part(cow, 'box', patch, [0.15, 0.1, 0.15], [x, 0.1, z]);
      }
    }
    part(cow, 'box', white, [0.56, 0.46, 0.43], [0, 0.77, 0.55]);
    part(cow, 'box', 0xf1ada6, [0.57, 0.21, 0.2], [0, 0.63, 0.79]);
    for (const x of [-0.18, 0.18]) {
      part(cow, 'sphere', 0x293d37, [0.038, 0.047, 0.025], [x, 0.84, 0.772]);
      part(cow, 'sphere', 0xbb797a, [0.025, 0.025, 0.015], [x * 0.7, 0.66, 0.895]);
      part(cow, 'cone', 0xe5c493, [0.07, 0.2, 0.07], [x, 1.06, 0.54]);
      const ear = part(cow, 'box', patch, [0.24, 0.09, 0.14], [x * 2, 0.89, 0.53]);
      ear.rotation.z = x > 0 ? 0.25 : -0.25;
    }
    // Hangs from the top of the rump down to the tuft
    const tail = part(cow, 'cylinder', white, [0.025, 0.4, 0.025], [0, 0.55, -0.61]);
    tail.rotation.x = 0.65;
    part(cow, 'sphere', patch, [0.06, 0.09, 0.06], [0, 0.38, -0.72]);
    return { mesh: cow, legs };
  }

  function makeUfo() {
    const group = new THREE.Group();
    part(group, 'sphere', 0xc3e2d2, [1.05, 0.23, 1.05]);
    part(group, 'cylinder', 0x3d7167, [0.82, 0.13, 0.82], [0, -0.1, 0]);
    part(group, 'sphere', 0x5eaea4, [0.6, 0.43, 0.6], [0, 0.2, 0]);
    part(group, 'sphere', 0xc7f6dc, [0.18, 0.08, 0.1], [-0.22, 0.5, 0.25]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      part(group, 'sphere', 0xffdc76, [0.1, 0.07, 0.1], [Math.sin(a) * 0.85, 0.12, Math.cos(a) * 0.85]);
    }
    part(group, 'cylinder', 0x3d7167, [0.025, 0.3, 0.025], [0, 0.68, 0]);
    part(group, 'sphere', 0xffb870, [0.09, 0.09, 0.09], [0, 0.88, 0]);
    return group;
  }

  function makeObstacle(kind: ObstacleKind) {
    const group = new THREE.Group();
    let roller: THREE.Group | undefined;
    if (kind === 'hay') {
      roller = new THREE.Group();
      roller.position.y = 0.48;
      group.add(roller);
      const bale = part(roller, 'cylinder', 0xe6b853, [0.48, 0.82, 0.48]);
      bale.rotation.z = Math.PI / 2;
      for (const x of [-0.27, 0.27]) {
        const strap = part(roller, 'cylinder', 0xa77a38, [0.495, 0.06, 0.495], [x, 0, 0]);
        strap.rotation.z = Math.PI / 2;
      }
      for (const x of [-0.42, 0.42]) {
        const end = part(roller, 'cylinder', 0xffdc7f, [0.34, 0.02, 0.34], [x, 0, 0]);
        end.rotation.z = Math.PI / 2;
        part(roller, 'box', 0xc3933e, [0.025, 0.07, 0.58], [x * 1.03, 0, 0]);
      }
    } else if (kind === 'rock') {
      part(group, 'rock', 0x87949b, [0.56, 0.6, 0.5], [0, 0.4, 0]);
      part(group, 'rock', 0xa4adb0, [0.28, 0.3, 0.27], [0.35, 0.18, 0.15]);
    } else if (kind === 'stump') {
      part(group, 'cylinder', 0x966a49, [0.42, 0.62, 0.42], [0, 0.36, 0]);
      part(group, 'cylinder', 0xe4bf83, [0.36, 0.025, 0.36], [0, 0.68, 0]);
      part(group, 'cylinder', 0xb58958, [0.22, 0.028, 0.22], [0, 0.69, 0]);
      part(group, 'cylinder', 0xe4bf83, [0.13, 0.03, 0.13], [0, 0.7, 0]);
    } else {
      part(group, 'box', 0xc88c52, [0.74, 0.73, 0.74], [0, 0.4, 0]);
      for (const x of [-0.26, 0.26]) part(group, 'box', 0xf0cb85, [0.1, 0.78, 0.79], [x, 0.4, 0]);
      const brace = part(group, 'box', 0xf0cb85, [0.8, 0.1, 0.04], [0, 0.4, 0.39]);
      brace.rotation.z = Math.PI / 4;
    }
    return { mesh: group, roller };
  }

  function dispose() {
    for (const geo of Object.values(geometry)) geo.dispose();
    for (const mat of materials.values()) mat.dispose();
    materials.clear();
  }

  return { part, makeCow, makeUfo, makeObstacle, dispose };
}
