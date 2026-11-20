import * as THREE from 'three';
import type { PastureKit } from './pastureKit';

export interface Bursts {
  spawn(pos: THREE.Vector3, color: number, count?: number): void;
  update(dt: number): void;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

export function createBursts(kit: PastureKit, parent: THREE.Group): Bursts {
  const particles: BurstParticle[] = [];

  function spawn(pos: THREE.Vector3, colorHex: number, count = 10) {
    for (let i = 0; i < count; i++) {
      const size = 0.08 + Math.random() * 0.07;
      const mesh = kit.part(parent, 'box', colorHex, [size, size, size], [pos.x, pos.y + 0.35, pos.z]);
      particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 3.4,
          1.8 + Math.random() * 2.4,
          (Math.random() - 0.5) * 3.4,
        ),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8,
      });
    }
  }

  function update(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        parent.remove(p.mesh);
        particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 7.2 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.001, t * 0.14));
    }
  }

  return { spawn, update };
}
