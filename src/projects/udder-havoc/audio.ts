import { createSfxEngine } from '../../lib/sfx';

export function createArenaAudio() {
  const sfx = createSfxEngine('udder-havoc-muted');
  let xpCombo = 0;
  let lastXpAt = 0;

  return {
    unlock: sfx.unlock,
    isMuted: sfx.isMuted,
    setMuted: sfx.setMuted,
    playFire(gold: boolean) {
      if (!sfx.live()) return;
      sfx.tone({
        freq: gold ? 220 : 165,
        endFreq: gold ? 58 : 72,
        type: 'triangle',
        gain: gold ? 0.16 : 0.1,
        attack: 0.004,
        duration: gold ? 0.24 : 0.14,
      });
      sfx.noise({
        freq: gold ? 1800 : 1100,
        endFreq: 340,
        gain: gold ? 0.12 : 0.065,
        duration: gold ? 0.22 : 0.12,
      });
    },
    playHit(crit: boolean) {
      if (!sfx.live()) return;
      sfx.tone({
        freq: crit ? 660 : 320,
        endFreq: crit ? 280 : 140,
        type: crit ? 'sawtooth' : 'triangle',
        gain: crit ? 0.075 : 0.045,
        attack: 0.003,
        duration: 0.075,
      });
    },
    playKill() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 520, endFreq: 780, type: 'sine', gain: 0.055, attack: 0.004, duration: 0.09 });
    },
    playMortar() {
      if (!sfx.live()) return;
      sfx.noise({ freq: 950, endFreq: 160, gain: 0.15, duration: 0.2 });
      sfx.tone({ freq: 130, endFreq: 55, type: 'triangle', gain: 0.12, duration: 0.22 });
    },
    playXp() {
      if (!sfx.live()) return;
      const now = performance.now();
      xpCombo = now - lastXpAt < 600 ? Math.min(10, xpCombo + 1) : 0;
      lastXpAt = now;
      const freq = 580 * Math.pow(1.06, xpCombo);
      sfx.tone({ freq, endFreq: freq * 1.18, type: 'sine', gain: 0.045, attack: 0.004, duration: 0.07 });
    },
    playHeal() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 523.25, endFreq: 783.99, type: 'sine', gain: 0.08, attack: 0.01, duration: 0.18 });
    },
    playHurt() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 170, endFreq: 68, type: 'sawtooth', gain: 0.12, attack: 0.004, duration: 0.18 });
      sfx.noise({ freq: 700, endFreq: 200, gain: 0.1, duration: 0.12 });
    },
    playLevelUp() {
      if (!sfx.live()) return;
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        sfx.tone({ freq, type: 'triangle', gain: 0.085, attack: 0.01, duration: 0.2, delay: i * 0.065 });
      });
    },
    playBoss() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 110, endFreq: 78, type: 'sawtooth', gain: 0.11, attack: 0.04, duration: 0.55 });
      sfx.tone({ freq: 220, endFreq: 146.8, type: 'triangle', gain: 0.08, attack: 0.05, duration: 0.55, delay: 0.1 });
    },
    playGameOver() {
      if (!sfx.live()) return;
      sfx.tone({ freq: 392, endFreq: 196, type: 'triangle', gain: 0.12, attack: 0.02, duration: 0.65 });
      sfx.tone({ freq: 293.66, endFreq: 130.81, type: 'sine', gain: 0.11, attack: 0.02, duration: 0.78, delay: 0.06 });
    },
    destroy: sfx.destroy,
  };
}
