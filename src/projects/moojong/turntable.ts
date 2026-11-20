import * as THREE from 'three';
import { createPastureKit } from '../../lib/pastureKit';
import { buildMiniature, createStudioBuilder, createStudioStage, frameModel } from './miniatures';

const RENDER_SIZE = 512;
const SPIN_SPEED = 0.7; // radians per second

interface Target {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  holder: THREE.Group;
  visible: boolean;
  drawn: boolean;
}

export interface Turntable {
  /** Svelte attachment: draws the design's miniature into a 2D canvas, slowly spinning. */
  spin(designId: string): (canvas: HTMLCanvasElement) => () => void;
  destroy(): void;
}

/**
 * Live gallery miniatures from one shared WebGL renderer: each visible target is
 * rendered in turn and copied into its own 2D canvas, so any number of cards
 * share a single GL context and lay out like ordinary images.
 */
export function createTurntable(): Turntable {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER_SIZE, RENDER_SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const kit = createPastureKit();
  const studio = createStudioBuilder(kit);
  const stage = createStudioStage();
  // Bounding-sphere radius 1.05 vs frustum half-width 1.35 / 1.25 = 1.08: fills the frame, never clips mid-spin.
  stage.camera.zoom = 1.25;
  stage.camera.updateProjectionMatrix();
  const holders = new Map<string, THREE.Group>();
  const targets = new Map<Element, Target>();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = targets.get(entry.target);
      if (target) target.visible = entry.isIntersecting;
    }
  });

  function holderFor(designId: string): THREE.Group {
    let holder = holders.get(designId);
    if (!holder) {
      holder = frameModel(buildMiniature(studio, designId));
      holders.set(designId, holder);
    }
    return holder;
  }

  const clock = new THREE.Clock();
  let rafId = requestAnimationFrame(frame);

  function frame() {
    rafId = requestAnimationFrame(frame);
    const angle = reduceMotion ? 0 : clock.getElapsedTime() * SPIN_SPEED;
    for (const t of targets.values()) {
      if (!t.visible || (reduceMotion && t.drawn)) continue;
      t.holder.rotation.y = angle;
      stage.scene.add(t.holder);
      renderer.render(stage.scene, stage.camera);
      stage.scene.remove(t.holder);
      t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
      t.ctx.drawImage(renderer.domElement, 0, 0, t.canvas.width, t.canvas.height);
      t.drawn = true;
    }
  }

  return {
    spin: (designId) => (canvas) => {
      targets.set(canvas, {
        canvas,
        ctx: canvas.getContext('2d')!,
        holder: holderFor(designId),
        visible: false,
        drawn: false,
      });
      visibility.observe(canvas);
      return () => {
        visibility.unobserve(canvas);
        targets.delete(canvas);
      };
    },
    destroy() {
      cancelAnimationFrame(rafId);
      visibility.disconnect();
      targets.clear();
      studio.dispose();
      kit.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
