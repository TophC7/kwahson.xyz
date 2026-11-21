import type { MiniatureId } from '../../lib/miniatures';
import * as THREE from 'three';
import { BAZOOKA_MUZZLE_LOCAL, createSightBeams, SIGHT_GOLD, SIGHT_MINT, wrapCornShell } from '../../lib/bazookaCow';
import type { PastureAudio } from './audio';
import type { PastureKit } from '../../lib/pastureKit';

interface FieldEntity {
  mesh: THREE.Group;
  lift: number;
  aiming?: boolean;
  animal?: string;
  heading: number;
  scatter: number;
}

interface ThreatOptions {
  scene: THREE.Scene;
  kit: PastureKit;
  miniature(id: MiniatureId): THREE.Group;
  audio: PastureAudio;
  player: THREE.Vector3;
  /** UFO cruising height; corn shells fly at the hull, not its shadow. */
  hover: number;
  entities: readonly FieldEntity[];
  clamp: (v: number) => number;
  spawnGunner(): void;
  damage(amount: number, text: string): void;
  burst(position: THREE.Vector3, color: number): void;
  status(text: string): void;
}

const GROUND = 0.16;
const EDGE = 8;
const SPLASH = 1.55;
const GUNNER_RADIUS = 0.75;
const SHELL_SPEED = 11;
// Track the UFO, then hold a locked line long enough to read before the shell leaves.
const TRACK = 0.85, LOCK = 0.4;
const isGunner = (e: FieldEntity) => e.animal === 'gunner';

