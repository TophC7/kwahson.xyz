const STORAGE_KEY = 'pasture-patrol-muted';
const PENTATONIC_CHIMES: [number, number][] = [
  [523.25, 659.25],
  [587.33, 783.99],
  [659.25, 880.0],
  [783.99, 1046.5],
];
const HEAL_CHORD = [523.25, 659.25, 783.99, 987.77];
const ALIEN_GLIDES: [number, number, number][] = [
  [523.25, 587.33, 493.88],
  [659.25, 587.33, 523.25],
  [440.0, 523.25, 493.88],
  [587.33, 659.25, 587.33],
];

interface PastureAudio {
  isMuted(): boolean;
  isLocked(): boolean;
  setMuted(next: boolean): boolean;
  unlock(fromGesture?: boolean): boolean;
  setActive(next: boolean): void;
  setHidden(next: boolean): void;
  update(dt: number, state?: { speedNorm?: number; cowLift?: number; hazardLift?: number }): void;
  playCowCollect(): void;
  playHealCollect(): void;
  playDamage(): void;
  playCowStartle(): void;
  playHaySpawn(): void;
  playHayBounce(): void;
  playLevelUp(): void;
  playGameOver(): void;
  playUiClick(bright?: boolean): void;
  destroy(): void;
}

interface AmbientLayers {
  ambientGain: GainNode;
  ufoOscA: OscillatorNode;
  ufoOscB: OscillatorNode;
  ufoGain: GainNode;
  cowBeamOsc: OscillatorNode;
  cowBeamLfoGain: GainNode;
  cowBeamGain: GainNode;
  hazardBeamOsc: OscillatorNode;
  hazardBeamFilter: BiquadFilterNode;
  hazardBeamLfo: OscillatorNode;
  hazardBeamGain: GainNode;
}

function loadMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMutedPreference(muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

function createNoiseBuffer(ctx: AudioContext, durationSeconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createAudio({ onUnlock }: { onUnlock?: () => void } = {}): PastureAudio {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let muted = loadMutedPreference();
  let unavailable = !AudioCtx;

  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let layers: AmbientLayers | null = null;

  let active = true;
  let hidden = false;
  let unlocked = false;
  let destroyed = false;
  let initializing = true;
  let resumePending = false;
  let cricketTimer = 0.9;
  let alienWarbleTimer = 4.5;
  let lastStartleAt = -10;
  let lastBounceAt = -10;

  function markUnlocked() {
    if (destroyed || !ctx || ctx.state !== 'running') return;
    const wasLocked = !unlocked;
    unlocked = true;
    resumePending = false;
    syncPowerState();
    if (wasLocked && !initializing && onUnlock) onUnlock();
  }

  function ensureGraph(): boolean {
    if (destroyed || !AudioCtx) return false;
    if (ctx) return true;
    try {
      ctx = new AudioCtx();
    } catch {
      unavailable = true;
      return false;
    }

    ctx.onstatechange = () => {
      if (ctx && ctx.state === 'running') markUnlocked();
    };

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.15;

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.85;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    const ambientGain = ctx.createGain();
    ambientGain.gain.value = active && !hidden ? 1 : 0;
    ambientGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 1;
    sfxGain.connect(masterGain);

    noiseBuffer = createNoiseBuffer(ctx, 2);
    layers = setupAmbientLayers(ctx, ambientGain);
    if (ctx.state === 'running') markUnlocked();
    return true;
  }

  function setupAmbientLayers(audioCtx: AudioContext, bus: GainNode): AmbientLayers {
    const padRoot = audioCtx.createOscillator();
    padRoot.type = 'sine';
    padRoot.frequency.value = 110;
    const padRootGain = audioCtx.createGain();
    padRootGain.gain.value = 0.022;
    padRoot.connect(padRootGain);
    padRootGain.connect(bus);

    const padFifth = audioCtx.createOscillator();
    padFifth.type = 'sine';
    padFifth.frequency.value = 164.81;
    const padFifthGain = audioCtx.createGain();
    padFifthGain.gain.value = 0.013;
    padFifth.connect(padFifthGain);
    padFifthGain.connect(bus);

    const padShimmer = audioCtx.createOscillator();
    padShimmer.type = 'sine';
    padShimmer.frequency.value = 246.94;
    const padShimmerGain = audioCtx.createGain();
    padShimmerGain.gain.value = 0.004;
    const padLfo = audioCtx.createOscillator();
    padLfo.frequency.value = 0.09;
    const padLfoGain = audioCtx.createGain();
    padLfoGain.gain.value = 0.0035;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(padShimmerGain.gain);
    padShimmer.connect(padShimmerGain);
    padShimmerGain.connect(bus);

    padRoot.start();
    padFifth.start();
    padShimmer.start();
    padLfo.start();

    const ufoOscA = audioCtx.createOscillator();
    ufoOscA.type = 'sine';
    ufoOscA.frequency.value = 92;
    const ufoOscB = audioCtx.createOscillator();
    ufoOscB.type = 'sine';
    ufoOscB.frequency.value = 138;
    const ufoGain = audioCtx.createGain();
    ufoGain.gain.value = 0.024;
    ufoOscA.connect(ufoGain);
    ufoOscB.connect(ufoGain);
    ufoGain.connect(bus);
    ufoOscA.start();
    ufoOscB.start();

    const cowBeamOsc = audioCtx.createOscillator();
    cowBeamOsc.type = 'sine';
    cowBeamOsc.frequency.value = 340;
    const cowBeamLfo = audioCtx.createOscillator();
    cowBeamLfo.frequency.value = 7.5;
    const cowBeamLfoGain = audioCtx.createGain();
    cowBeamLfoGain.gain.value = 16;
    cowBeamLfo.connect(cowBeamLfoGain);
    cowBeamLfoGain.connect(cowBeamOsc.frequency);
    const cowBeamGain = audioCtx.createGain();
    cowBeamGain.gain.value = 0;
    cowBeamOsc.connect(cowBeamGain);
    cowBeamGain.connect(bus);
    cowBeamOsc.start();
    cowBeamLfo.start();

    const hazardBeamOsc = audioCtx.createOscillator();
    hazardBeamOsc.type = 'sawtooth';
    hazardBeamOsc.frequency.value = 125;
    const hazardBeamFilter = audioCtx.createBiquadFilter();
    hazardBeamFilter.type = 'lowpass';
    hazardBeamFilter.frequency.value = 420;
    const hazardBeamGain = audioCtx.createGain();
    hazardBeamGain.gain.value = 0;
    const hazardPulseGain = audioCtx.createGain();
    hazardPulseGain.gain.value = 0.65;
    const hazardBeamLfo = audioCtx.createOscillator();
    hazardBeamLfo.frequency.value = 9;
    const hazardLfoDepth = audioCtx.createGain();
    hazardLfoDepth.gain.value = 0.35;
    hazardBeamLfo.connect(hazardLfoDepth);
    hazardLfoDepth.connect(hazardPulseGain.gain);
    hazardBeamOsc.connect(hazardBeamFilter);
    hazardBeamFilter.connect(hazardPulseGain);
    hazardPulseGain.connect(hazardBeamGain);
    hazardBeamGain.connect(bus);
    hazardBeamOsc.start();
    hazardBeamLfo.start();

    return {
      ambientGain: bus,
      ufoOscA,
      ufoOscB,
      ufoGain,
      cowBeamOsc,
      cowBeamLfoGain,
      cowBeamGain,
      hazardBeamOsc,
      hazardBeamFilter,
      hazardBeamLfo,
      hazardBeamGain,
    };
  }

  function syncPowerState() {
    if (!ctx || !masterGain || !layers || destroyed) return;
    const now = ctx.currentTime;
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.035);
    layers.ambientGain.gain.setTargetAtTime(active && !hidden ? 1 : 0, now, 0.07);
  }

  function unlock(fromGesture = false): boolean {
    if (destroyed || !ensureGraph() || !ctx) return false;
    if (ctx.state === 'running') {
      markUnlocked();
      return true;
    }
    if (ctx.state === 'suspended' && !hidden) {
      if (fromGesture) resumePending = true;
      ctx
        .resume()
        .then(() => {
          if (ctx && ctx.state === 'running') markUnlocked();
          else resumePending = false;
        })
        .catch(() => {
          resumePending = false;
        });
    }
    return false;
  }

  function canPlaySfx(): boolean {
    return Boolean(!destroyed && ctx && !muted && !hidden && (ctx.state === 'running' || resumePending));
  }

  function playTone({
    freq,
    endFreq = freq,
    type = 'sine',
    gain = 0.1,
    attack = 0.01,
    duration = 0.16,
    delay = 0,
    bus = sfxGain,
    filterFreq = null,
    filterEndFreq = null,
  }: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    duration?: number;
    delay?: number;
    bus?: GainNode | null;
    filterFreq?: number | null;
    filterEndFreq?: number | null;
  }) {
    if (!ctx || !bus || destroyed) return;
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

  function playNoiseBurst({
    gain = 0.12,
    duration = 0.12,
    filterType = 'lowpass',
    freq = 600,
    endFreq = 200,
    q = 1,
    delay = 0,
  }: {
    gain?: number;
    duration?: number;
    filterType?: BiquadFilterType;
    freq?: number;
    endFreq?: number;
    q?: number;
    delay?: number;
  }) {
    if (!ctx || !noiseBuffer || !sfxGain || destroyed) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(sfxGain);
    src.start(start, Math.random());
    src.stop(start + duration + 0.02);
  }

  function playCricketChirp(bus: GainNode) {
    const freq = 3900 + Math.random() * 450;
    const pulses = Math.random() < 0.6 ? 3 : 4;
    for (let i = 0; i < pulses; i++) {
      playTone({
        freq,
        endFreq: freq * 0.985,
        type: 'sine',
        gain: 0.0095,
        attack: 0.004,
        duration: 0.024,
        delay: i * 0.042,
        bus,
      });
    }
  }

  function playAlienNightWarble(audioCtx: AudioContext, bus: GainNode) {
    const [a, b, c] = ALIEN_GLIDES[Math.floor(Math.random() * ALIEN_GLIDES.length)];
    const start = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    const env = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(a, start);
    osc.frequency.exponentialRampToValueAtTime(b, start + 0.42);
    osc.frequency.exponentialRampToValueAtTime(c, start + 0.95);

    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(0.012, start + 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);

    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    lfo.start(start);
    osc.stop(start + 1.1);
    lfo.stop(start + 1.1);
  }

  if (!muted) unlock(false);
  initializing = false;

  return {
    isMuted: () => muted,
    isLocked: () => !unavailable && !muted && !unlocked,
    setMuted(next) {
      muted = Boolean(next);
      saveMutedPreference(muted);
      if (!muted) unlock(true);
      syncPowerState();
      return muted;
    },
    unlock: (fromGesture = true) => unlock(fromGesture),
    setActive(next) {
      active = Boolean(next);
      syncPowerState();
    },
    setHidden(next) {
      hidden = Boolean(next);
      if (!ctx || destroyed) return;
      if (hidden) {
        ctx.suspend().catch(() => {});
      } else if (unlocked) {
        ctx.resume().catch(() => {});
        syncPowerState();
      }
    },
    update(dt, { speedNorm = 0, cowLift = 0, hazardLift = 0 } = {}) {
      if (destroyed || !ctx || !unlocked || ctx.state !== 'running' || !layers) {
        return;
      }
      const now = ctx.currentTime;

      layers.ufoOscA.frequency.setTargetAtTime(92 + speedNorm * 16, now, 0.08);
      layers.ufoOscB.frequency.setTargetAtTime(138 + speedNorm * 24, now, 0.08);
      layers.ufoGain.gain.setTargetAtTime(0.022 + speedNorm * 0.022, now, 0.08);

      if (cowLift > 0.01) {
        layers.cowBeamOsc.frequency.setTargetAtTime(330 + cowLift * 270, now, 0.05);
        layers.cowBeamLfoGain.gain.setTargetAtTime(14 + cowLift * 14, now, 0.05);
        layers.cowBeamGain.gain.setTargetAtTime(0.032 + cowLift * 0.022, now, 0.05);
      } else {
        layers.cowBeamGain.gain.setTargetAtTime(0, now, 0.06);
      }

      if (hazardLift > 0.01) {
        layers.hazardBeamOsc.frequency.setTargetAtTime(120 + hazardLift * 95, now, 0.05);
        layers.hazardBeamFilter.frequency.setTargetAtTime(360 + hazardLift * 460, now, 0.05);
        layers.hazardBeamLfo.frequency.setTargetAtTime(8 + hazardLift * 9, now, 0.05);
        layers.hazardBeamGain.gain.setTargetAtTime(0.038 + hazardLift * 0.03, now, 0.05);
      } else {
        layers.hazardBeamGain.gain.setTargetAtTime(0, now, 0.05);
      }

      if (active && !muted && !hidden) {
        cricketTimer -= dt;
        if (cricketTimer <= 0) {
          playCricketChirp(layers.ambientGain);
          cricketTimer = 1.6 + Math.random() * 2.6;
        }
        alienWarbleTimer -= dt;
        if (alienWarbleTimer <= 0) {
          playAlienNightWarble(ctx, layers.ambientGain);
          alienWarbleTimer = 6.5 + Math.random() * 6.5;
        }
      }
    },
    playCowCollect() {
      if (!canPlaySfx()) return;
      const [root, fifth] = PENTATONIC_CHIMES[Math.floor(Math.random() * PENTATONIC_CHIMES.length)];
      const jitter = 0.985 + Math.random() * 0.03;
      playTone({ freq: 240 * jitter, endFreq: 540 * jitter, type: 'sine', gain: 0.09, attack: 0.006, duration: 0.09 });
      playTone({ freq: root * jitter, type: 'triangle', gain: 0.1, attack: 0.008, duration: 0.15, delay: 0.02 });
      playTone({ freq: fifth * jitter, type: 'sine', gain: 0.09, attack: 0.008, duration: 0.22, delay: 0.075 });
    },
    playHealCollect() {
      if (!canPlaySfx()) return;
      HEAL_CHORD.forEach((freq, i) => {
        playTone({ freq, type: 'sine', gain: 0.1, attack: 0.01, duration: 0.28, delay: i * 0.055 });
        playTone({ freq: freq * 2, type: 'triangle', gain: 0.035, attack: 0.01, duration: 0.2, delay: i * 0.055 });
      });
    },
    playDamage() {
      if (!canPlaySfx()) return;
      playNoiseBurst({ gain: 0.22, duration: 0.16, filterType: 'lowpass', freq: 950, endFreq: 180 });
      playTone({ freq: 220, endFreq: 68, type: 'sawtooth', gain: 0.14, attack: 0.008, duration: 0.24 });
      playTone({ freq: 145, endFreq: 52, type: 'triangle', gain: 0.14, attack: 0.008, duration: 0.28 });
    },
    playCowStartle() {
      if (!canPlaySfx() || !ctx) return;
      const now = ctx.currentTime;
      if (now - lastStartleAt < 0.45) return;
      lastStartleAt = now;
      const base = 148 + Math.random() * 34;
      playTone({
        freq: base,
        endFreq: base * 0.84,
        type: 'sawtooth',
        gain: 0.055,
        attack: 0.025,
        duration: 0.21,
        filterFreq: 640,
        filterEndFreq: 420,
      });
    },
    playHaySpawn() {
      if (!canPlaySfx()) return;
      playNoiseBurst({ gain: 0.1, duration: 0.24, filterType: 'bandpass', freq: 340, endFreq: 680, q: 1.5 });
      playTone({ freq: 180, endFreq: 240, type: 'triangle', gain: 0.045, attack: 0.03, duration: 0.2 });
    },
    playHayBounce() {
      if (!canPlaySfx() || !ctx) return;
      const now = ctx.currentTime;
      if (now - lastBounceAt < 0.12) return;
      lastBounceAt = now;
      playTone({ freq: 145, endFreq: 85, type: 'sine', gain: 0.055, attack: 0.005, duration: 0.08 });
      playNoiseBurst({ gain: 0.04, duration: 0.04, filterType: 'bandpass', freq: 720, endFreq: 420, q: 1.4 });
    },
    playLevelUp() {
      if (!canPlaySfx()) return;
      [440, 554.37, 659.25].forEach((freq, i) => {
        playTone({ freq, type: 'triangle', gain: 0.085, attack: 0.01, duration: 0.18, delay: i * 0.08 });
      });
    },
    playGameOver() {
      if (!canPlaySfx()) return;
      playTone({ freq: 392, endFreq: 196, type: 'triangle', gain: 0.12, attack: 0.02, duration: 0.72 });
      playTone({ freq: 293.66, endFreq: 130.81, type: 'sine', gain: 0.11, attack: 0.02, duration: 0.82, delay: 0.06 });
    },
    playUiClick(bright = true) {
      if (!canPlaySfx()) return;
      playTone({
        freq: bright ? 660 : 480,
        endFreq: bright ? 740 : 420,
        type: 'sine',
        gain: 0.06,
        attack: 0.004,
        duration: 0.055,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      layers = null;
      if (ctx) {
        ctx.onstatechange = null;
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}
