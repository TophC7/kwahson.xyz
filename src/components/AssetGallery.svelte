<script module lang="ts">
  import type { MiniatureId } from '../lib/miniatures';

  export interface GalleryItem<T extends string = MiniatureId> {
    id: T;
    name: string;
    group: string;
    badge: string;
  }

  export interface GalleryGroup {
    label: string;
    accent: string;
  }
</script>

<script lang="ts">
  import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Copy01Icon,
    Delete02Icon,
    Tick01Icon,
  } from '@hugeicons/core-free-icons';
  import { createTurntable } from '../lib/turntable';
  import Button from './ui/Button.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';
  import SegmentedControl, { type SegmentedOption } from './ui/SegmentedControl.svelte';

  type ReviewStatus = 'ok' | 'tweak' | 'redo' | '';
  type ViewMode = 'both' | 'tile' | 'model';

  interface ReviewEntry {
    status: ReviewStatus;
    comment: string;
  }

  interface Props {
    title: string;
    storageKey: string;
    items: GalleryItem<string>[];
    groups: Record<string, GalleryGroup>;
    previews?: Record<string, string>;
    tags?: Record<string, string>;
  }

  const STATUSES: { id: Exclude<ReviewStatus, ''>; label: string; cls: string }[] = [
    { id: 'ok', label: 'OK', cls: 'border-sage/60 bg-sage/24 text-ink' },
    { id: 'tweak', label: 'Tweak', cls: 'border-ochre/70 bg-ochre/24 text-ink' },
    { id: 'redo', label: 'Redo', cls: 'border-danger/70 bg-danger/24 text-danger-soft' },
  ];
  const VIEW_MODES: SegmentedOption<ViewMode>[] = [
    { value: 'both', label: 'Both' },
    { value: 'tile', label: 'Tile' },
    { value: 'model', label: '3D Model' },
  ];
  // Status/comment review + JSON export only exist on the dev server; Vite folds this to `false` in builds so those branches drop out.
  const REVIEW = import.meta.env.DEV;

  let { title, storageKey, items, groups, previews, tags }: Props = $props();

  const turntable = createTurntable();
  let copyTimer = 0;
  let confirmTimer = 0;

  $effect(() => () => {
    clearTimeout(copyTimer);
    clearTimeout(confirmTimer);
    turntable.destroy();
  });

  function loadSaved(): Record<string, ReviewEntry> {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  let reviews = $state<Record<string, ReviewEntry>>({});
  let filter = $state('all');
  let viewMode = $state<ViewMode>('both');
  let copied = $state(false);
  let showJson = $state(false);
  let confirmClear = $state(false);
  let focusedId = $state<string | null>(null);

  $effect(() => {
    void storageKey;
    reviews = REVIEW ? loadSaved() : {};
    filter = 'all';
    focusedId = null;
    showJson = false;
    confirmClear = false;
  });

  function saveReviews() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(reviews));
    } catch {
      // Ignore storage failures
    }
  }

  function getEntry(id: string): ReviewEntry {
    return reviews[id] ?? { status: '', comment: '' };
  }

  function patchEntry(id: string, patch: Partial<ReviewEntry>) {
    reviews[id] = { ...getEntry(id), ...patch };
    saveReviews();
  }

  function setStatus(id: string, next: ReviewStatus) {
    patchEntry(id, { status: getEntry(id).status === next ? '' : next });
  }

  function hasFeedback(id: string): boolean {
    const entry = reviews[id];
    if (!entry) return false;
    return entry.comment.trim().length > 0 || entry.status === 'tweak' || entry.status === 'redo';
  }

  const exportItems = $derived(
    items.filter((d) => hasFeedback(d.id)).map((d) => ({
      id: d.id,
      name: d.name,
      group: d.group,
      badge: d.badge,
      status: reviews[d.id].status || 'note',
      comment: reviews[d.id].comment.trim(),
    })),
  );

  const exportJson = $derived(JSON.stringify(exportItems, null, 2));

  const filterOptions = $derived<SegmentedOption<string>[]>([
    { value: 'all', label: `All (${items.length})` },
    ...(REVIEW ? [{ value: 'notes', label: `Notes (${exportItems.length})` }] : []),
    ...Object.keys(groups).map((group) => ({
      value: group,
      label: `${groups[group].label} (${items.filter((d) => d.group === group).length})`,
    })),
  ]);

  const filteredDesigns = $derived.by(() => {
    if (filter === 'all') return items;
    if (filter === 'notes') return items.filter((d) => hasFeedback(d.id));
    return items.filter((d) => d.group === filter);
  });

  const focusedIndex = $derived(
    focusedId ? filteredDesigns.findIndex((d) => d.id === focusedId) : -1,
  );
  const focusedDesign = $derived<GalleryItem<string> | null>(
    focusedIndex >= 0 ? filteredDesigns[focusedIndex] : null,
  );

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(exportJson);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => (copied = false), 2000);
    } catch {
      showJson = true;
    }
  }

  function clearAllNotes() {
    if (!confirmClear) {
      confirmClear = true;
      clearTimeout(confirmTimer);
      confirmTimer = window.setTimeout(() => (confirmClear = false), 3000);
      return;
    }
    reviews = {};
    confirmClear = false;
    clearTimeout(confirmTimer);
    saveReviews();
  }

  function stepFocused(delta: number) {
    if (focusedIndex < 0 || filteredDesigns.length === 0) return;
    const nextIdx = (focusedIndex + delta + filteredDesigns.length) % filteredDesigns.length;
    focusedId = filteredDesigns[nextIdx].id;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    if (focusedDesign) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFocused(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFocused(-1);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet reviewEditor(id: string, rows: number, placeholder: string)}
  {@const entry = getEntry(id)}
  <div class="flex flex-1 flex-col gap-2 border-t border-ink/8 p-2.5">
    <div class="flex items-center gap-1 font-mono text-[10px]">
      {#each STATUSES as btn (btn.id)}
        <button
          type="button"
          onclick={() => setStatus(id, btn.id)}
          aria-pressed={entry.status === btn.id}
          class="focus-ring flex-1 cursor-pointer rounded-sm border py-1 transition-colors {entry.status === btn.id
            ? btn.cls
            : 'border-ink/9 bg-canvas/60 text-ink-dim hover:text-ink-muted'}"
        >
          {btn.label}
        </button>
      {/each}
    </div>

    <textarea
      {rows}
      value={entry.comment}
      oninput={(e) => patchEntry(id, { comment: e.currentTarget.value })}
      {placeholder}
      class="focus-ring w-full resize-y rounded-sm border border-ink/10 bg-canvas/80 px-2 py-1.5 text-xs text-ink placeholder:text-ink-dim"
    ></textarea>
  </div>
{/snippet}

<div class="flex flex-col text-ink select-text">
  <div class="border-b border-ink/10 bg-surface/75 px-3 py-3 sm:px-5">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5">
      <h2 class="text-sm font-semibold tracking-tight text-ink sm:text-base">
        {title}{REVIEW ? ' Review' : ''}
        <span class="font-mono text-xs font-normal text-ink-dim">({items.length})</span>
      </h2>

      <div class="flex flex-wrap items-center gap-1.5">
        {#if previews}
          <SegmentedControl
            options={VIEW_MODES}
            value={viewMode}
            onChange={(v) => (viewMode = v)}
            ariaLabel="Preview view mode"
          />
        {/if}

        {#if REVIEW}
          <Button
            variant="surface"
            size="sm"
            active={showJson}
            onclick={() => (showJson = !showJson)}
            class="text-ink-muted hover:text-ink"
          >
            {showJson ? 'Hide JSON' : 'Preview JSON'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={copied ? Tick01Icon : Copy01Icon}
            iconSize={13}
            onclick={copyJson}
          >
            {copied ? 'Copied JSON!' : `Copy JSON (${exportItems.length})`}
          </Button>

          {#if exportItems.length > 0}
            <Button
              variant={confirmClear ? 'danger' : 'surface'}
              size="sm"
              icon={Delete02Icon}
              iconSize={13}
              onclick={clearAllNotes}
              title="Clear all saved notes"
            >
              {confirmClear ? 'Confirm clear?' : 'Clear'}
            </Button>
          {/if}
        {/if}
      </div>
    </div>

    <div class="mx-auto mt-2.5 max-w-7xl">
      <SegmentedControl
        options={filterOptions}
        value={filter}
        onChange={(v) => (filter = v)}
        ariaLabel="Filter assets"
      />
    </div>
  </div>

  {#if REVIEW && showJson}
    <div class="shrink-0 border-b border-ink/12 bg-[#141613] px-3 py-3 sm:px-5">
      <div class="mx-auto max-w-7xl">
        <div class="mb-1.5 flex items-center justify-between font-mono text-[10.5px] text-ink-dim">
          <span>JSON payload ({exportItems.length} flagged/commented assets)</span>
          <button
            type="button"
            onclick={copyJson}
            class="focus-ring cursor-pointer rounded-xs text-sage-soft underline underline-offset-2 hover:text-ink"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
        <pre class="max-h-48 overflow-auto rounded-sm border border-ink/10 bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-muted">{exportJson}</pre>
      </div>
    </div>
  {/if}

  <div class="px-3 py-4 sm:px-5 sm:py-5">
    <div class="mx-auto max-w-7xl">
      {#if filteredDesigns.length === 0}
        <div class="rounded-md border border-dashed border-ink/14 bg-surface/40 p-10 text-center">
          <p class="font-mono text-xs text-ink-muted">No assets match this filter yet.</p>
          <Button variant="primary" size="sm" onclick={() => (filter = 'all')} class="mt-3">
            Show all {items.length} assets
          </Button>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each filteredDesigns as design (`${design.group}:${design.id}`)}
            {@const entry = getEntry(design.id)}
            {@const group = groups[design.group]}
            {@const tag = tags?.[design.id]}
            <article
              class="flex flex-col overflow-hidden rounded-md border bg-surface transition-colors {entry.status === 'redo'
                ? 'border-danger/55'
                : entry.status === 'tweak'
                  ? 'border-ochre/60'
                  : entry.status === 'ok'
                    ? 'border-sage/45'
                    : 'border-ink/10'}"
            >
              <div class="flex items-center justify-between gap-2 border-b border-ink/8 px-3 py-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    class="inline-flex h-5 min-w-[22px] items-center justify-center rounded-[3px] px-1 font-mono text-[10px] font-bold text-[#fbf7ee]"
                    style="background-color: {group.accent};"
                  >
                    {design.badge}
                  </span>
                  <div class="min-w-0">
                    <h2 class="truncate text-xs font-semibold text-ink">{design.name}</h2>
                    <p class="truncate font-mono text-[10px] text-ink-dim">{design.id}</p>
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                  {#if tag}
                    <span class="rounded-[3px] border border-sage/35 bg-sage/12 px-1.5 py-0.5 font-mono text-[9px] text-sage-soft uppercase">
                      {tag}
                    </span>
                  {/if}
                  <span class="rounded-[3px] border border-ink/9 bg-canvas/70 px-1.5 py-0.5 font-mono text-[9px] text-ink-dim uppercase">
                    {group.label}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onclick={() => (focusedId = design.id)}
                class="focus-ring group relative flex cursor-zoom-in items-center justify-center gap-2.5 bg-[#141613] p-3 transition-colors hover:bg-[#191c18]"
                title="Click to inspect larger"
              >
                {#if previews?.[design.id] && viewMode !== 'model'}
                  <img
                    src={previews[design.id]}
                    alt={`${design.name} tile face`}
                    class="rounded-[6px] shadow-[0_8px_20px_rgba(0,0,0,0.45)] {viewMode === 'both'
                      ? 'h-36 w-auto'
                      : 'h-48 w-auto'}"
                  />
                {/if}

                {#if !previews || viewMode !== 'tile'}
                  <div
                    class="flex items-center justify-center rounded-[6px] border border-ink/8 bg-[#232721] p-1.5 {previews && viewMode === 'both'
                      ? 'h-36 w-32'
                      : 'h-48 w-48'}"
                  >
                    <canvas
                      {@attach turntable.spin(design.id)}
                      width="256"
                      height="256"
                      class="h-full w-full object-contain"
                    >{design.name} 3D model</canvas>
                  </div>
                {/if}
              </button>

              {#if REVIEW}
                {@render reviewEditor(design.id, 2, 'Add comment for this asset...')}
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <ModalDialog
    open={Boolean(focusedDesign)}
    onClose={() => (focusedId = null)}
    eyebrow={focusedDesign ? `${groups[focusedDesign.group].label} · ${focusedDesign.id}` : ''}
    title={focusedDesign?.name ?? ''}
    maxWidth="42rem"
  >
    {#snippet headerExtra()}
      {#if focusedDesign}
        <span class="mr-1 font-mono text-[11px] text-ink-dim">
          {focusedIndex + 1} / {filteredDesigns.length}
        </span>
        <Button
          variant="surface"
          size="sm"
          icon={ArrowLeft01Icon}
          iconSize={15}
          aria-label="Previous"
          title="Previous (Left Arrow)"
          onclick={() => stepFocused(-1)}
        />
        <Button
          variant="surface"
          size="sm"
          icon={ArrowRight01Icon}
          iconSize={15}
          aria-label="Next"
          title="Next (Right Arrow)"
          onclick={() => stepFocused(1)}
        />
      {/if}
    {/snippet}

    {#if focusedDesign}
      <div class="-mx-5 -my-4 flex flex-col">
        <div class="grid grid-cols-1 gap-4 bg-[#141613] p-5 {previews ? 'sm:grid-cols-2' : ''}">
          {#if previews}
            <div class="flex flex-col items-center gap-2">
              <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">Tile Face</span>
              {#if previews[focusedDesign.id]}
                <img
                  src={previews[focusedDesign.id]}
                  alt={`${focusedDesign.name} tile face`}
                  class="h-64 w-auto rounded-[8px] shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
                />
              {/if}
            </div>
          {/if}
          <div class="flex flex-col items-center gap-2">
            <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">3D Miniature</span>
            <div class="flex h-64 w-64 items-center justify-center rounded-[8px] border border-ink/10 bg-[#232721] p-3">
              <canvas
                {@attach turntable.spin(focusedDesign.id)}
                width="512"
                height="512"
                class="h-full w-full object-contain"
              >{focusedDesign.name} 3D model</canvas>
            </div>
          </div>
        </div>

        {#if REVIEW}
          <div class="p-1.5">
            {@render reviewEditor(
              focusedDesign.id,
              3,
              'Describe what looks whacky or what to change...',
            )}
          </div>
        {/if}
      </div>
    {/if}
  </ModalDialog>
</div>
