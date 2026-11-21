<script lang="ts">
  export type MeterTone = 'sage' | 'danger' | 'gold';

  interface Props {
    value: number;
    max: number;
    tone?: MeterTone;
    ariaLabel: string;
    class?: string;
  }

  const FILLS: Record<MeterTone, string> = {
    sage: 'bg-sage',
    danger: 'bg-danger',
    gold: 'bg-gold',
  };

  let { value, max, tone = 'sage', ariaLabel, class: className = '' }: Props = $props();

  const safeMax = $derived(Math.max(0, max));
  const clamped = $derived(Math.max(0, Math.min(safeMax, value)));
  const pct = $derived(safeMax > 0 ? (clamped / safeMax) * 100 : 0);
</script>

<div
  class="h-1.5 w-full overflow-hidden rounded-full bg-canvas {className}"
  role="meter"
  aria-label={ariaLabel}
  aria-valuemin={0}
  aria-valuemax={safeMax}
  aria-valuenow={clamped}
>
  <div
    class="h-full rounded-full transition-[width,background-color] duration-150 {FILLS[tone]}"
    style:width="{pct}%"
  ></div>
</div>
