<script lang="ts">
  export type TouchPadAccent = 'sage' | 'gold' | 'ochre';

  interface Props {
    label?: string;
    ariaLabel?: string;
    accent?: TouchPadAccent;
    radius?: number;
    maxTravel?: number;
    defaultPos?: { left: string; top: string };
    disabled?: boolean;
    onInput: (nx: number, ny: number, active: boolean) => void;
    class?: string;
  }

  let {
    label,
    ariaLabel = 'Touch control pad',
    accent = 'sage',
    radius = 54,
    maxTravel = 36,
    defaultPos = { left: '50%', top: '55%' },
    disabled = false,
    onInput,
    class: className = '',
  }: Props = $props();

  let controlZoneEl = $state<HTMLDivElement>();
  let pad = $state<{ id: number; x: number; y: number } | null>(null);
  let knobX = $state(0);
  let knobY = $state(0);

  const diameter = $derived(radius * 2);
  const innerSize = $derived(Math.round(radius * 0.8));
  const knobSize = $derived(Math.round(radius * 0.62));

  function reset() {
    if (!pad) return;
    pad = null;
    knobX = 0;
    knobY = 0;
    onInput(0, 0, false);
  }

  $effect(() => {
    if (disabled) reset();
  });

  $effect(() => () => reset());

  function handleDown(e: PointerEvent) {
    if (disabled || pad || !controlZoneEl) return;
    const rect = controlZoneEl.getBoundingClientRect();
    const margin = radius + 8;
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const clampedX = Math.min(Math.max(margin, rawX), Math.max(margin, rect.width - margin));
    const clampedY = Math.min(Math.max(margin, rawY), Math.max(margin, rect.height - margin));

    controlZoneEl.setPointerCapture(e.pointerId);
    pad = { id: e.pointerId, x: clampedX, y: clampedY };
    knobX = 0;
    knobY = 0;
    onInput(0, 0, true);
  }

  function handleMove(e: PointerEvent) {
    if (e.pointerId !== pad?.id || !controlZoneEl) return;
    const rect = controlZoneEl.getBoundingClientRect();
    const dx = e.clientX - rect.left - pad.x;
    const dy = e.clientY - rect.top - pad.y;
    const dist = Math.hypot(dx, dy);
    const k = dist > 0 ? Math.min(1, maxTravel / dist) : 0;
    knobX = dx * k;
    knobY = dy * k;
    onInput(maxTravel > 0 ? knobX / maxTravel : 0, maxTravel > 0 ? knobY / maxTravel : 0, true);
  }

  function handleUp(e: PointerEvent) {
    if (e.pointerId !== pad?.id) return;
    reset();
  }
</script>

<div
  bind:this={controlZoneEl}
  class="touch-pad-zone touch-none {className}"
  role="application"
  aria-label={ariaLabel}
  onpointerdown={handleDown}
  onpointermove={handleMove}
  onpointerup={handleUp}
  onpointercancel={handleUp}
  onlostpointercapture={handleUp}
>
  <div
    class="touch-pad"
    class:is-active={pad}
    data-accent={accent}
    style:width="{diameter}px"
    style:height="{diameter}px"
    style:left={pad ? `${pad.x}px` : defaultPos.left}
    style:top={pad ? `${pad.y}px` : defaultPos.top}
    aria-hidden="true"
  >
    <span class="touch-axis-h"></span>
    <span class="touch-axis-v"></span>
    <span class="touch-inner-ring" style:width="{innerSize}px" style:height="{innerSize}px"></span>
    {#if label && !pad}
      <span class="touch-pad-label">{label}</span>
    {/if}
    <span
      class="touch-knob"
      style:width="{knobSize}px"
      style:height="{knobSize}px"
      style:transform="translate(calc(-50% + {knobX}px), calc(-50% + {knobY}px))"
    ></span>
  </div>
</div>

<style>
  .touch-pad-zone {
    display: none;
  }

  @media (hover: none) and (pointer: coarse), (max-width: 900px) {
    .touch-pad-zone {
      display: block;
    }
  }

  .touch-pad {
    --pad-accent: var(--color-sage-soft);
    --pad-accent-base: var(--color-sage);
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent);
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--color-surface) 62%, transparent) 0%,
      color-mix(in srgb, var(--color-canvas) 42%, transparent) 100%
    );
    backdrop-filter: blur(4px);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-ink) 4%, transparent);
    pointer-events: none;
    opacity: 0.72;
    transition:
      left 220ms cubic-bezier(0.22, 1, 0.36, 1),
      top 220ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .touch-pad[data-accent='gold'] {
    --pad-accent: var(--color-gold);
    --pad-accent-base: var(--color-gold);
    border-color: color-mix(in srgb, var(--color-gold) 30%, transparent);
  }

  .touch-pad[data-accent='ochre'] {
    --pad-accent: var(--color-ochre);
    --pad-accent-base: var(--color-ochre);
    border-color: color-mix(in srgb, var(--color-ochre) 30%, transparent);
  }

  .touch-pad.is-active {
    opacity: 1;
    border-color: color-mix(in srgb, var(--pad-accent) 70%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--pad-accent) 22%, transparent),
      inset 0 0 18px color-mix(in srgb, var(--pad-accent-base) 16%, transparent);
    transition:
      opacity 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .touch-axis-h,
  .touch-axis-v {
    position: absolute;
    background: color-mix(in srgb, var(--color-ink) 16%, transparent);
  }

  .touch-axis-h {
    left: 12px;
    right: 12px;
    top: 50%;
    height: 1px;
    transform: translateY(-0.5px);
  }

  .touch-axis-v {
    top: 12px;
    bottom: 12px;
    left: 50%;
    width: 1px;
    transform: translateX(-0.5px);
  }

  .touch-pad.is-active .touch-axis-h,
  .touch-pad.is-active .touch-axis-v {
    background: color-mix(in srgb, var(--pad-accent) 34%, transparent);
  }

  .touch-inner-ring {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--color-ink) 16%, transparent);
  }

  .touch-pad-label {
    position: absolute;
    left: 50%;
    bottom: 11px;
    transform: translateX(-50%);
    font-family: var(--font-mono, monospace);
    font-size: 8.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    color: color-mix(in srgb, var(--color-ink) 62%, transparent);
  }

  .touch-pad[data-accent='gold'] .touch-pad-label,
  .touch-pad[data-accent='ochre'] .touch-pad-label {
    color: color-mix(in srgb, var(--pad-accent) 75%, transparent);
  }

  .touch-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--pad-accent) 65%, transparent);
    background: color-mix(in srgb, var(--pad-accent-base) 30%, transparent);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    transition:
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .touch-pad.is-active .touch-knob {
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .touch-pad,
    .touch-knob {
      transition: none !important;
    }
  }
</style>
