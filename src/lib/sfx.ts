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
