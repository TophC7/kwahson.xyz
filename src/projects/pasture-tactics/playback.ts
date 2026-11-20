import * as THREE from 'three';
import type { Bursts } from '../../lib/bursts';
import { createStudioBuilder } from '../../lib/miniatures';
import type { PartKind, PastureKit } from '../../lib/pastureKit';
import type { SfxName, TacticsAudio } from './audio';
import { COLS, ROWS, HEROES, ENEMIES, ITEMS, type EntityKind } from './data';
import { buildTacticsModel } from './models';
import type { Entity, GameEvent } from './rules';

export interface EntityVisual {
  kind: EntityKind;
  holder: THREE.Group;
  model: THREE.Group;
  baseScale: number;
  hover: number;
  pips: THREE.Sprite;
  bubble: THREE.Mesh | null;
  hit: THREE.Mesh;
}

export interface Stage {
  tileCenter(x: number, y: number): THREE.Vector3;
  visual(id: number): EntityVisual | undefined;
  addEntity(entity: Entity): EntityVisual;
  removeEntity(id: number): void;
  setEgg(x: number, y: number, on: boolean): void;
  floatText(pos: THREE.Vector3, text: string, color: string): void;
  redrawPips(id: number, hp: number): void;
  effects: THREE.Group;
  kit: PastureKit;
  bursts: Bursts;
  audio: TacticsAudio;
  setStatus(text: string): void;
}

export interface Playback {
  play(events: GameEvent[]): Promise<void>;
  readonly busy: boolean;
  timeScale: number;
  update(dt: number): void;
  cancel(): void;
}

type Frame = (t: number) => void;
type Beat = [duration: number, frame?: Frame];
interface Batch { events: GameEvent[]; resolve(): void; reject(error: unknown): void }
const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const UP = new THREE.Vector3(0, 1, 0);
const arc = (t: number) => 4 * t * (1 - t);
const inside = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
// Straight attacks drawn as one shape from the attacker to its target; a cone flares toward the target.
const RAYS: Partial<Record<string, { kind: PartKind; color: number; radius: number; opacity: number; time: number }>> = {
  Laser: { kind: 'box', color: 0xff8f5a, radius: 0.10, opacity: 1, time: 0.12 },
  Beam: { kind: 'cylinder', color: 0x68ccc4, radius: 0.19, opacity: 0.48, time: 0.30 },
  Chain: { kind: 'box', color: 0xffe066, radius: 0.07, opacity: 1, time: 0.18 },
  Jet: { kind: 'cylinder', color: 0x5aa7e6, radius: 0.14, opacity: 0.75, time: 0.24 },
  Flame: { kind: 'cone', color: 0xff7a33, radius: 0.34, opacity: 0.8, time: 0.30 },
};
const IMPACTS: Partial<Record<string, number>> = { Chain: 0xffe066, Jet: 0x8fd0ff, Flame: 0xff7a33 };

