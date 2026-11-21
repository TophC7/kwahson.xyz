import { createSfxEngine } from '../../lib/sfx';
import type { PowerupKind } from './sim';

// Warm descending scale notes across the 11 merge result tiers (T2-T12)
const TIER_FREQS = [523.25, 493.88, 440, 392, 349.23, 329.63, 293.66, 261.63, 220, 196, 164.81];

// Cozy lo-fi Fmaj7 -> Dm7 -> Gm7 -> C9 groove (32 eighth-note steps at ~107 BPM)
const BGM_STEP_SEC = 0.28;
const BGM_BARS: ReadonlyArray<{ bass: number; chord: readonly number[] }> = [
  { bass: 87.31, chord: [174.61, 220.0, 261.63, 329.63] },  // Fmaj7
  { bass: 73.42, chord: [146.83, 174.61, 220.0, 261.63] },  // Dm7
  { bass: 98.0, chord: [196.0, 233.08, 293.66, 349.23] },   // Gm7
  { bass: 130.81, chord: [164.81, 233.08, 293.66, 392.0] }, // C9
];
const BGM_MELODY: readonly number[] = [
  523.25, 0, 440.0, 523.25, 0, 587.33, 523.25, 0,
  440.0, 0, 349.23, 440.0, 0, 523.25, 440.0, 0,
  587.33, 0, 466.16, 587.33, 0, 698.46, 587.33, 0,
  659.25, 0, 587.33, 523.25, 0, 440.0, 392.0, 0,
];

