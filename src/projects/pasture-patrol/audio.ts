import { createSfxEngine, type NoiseOptions, type ToneOptions } from '../../lib/sfx';

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

export interface PastureAudio {
  isMuted(): boolean;
  isLocked(): boolean;
  setMuted(next: boolean): boolean;
  unlock(): void;
  setActive(next: boolean): void;
  update(dt: number, state?: { speedNorm?: number; cowLift?: number; hazardLift?: number }): void;
  playCowCollect(): void;
  playAnimalCollect(kind: 'chicken' | 'goat' | 'pig' | 'sheep'): void;
  playCombo(multiplier: number): void;
  playHealCollect(): void;
  playDamage(): void;
  playCowStartle(): void;
  playHaySpawn(): void;
  playHayBounce(): void;
  playMortarLaunch(): void;
  playMortarImpact(): void;
  playCornAim(): void;
  playCornLaunch(): void;
  playTractorRumble(): void;
  playBeeSwarm(): void;
  playBeeSting(): void;
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

export function createAudio({ onUnlock }: { onUnlock?: () => void } = {}): PastureAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let tractorBus: GainNode | null = null;
  let layers: AmbientLayers | null = null;

  let active = true;
  let initializing = true;
  let cricketTimer = 0.9;
  let alienWarbleTimer = 4.5;
  let lastStartleAt = -10;
  let lastBounceAt = -10;

  const sfx = createSfxEngine(STORAGE_KEY, {
    onGraph(audioCtx, masterBus) {
      ctx = audioCtx;
      master = masterBus;
      const ambientGain = audioCtx.createGain();
      ambientGain.gain.value = active ? 1 : 0;
      ambientGain.connect(masterBus);
      layers = setupAmbientLayers(audioCtx, ambientGain);
    },
    // The game reads audio, which is unassigned until createAudio returns.
    onUnlock() {
      if (!initializing) onUnlock?.();
    },
  });

  function setupAmbientLayers(audioCtx: AudioContext, bus: GainNode): AmbientLayers {
    const oscs: OscillatorNode[] = [];
    const gain = (value: number, to: AudioNode | AudioParam) => {
      const g = audioCtx.createGain();
      g.gain.value = value;
      g.connect(to as AudioNode);
      return g;
    };
    const osc = (freq: number, to: AudioNode | AudioParam, type: OscillatorType = 'sine') => {
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(to as AudioNode);
      oscs.push(o);
      return o;
    };

    osc(110, gain(0.022, bus));
    osc(164.81, gain(0.013, bus));
    const padShimmerGain = gain(0.004, bus);
    osc(246.94, padShimmerGain);
    osc(0.09, gain(0.0035, padShimmerGain.gain));

    const ufoGain = gain(0.024, bus);
    const ufoOscA = osc(92, ufoGain);
    const ufoOscB = osc(138, ufoGain);

    const cowBeamGain = gain(0, bus);
    const cowBeamOsc = osc(340, cowBeamGain);
    const cowBeamLfoGain = gain(16, cowBeamOsc.frequency);
    osc(7.5, cowBeamLfoGain);

    const hazardBeamGain = gain(0, bus);
    const hazardPulseGain = gain(0.65, hazardBeamGain);
    const hazardBeamFilter = audioCtx.createBiquadFilter();
    hazardBeamFilter.type = 'lowpass';
    hazardBeamFilter.frequency.value = 420;
    hazardBeamFilter.connect(hazardPulseGain);
    const hazardBeamOsc = osc(125, hazardBeamFilter, 'sawtooth');
    const hazardBeamLfo = osc(9, gain(0.35, hazardPulseGain.gain));
    for (const o of oscs) o.start();

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
    if (ctx && layers) layers.ambientGain.gain.setTargetAtTime(active ? 1 : 0, ctx.currentTime, 0.07);
  }

  const playTone = ({ bus, ...opts }: ToneOptions & { bus?: AudioNode }) => sfx.tone(opts, bus);
  const playNoiseBurst = (opts: Partial<NoiseOptions>) => sfx.noise({
    gain: 0.12, duration: 0.12, filterType: 'lowpass', freq: 600, endFreq: 200, q: 1, attack: 0.01, ...opts,
  });

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