export function createPlayback(stage: Stage, reduceMotion: boolean): Playback {
  const tile = stage.tileCenter(0, 0).distanceTo(stage.tileCenter(1, 0));
  const queue: Batch[] = [];
  let current: Batch | undefined;
  let clock: { duration: number; elapsed: number; frame?: Frame; resolve(): void } | null = null;
  const cleanups: (() => void)[] = [];
  let props: THREE.Group | null = null;

  function clearEffects() {
    props?.removeFromParent();
    props = null;
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }
  function effectGroup() {
    if (!props) { props = new THREE.Group(); stage.effects.add(props); }
    return props;
  }
  function tint(color: number, opacity: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    cleanups.push(() => mat.dispose());
    return mat;
  }
  function part(kind: PartKind, color: number, size: [number, number, number], mat?: THREE.Material) {
    return stage.kit.part(effectGroup(), kind, color, size, undefined, mat);
  }
  // A model whose widest side spans `footprint` world units, centred with its feet on the returned holder's origin.
  function miniature(id: string, footprint: number) {
    const studio = createStudioBuilder(stage.kit);
    cleanups.push(() => studio.dispose());
    const model = buildTacticsModel(studio, id);
    model.rotation.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const scale = footprint / Math.max(size.x, size.z);
    model.scale.setScalar(scale);
    model.position.set(-(box.min.x + box.max.x) / 2 * scale, -box.min.y * scale, -(box.min.z + box.max.z) / 2 * scale);
    const holder = new THREE.Group(); holder.add(model); effectGroup().add(holder);
    return holder;
  }
  function travel(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, height: number): Frame {
    return t => {
      object.position.lerpVectors(from, to, t);
      object.position.y += height * arc(t);
    };
  }
  function column(pos: THREE.Vector3) {
    const mat = tint(0x73dbd4, 0.33);
    const beam = part('cylinder', 0x73dbd4, [0.52, 3.8, 0.52], mat);
    beam.position.copy(pos); beam.position.y += beam.scale.y / 2;
    return (t: number) => { mat.opacity = 0.34 * arc(t); };
  }

  // A generator expresses successive beats without scheduling future effects. Dropping it
  // on cancel prevents any late KO, tile mutation or sound from touching a restored scene.
  function* animate(e: GameEvent): Generator<Beat, void> {
    const v = 'id' in e ? stage.visual(e.id) : undefined;
    switch (e.t) {
      case 'move': {
        if (!v) return;
        const single = e.style === 'slide' || e.style === 'leap';
        for (let i = single ? e.path.length - 1 : 0; i >= 0 && i < e.path.length; i++) {
          const p = e.path[i], dest = stage.tileCenter(p.x, p.y), start = v.holder.position.clone();
          const fly = e.style === 'fly', walk = e.style === 'walk';
          if (fly || walk) stage.audio.play(fly ? 'fly' : 'step', i);
          const lift = tile * (walk ? 0.18 : fly ? 0.05 : e.style === 'leap' ? 0.9 : 0);
          yield [walk ? 0.14 : fly ? 0.12 : e.style === 'charge' ? 0.07 : e.style === 'leap' ? 0.32 : 0.16, t => {
            v.holder.position.lerpVectors(start, dest, e.style === 'slide' ? 1 - (1 - t) ** 2 : t);
            v.holder.position.y += lift * arc(t);
            if (walk) v.model.scale.y = v.baseScale * (1 - 0.1 * arc(Math.max(0, (t - 0.7) / 0.3)));
          }];
          if (e.style === 'charge') stage.bursts.spawn(dest, 0xd9c9a8, 4);
        }
        return;
      }
      case 'skill': {
        if (!v) return;
        stage.audio.play(e.name as SfxName);
        const at = v.holder.position.clone(), ground = stage.tileCenter(e.x, e.y);
        const start = at.clone(); start.y += v.hover + 0.65;
        const end = ground.clone(); end.y += 0.55;
        const heading = new THREE.Vector3(DX[e.dir], 0, DZ[e.dir]);
        const yaw = v.holder.rotation.y;
        v.holder.rotation.y = YAW[e.dir];
        let fx: Frame | undefined, fxTime = 0;
        const ray = RAYS[e.name];
        if (ray) {
          const mat = tint(ray.color, ray.opacity);
          const shape = part(ray.kind, ray.color, [ray.radius, start.distanceTo(end), ray.radius], mat);
          shape.position.lerpVectors(start, end, 0.5);
          const along = end.clone().sub(start).normalize();
          shape.quaternion.setFromUnitVectors(UP, ray.kind === 'cone' ? along.negate() : along);
          fx = t => { mat.opacity = ray.opacity * arc(t); };
          fxTime = ray.time;
        }
        switch (e.name) {
          case 'Sting': {
            const dart = part('cone', 0xf2c63b, [0.09, 0.38, 0.09]);
            dart.quaternion.setFromUnitVectors(UP, heading);
            fx = travel(dart, start, end, 0); fxTime = 0.15; break;
          }
          case 'Mortar': case 'Egg': {
            const mortar = e.name === 'Mortar';
            const shot = mortar ? part('sphere', 0xff8f5a, [0.14, 0.14, 0.14]) : miniature('egg', tile * 0.3);
            fx = travel(shot, start, ground, tile * (mortar ? 1.3 : 0.6));
            fxTime = mortar ? 0.45 : 0.25; break;
          }
          case 'Mend': {
            const cross = new THREE.Group(); effectGroup().add(cross);
            for (const size of [[0.47, 0.13, 0.13], [0.13, 0.47, 0.13]] as const) {
              stage.kit.part(cross, 'box', 0x92d877, [...size]);
            }
            cross.rotation.x = -0.6;
            fx = t => { cross.position.copy(end); cross.position.y += t * 0.7; cross.scale.setScalar(arc(t)); };
            fxTime = 0.28; break;
          }
          case 'Wool': {
            const flock = new THREE.Group(); effectGroup().add(flock);
            for (let i = 0; i < 5; i++) {
              const a = i * 2.4;
              stage.kit.part(flock, 'sphere', 0xfff8e7, [0.12, 0.12, 0.12], [0.16 * Math.cos(a), 0.12 * Math.sin(a), i * 0.05]);
            }
            fx = travel(flock, start, end, 0.4); fxTime = 0.25; break;
          }
        }
        const lungeTime = e.name === 'Slam' ? 0.25 : 0.22;
        const duration = Math.max(lungeTime, fxTime);
        yield [duration, t => {
          const progress = Math.min(1, t * duration / lungeTime);
          v.holder.position.copy(at).addScaledVector(heading, tile * 0.30 * arc(progress));
          if (e.name === 'Slam') v.holder.position.y += 0.55 * arc(progress);
          if (fx) fx(Math.min(1, t * duration / fxTime));
        }];
        v.holder.rotation.y = yaw;
        const impact = IMPACTS[e.name];
        if (impact !== undefined) {
          stage.bursts.spawn(ground, impact, 10);
          // Flame scorches both tiles in front of the attacker.
          if (e.name === 'Flame') stage.bursts.spawn(at.clone().addScaledVector(heading, tile), impact, 10);
        }
        if (e.name === 'Mortar' && inside(e.x, e.y)) {
          const mat = tint(0xff8f5a, 0.8);
          for (let i = -1; i < 4; i++) {
            const x = e.x + (i < 0 ? 0 : DX[i]), y = e.y + (i < 0 ? 0 : DZ[i]);
            if (!inside(x, y)) continue;
            const flash = part('box', 0xff8f5a, [tile * 0.95, 0.025, tile * 0.95], mat);
            flash.position.copy(stage.tileCenter(x, y)); flash.position.y += 0.06;
          }
          yield [0.14, t => { mat.opacity = 0.8 * (1 - t); }];
        } else if (e.name === 'Slam') {
          const mat = tint(0xffc18c, 0.85);
          const ring = part('ring', 0xffc18c, [1, 1, 1], mat);
          ring.position.copy(ground); ring.position.y += 0.05; ring.rotation.x = -Math.PI / 2;
          yield [0.14, t => { ring.scale.setScalar(0.12 + tile * 0.62 * t); mat.opacity = 1 - t; }];
        }
        return;
      }
      case 'item': {
        if (!v) return;
        const at = v.holder.position.clone(), target = stage.tileCenter(e.x, e.y);
        if (e.item === 'tractor') {
          // Full-size tractor drives from the user down the whole row or column and off the board.
          stage.audio.play('tractor');
          const dx = Math.sign(target.x - at.x), dz = Math.sign(target.z - at.z);
          let x = e.x, y = e.y, steps = 1;
          while (inside(x + dx, y + dz)) { x += dx; y += dz; steps++; }
          const tractor = miniature(ITEMS.tractor.model, tile * 0.95);
          tractor.rotation.y = Math.atan2(dx, dz);
          const from = at.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), tile * 0.5);
          const to = stage.tileCenter(x, y).addScaledVector(new THREE.Vector3(dx, 0, dz), tile * 1.2);
          let dusted = 0;
          yield [0.12 * (steps + 1.7), t => {
            tractor.position.lerpVectors(from, to, t);
            tractor.position.y += 0.03 * Math.abs(Math.sin(t * steps * Math.PI * 2));
            tractor.scale.setScalar(t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1);
            const crossed = Math.floor(t * (steps + 1.7));
            for (; dusted < Math.min(crossed, steps); dusted++) stage.bursts.spawn(stage.tileCenter(e.x + dx * dusted, e.y + dz * dusted), 0xd9c9a8, 6);
          }];
        } else if (e.item === 'pumpkin') {
          // Big lob, then a squash and an orange splash on the target tile.
          stage.audio.play('item');
          const pumpkin = miniature(ITEMS.pumpkin.model, tile * 0.55);
          at.y += 0.55;
          yield [0.42, travel(pumpkin, at, target, tile * 1.3)];
          stage.audio.play('splat');
          const burstAt = target.clone(); burstAt.y += 0.45;
          stage.bursts.spawn(burstAt, 0xf08a24, 30);
          stage.bursts.spawn(burstAt, 0xffc35a, 16);
          stage.bursts.spawn(burstAt, 0x6f9b4d, 6);
          const mat = tint(0xf08a24, 0.95), span = tile * 1.45;
          const splash = part('cylinder', 0xf08a24, [span, 0.02, span], mat);
          splash.position.copy(target); splash.position.y += 0.04;
          yield [0.45, t => {
            pumpkin.scale.set(1 + 0.8 * t, Math.max(0.05, 1 - 0.95 * Math.min(1, t * 3)), 1 + 0.8 * t);
            const grow = span * (0.25 + 0.75 * Math.min(1, t * 4));
            splash.scale.set(grow, 0.02, grow);
            mat.opacity = 0.95 * (1 - t * t);
          }];
        } else {
          stage.audio.play('item');
          const object = miniature(ITEMS[e.item].model, tile * 0.4);
          at.y += 0.55;
          yield [0.30, travel(object, at, target, tile * 0.6)];
        }
        return;
      }
      case 'damage': case 'heal': {
        if (!v) return;
        const hit = e.t === 'damage', at = v.holder.position.clone();
        stage.audio.play(hit ? 'hit' : 'heal');
        stage.redrawPips(e.id, e.hp);
        stage.floatText(at, `${hit ? '−' : '+'}${e.amount}`, hit ? '#d9614f' : '#9eb09a');
        if (hit) {
          stage.bursts.spawn(at, 0xd9614f, 6);
          // Never recolour a kit material: other figures share it.
          const red = tint(0xe95f4e, 1);
          const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
          v.model.traverse(child => {
            if (child instanceof THREE.Mesh) { materials.set(child, child.material); child.material = red; }
          });
          cleanups.push(() => { for (const [mesh, mat] of materials) mesh.material = mat; });
        }
        yield [0.18, t => {
          v.model.scale.setScalar(v.baseScale * (1 + 0.12 * arc(t)));
          if (hit && !reduceMotion) v.holder.position.x = at.x + Math.sin(t * 4 * Math.PI) * arc(t) * 0.06 * tile;
        }];
        return;
      }
      case 'shield': case 'block': {
        if (!v) return;
        const block = e.t === 'block';
        if (block) { stage.audio.play('block'); stage.floatText(v.holder.position.clone(), 'Block', '#eaf4f7'); }
        const mat = tint(0xeaf4f7, 0.25);
        const bubble = v.bubble ?? part('sphere', 0xeaf4f7, [0.77, 0.85, 0.77], mat);
        if (v.bubble) {
          const original = bubble.material;
          bubble.material = mat;
          cleanups.push(() => { bubble.material = original; });
        } else {
          bubble.position.copy(v.holder.position); bubble.position.y += v.hover + 0.60;
        }
        const size = bubble.scale.clone(); bubble.visible = true;
        yield [0.20, t => {
          bubble.scale.copy(size).multiplyScalar(block ? 1 + t * 0.32 : t);
          mat.opacity = block ? (1 - t) * 0.65 : 0.25;
          if (block && t === 1) { bubble.visible = false; bubble.scale.copy(size); }
        }];
        return;
      }
      case 'bump': {
        if (!v) return;
        stage.audio.play('bump');
        const at = v.holder.position.clone();
        yield [0.14, t => {
          const n = 0.1 * tile * arc(t);
          v.holder.position.set(at.x + DX[e.dir] * n, at.y, at.z + DZ[e.dir] * n);
        }];
        return;
      }
      case 'ko': {
        if (!v) return;
        const at = v.holder.position.clone(), yaw = v.holder.rotation.y;
        const hero = Object.hasOwn(HEROES, v.kind), enemy = Object.hasOwn(ENEMIES, v.kind);
        stage.audio.play(hero ? 'koHero' : enemy ? 'koEnemy' : 'crunch');
        v.pips.visible = false;
        if (hero) {
          const shine = column(at);
          yield [0.5, t => {
            shine(t); v.holder.rotation.y = yaw + t * Math.PI * 2; v.holder.position.y = at.y + tile * t;
            v.model.scale.setScalar(v.baseScale * (1 - t));
          }];
        } else {
          stage.bursts.spawn(at, enemy ? 0x67d964 : 0xc39360, 10);
          yield [enemy ? 0.2 : 0.18, t => {
            if (enemy) v.model.scale.setScalar(v.baseScale * (t < 0.2 ? 1 + t : 1.5 * (1 - t)));
            else v.model.scale.y = v.baseScale * (1 - t);
          }];
        }
        stage.removeEntity(e.id); return;
      }
      case 'split': {
        if (!v) return;
        const at = v.holder.position.clone();
        stage.removeEntity(e.id);
        stage.audio.play('split');
        stage.bursts.spawn(at, 0x9cd994, 10);
        const sprouts = e.into.map(m => stage.addEntity(m));
        yield [0.18, t => { for (const s of sprouts) s.model.scale.setScalar(s.baseScale * (0.4 + 0.6 * t)); }];
        return;
      }
      case 'spawn': {
        const landed = e.how === 'land', unit = stage.addEntity(e.entity);
        const at = stage.tileCenter(e.entity.x, e.entity.y);
        stage.audio.play(landed ? 'land' : 'place');
        if (landed) {
          const shine = column(at);
          yield [0.30, t => { unit.holder.visible = t === 1; shine(t); }];
        }
        yield [landed ? 0.20 : 0.25, t => {
          const drop = t < 0.75 ? 1 - (t / 0.75) ** 2 : 0.13 * arc((t - 0.75) / 0.25);
          unit.holder.position.y = at.y + 1.2 * tile * drop;
        }];
        return;
      }
      case 'egg': {
        const egg = miniature('egg', tile * 0.5);
        egg.position.copy(stage.tileCenter(e.x, e.y));
        if (!e.on) stage.setEgg(e.x, e.y, false);
        yield [0.12, t => { egg.scale.setScalar(e.on ? t : 1 - t); }];
        if (e.on) stage.setEgg(e.x, e.y, true);
        return;
      }
      case 'eggHit':
        stage.audio.play('eggHit'); stage.bursts.spawn(stage.tileCenter(e.x, e.y), 0xffe38a, 8); return;
      case 'phase': {
        const enemy = e.phase === 'enemy';
        stage.setStatus(enemy ? "Visitors' turn" : 'Your turn'); stage.audio.play(enemy ? 'enemyPhase' : 'playerPhase');
        yield [0.35]; return;
      }
      case 'end': stage.audio.play(e.result); yield [0.4]; return;
    }
  }

  function tween(duration: number, frame?: Frame): Promise<void> {
    frame?.(0);
    return new Promise(resolve => { clock = { duration: duration * (reduceMotion ? 0.35 : 1), elapsed: 0, frame, resolve }; });
  }
  async function run(batch: Batch) {
    current = batch;
    try {
      for (const event of batch.events) {
        for (const [duration, frame] of animate(event)) {
          await tween(duration, frame);
          if (current !== batch) return;
        }
        clearEffects();
      }
      batch.resolve();
    } catch (error) {
      batch.reject(error);
    } finally {
      if (current === batch) {
        clearEffects();
        current = undefined;
        const next = queue.shift();
        if (next) void run(next);
      }
    }
  }
  return {
    timeScale: 1,
    get busy() { return current !== undefined; },
    play(events) {
      return new Promise((resolve, reject) => {
        const batch = { events, resolve, reject };
        if (current) queue.push(batch); else void run(batch);
      });
    },
    update(dt) {
      if (!clock) return;
      clock.elapsed += dt * this.timeScale;
      const t = Math.min(1, clock.elapsed / clock.duration);
      clock.frame?.(t);
      if (t === 1) { clock.resolve(); clock = null; }
    },
    cancel() {
      if (clock) { clock.frame?.(1); clock.resolve(); clock = null; }
      clearEffects();
      current?.resolve(); current = undefined;
      for (const batch of queue) batch.resolve();
      queue.length = 0;
    },
  };
}