export function createHarvestAudio() {
  let ctx: AudioContext | null = null;
  let bgmBus: GainNode | null = null;
  let bgmTargetGain = 0.55;
  let musicAccum = 0;
  let musicStep = 0;

  const sfx = createSfxEngine('harvest-drop-muted', {
    onGraph(audioCtx, masterBus) {
      ctx = audioCtx;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1450;
      const bus = audioCtx.createGain();
      bus.gain.value = bgmTargetGain;
      bus.connect(filter);
      filter.connect(masterBus);
      bgmBus = bus;
    },
  });

  return {
    unlock: sfx.unlock,
    isMuted: sfx.isMuted,
    setMuted: sfx.setMuted,
    destroy: sfx.destroy,

    updateMusic(dt: number, paused: boolean, gameover: boolean) {
      const target = paused ? 0 : gameover ? 0.2 : 0.55;
      if (ctx && bgmBus && target !== bgmTargetGain) {
        bgmTargetGain = target;
        bgmBus.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      } else {
        bgmTargetGain = target;
      }

      if (paused || !sfx.live() || !bgmBus) return;
      musicAccum += dt;
      if (musicAccum < BGM_STEP_SEC) return;
      musicAccum -= BGM_STEP_SEC;

      const step = musicStep % 32;
      musicStep = (musicStep + 1) % 32;
      const bar = BGM_BARS[Math.floor(step / 8)];
      const beatInBar = step % 8;

      if (beatInBar === 0) {
        for (const freq of bar.chord) {
          sfx.tone({ freq, type: 'triangle', gain: 0.015, attack: 0.08, duration: 1.95 }, bgmBus);
        }
      }
      if (beatInBar === 0 || beatInBar === 3) {
        sfx.tone({ freq: bar.bass, type: 'sine', gain: 0.055, attack: 0.015, duration: 0.42 }, bgmBus);
      } else if (beatInBar === 2 || beatInBar === 6) {
        const arp = bar.chord[(step >> 1) % bar.chord.length];
        sfx.tone({ freq: arp, type: 'sine', gain: 0.018, attack: 0.01, duration: 0.22 }, bgmBus);
      }

      const lead = BGM_MELODY[step];
      if (lead > 0) {
        sfx.tone({ freq: lead, type: 'sine', gain: 0.032, attack: 0.008, duration: 0.34 }, bgmBus);
        sfx.tone({ freq: lead * 2, type: 'sine', gain: 0.007, attack: 0.008, duration: 0.2 }, bgmBus);
      }
    },

    playDrop(tier: number) {
      if (!sfx.ready()) return;
      const base = 340 - tier * 24;
      sfx.tone({ freq: base, endFreq: base * 0.55, type: 'sine', gain: 0.08, attack: 0.004, duration: 0.09 });
      sfx.noise({ freq: 850, endFreq: 340, gain: 0.025, duration: 0.04 });
    },

    playMerge(tier: number, combo: number) {
      if (!sfx.live()) return;
      const idx = Math.max(0, Math.min(TIER_FREQS.length - 1, tier - 2));
      const comboBoost = Math.pow(1.06, Math.min(8, Math.max(0, combo - 1)));
      const freq = TIER_FREQS[idx] * comboBoost;
      sfx.tone({ freq: freq * 0.85, endFreq: freq * 1.25, type: 'triangle', gain: 0.11, attack: 0.005, duration: 0.14 });
      sfx.tone({ freq: freq * 1.5, type: 'sine', gain: 0.055, attack: 0.008, duration: 0.18, delay: 0.03 });
    },

    playPumpkinPoof() {
      if (!sfx.live()) return;
      const notes = [392.0, 493.88, 587.33, 783.99, 987.77];
      notes.forEach((freq, i) => {
        sfx.tone({ freq, type: 'triangle', gain: 0.1, attack: 0.006, duration: 0.28, delay: i * 0.055 });
      });
      sfx.noise({ freq: 1400, endFreq: 380, gain: 0.08, duration: 0.22 });
    },

    playPowerupEarned() {
      if (!sfx.live()) return;
      [587.33, 739.99, 880].forEach((freq, i) => {
        sfx.tone({ freq, type: 'sine', gain: 0.075, attack: 0.006, duration: 0.16, delay: i * 0.065 });
      });
    },

    playCapUpgraded() {
      if (!sfx.live()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        sfx.tone({ freq, type: 'triangle', gain: 0.09, attack: 0.006, duration: 0.2, delay: i * 0.055 });
      });
    },

    playPineappleThrow() {
      if (!sfx.ready()) return;
      sfx.tone({ freq: 520, endFreq: 280, type: 'sine', gain: 0.065, attack: 0.005, duration: 0.24 });
    },

    playPowerupUsed(kind: PowerupKind) {
      if (!sfx.ready()) return;
      if (kind === 'pineapple') {
        sfx.noise({ freq: 950, endFreq: 110, gain: 0.22, duration: 0.28 });
        sfx.tone({ freq: 145, endFreq: 42, type: 'sawtooth', gain: 0.14, attack: 0.004, duration: 0.28 });
      } else if (kind === 'abduct') {
        sfx.tone({ freq: 620, endFreq: 980, type: 'sine', gain: 0.09, attack: 0.01, duration: 0.26 });
        sfx.tone({ freq: 440, endFreq: 760, type: 'triangle', gain: 0.06, attack: 0.01, duration: 0.24, delay: 0.05 });
      } else if (kind === 'shake') {
        sfx.noise({ freq: 420, endFreq: 180, gain: 0.13, duration: 0.22 });
        sfx.tone({ freq: 130, endFreq: 75, type: 'triangle', gain: 0.11, attack: 0.004, duration: 0.2 });
      } else if (kind === 'grow') {
        [440, 554.37, 659.25].forEach((freq, i) => {
          sfx.tone({ freq, type: 'triangle', gain: 0.085, attack: 0.006, duration: 0.15, delay: i * 0.045 });
        });
      } else {
        sfx.noise({ freq: 1600, endFreq: 520, gain: 0.085, duration: 0.22 });
        sfx.tone({ freq: 680, endFreq: 1020, type: 'sine', gain: 0.06, attack: 0.006, duration: 0.16 });
      }
    },

    playDangerTick(progress: number) {
      if (!sfx.live()) return;
      const freq = 520 + progress * 240;
      sfx.tone({ freq, type: 'sine', gain: 0.032, attack: 0.003, duration: 0.05 });
    },

    playGameOver() {
      if (!sfx.live()) return;
      [392, 349.23, 311.13, 261.63].forEach((freq, i) => {
        sfx.tone({ freq, type: 'triangle', gain: 0.085, attack: 0.01, duration: 0.24, delay: i * 0.1 });
      });
    },
  };
}