  if (!sfx.isMuted()) sfx.unlock();
  initializing = false;

  return {
    isMuted: sfx.isMuted,
    isLocked: sfx.isLocked,
    setMuted(next) {
      const muted = sfx.setMuted(next);
      if (muted && tractorBus && ctx) {
        // Fade scheduled engine pulses without bringing them back on a quick unmute.
        tractorBus.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
        tractorBus = null;
      }
      return muted;
    },
    unlock: sfx.unlock,
    setActive(next) {
      active = Boolean(next);
      syncPowerState();
    },
    update(dt, { speedNorm = 0, cowLift = 0, hazardLift = 0 } = {}) {
      if (!ctx || ctx.state !== 'running' || !layers) return;
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

      if (active && !sfx.isMuted()) {
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
      if (!sfx.live()) return;
      const [root, fifth] = PENTATONIC_CHIMES[Math.floor(Math.random() * PENTATONIC_CHIMES.length)];
      const jitter = 0.985 + Math.random() * 0.03;
      playTone({ freq: 240 * jitter, endFreq: 540 * jitter, type: 'sine', gain: 0.09, attack: 0.006, duration: 0.09 });
      playTone({ freq: root * jitter, type: 'triangle', gain: 0.1, attack: 0.008, duration: 0.15, delay: 0.02 });
      playTone({ freq: fifth * jitter, type: 'sine', gain: 0.09, attack: 0.008, duration: 0.22, delay: 0.075 });
    },
    playAnimalCollect(kind) {
      if (!sfx.live()) return;
      switch (kind) {
        case 'chicken':
          playTone({ freq: 820, endFreq: 410, type: 'triangle', gain: 0.1, duration: 0.06 });
          playTone({ freq: 980, endFreq: 520, type: 'triangle', gain: 0.09, duration: 0.09, delay: 0.07 });
          break;
        case 'goat':
          for (let i = 0; i < 3; i++) {
            playTone({ freq: 275 + i * 16, endFreq: 236, type: 'sawtooth', filterFreq: 820, gain: 0.095, duration: 0.09, delay: i * 0.05 });
          }
          break;
        case 'pig':
          playTone({ freq: 172, endFreq: 92, type: 'triangle', gain: 0.12, duration: 0.17 });
          playNoiseBurst({ freq: 620, endFreq: 260, filterType: 'bandpass', gain: 0.1, duration: 0.12 });
          break;
        case 'sheep':
          playTone({ freq: 335, endFreq: 250, type: 'triangle', gain: 0.1, attack: 0.035, duration: 0.23 });
          playTone({ freq: 355, endFreq: 270, gain: 0.055, attack: 0.025, duration: 0.18, delay: 0.075 });
          break;
      }
    },
    playCombo(multiplier) {
      if (!sfx.live()) return;
      const freq = 660 * 2 ** ((Math.min(8, Math.max(1, multiplier)) - 1) / 7);
      playTone({ freq, endFreq: freq * 1.25, type: 'triangle', gain: 0.075, duration: 0.09 });
    },
    playHealCollect() {
      if (!sfx.live()) return;
      HEAL_CHORD.forEach((freq, i) => {
        playTone({ freq, type: 'sine', gain: 0.1, attack: 0.01, duration: 0.28, delay: i * 0.055 });
        playTone({ freq: freq * 2, type: 'triangle', gain: 0.035, attack: 0.01, duration: 0.2, delay: i * 0.055 });
      });
    },
    playDamage() {
      if (!sfx.live()) return;
      playNoiseBurst({ gain: 0.22, duration: 0.16, filterType: 'lowpass', freq: 950, endFreq: 180 });
      playTone({ freq: 220, endFreq: 68, type: 'sawtooth', gain: 0.14, attack: 0.008, duration: 0.24 });
      playTone({ freq: 145, endFreq: 52, type: 'triangle', gain: 0.14, attack: 0.008, duration: 0.28 });
    },
    playCowStartle() {
      if (!sfx.live() || !ctx) return;
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
      if (!sfx.live()) return;
      playNoiseBurst({ gain: 0.1, duration: 0.24, filterType: 'bandpass', freq: 340, endFreq: 680, q: 1.5 });
      playTone({ freq: 180, endFreq: 240, type: 'triangle', gain: 0.045, attack: 0.03, duration: 0.2 });
    },
    playHayBounce() {
      if (!sfx.live() || !ctx) return;
      const now = ctx.currentTime;
      if (now - lastBounceAt < 0.12) return;
      lastBounceAt = now;
      playTone({ freq: 145, endFreq: 85, type: 'sine', gain: 0.055, attack: 0.005, duration: 0.08 });
      playNoiseBurst({ gain: 0.04, duration: 0.04, filterType: 'bandpass', freq: 720, endFreq: 420, q: 1.4 });
    },
    playMortarLaunch() {
      if (!sfx.live()) return;
      playTone({ freq: 155, endFreq: 76, type: 'triangle', gain: 0.11, duration: 0.14 });
      playTone({ freq: 410, endFreq: 1030, gain: 0.055, attack: 0.23, duration: 0.52, delay: 0.035 });
    },
    playMortarImpact() {
      if (!sfx.live()) return;
      playNoiseBurst({ freq: 980, endFreq: 180, gain: 0.18, duration: 0.18 });
      playTone({ freq: 136, endFreq: 62, type: 'triangle', gain: 0.13, duration: 0.2 });
    },
    playCornAim() {
      if (!sfx.live()) return;
      playTone({ freq: 275, endFreq: 940, type: 'triangle', gain: 0.065, attack: 1.15, duration: 1.25 });
    },
    playCornLaunch() {
      if (!sfx.live()) return;
      // Bazooka thoomp plus the shell's whoosh.
      playTone({ freq: 180, endFreq: 70, type: 'triangle', gain: 0.14, attack: 0.005, duration: 0.18 });
      playNoiseBurst({ freq: 1400, endFreq: 420, gain: 0.1, duration: 0.3 });
    },
    playTractorRumble() {
      if (!sfx.live() || !ctx || !master) return;
      if (!tractorBus) {
        tractorBus = ctx.createGain();
        tractorBus.connect(master);
      }
      playTone({ bus: tractorBus, freq: 78, endFreq: 103, type: 'triangle', gain: 0.08, attack: 1.4, duration: 2.5 });
      for (let i = 0; i < 18; i++) {
        const pass = Math.sin(Math.PI * (i + 1) / 19);
        playTone({ bus: tractorBus, freq: 112 + pass * 18, endFreq: 73, type: 'sawtooth', gain: 0.015 + pass * 0.035, duration: 0.14, delay: i * 0.138 });
      }
    },
    playBeeSwarm() {
      if (!sfx.live()) return;
      for (const freq of [205, 214, 223]) {
        playTone({ freq, endFreq: freq * 1.45, type: 'sawtooth', gain: 0.024, attack: 0.24, duration: 0.68 });
      }
    },
    playBeeSting() {
      if (!sfx.live()) return;
      playTone({ freq: 1620, endFreq: 630, type: 'square', gain: 0.05, attack: 0.003, duration: 0.055 });
    },
    playLevelUp() {
      if (!sfx.live()) return;
      [440, 554.37, 659.25].forEach((freq, i) => {
        playTone({ freq, type: 'triangle', gain: 0.085, attack: 0.01, duration: 0.18, delay: i * 0.08 });
      });
    },
    playGameOver() {
      if (!sfx.live()) return;
      playTone({ freq: 392, endFreq: 196, type: 'triangle', gain: 0.12, attack: 0.02, duration: 0.72 });
      playTone({ freq: 293.66, endFreq: 130.81, type: 'sine', gain: 0.11, attack: 0.02, duration: 0.82, delay: 0.06 });
    },
    playUiClick(bright = true) {
      if (!sfx.ready()) return;
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
      layers = null;
      tractorBus = null;
      ctx = master = null;
      sfx.destroy();
    },
  };
}
