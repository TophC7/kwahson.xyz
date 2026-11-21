import { createSfxEngine } from '../../lib/sfx';
import type { HitKind } from './physics';

export function createCornAudio() {
  const sfx = createSfxEngine('corn-shots-muted');

  return {
    unlock: sfx.unlock,
    isMuted: sfx.isMuted,
    setMuted: sfx.setMuted,
    destroy: sfx.destroy,

    playAimTick() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 920, endFreq: 760, type: 'sine', gain: 0.018, attack: 0.002, duration: 0.025 });
    },

    playFire() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 185, endFreq: 68, type: 'triangle', gain: 0.13, attack: 0.004, duration: 0.18 });
      sfx.noise({ freq: 1350, endFreq: 320, gain: 0.09, duration: 0.14 });
    },

    playRicochet(bounceIndex: number, kind: HitKind) {
      if (!sfx.live()) return;
      const mult = Math.pow(1.16, Math.max(0, bounceIndex - 1));
      if (kind === 'shield') {
        sfx.tone({ freq: 980 * mult, endFreq: 1320 * mult, type: 'triangle', gain: 0.085, attack: 0.003, duration: 0.14 });
        sfx.tone({ freq: 1470 * mult, endFreq: 1020 * mult, type: 'sine', gain: 0.05, attack: 0.004, duration: 0.16 });
        return;
      }
      if (kind === 'hay' || kind === 'slider') {
        sfx.tone({ freq: 260 * mult, endFreq: 165 * mult, type: 'sine', gain: 0.065, attack: 0.004, duration: 0.09 });
        sfx.noise({ freq: 720, endFreq: 260, gain: 0.035, duration: 0.06 });
        return;
      }
      if (kind === 'tractor' || kind === 'blade') {
        sfx.tone({ freq: 620 * mult, endFreq: 860 * mult, type: 'triangle', gain: 0.07, attack: 0.003, duration: 0.11 });
        return;
      }
      if (kind === 'crate' || kind === 'crates' || kind === 'stump') {
        sfx.tone({ freq: 340 * mult, endFreq: 210 * mult, type: 'triangle', gain: 0.07, attack: 0.003, duration: 0.085 });
        return;
      }
      // Boulder / wooden pasture fence border
      sfx.tone({ freq: 440 * mult, endFreq: 560 * mult, type: 'triangle', gain: 0.065, attack: 0.003, duration: 0.095 });
    },

    playTargetPop() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 480, endFreq: 820, type: 'sine', gain: 0.075, attack: 0.004, duration: 0.11 });
    },

    playPumpkinBoom() {
      if (!sfx.live()) return;
      sfx.noise({ freq: 920, endFreq: 140, gain: 0.16, duration: 0.24 });
      sfx.tone({ freq: 135, endFreq: 48, type: 'sawtooth', gain: 0.12, attack: 0.004, duration: 0.25 });
    },

    playRoomClear(underPar: boolean) {
      if (!sfx.live()) return;
      const notes = underPar ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
      notes.forEach((freq, i) => {
        sfx.tone({ freq, type: 'triangle', gain: 0.085, attack: 0.008, duration: 0.22, delay: i * 0.07 });
      });
    },

    playOutOfAmmo() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 293.66, endFreq: 220, type: 'triangle', gain: 0.08, attack: 0.01, duration: 0.2 });
      sfx.tone({ freq: 220, endFreq: 164.81, type: 'sine', gain: 0.08, attack: 0.01, duration: 0.26, delay: 0.14 });
    },
  };
}