export function createThreats({ scene, kit, miniature, audio, player, hover, entities, clamp, spawnGunner, damage, burst, status }: ThreatOptions) {
  const root = new THREE.Group();
  scene.add(root);
  function group() {
    const g = new THREE.Group();
    root.add(g);
    return g;
  }
  const materials: THREE.MeshBasicMaterial[] = [];
  function ink(color: number, opacity = 1) {
    const m = new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: false });
    materials.push(m);
    return m;
  }
  function circle(parent: THREE.Group, radius: number, mat: THREE.Material) {
    const m = kit.part(parent, 'ring', 0, [radius, radius, 1], [0, GROUND, 0], mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  const gold = ink(SIGHT_GOLD);
  const orange = ink(0xb5401d);
  const mint = ink(SIGHT_MINT);
  const mortar = group();
  const pumpkin = miniature('pumpkin');
  mortar.add(pumpkin);
  const splash = kit.part(mortar, 'disc', 0, [SPLASH, SPLASH, 1], [0, GROUND - 0.01, 0], ink(0xf64b18, 0.27));
  splash.rotation.x = -Math.PI / 2;
  circle(mortar, SPLASH, orange);
  const countdown = circle(mortar, SPLASH, gold);
  countdown.position.y += 0.01;
  let mortarWait = 0, shotsLeft = 0, flight = 0, fromX = 0, fromZ = 0;
  function updateMortar(dt: number, level: number) {
    if (!mortar.visible) {
      mortarWait -= dt;
      if (mortarWait > 0) return;
      if (shotsLeft === 0) {
        shotsLeft = level >= 7 ? 2 : 1;
        mortar.position.set(player.x, 0, player.z);
      }
      shotsLeft--;
      mortar.visible = true;
      flight = 0;
      fromX = (mortar.position.x > 0 ? -EDGE : EDGE) - mortar.position.x;
      fromZ = Math.random() * 8 - 4 - mortar.position.z;
      status('Pumpkin incoming! Leave the orange circle.');
      audio.playMortarLaunch();
    }
    flight += dt;
    const t = Math.min(1, flight / 1.2);
    pumpkin.position.set(fromX * (1 - t), 0.2 + 16 * t * (1 - t), fromZ * (1 - t));
    pumpkin.rotation.z = t * Math.PI * 2;
    countdown.scale.setScalar(SPLASH * t);
    if (t < 1) return;
    mortar.visible = false;
    mortarWait = shotsLeft > 0 ? 0.65 : 0;
    audio.playMortarImpact();
    burst(mortar.position, 0xff8c2f);
    if (Math.hypot(player.x - mortar.position.x, player.z - mortar.position.z) <= SPLASH) damage(10, 'Pumpkin splat!');
  }

  const lane = group();
  const laneInk = ink(0xbb6b14, 0.24);
  kit.part(lane, 'box', 0, [2.1, 0.012, 16], [0, GROUND, 0], laneInk);
  for (const side of [-1, 1]) kit.part(lane, 'box', 0, [0.055, 0.015, 16], [side * 1.05, GROUND, 0], gold);
  const tractor = miniature('tractor');
  tractor.scale.setScalar(1.65);
  lane.add(tractor);
  let pass = 0, horizontal = false, sign = 1;
  function updateTractor(dt: number) {
    if (!lane.visible) {
      horizontal = Math.random() < 0.5;
      sign = Math.random() < 0.5 ? 1 : -1;
      lane.rotation.y = horizontal ? Math.PI / 2 : 0;
      lane.position.set(horizontal ? 0 : player.x, 0, horizontal ? player.z : 0);
      tractor.rotation.y = sign > 0 ? 0 : Math.PI;
      pass = -1.65;
      lane.visible = true;
      status('Tractor crossing! Watch for shifting debris.');
    }
    const prev = pass;
    pass += dt;
    if (prev < 0 && pass >= 0) audio.playTractorRumble();
    const along = sign * (-EDGE + Math.max(0, pass) * 6);
    tractor.position.z = along;
    if (pass < 0) {
      laneInk.opacity = 0.19 + 0.12 * Math.sin(pass * 10);
      return;
    }
    laneInk.opacity = 0.14;
    if (Math.abs(along) > EDGE) { lane.visible = false; return; }
    const x = lane.position.x + (horizontal ? along : 0);
    const z = lane.position.z + (horizontal ? 0 : along);
    for (const e of entities) {
      if (e.lift > 0) continue;
      const p = e.mesh.position;
      const cross = horizontal ? p.z - z : p.x - x;
      const ahead = horizontal ? p.x - x : p.z - z;
      if (e.animal) {
        if (Math.abs(cross) > 2 || Math.abs(ahead) > 1.65) continue;
        // At a field edge, send the herd back into the pasture.
        const edge = horizontal ? z : x;
        const away = Math.abs(edge) > 5.8 ? -Math.sign(edge) : cross >= 0 ? 1 : -1;
        e.heading = horizontal ? (away > 0 ? 0 : Math.PI) : away * Math.PI / 2;
        e.scatter = Math.max(e.scatter, 1.2);
      } else if (Math.abs(cross) < 1.05 && Math.abs(ahead) < 1.2) {
        if (horizontal) p.x = clamp(x + sign * 1.15);
        else p.z = clamp(z + sign * 1.15);
        e.heading = (horizontal ? Math.PI / 2 : 0) + (sign < 0 ? Math.PI : 0);
      }
    }
  }

  const swarm = group();
  const bee = miniature('bee');
  const bees = [bee, bee.clone(), bee.clone(), bee.clone()];
  for (const b of bees) { b.scale.setScalar(0.54); swarm.add(b); }
  circle(swarm, 0.85, gold);
  let age = 0, sting = 0, stings = 0, beeCount = 2;
  function updateSwarm(dt: number, level: number) {
    if (!swarm.visible) {
      swarm.visible = true;
      swarm.position.set(player.x > 0 ? -7 : 7, 0, Math.random() * 12 - 6);
      age = sting = stings = 0;
      beeCount = Math.min(4, 2 + Math.floor((level - 3) / 3));
      for (let i = 0; i < bees.length; i++) bees[i].visible = i < beeCount;
      audio.playBeeSwarm();
      status('Bees on the breeze! Outrun the swarm.');
    }
    age += dt;
    if (age >= 6) { swarm.visible = false; return; }
    const p = swarm.position;
    const dx = player.x - p.x, dz = player.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = dist > 0 ? Math.min(1, 3 * dt / dist) : 0;
    p.x += dx * step;
    p.z += dz * step;
    for (let i = 0; i < beeCount; i++) {
      const angle = age * 4 + i * 2 * Math.PI / beeCount;
      bees[i].position.set(0.46 * Math.cos(angle), 2.45 + 0.24 * Math.sin(angle * 1.8), 0.46 * Math.sin(angle));
      bees[i].rotation.y = Math.atan2(dx, dz) + 0.3 * Math.sin(angle);
    }
    sting -= dt;
    if (dist * (1 - step) <= 0.85 && sting <= 0) {
      sting = 2.8;
      stings++;
      audio.playBeeSting();
      burst(hit.set(player.x, 2.75, player.z), 0xffdd56);
      if (stings === 2) swarm.visible = false;
      damage(5, 'Bumble bump!');
    }
  }

  // The bazooka cow is a field unit, not a scheduled event: while it stands it keeps firing.
  const sight = group();
  const target = circle(sight, GUNNER_RADIUS, mint);
  const sightBeams = createSightBeams(kit, sight, 1, { opacity: 1, lockedOpacity: 1 });
  const shell = wrapCornShell(miniature('corn'));
  root.add(shell);
  const muzzle = new THREE.Vector3(), aimEnd = new THREE.Vector3(), velocity = new THREE.Vector3();
  const before = new THREE.Vector3(), ufo = new THREE.Vector3(), hit = new THREE.Vector3(), path = new THREE.Line3(before);
  let aim: FieldEntity | undefined, warned: FieldEntity | undefined;
  let spawnWait = 0, charge = 0, reload = 0;
  function cancelAim() {
    if (aim) aim.aiming = false;
    aim = undefined;
    sight.visible = false;
    sightBeams.hideFrom(0);
  }
  function updateShell(dt: number) {
    if (!shell.visible) return;
    before.copy(shell.position);
    shell.position.addScaledVector(velocity, dt);
    shell.rotateZ(dt * 14);
    // Swept test so a fast shell can't tunnel through the hull between frames.
    path.end.copy(shell.position);
    path.closestPointToPoint(ufo.set(player.x, hover, player.z), true, hit);
    if (hit.distanceTo(ufo) <= GUNNER_RADIUS) {
      shell.visible = false;
      burst(hit, 0xffdd53);
      damage(10, 'Creamed by corn!');
    } else if (Math.abs(shell.position.x) > EDGE + 2 || Math.abs(shell.position.z) > EDGE + 2 || shell.position.y > 7) {
      shell.visible = false;
    }
  }
  function updateGunner(dt: number, cow: FieldEntity | undefined, level: number) {
    updateShell(dt);
    if (!cow || cow.lift > 0) { cancelAim(); return; }
    if (!aim) {
      if ((reload -= dt) > 0) return;
      aim = cow;
      cow.aiming = true;
      charge = 0;
      sight.visible = true;
      if (warned !== cow) status('Bazooka cow! Sidestep when its aim line turns gold.');
      warned = cow;
      audio.playCornAim();
    }
    charge += dt;
    if (charge < TRACK) aimEnd.set(player.x, hover, player.z);
    const p = cow.mesh.position;
    cow.heading = cow.mesh.rotation.y = Math.atan2(aimEnd.x - p.x, aimEnd.z - p.z);
    cow.mesh.updateMatrixWorld();
    cow.mesh.localToWorld(muzzle.set(...BAZOOKA_MUZZLE_LOCAL));
    const locked = charge >= TRACK;
    const pulse = locked ? 0.2 + 0.05 * Math.sin(charge * 60) : 0.1;
    sightBeams.setSegment(0, muzzle, aimEnd, pulse, locked);
    target.position.set(aimEnd.x, GROUND, aimEnd.z);
    target.material = locked ? gold : mint;
    if (charge < TRACK + LOCK) return;
    cancelAim();
    shell.visible = true;
    shell.position.copy(muzzle);
    velocity.copy(aimEnd).sub(muzzle).setLength(SHELL_SPEED);
    shell.lookAt(aimEnd);
    audio.playCornLaunch();
    reload = Math.max(1.4, 2.6 - 0.15 * (level - 5));
  }

  // Timers run from unlock (first) or event completion (cooldown), even while another event plays.
  const events = [
    { kind: 'mortar', unlock: 2, first: 8, cooldown: 20, floor: 10 },
    { kind: 'swarm', unlock: 3, first: 12, cooldown: 24, floor: 12 },
    { kind: 'tractor', unlock: 4, first: 16, cooldown: 22, floor: 11 },
  ] as const;
  const due = new Float64Array(events.length);
  let active = -1, last = -1, quiet = 0;

  function reset() {
    cancelAim();
    mortar.visible = lane.visible = swarm.visible = shell.visible = false;
    mortarWait = shotsLeft = 0;
    spawnWait = 4;
    reload = 1.5;
    active = last = -1;
    quiet = 0;
    for (let i = 0; i < events.length; i++) due[i] = events[i].first;
  }
  reset();
  return {
    update(dt: number, level: number) {
      if (dt <= 0) return;
      const cow = level >= 5 ? entities.find(isGunner) : undefined;
      if (level >= 5) {
        if (cow) spawnWait = 10;
        else if ((spawnWait -= dt) <= 0) { spawnGunner(); spawnWait = 4; }
      }
      updateGunner(dt, cow, level);
      for (let i = 0; i < events.length; i++) {
        if (level >= events[i].unlock) due[i] = Math.max(0, due[i] - dt);
      }
      if (active === -1) {
        quiet = Math.max(0, quiet - dt);
        if (quiet > 0) return;
        // Round-robin among ready events: a busy field can't starve an older unlock.
        for (let step = 1; step <= events.length; step++) {
          const i = (last + step) % events.length;
          const event = events[i];
          if (level < event.unlock || due[i] > 0) continue;
          active = i;
          break;
        }
        if (active === -1) return;
      }
      const event = events[active];
      switch (event.kind) {
        case 'mortar':
          updateMortar(dt, level);
          if (mortar.visible || shotsLeft > 0) return;
          break;
        case 'swarm':
          updateSwarm(dt, level);
          if (swarm.visible) return;
          break;
        case 'tractor':
          updateTractor(dt);
          if (lane.visible) return;
          break;
      }
      due[active] = Math.max(event.floor, event.cooldown - 0.75 * (level - event.unlock));
      quiet = Math.max(2.5, 6 - 0.25 * (level - 2));
      last = active;
      active = -1;
    },
    reset,
    dispose() {
      cancelAim();
      sightBeams.dispose();
      root.removeFromParent();
      // The caller owns the shared kit geometry and studio-tracked miniature resources.
      for (const m of materials) m.dispose();
    },
  };
}
