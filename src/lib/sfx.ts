const MASTER_GAIN = 0.85;

function audioContextClass(): typeof AudioContext | undefined {
  // DOM typings omit Safari's legacy AudioContext constructor.
  const legacyWindow = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || legacyWindow.webkitAudioContext;
}

function loadMuted(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveMuted(key: string, muted: boolean) {
  try {
    window.localStorage.setItem(key, muted ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

/** Master gain -> gentle compressor -> destination. */
function createMasterBus(ctx: AudioContext, muted: boolean): GainNode {
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

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
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

function scheduleTone(
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

export interface NoiseOptions {
  freq: number;
  /** Sweeps the filter to this frequency over duration. */
  endFreq?: number;
  filterType?: BiquadFilterType;
  gain: number;
  attack?: number;
  duration?: number;
  q?: number;
  delay?: number;
}

export interface SfxHooks {
  /** Runs once, when the context and master bus exist; build extra layers here. */
  onGraph?(ctx: AudioContext, master: GainNode): void;
  /** Runs when the context first reaches running. */
  onUnlock?(): void;
}

export interface SfxEngine {
  isMuted(): boolean;
  setMuted(next: boolean): boolean;
  /** Call from a user gesture: builds the graph and resumes a suspended context. */
  unlock(): void;
  /** True while autoplay policy holds the context, unless muted or audio is unavailable. */
  isLocked(): boolean;
  /** Gesture sounds may schedule while the context resumes. */
  ready(): boolean;
  /** Simulation sounds must not queue on a frozen clock. */
  live(): boolean;
  /** Plays into bus, or the master bus. */
  tone(opts: ToneOptions, bus?: AudioNode): void;
  /** Filtered noise tick: linear attack, exponential decay over duration. */
  noise(opts: NoiseOptions): void;
  destroy(): void;
}

export function createSfxEngine(storageKey: string, hooks: SfxHooks = {}): SfxEngine {
  const AudioCtx = audioContextClass();
  let muted = loadMuted(storageKey);
  let hidden = document.hidden;
  let unavailable = !AudioCtx;
  let unlocked = false;
  let destroyed = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  function markUnlocked() {
    if (unlocked || destroyed || ctx?.state !== 'running') return;
    unlocked = true;
    hooks.onUnlock?.();
  }

  function ensureGraph(): boolean {
    if (destroyed || unavailable || !AudioCtx) return false;
    if (ctx) return true;
    try {
      ctx = new AudioCtx();
      master = createMasterBus(ctx, muted);
      noiseBuffer = createNoiseBuffer(ctx, 1);
      hooks.onGraph?.(ctx, master);
    } catch {
      unavailable = true;
      ctx?.close().catch(() => {});
      ctx = master = noiseBuffer = null;
      return false;
    }
    ctx.onstatechange = markUnlocked;
    markUnlocked();
    return true;
  }

  function unlock() {
    if (destroyed || muted || !ensureGraph() || !ctx) return;
    if (ctx.state === 'suspended' && !hidden) ctx.resume().catch(() => {});
  }

  function onVisibility() {
    hidden = document.hidden;
    if (!ctx || destroyed) return;
    if (hidden) ctx.suspend().catch(() => {});
    else if (!muted) ctx.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', onVisibility);

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
    isLocked: () => !unavailable && !muted && !unlocked,
    live: () => !destroyed && !muted && !hidden && ctx?.state === 'running',
    ready() {
      if (destroyed || muted || hidden) return false;
      if (!ensureGraph() || !ctx || !master) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    },
    tone(opts, bus) {
      const out = bus ?? master;
      if (ctx && out) scheduleTone(ctx, out, opts);
    },
    noise({ freq, endFreq = freq, filterType = 'bandpass', gain, attack = 0.003, duration = 0.038, q = 3.2, delay = 0 }) {
      if (!ctx || !master || !noiseBuffer) return;
      const start = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = filterType;
      bp.frequency.setValueAtTime(freq, start);
      if (endFreq !== freq) bp.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);
      bp.Q.value = q;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(gain, start + attack);
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
      document.removeEventListener('visibilitychange', onVisibility);
      if (ctx) {
        ctx.onstatechange = null;
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}
