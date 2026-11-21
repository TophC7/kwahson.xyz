<script lang="ts" module>
  export interface SegmentedOption<T extends string | number = string> {
    value: T;
    label: string;
    suffix?: string | number;
    disabled?: boolean;
    title?: string;
  }
</script>

<script lang="ts" generics="T extends string | number">
  interface Props {
    options: readonly SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    variant?: 'floating' | 'inset';
    ariaLabel: string;
    class?: string;
  }

  let {
    options,
    value,
    onChange,
    variant = 'inset',
    ariaLabel,
    class: className = '',
  }: Props = $props();

  const containerClass = $derived(
    variant === 'floating'
      ? 'hud-surface pointer-events-auto inline-flex flex-wrap items-center gap-0.5 rounded-md p-1'
      : 'inline-flex flex-wrap items-center gap-0.5 rounded-sm border border-ink/12 bg-canvas/80 p-0.5',
  );
</script>

<div role="group" aria-label={ariaLabel} class="{containerClass} {className}">
  {#each options as opt (opt.value)}
    <button
      type="button"
      disabled={opt.disabled}
      title={opt.title}
      aria-pressed={value === opt.value}
      onclick={() => onChange(opt.value)}
      class="focus-ring rounded-[3px] px-2.5 py-1 font-mono text-[11px] transition-colors {value === opt.value
        ? 'bg-sage/24 text-ink'
        : opt.disabled
          ? 'cursor-not-allowed text-ink-dim/40'
          : 'cursor-pointer text-ink-muted hover:bg-surface-raised/70 hover:text-ink'}"
    >
      {opt.label}{#if opt.suffix !== undefined}<span class="ml-1 opacity-60">{opt.suffix}</span>{/if}
    </button>
  {/each}
</div>
