<script module lang="ts">
  import type { MiniatureId } from '../lib/miniatures';

  /** True when the page was opened with `?gallery`. */
  export const galleryLinked = () => new URLSearchParams(location.search).has('gallery');

  /** Mirrors the open state into `?gallery=1`, keeping the path, other params and hash. */
  export function linkGallery(open: boolean) {
    const url = new URL(location.href);
    if (open) url.searchParams.set('gallery', '1');
    else url.searchParams.delete('gallery');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  export interface GalleryItem {
    id: MiniatureId;
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
    Cancel01Icon,
    Copy01Icon,
    Delete02Icon,
    Tick01Icon,
  } from '@hugeicons/core-free-icons';
  import { createTurntable } from '../lib/turntable';
  import Icon from './Icon.svelte';

  type ReviewStatus = 'ok' | 'tweak' | 'redo' | '';
  type ViewMode = 'both' | 'tile' | 'model';

  interface ReviewEntry {
    status: ReviewStatus;
    comment: string;
  }

  interface Props {
    title: string;
    storageKey: string;
    items: GalleryItem[];
    groups: Record<string, GalleryGroup>;
    previews?: Record<string, string>;
    tags?: Record<string, string>;
    onClose: () => void;
  }

  const STATUSES: { id: Exclude<ReviewStatus, ''>; label: string; cls: string }[] = [
    { id: 'ok', label: 'OK', cls: 'border-sage/60 bg-sage/24 text-ink' },
    { id: 'tweak', label: 'Tweak', cls: 'border-ochre/70 bg-ochre/24 text-ink' },
    { id: 'redo', label: 'Redo', cls: 'border-[#c96c5b]/70 bg-[#c96c5b]/24 text-[#f0b4a9]' },
  ];
  // Status/comment review + JSON export only exist on the dev server; Vite folds this to `false` in builds so those branches drop out.
  const REVIEW = import.meta.env.DEV;

  let { title, storageKey, items, groups, previews, tags, onClose }: Props = $props();

  const turntable = createTurntable();
  $effect(() => turntable.destroy);

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

  let reviews = $state<Record<string, ReviewEntry>>(REVIEW ? loadSaved() : {});
  let filter = $state('all');
  let viewMode = $state<ViewMode>('both');
  let copied = $state(false);
  let showJson = $state(false);
  let confirmClear = $state(false);
  let focusedId = $state<string | null>(null);

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

  const filteredDesigns = $derived.by(() => {
    if (filter === 'all') return items;
    if (filter === 'notes') return items.filter((d) => hasFeedback(d.id));
    return items.filter((d) => d.group === filter);
  });

  const focusedIndex = $derived(
    focusedId ? filteredDesigns.findIndex((d) => d.id === focusedId) : -1,
  );
  const focusedDesign = $derived<GalleryItem | null>(
    focusedIndex >= 0 ? filteredDesigns[focusedIndex] : null,
  );

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(exportJson);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      showJson = true;
    }
  }

  function clearAllNotes() {
    if (!confirmClear) {
      confirmClear = true;
      setTimeout(() => (confirmClear = false), 3000);
      return;
    }
    reviews = {};
    confirmClear = false;
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
      if (e.key === 'Escape') {
        focusedId = null;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFocused(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFocused(-1);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="absolute inset-0 z-40 flex flex-col bg-canvas text-ink select-text"
  role="dialog"
  aria-modal="true"
  aria-label={title}
>
  <!-- Sticky top review bar -->
  <header class="shrink-0 border-b border-ink/10 bg-surface/95 px-3 py-2.5 backdrop-blur-md sm:px-5">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5">
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={onClose}
          class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-ink/14 bg-surface-raised px-2.5 font-mono text-[11px] text-ink transition-colors hover:border-sage/45"
        >
          <Icon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
          <span>Back</span>
        </button>

        <div>
          <h1 class="text-sm font-semibold tracking-tight text-ink sm:text-base">
            {title}{REVIEW ? ' Review' : ''} <span class="font-mono text-xs font-normal text-ink-dim">({items.length})</span>
          </h1>
        </div>
      </div>

      <!-- View mode + JSON export actions -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#if previews}
          <div
            role="group"
            aria-label="Preview view mode"
            class="flex items-center rounded-sm border border-ink/12 bg-canvas/80 p-0.5 font-mono text-[10.5px]"
          >
            {#each [
              { id: 'both', label: 'Both' },
              { id: 'tile', label: 'Tile' },
              { id: 'model', label: '3D Model' },
            ] as mode}
              <button
                type="button"
                onclick={() => (viewMode = mode.id as ViewMode)}
                class="cursor-pointer rounded-[2px] px-2 py-1 transition-colors {viewMode === mode.id
                  ? 'bg-sage/25 text-ink'
                  : 'text-ink-muted hover:text-ink'}"
              >
                {mode.label}
              </button>
            {/each}
          </div>
        {/if}

        {#if REVIEW}
          <button
            type="button"
            onclick={() => (showJson = !showJson)}
            class="inline-flex h-8 cursor-pointer items-center rounded-sm border border-ink/12 bg-surface-raised px-2.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-ink/26 hover:text-ink"
          >
            {showJson ? 'Hide JSON' : 'Preview JSON'}
          </button>

          <button
            type="button"
            onclick={copyJson}
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-sage/55 bg-sage/24 px-3 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-sage/36"
          >
            <Icon icon={copied ? Tick01Icon : Copy01Icon} size={13} strokeWidth={2} />
            <span>{copied ? 'Copied JSON!' : `Copy JSON (${exportItems.length})`}</span>
          </button>

          {#if exportItems.length > 0}
            <button
              type="button"
              onclick={clearAllNotes}
              class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-sm border px-2 font-mono text-[10.5px] transition-colors {confirmClear
                ? 'border-[#c96c5b]/60 bg-[#c96c5b]/20 text-[#e8a397]'
                : 'border-ink/10 bg-surface-raised text-ink-dim hover:text-ink-muted'}"
              title="Clear all saved notes"
            >
              <Icon icon={Delete02Icon} size={13} strokeWidth={1.8} />
              <span>{confirmClear ? 'Confirm clear?' : 'Clear'}</span>
            </button>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Group filter pills -->
    <div class="mx-auto mt-2.5 flex max-w-7xl flex-wrap items-center gap-1.5">
      <button
        type="button"
        onclick={() => (filter = 'all')}
        class="cursor-pointer rounded-sm border px-2 py-0.5 font-mono text-[10.5px] transition-colors {filter === 'all'
          ? 'border-sage/50 bg-sage/20 text-ink'
          : 'border-ink/9 bg-canvas/60 text-ink-muted hover:text-ink'}"
      >
        All ({items.length})
      </button>

      {#if REVIEW}
        <button
          type="button"
          onclick={() => (filter = 'notes')}
          class="cursor-pointer rounded-sm border px-2 py-0.5 font-mono text-[10.5px] transition-colors {filter === 'notes'
            ? 'border-ochre/60 bg-ochre/20 text-ink'
            : 'border-ink/9 bg-canvas/60 text-ink-muted hover:text-ink'}"
        >
          Flagged / Notes ({exportItems.length})
        </button>
      {/if}

      <span class="mx-0.5 h-3.5 w-px bg-ink/12" aria-hidden="true"></span>

      {#each Object.keys(groups) as group}
        {@const count = items.filter((d) => d.group === group).length}
        <button
          type="button"
          onclick={() => (filter = group)}
          class="cursor-pointer rounded-sm border px-2 py-0.5 font-mono text-[10.5px] transition-colors {filter === group
            ? 'border-sage/50 bg-sage/20 text-ink'
            : 'border-ink/9 bg-canvas/60 text-ink-muted hover:text-ink'}"
        >
          {groups[group].label} ({count})
        </button>
      {/each}
    </div>
  </header>

  <!-- Collapsible JSON preview drawer -->
  {#if REVIEW && showJson}
    <div class="shrink-0 border-b border-ink/12 bg-[#141613] px-3 py-3 sm:px-5">
      <div class="mx-auto max-w-7xl">
        <div class="mb-1.5 flex items-center justify-between font-mono text-[10.5px] text-ink-dim">
          <span>JSON payload ({exportItems.length} flagged/commented assets)</span>
          <button
            type="button"
            onclick={copyJson}
            class="cursor-pointer text-sage-soft underline underline-offset-2 hover:text-ink"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
        <pre class="max-h-48 overflow-auto rounded-sm border border-ink/10 bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-muted">{exportJson}</pre>
      </div>
    </div>
  {/if}

  <!-- Scrollable asset review grid -->
  <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
    <div class="mx-auto max-w-7xl">
      {#if filteredDesigns.length === 0}
        <div class="rounded-md border border-dashed border-ink/14 bg-surface/40 p-10 text-center">
          <p class="font-mono text-xs text-ink-muted">No assets match this filter yet.</p>
          <button
            type="button"
            onclick={() => (filter = 'all')}
            class="mt-3 cursor-pointer rounded-sm border border-sage/45 bg-sage/18 px-3 py-1.5 font-mono text-[11px] text-ink"
          >
            Show all {items.length} assets
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each filteredDesigns as design (design.id)}
            {@const entry = getEntry(design.id)}
            {@const group = groups[design.group]}
            {@const tag = tags?.[design.id]}
            <article
              class="flex flex-col overflow-hidden rounded-md border bg-surface transition-colors {entry.status === 'redo'
                ? 'border-[#c96c5b]/55'
                : entry.status === 'tweak'
                  ? 'border-ochre/60'
                  : entry.status === 'ok'
                    ? 'border-sage/45'
                    : 'border-ink/10'}"
            >
              <!-- Card header -->
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

              <!-- Image preview stage (click to zoom lightbox) -->
              <button
                type="button"
                onclick={() => (focusedId = design.id)}
                class="group relative flex cursor-zoom-in items-center justify-center gap-2.5 bg-[#141613] p-3 transition-colors hover:bg-[#191c18]"
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
                <!-- Status pills + comment input -->
                <div class="flex flex-1 flex-col gap-2 border-t border-ink/8 p-2.5">
                  <div class="flex items-center gap-1 font-mono text-[10px]">
                    {#each STATUSES as btn}
                      <button
                        type="button"
                        onclick={() => setStatus(design.id, btn.id)}
                        class="flex-1 cursor-pointer rounded-sm border py-1 transition-colors {entry.status === btn.id
                          ? btn.cls
                          : 'border-ink/9 bg-canvas/60 text-ink-dim hover:text-ink-muted'}"
                      >
                        {btn.label}
                      </button>
                    {/each}
                  </div>

                  <textarea
                    rows={2}
                    value={entry.comment}
                    oninput={(e) => patchEntry(design.id, { comment: e.currentTarget.value })}
                    placeholder="Add comment for this asset..."
                    class="w-full resize-y rounded-sm border border-ink/10 bg-canvas/80 px-2 py-1.5 text-xs text-ink placeholder:text-ink-dim focus:border-sage/55 focus:outline-none"
                  ></textarea>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Lightbox detail view for inspecting an asset up close & stepping with arrow keys -->
  {#if focusedDesign}
    {@const group = groups[focusedDesign.group]}
    <div
      class="fixed inset-0 z-50 grid place-items-center bg-canvas/82 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${focusedDesign.name}`}
    >
      <div class="w-full max-w-2xl overflow-hidden rounded-md border border-ink/16 bg-surface shadow-[0_28px_80px_rgba(0,0,0,0.8)]">
        <div class="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <div class="flex items-center gap-2.5">
            <span
              class="inline-flex h-6 min-w-[26px] items-center justify-center rounded-[3px] px-1.5 font-mono text-xs font-bold text-[#fbf7ee]"
              style="background-color: {group.accent};"
            >
              {focusedDesign.badge}
            </span>
            <div>
              <strong class="text-sm text-ink">{focusedDesign.name}</strong>
              <span class="ml-2 font-mono text-xs text-ink-dim">{focusedDesign.id}</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="mr-1 font-mono text-[11px] text-ink-dim">
              {focusedIndex + 1} / {filteredDesigns.length}
            </span>
            <button
              type="button"
              onclick={() => stepFocused(-1)}
              class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-ink/12 bg-surface-raised text-ink-muted hover:text-ink"
              title="Previous (Left Arrow)"
            >
              <Icon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onclick={() => stepFocused(1)}
              class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-ink/12 bg-surface-raised text-ink-muted hover:text-ink"
              title="Next (Right Arrow)"
            >
              <Icon icon={ArrowRight01Icon} size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onclick={() => (focusedId = null)}
              class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-ink/12 bg-surface-raised text-ink-muted hover:text-ink"
              title="Close (Esc)"
            >
              <Icon icon={Cancel01Icon} size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

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
          {@const entry = getEntry(focusedDesign.id)}
          <div class="flex flex-col gap-2.5 border-t border-ink/10 p-4">
            <div class="flex items-center gap-2 font-mono text-[11px]">
              <span class="text-ink-dim">Status:</span>
              {#each STATUSES as btn}
                <button
                  type="button"
                  onclick={() => setStatus(focusedDesign.id, btn.id)}
                  class="cursor-pointer rounded-sm border px-3 py-1 transition-colors {entry.status === btn.id
                    ? btn.cls
                    : 'border-ink/10 bg-canvas/60 text-ink-dim hover:text-ink'}"
                >
                  {btn.label}
                </button>
              {/each}
            </div>

            <textarea
              rows={3}
              value={entry.comment}
              oninput={(e) => patchEntry(focusedDesign.id, { comment: e.currentTarget.value })}
              placeholder="Describe what looks whacky or what to change..."
              class="w-full resize-y rounded-sm border border-ink/12 bg-canvas/90 px-3 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-sage/55 focus:outline-none"
            ></textarea>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
