<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Cancel01Icon } from '@hugeicons/core-free-icons';
  import Button from './Button.svelte';

  export type DialogTone = 'default' | 'sage' | 'danger' | 'gold';

  interface Props {
    open: boolean;
    onClose?: () => void;
    dismissible?: boolean;
    eyebrow?: string;
    title: string;
    tone?: DialogTone;
    maxWidth?: string;
    headerExtra?: Snippet;
    children: Snippet;
    actions?: Snippet;
    class?: string;
  }

  const TONES: Record<DialogTone, { border: string; eyebrow: string }> = {
    default: { border: 'border-ink/14', eyebrow: 'text-ink-dim' },
    sage: { border: 'border-sage/35', eyebrow: 'text-sage' },
    danger: { border: 'border-danger/40', eyebrow: 'text-danger-soft' },
    gold: { border: 'border-gold/35', eyebrow: 'text-gold' },
  };

  let {
    open,
    onClose,
    dismissible = true,
    eyebrow,
    title,
    tone = 'default',
    maxWidth = '26rem',
    headerExtra,
    children,
    actions,
    class: className = '',
  }: Props = $props();

  const titleId = $props.id();
  let dialogEl = $state<HTMLDialogElement>();
  let backdropDown = false;

  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  });

  function handleCancel(e: Event) {
    if (!dismissible || !onClose) e.preventDefault();
  }

  function handleClose() {
    if (open) onClose?.();
  }

  function handlePointerDown(e: PointerEvent) {
    backdropDown = e.target === dialogEl;
  }

  function handleClick(e: MouseEvent) {
    if (dismissible && backdropDown && e.target === dialogEl) onClose?.();
    backdropDown = false;
  }
</script>

<dialog
  bind:this={dialogEl}
  aria-labelledby={titleId}
  style:max-width={maxWidth}
  oncancel={handleCancel}
  onclose={handleClose}
  onpointerdown={handlePointerDown}
  onclick={handleClick}
  class="m-auto max-h-[90dvh] w-[92vw] overflow-y-auto overscroll-contain rounded-md border bg-surface p-0 text-ink shadow-[0_24px_70px_rgba(0,0,0,0.72)] backdrop:bg-canvas/70 backdrop:backdrop-blur-xs {TONES[tone].border} {className}"
>
  <div class="flex flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
      <div class="min-w-0 flex-1">
        {#if eyebrow}
          <p class="font-mono text-[10px] tracking-[0.14em] uppercase {TONES[tone].eyebrow}">
            {eyebrow}
          </p>
        {/if}
        <h2 id={titleId} class="mt-0.5 text-lg leading-snug font-semibold tracking-tight text-ink">
          {title}
        </h2>
      </div>

      {#if headerExtra || (dismissible && onClose)}
        <div class="flex shrink-0 items-center gap-1.5">
          {#if headerExtra}
            {@render headerExtra()}
          {/if}
          {#if dismissible && onClose}
            <Button
              variant="surface"
              size="sm"
              icon={Cancel01Icon}
              aria-label="Close"
              title="Close (Esc)"
              onclick={onClose}
            />
          {/if}
        </div>
      {/if}
    </header>

    <div class="px-5 py-4 text-sm text-ink-muted">
      {@render children()}
    </div>

    {#if actions}
      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-ink/10 px-5 py-3.5">
        {@render actions()}
      </footer>
    {/if}
  </div>
</dialog>
