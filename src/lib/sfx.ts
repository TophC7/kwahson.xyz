export const MASTER_GAIN = 0.85;

export function audioContextClass(): typeof AudioContext | undefined {
  // DOM typings omit Safari's legacy AudioContext constructor.
  const legacyWindow = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || legacyWindow.webkitAudioContext;
}

export function loadMuted(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(key: string, muted: boolean) {
  try {
    window.localStorage.setItem(key, muted ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

/** Master gain -> gentle compressor -> destination. */
export function createMasterBus(ctx: AudioContext, muted: boolean): GainNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return master;
}

export function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export interface ToneOptions {
  freq: number;
  endFreq?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  duration?: number;
  delay?: number;
  filterFreq?: number;
  filterEndFreq?: number;
}

export function scheduleTone(
  ctx: AudioContext,
  bus: AudioNode,
  {
    freq,
    endFreq = freq,
    type = 'sine',
    gain = 0.1,
    attack = 0.006,
    duration = 0.14,
    delay = 0,
    filterFreq,
    filterEndFreq,
  }: ToneOptions,
) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  }

  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(filterFreq, start);
    if (filterEndFreq && filterEndFreq !== filterFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEndFreq), start + duration);
    }
    osc.connect(filter);
    filter.connect(env);
  } else {
    osc.connect(env);
  }

  env.connect(bus);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

export interface SfxEngine {
  isMuted(): boolean;
  setMuted(next: boolean): boolean;
  unlock(): void;
  setHidden(next: boolean): void;
  /** True when a sound may be scheduled now; builds and resumes the graph. */
  ready(): boolean;
  tone(opts: ToneOptions): void;
  /** Band-passed noise tick: 3 ms attack, exponential decay over `duration`. */
  noise(opts: { freq: number; gain: number; duration?: number; q?: number; delay?: number }): void;
  destroy(): void;
}

export function createSfxEngine(storageKey: string): SfxEngine {
  const AudioCtx = audioContextClass();
  let muted = loadMuted(storageKey);
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
    noiseBuffer = createNoiseBuffer(ctx, 1);
    return true;
  }

  function unlock() {
    if (destroyed || muted || !ensureGraph() || !ctx) return;
    if (ctx.state === 'suspended' && !hidden) ctx.resume().catch(() => {});
  }

  return {
    isMuted: () => muted,
    setMuted(next) {
      muted = Boolean(next);
      saveMuted(storageKey, muted);
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
    ready() {
      if (destroyed || muted || hidden) return false;
      if (!ensureGraph() || !ctx || !master) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    },
    tone(opts) {
      if (ctx && master) scheduleTone(ctx, master, opts);
    },
    noise({ freq, gain, duration = 0.038, q = 3.2, delay = 0 }) {
      if (!ctx || !master || !noiseBuffer) return;
      const start = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq, start);
      bp.Q.value = q;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(gain, start + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      src.connect(bp);
      bp.connect(env);
      env.connect(master);
      src.start(start, Math.random() * 0.2);
      src.stop(start + duration + 0.012);
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
