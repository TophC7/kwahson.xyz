import { createSfxEngine } from '../../lib/sfx';

export type SfxName =
  | 'select' | 'deselect' | 'invalid' | 'uiClick' | 'undo' | 'step' | 'fly'
  | 'Shove' | 'Mend' | 'Sting' | 'Ram' | 'Pounce' | 'Egg' | 'Wool'
  | 'Zap' | 'Laser' | 'Slam' | 'Mortar' | 'Beam' | 'Flame' | 'Chain' | 'Jet' | 'split'
  | 'bump' | 'heal' | 'hit' | 'block' | 'koHero' | 'koEnemy' | 'crunch'
  | 'place' | 'land' | 'eggHit' | 'item' | 'splat' | 'tractor'
  | 'enemyPhase' | 'playerPhase' | 'endTurn' | 'won' | 'lost';

export interface TacticsAudio {
  isMuted(): boolean;
  setMuted(next: boolean): boolean;
  unlock(): void;
  setHidden(next: boolean): void;
  play(name: SfxName, step?: number): void;
  destroy(): void;
}

const WIN_CHORD = [523.25, 659.25, 783.99, 1046.5, 1318.5];

export function createTacticsAudio(): TacticsAudio {
  const sfx = createSfxEngine('pasture-tactics-muted');
  const { noise, tone } = sfx;

  function bump() {
    noise({ freq: 260, gain: 0.14, duration: 0.09 });
    tone({ freq: 140, endFreq: 90, gain: 0.11, duration: 0.14 });
  }
  function heal() {
    tone({ freq: 659, gain: 0.07, duration: 0.18 });
    tone({ freq: 880, gain: 0.06, duration: 0.24, delay: 0.07 });
  }
  function zap() {
    tone({ freq: 520, endFreq: 260, type: 'square', gain: 0.045, duration: 0.09, filterFreq: 1800 });
  }

  const recipes: Record<SfxName, (step: number) => void> = {
    select() {
      noise({ freq: 1730, gain: 0.10 });
      tone({ freq: 620, endFreq: 740, type: 'triangle', gain: 0.055, duration: 0.065 });
    },
    deselect() {
      noise({ freq: 1400, gain: 0.07 });
      tone({ freq: 480, endFreq: 390, gain: 0.045, duration: 0.06 });
    },
    invalid() {
      tone({ freq: 185, endFreq: 112, type: 'triangle', gain: 0.10, duration: 0.10 });
      noise({ freq: 740, gain: 0.08 });
    },
    uiClick() {
      tone({ freq: 660, endFreq: 740, gain: 0.055, duration: 0.055 });
    },
    undo() {
      noise({ freq: 1480, gain: 0.08 });
      tone({ freq: 520, endFreq: 390, type: 'triangle', gain: 0.06, duration: 0.11 });
    },
    step(step) {
      const pitch = step % 2 === 0 ? 0.96 : 1.04;
      tone({ freq: 300 * pitch, endFreq: 240 * pitch, type: 'triangle', gain: 0.05, duration: 0.05 });
    },
    fly() {
      tone({ freq: 180, endFreq: 210, type: 'sawtooth', gain: 0.03, duration: 0.10, filterFreq: 900 });
    },
    Shove: bump,
    bump,
    Mend: heal,
    heal,
    Sting() {
      tone({ freq: 900, endFreq: 1400, type: 'sawtooth', gain: 0.045, duration: 0.08, filterFreq: 2400 });
    },
    Ram() {
      for (let i = 0; i < 3; i++) noise({ freq: 900, gain: 0.09, delay: i * 0.06 });
      tone({ freq: 120, endFreq: 70, gain: 0.12, duration: 0.16, delay: 0.16 });
    },
    Pounce() {
      tone({ freq: 700, endFreq: 1100, gain: 0.06, duration: 0.08 });
      tone({ freq: 1100, endFreq: 800, gain: 0.05, duration: 0.08, delay: 0.08 });
      noise({ freq: 2600, gain: 0.06, delay: 0.14 });
    },
    Egg() {
      tone({ freq: 520, endFreq: 600, type: 'triangle', gain: 0.06, duration: 0.07 });
      noise({ freq: 500, gain: 0.07, delay: 0.16 });
    },
    Wool() {
      tone({ freq: 440, gain: 0.05, duration: 0.30 });
      tone({ freq: 554, gain: 0.045, duration: 0.30, delay: 0.04 });
    },
    Zap: zap,
    Flame() {
      noise({ freq: 700, gain: 0.12, duration: 0.25, q: 1.4 });
      tone({ freq: 180, endFreq: 120, type: 'sawtooth', gain: 0.04, duration: 0.25, filterFreq: 900 });
    },
    Chain() {
      tone({ freq: 1600, endFreq: 400, type: 'square', gain: 0.035, duration: 0.12, filterFreq: 3000 });
      tone({ freq: 1200, endFreq: 300, type: 'square', gain: 0.03, duration: 0.10, delay: 0.06, filterFreq: 3000 });
      noise({ freq: 3200, gain: 0.06, duration: 0.05 });
    },
    Jet() {
      noise({ freq: 1800, gain: 0.10, duration: 0.22, q: 1.2 });
      tone({ freq: 400, endFreq: 700, gain: 0.04, duration: 0.18 });
    },
    split() {
      [[500, 800], [600, 950], [700, 1100]].forEach(([freq, endFreq], i) => {
        tone({ freq, endFreq, type: 'triangle', gain: 0.05 - i * 0.005, duration: 0.08, delay: i * 0.06 });
      });
    },
    Laser() {
      tone({ freq: 1200, endFreq: 300, type: 'sawtooth', gain: 0.05, duration: 0.14, filterFreq: 2600 });
    },
    Slam() {
      tone({ freq: 90, endFreq: 50, gain: 0.14, duration: 0.22 });
      noise({ freq: 180, gain: 0.12, duration: 0.12 });
    },
    Mortar() {
      tone({ freq: 900, endFreq: 300, gain: 0.05, duration: 0.40 });
      noise({ freq: 220, gain: 0.14, duration: 0.18, delay: 0.42 });
    },
    Beam() {
      tone({ freq: 300, endFreq: 360, gain: 0.05, duration: 0.15 });
      tone({ freq: 360, endFreq: 300, gain: 0.05, duration: 0.15, delay: 0.15 });
    },
    hit() {
      noise({ freq: 1100, gain: 0.10 });
      tone({ freq: 220, endFreq: 150, type: 'triangle', gain: 0.09, duration: 0.10 });
    },
    block() {
      tone({ freq: 1320, gain: 0.06, duration: 0.16 });
      tone({ freq: 1980, gain: 0.03, duration: 0.12 });
    },
    koHero() {
      tone({ freq: 880, endFreq: 220, gain: 0.08, duration: 0.50 });
    },
    koEnemy() {
      tone({ freq: 300, endFreq: 80, type: 'triangle', gain: 0.10, duration: 0.16 });
      noise({ freq: 600, gain: 0.10, duration: 0.08 });
    },
    crunch() {
      noise({ freq: 420, gain: 0.13, duration: 0.12 });
      noise({ freq: 900, gain: 0.08, duration: 0.06, delay: 0.05 });
    },
    place() {
      tone({ freq: 240, endFreq: 180, type: 'triangle', gain: 0.08, duration: 0.09 });
      noise({ freq: 320, gain: 0.08 });
    },
    land() {
      tone({ freq: 200, endFreq: 600, gain: 0.06, duration: 0.30 });
    },
    eggHit() {
      noise({ freq: 2200, gain: 0.10, duration: 0.05 });
      tone({ freq: 400, endFreq: 200, type: 'triangle', gain: 0.08, duration: 0.10, delay: 0.03 });
    },
    item() {
      tone({ freq: 587, type: 'triangle', gain: 0.06, duration: 0.10 });
      tone({ freq: 784, gain: 0.05, duration: 0.14, delay: 0.06 });
    },
    splat() {
      noise({ freq: 300, gain: 0.14, duration: 0.14 });
      tone({ freq: 160, endFreq: 90, gain: 0.09, duration: 0.14 });
    },
    tractor() {
      for (let i = 0; i < 6; i++) {
        tone({ freq: 70, type: 'square', gain: 0.05, duration: 0.06, delay: i * 0.07, filterFreq: 400 });
      }
    },
    enemyPhase() {
      tone({ freq: 330, type: 'triangle', gain: 0.07, duration: 0.16 });
      tone({ freq: 262, gain: 0.07, duration: 0.26, delay: 0.12 });
    },
    playerPhase() {
      tone({ freq: 523, type: 'triangle', gain: 0.07, duration: 0.14 });
      tone({ freq: 784, gain: 0.07, duration: 0.22, delay: 0.10 });
    },
    endTurn() {
      tone({ freq: 392, endFreq: 330, gain: 0.06, duration: 0.12 });
    },
    won() {
      WIN_CHORD.forEach((freq, i) => {
        tone({ freq, type: 'triangle', gain: 0.09, duration: 0.34, delay: i * 0.085 });
        tone({ freq: freq * 0.5, gain: 0.05, duration: 0.44, delay: i * 0.085 });
      });
    },
    lost() {
      tone({ freq: 392, endFreq: 330, type: 'triangle', gain: 0.09, duration: 0.26 });
      tone({ freq: 311, endFreq: 247, gain: 0.09, duration: 0.42, delay: 0.18 });
    },
  };

  return {
    isMuted: sfx.isMuted,
    setMuted: sfx.setMuted,
    unlock: sfx.unlock,
    setHidden: sfx.setHidden,
    play(name, step = 0) {
      if (!sfx.ready()) return;
      recipes[name](step);
    },
    destroy: sfx.destroy,
  };
}
