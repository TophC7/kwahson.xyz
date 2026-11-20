import {
  MASTER_GAIN,
  audioContextClass,
  createMasterBus,
  createNoiseBuffer,
  loadMuted,
  saveMuted,
  scheduleTone,
  type ToneOptions,
} from '../../lib/sfx';

const STORAGE_KEY = 'moojong-muted';

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

export interface MoojongAudio {
  isMuted(): boolean;
  setMuted(next: boolean): boolean;
  unlock(): void;
  setHidden(next: boolean): void;
  playSelect(): void;
  playDeselect(): void;
  playBlocked(): void;
  playMatch(streak?: number, isBonus?: boolean): void;
  playHint(): void;
  playUndo(): void;
  playReshuffle(): void;
  playDeadEnd(): void;
  playWin(): void;
  playUiClick(bright?: boolean): void;
  destroy(): void;
}

export function createMoojongAudio(): MoojongAudio {
  const AudioCtx = audioContextClass();

  let muted = loadMuted(STORAGE_KEY);
  let hidden = false;
  let destroyed = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  function ensureGraph(): boolean {
    if (destroyed || !AudioCtx) return false;
    if (ctx) return true;
    try {
      ctx = new AudioCtx();
    } catch {
      return false;
    }

    master = createMasterBus(ctx, muted);
    noiseBuffer = createNoiseBuffer(ctx, 0.5);

    return true;
  }

  function unlock() {
    if (destroyed || muted || !ensureGraph() || !ctx) return;
    if (ctx.state === 'suspended' && !hidden) {
      ctx.resume().catch(() => {});
    }
  }

  function ready(): boolean {
    if (destroyed || muted || hidden) return false;
    if (!ensureGraph() || !ctx || !master) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  const tone = (opts: ToneOptions) => {
    if (ctx && master) scheduleTone(ctx, master, opts);
  };

  function clack(delay = 0, pitch = 1, volume = 0.12) {
    if (!ctx || !master || !noiseBuffer) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1650 * pitch, start);
    bp.Q.value = 3.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(volume, start + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.038);

    src.connect(bp);
    bp.connect(env);
    env.connect(master);
    src.start(start, Math.random() * 0.2);
    src.stop(start + 0.05);
  }

  return {
    isMuted: () => muted,
    setMuted(next) {
      muted = Boolean(next);
      saveMuted(STORAGE_KEY, muted);
      if (!muted) unlock();
      if (ctx && master) {
        master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.025);
      }
      return muted;
    },
    unlock,
    setHidden(next) {
      hidden = Boolean(next);
      if (!ctx || destroyed) return;
      if (hidden) ctx.suspend().catch(() => {});
      else if (!muted) ctx.resume().catch(() => {});
    },
    playSelect() {
      if (!ready()) return;
      clack(0, 1.05, 0.11);
      tone({ freq: 620, endFreq: 740, type: 'triangle', gain: 0.055, duration: 0.065 });
    },
    playDeselect() {
      if (!ready()) return;
      clack(0, 0.85, 0.07);
      tone({ freq: 480, endFreq: 390, type: 'sine', gain: 0.045, duration: 0.06 });
    },
    playBlocked() {
      if (!ready()) return;
      tone({ freq: 185, endFreq: 112, type: 'triangle', gain: 0.1, attack: 0.004, duration: 0.1 });
      clack(0, 0.45, 0.08);
    },
    playMatch(streak = 0, isBonus = false) {
      if (!ready()) return;
      // Tactile double ceramic clack
      clack(0, 1.0, 0.13);
      clack(0.045, 1.22, 0.12);

      const idx = Math.min(PENTATONIC.length - 2, streak % (PENTATONIC.length - 1));
      const root = PENTATONIC[idx];
      const top = PENTATONIC[Math.min(PENTATONIC.length - 1, idx + 1)];

      if (isBonus) {
        // Warm Pasture Patrol sparkle arpeggio for Seasons & Blooms
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          tone({ freq, type: 'sine', gain: 0.085, duration: 0.26, delay: 0.04 + i * 0.05 });
          tone({ freq: freq * 2, type: 'triangle', gain: 0.025, duration: 0.18, delay: 0.04 + i * 0.05 });
        });
      } else {
        tone({ freq: root, type: 'triangle', gain: 0.085, duration: 0.15, delay: 0.03 });
        tone({ freq: top, type: 'sine', gain: 0.085, duration: 0.22, delay: 0.085 });
      }
    },
    playHint() {
      if (!ready()) return;
      tone({ freq: 783.99, type: 'sine', gain: 0.07, duration: 0.18 });
      tone({ freq: 1046.5, type: 'sine', gain: 0.055, duration: 0.24, delay: 0.07 });
    },
    playUndo() {
      if (!ready()) return;
      clack(0, 0.9, 0.08);
      tone({ freq: 520, endFreq: 390, type: 'triangle', gain: 0.06, duration: 0.11 });
    },
    playReshuffle() {
      if (!ready()) return;
      for (let i = 0; i < 6; i++) {
        clack(i * 0.042, 0.85 + i * 0.07, 0.09);
      }
      tone({ freq: 440, endFreq: 660, type: 'sine', gain: 0.065, duration: 0.26, delay: 0.16 });
    },
    playDeadEnd() {
      if (!ready()) return;
      tone({ freq: 392, endFreq: 330, type: 'triangle', gain: 0.09, duration: 0.26 });
      tone({ freq: 311.13, endFreq: 246.94, type: 'sine', gain: 0.09, duration: 0.42, delay: 0.18 });
    },
    playWin() {
      if (!ready()) return;
      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      chord.forEach((freq, i) => {
        tone({ freq, type: 'triangle', gain: 0.09, duration: 0.34, delay: i * 0.085 });
        tone({ freq: freq * 0.5, type: 'sine', gain: 0.05, duration: 0.44, delay: i * 0.085 });
      });
    },
    playUiClick(bright = true) {
      if (!ready()) return;
      tone({
        freq: bright ? 660 : 480,
        endFreq: bright ? 740 : 420,
        type: 'sine',
        gain: 0.055,
        attack: 0.004,
        duration: 0.055,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}
