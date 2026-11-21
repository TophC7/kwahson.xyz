<script lang="ts">
  import type { Snippet } from 'svelte';

  export type StatusTone = 'sage' | 'ochre' | 'mint' | 'danger';

  interface Props {
    tone?: StatusTone;
    class?: string;
    children: Snippet;
  }

  const DOTS: Record<StatusTone, string> = {
    sage: 'bg-sage',
    ochre: 'bg-ochre',
    mint: 'bg-mint',
    danger: 'bg-danger',
  };

  let { tone = 'sage', class: className = '', children }: Props = $props();
</script>

<div
  role="status"
  class="hud-surface inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] text-ink-muted {className}"
>
  <span class="h-1.5 w-1.5 shrink-0 rounded-full {DOTS[tone]}" aria-hidden="true"></span>
  <span class="truncate">{@render children()}</span>
</div>
