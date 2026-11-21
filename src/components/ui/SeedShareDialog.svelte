<script lang="ts">
  import { DiceIcon, Share08Icon, Tick01Icon } from '@hugeicons/core-free-icons';
  import Button from './Button.svelte';
  import ModalDialog from './ModalDialog.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    seed: number;
    eyebrow?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    shareTitle?: string;
    shareText?: string;
    seedLabel?: string;
    submitLabel?: string;
    maxSeed?: number;
    onSelectSeed: (seed: number) => void;
    onRandomSeed?: () => void;
  }

  let {
    open,
    onClose,
    seed,
    eyebrow = 'Share',
    title,
    subtitle,
    description = 'Share this link to replay the exact same seed.',
    shareTitle = 'kwahson.xyz',
    shareText,
    seedLabel = 'Play a seed',
    submitLabel = 'Load',
    maxSeed,
    onSelectSeed,
    onRandomSeed,
  }: Props = $props();

  let seedInput = $state<number | undefined>(undefined);
  let copied = $state(false);
  let copyTimer = 0;
  let urlInputEl = $state<HTMLInputElement>();

  const shareUrl = $derived(open && typeof window !== 'undefined' ? window.location.href : '');
  const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  $effect(() => {
    if (!open) {
      copied = false;
      seedInput = undefined;
    }
  });

  $effect(() => () => clearTimeout(copyTimer));

  async function handleShare() {
    const url = window.location.href;
    if (hasNativeShare) {
      try {
        await navigator.share({ title: shareTitle, text: shareText ?? `Seed #${seed}`, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => (copied = false), 2000);
    } catch {
      urlInputEl?.focus();
      urlInputEl?.select();
    }
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (seedInput === undefined || !Number.isFinite(seedInput) || seedInput < 1) return;
    onSelectSeed(Math.floor(seedInput));
    seedInput = undefined;
    onClose();
  }
</script>

<ModalDialog
  {open}
  {onClose}
  {eyebrow}
  title={title ?? `Seed #${seed}`}
  tone="sage"
  maxWidth="25rem"
>
  <div class="grid gap-3">
    {#if subtitle}
      <p class="-mt-1 font-mono text-xs text-ink-muted">{subtitle}</p>
    {/if}

    <p class="text-xs leading-relaxed text-ink-muted">{description}</p>

    <div class="flex gap-2">
      <input
        bind:this={urlInputEl}
        type="text"
        readonly
        value={shareUrl}
        aria-label="Share link"
        onfocus={(e) => e.currentTarget.select()}
        class="focus-ring min-w-0 flex-1 rounded-sm border border-ink/15 bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-ink-muted select-text"
      />
      <Button
        variant="primary"
        size="md"
        icon={copied ? Tick01Icon : Share08Icon}
        onclick={handleShare}
      >
        {copied ? 'Copied' : hasNativeShare ? 'Share' : 'Copy'}
      </Button>
    </div>

    <form class="flex items-end gap-2 border-t border-ink/10 pt-3" onsubmit={handleSubmit}>
      <label class="flex min-w-0 flex-1 flex-col gap-1 font-mono text-[10px] tracking-wider text-ink-dim uppercase">
        {seedLabel}
        <input
          type="number"
          min={1}
          max={maxSeed}
          step={1}
          required
          placeholder={String(seed)}
          bind:value={seedInput}
          class="focus-ring h-9 rounded-sm border border-ink/15 bg-canvas px-2.5 font-mono text-xs text-ink"
        />
      </label>
      <Button type="submit" variant="surface" size="md" disabled={!seedInput}>
        {submitLabel}
      </Button>
      {#if onRandomSeed}
        <Button
          variant="surface"
          size="md"
          icon={DiceIcon}
          title="New random seed"
          onclick={() => {
            onRandomSeed();
            onClose();
          }}
        >
          Random
        </Button>
      {/if}
    </form>
  </div>
</ModalDialog>
