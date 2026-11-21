<script module lang="ts">
  import { TILE_DESIGNS } from './deck';

  const GALLERY_ITEMS = TILE_DESIGNS.map((d) => ({ id: d.id, name: d.name, group: d.suit, badge: d.badge }));
  const GALLERY_TAGS = Object.fromEntries(
    ['cow', 'healer-cow', 'hay-bale', 'rock', 'stump', 'crate', 'ufo'].map((id) => [id, 'Patrol']),
  );
</script>

<script lang="ts">
  import {
    Award01Icon,
    BulbIcon,
    Cancel01Icon,
    EyeIcon,
    GridViewIcon,
    HelpCircleIcon,
    RefreshIcon,
    ShuffleIcon,
    Undo02Icon,
    VolumeHighIcon,
    VolumeOffIcon,
    ZoomInAreaIcon,
  } from '@hugeicons/core-free-icons';
  import Icon from '../../components/Icon.svelte';
  import { DIFFICULTIES, type Difficulty } from './board';
  import { SUIT_STYLES, TOTAL_TILES } from './deck';
  import { mountMoojong, type MoojongController, type MoojongHudState } from './scene';
  import AssetGallery from '../../components/AssetGallery.svelte';

  const DIFFICULTY_LIST = Object.keys(DIFFICULTIES) as Difficulty[];
  const SEASON_IDS = TILE_DESIGNS.filter((d) => d.suit === 'season').map((d) => d.id);
  const BLOOM_IDS = TILE_DESIGNS.filter((d) => d.suit === 'bloom').map((d) => d.id);

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let topEl: HTMLDivElement;
  let footerEl: HTMLElement;
  let controller: MoojongController | null = null;
  let errorMessage = $state('');
  let showGuide = $state(false);
  let showGallery = $state(new URLSearchParams(window.location.search).has('gallery'));

  function setGalleryOpen(open: boolean) {
    showGallery = open;
    if (open) showGuide = false;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set('gallery', '1');
    else url.searchParams.delete('gallery');
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  let hud = $state<MoojongHudState>({
    difficulty: 'medium',
    layoutName: '',
    seed: 0,
    tilesLeft: TOTAL_TILES,
    movesLeft: 0,
    elapsedSec: 0,
    canUndo: false,
    muted: false,
    highlightFree: false,
    zoomed: false,
    hintsUsed: 0,
    reshufflesUsed: 0,
    status: '',
    phase: 'playing',
    selectedName: '',
  });
  let previews = $state.raw<Record<string, string>>({});

  function formatTime(totalSec: number): string {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  const nextDifficulty = $derived<Difficulty | null>(
    DIFFICULTY_LIST[DIFFICULTY_LIST.indexOf(hud.difficulty) + 1] ?? null,
  );

  const isPureClear = $derived(hud.reshufflesUsed === 0 && hud.hintsUsed === 0);

  $effect(() => {
    if (!viewportEl) return;
    errorMessage = '';

    try {
      const instance = mountMoojong({
        viewport: viewportEl,
        insets: (w, h) => {
          const side = w < h ? 6 : 24;
          return { top: topEl.offsetHeight + 4, bottom: footerEl.offsetHeight + 8, left: side, right: side };
        },
        onState: (patch) => {
          Object.assign(hud, patch);
        },
      });
      controller = instance;
      previews = instance.previews;
      const observer = new ResizeObserver(() => instance.refit());
      observer.observe(topEl);
      observer.observe(footerEl);
      return () => {
        observer.disconnect();
        instance.destroy();
        controller = null;
      };
    } catch (err) {
      console.error(err);
      errorMessage =
        'Your browser could not start the 3D Mahjong table. Please enable WebGL or try a newer browser.';
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Moojong Mahjong Solitaire">
  <!-- Subtle twilight dot grid + sage vignette matching kwahson.xyz -->
  <div
    class="bg-field-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_82%_76%_at_50%_50%,#000_25%,transparent_100%)]"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute inset-0"
    style="background: radial-gradient(circle at 50% 48%, rgba(122, 141, 118, 0.11), rgba(17, 18, 16, 0) 64%);"
    aria-hidden="true"
  ></div>

  <!-- Full-bleed 3D Three.js stage -->
  <div
    class="moojong-viewport absolute inset-0 z-0 touch-none"
    bind:this={viewportEl}
    aria-label="3D Mahjong board"
  ></div>

  <!-- Top floating HUD -->
  <div bind:this={topEl} class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-2.5 sm:p-4">
    <div class="flex items-start justify-between gap-2">
      <!-- Telemetry card -->
      <section
        aria-label="Board status"
        class="pointer-events-auto flex items-center gap-2.5 rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 py-1.5 backdrop-blur-md sm:gap-3.5 sm:px-3.5 sm:py-2"
      >
        <div class="flex flex-col">
          <span class="font-mono text-[8.5px] tracking-[0.12em] text-ink-dim uppercase">Tiles</span>
          <strong class="font-mono text-base leading-tight font-semibold text-ink sm:text-xl">
            {String(hud.tilesLeft).padStart(2, '0')}
          </strong>
        </div>

        <div class="h-6 w-px bg-[rgba(213,215,207,0.1)]" aria-hidden="true"></div>

        <div class="flex flex-col">
          <span class="font-mono text-[8.5px] tracking-[0.12em] text-ink-dim uppercase">Moves</span>
          <strong
            class="font-mono text-base leading-tight font-semibold sm:text-xl {hud.movesLeft <= 2
              ? 'text-ochre'
              : 'text-sage-soft'}"
          >
            {String(hud.movesLeft).padStart(2, '0')}
          </strong>
        </div>

        <div class="h-6 w-px bg-[rgba(213,215,207,0.1)]" aria-hidden="true"></div>

        <div class="flex flex-col">
          <span class="font-mono text-[8.5px] tracking-[0.12em] text-ink-dim uppercase">Time</span>
          <strong class="font-mono text-sm leading-tight font-medium text-ink-muted sm:text-base">
            {formatTime(hud.elapsedSec)}
          </strong>
        </div>
      </section>

      <!-- Desktop difficulty selector -->
      <div
        role="group"
        aria-label="Difficulty"
        class="pointer-events-auto hidden items-center gap-1 rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/85 p-1 backdrop-blur-md md:flex"
      >
        {#each DIFFICULTY_LIST as diff}
          <button
            type="button"
            onclick={() => controller?.setDifficulty(diff)}
            class="mj-btn cursor-pointer rounded-sm px-2.5 py-1 font-mono text-[11px] uppercase transition-colors {hud.difficulty ===
            diff
              ? 'bg-sage/25 text-ink'
              : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}"
            aria-pressed={hud.difficulty === diff}
            title={DIFFICULTIES[diff].tagline}
          >
            {DIFFICULTIES[diff].label}
          </button>
        {/each}
      </div>

      <!-- Right utility buttons -->
      <div class="pointer-events-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 font-mono text-[11px] backdrop-blur-md transition-colors hover:border-[rgba(213,215,207,0.26)] hover:bg-surface-raised {hud.muted
            ? 'text-ink-dim'
            : 'text-ink'}"
          aria-pressed={hud.muted}
          aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
          title="Toggle sound (M)"
          onclick={() => controller?.toggleMute()}
        >
          <Icon icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} size={14} strokeWidth={1.8} />
          <span class="hidden sm:inline">{hud.muted ? 'Off' : 'On'}</span>
        </button>

        <button
          type="button"
          class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 font-mono text-[11px] text-ink backdrop-blur-md transition-colors hover:border-[rgba(213,215,207,0.26)] hover:bg-surface-raised"
          aria-expanded={showGallery}
          aria-label="Inspect all 42 tile assets"
          title={import.meta.env.DEV ? 'Inspect & comment on all 42 tile assets' : 'Inspect all 42 tile assets'}
          onclick={() => setGalleryOpen(true)}
        >
          <Icon icon={GridViewIcon} size={14} strokeWidth={1.8} />
          <span class="hidden sm:inline">Assets</span>
        </button>

        <button
          type="button"
          class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 font-mono text-[11px] text-ink backdrop-blur-md transition-colors hover:border-[rgba(213,215,207,0.26)] hover:bg-surface-raised"
          aria-expanded={showGuide}
          aria-label="How to play and bonus tiles"
          title="Tile guide & rules"
          onclick={() => (showGuide = !showGuide)}
        >
          <Icon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
          <span class="hidden sm:inline">Guide</span>
        </button>
      </div>
    </div>

    <!-- Mobile difficulty bar + status pill. Fixed height and no wrapping: the board fits below this HUD,
         so a toast that changed its height would bounce the board on every show/dismiss. -->
    <div class="flex min-h-7 items-center justify-between gap-2">
      <div
        role="group"
        aria-label="Difficulty"
        class="pointer-events-auto flex items-center gap-0.5 rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/85 p-0.5 backdrop-blur-md md:hidden"
      >
        {#each DIFFICULTY_LIST as diff}
          <button
            type="button"
            onclick={() => controller?.setDifficulty(diff)}
            class="mj-btn cursor-pointer rounded-sm px-2 py-1 font-mono text-[10px] uppercase transition-colors {hud.difficulty ===
            diff
              ? 'bg-sage/25 text-ink'
              : 'text-ink-muted hover:text-ink'}"
            aria-pressed={hud.difficulty === diff}
          >
            {DIFFICULTIES[diff].label}
          </button>
        {/each}
      </div>

      {#if hud.status || hud.selectedName}
        <div
          role="status"
          class="mx-auto inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[rgba(213,215,207,0.1)] bg-surface/82 px-3 py-1 font-mono text-[10.5px] text-ink-muted backdrop-blur-md"
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full {hud.selectedName ? 'bg-ochre' : 'bg-sage'}"
            aria-hidden="true"
          ></span>
          <span class="truncate">
            {hud.status || `Selected: ${hud.selectedName}`}
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Bottom thumb-friendly action bar -->
  <footer
    bind:this={footerEl}
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 px-2.5 pb-2.5 sm:px-4 sm:pb-4 lg:justify-between"
    style="padding-bottom: max(10px, env(safe-area-inset-bottom));"
  >
    <!-- Layout & seed badge on desktop -->
    <div class="hidden items-center gap-2 rounded-md border border-[rgba(213,215,207,0.08)] bg-surface/75 px-3 py-2 font-mono text-[10.5px] text-ink-dim backdrop-blur-md lg:flex">
      <span class="text-ink-muted">{hud.layoutName}</span>
      <span>·</span>
      <span>#{hud.seed}</span>
    </div>

    <!-- Primary gameplay controls -->
    <div
      class="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/88 p-1.5 backdrop-blur-md"
    >
      <button
        type="button"
        disabled={!hud.canUndo}
        onclick={() => controller?.undo()}
        class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.1)] bg-surface-raised/70 px-2.5 font-mono text-[11px] text-ink transition-colors hover:border-[rgba(213,215,207,0.24)] hover:bg-surface-raised disabled:cursor-default disabled:opacity-40"
        title="Undo last match (Z)"
      >
        <Icon icon={Undo02Icon} size={14} strokeWidth={1.85} />
        <span>Undo</span>
      </button>

      <button
        type="button"
        disabled={hud.phase !== 'playing'}
        onclick={() => controller?.hint()}
        class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.1)] bg-surface-raised/70 px-2.5 font-mono text-[11px] text-ink transition-colors hover:border-ochre/45 hover:bg-surface-raised disabled:cursor-default disabled:opacity-40"
        title="Show a valid match (H)"
      >
        <Icon icon={BulbIcon} size={14} strokeWidth={1.85} class="text-ochre" />
        <span>Hint</span>
      </button>

      <button
        type="button"
        onclick={() => controller?.toggleHighlightFree()}
        aria-pressed={hud.highlightFree}
        class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 font-mono text-[11px] transition-colors {hud.highlightFree
          ? 'border-sage/55 bg-sage/22 text-ink'
          : 'border-[rgba(213,215,207,0.1)] bg-surface-raised/70 text-ink-muted hover:border-[rgba(213,215,207,0.24)] hover:text-ink'}"
        title="Dim blocked tiles to highlight free tiles (F)"
      >
        <Icon icon={EyeIcon} size={14} strokeWidth={1.85} />
        <span>Free</span>
      </button>

      {#if hud.zoomed}
        <button
          type="button"
          onclick={() => controller?.resetView()}
          class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-sage/40 bg-sage/18 px-2.5 font-mono text-[11px] text-ink transition-colors hover:bg-sage/28"
          title="Reset board zoom"
        >
          <Icon icon={ZoomInAreaIcon} size={14} strokeWidth={1.85} />
          <span>Fit</span>
        </button>
      {/if}

      <button
        type="button"
        onclick={() => controller?.newBoard()}
        class="mj-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.1)] bg-surface-raised/70 px-2.5 font-mono text-[11px] text-ink transition-colors hover:border-sage/45 hover:bg-surface-raised"
        title="Generate a fresh guaranteed-solvable board"
      >
        <Icon icon={RefreshIcon} size={14} strokeWidth={1.85} />
        <span>New</span>
      </button>
    </div>

    <p class="m-0 hidden rounded-md border border-[rgba(213,215,207,0.08)] bg-surface/75 px-3 py-2 font-mono text-[10.5px] text-ink-dim backdrop-blur-md lg:block">
      Tap free pairs · Pinch/scroll to zoom
    </p>
  </footer>

  <!-- Quick Guide Modal -->
  {#if showGuide}
    <div
      class="absolute inset-0 z-30 grid place-items-center bg-canvas/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moojong-guide-title"
    >
      <div class="w-full max-w-[390px] rounded-md border border-[rgba(213,215,207,0.14)] bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.72)]">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-sage uppercase">Pasture Rules</p>
            <h2 id="moojong-guide-title" class="mt-1 text-lg font-semibold tracking-tight text-ink">
              How to Play Moojong
            </h2>
          </div>
          <button
            type="button"
            onclick={() => (showGuide = false)}
            class="mj-btn inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface-raised text-ink-muted hover:text-ink"
            aria-label="Close guide"
          >
            <Icon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </button>
        </div>

        <ul class="mt-4 space-y-2.5 text-xs leading-relaxed text-ink-muted">
          <li>
            <strong class="text-ink">Match free pairs:</strong> A tile is free when nothing sits on top of it and at least one side (left or right) is open.
          </li>
          <li>
            <strong class="text-ink">144-tile pasture deck:</strong> 34 core designs (4 copies each) plus 8 unique bonus tiles.
          </li>
          <li>
            <strong class="text-ink">Bonus matching:</strong> Any two <span class="text-ochre">Seasons (S1-S4)</span> match each other, and any two <span class="text-[#d697ae]">Blooms (F1-F4)</span> match each other.
          </li>
        </ul>

        {#if previews[SEASON_IDS[0]] && previews[BLOOM_IDS[0]]}
          <div class="mt-4 grid grid-cols-2 gap-2.5 rounded-sm border border-[rgba(213,215,207,0.08)] bg-canvas/70 p-2.5">
            <div>
              <p class="mb-1.5 font-mono text-[9.5px] tracking-wider text-ochre uppercase">Seasons (Any 2)</p>
              <div class="grid grid-cols-4 gap-1">
                {#each SEASON_IDS as id}
                  {#if previews[id]}
                    <img src={previews[id]} alt={id} class="w-full rounded-[3px] border border-[rgba(213,215,207,0.12)]" />
                  {/if}
                {/each}
              </div>
            </div>
            <div>
              <p class="mb-1.5 font-mono text-[9.5px] tracking-wider text-[#d697ae] uppercase">Blooms (Any 2)</p>
              <div class="grid grid-cols-4 gap-1">
                {#each BLOOM_IDS as id}
                  {#if previews[id]}
                    <img src={previews[id]} alt={id} class="w-full rounded-[3px] border border-[rgba(213,215,207,0.12)]" />
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <p class="mt-3.5 font-mono text-[10px] text-ink-dim">
          Pinch or scroll to zoom · Drag to pan · Keys: Z undo, H hint, F free tiles, M mute
        </p>

        <button
          type="button"
          onclick={() => (showGuide = false)}
          class="mj-btn mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-sm border border-sage/50 bg-sage/20 px-4 py-2 font-mono text-xs font-medium text-ink transition-colors hover:bg-sage/30"
        >
          Back to Board
        </button>
      </div>
    </div>
  {/if}

  <!-- Dead-End Modal -->
  {#if hud.phase === 'deadend'}
    <section
      class="absolute inset-0 z-30 grid place-items-center bg-canvas/62 p-4 backdrop-blur-sm"
      aria-labelledby="moojong-deadend-title"
    >
      <div class="w-full max-w-[340px] rounded-md border border-[rgba(213,215,207,0.14)] bg-surface p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.72)]">
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-ochre uppercase">Dead End</p>
        <h2 id="moojong-deadend-title" class="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
          No Moves Left
        </h2>
        <p class="mt-2 text-xs leading-relaxed text-ink-muted">
          {hud.tilesLeft} tiles remain with no free matching pairs. Reshuffle the remaining tiles to keep going, or start fresh.
        </p>

        <div class="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onclick={() => controller?.reshuffle()}
            class="mj-btn inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-sage/55 bg-sage/24 px-4 py-2.5 font-mono text-xs font-medium text-ink transition-colors hover:bg-sage/34"
          >
            <Icon icon={ShuffleIcon} size={14} strokeWidth={1.9} />
            <span>Reshuffle Remaining</span>
          </button>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => controller?.retryBoard()}
              class="mj-btn inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface-raised px-3 py-2 font-mono text-[11px] text-ink-muted transition-colors hover:border-[rgba(213,215,207,0.24)] hover:text-ink"
            >
              <Icon icon={Undo02Icon} size={13} strokeWidth={1.9} />
              <span>Retry Board</span>
            </button>

            <button
              type="button"
              onclick={() => controller?.newBoard()}
              class="mj-btn inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface-raised px-3 py-2 font-mono text-[11px] text-ink-muted transition-colors hover:border-[rgba(213,215,207,0.24)] hover:text-ink"
            >
              <Icon icon={RefreshIcon} size={13} strokeWidth={1.9} />
              <span>New Board</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- Victory Modal -->
  {#if hud.phase === 'won'}
    <section
      class="absolute inset-0 z-30 grid place-items-center bg-canvas/62 p-4 backdrop-blur-sm"
      aria-labelledby="moojong-win-title"
    >
      <div class="w-full max-w-[350px] rounded-md border border-sage/35 bg-surface p-7 text-center shadow-[0_24px_70px_rgba(0,0,0,0.72)]">
        <div class="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-sage/40 bg-sage/18 text-sage-soft">
          <Icon icon={Award01Icon} size={20} strokeWidth={1.8} />
        </div>
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-sage uppercase">
          {isPureClear ? 'Pure Clear · 144 / 144' : 'Board Complete · 144 / 144'}
        </p>
        <h2 id="moojong-win-title" class="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
          Pasture Cleared!
        </h2>
        <p class="mt-1 font-mono text-[11px] text-ink-dim">
          {hud.layoutName} · {DIFFICULTIES[hud.difficulty].label}
        </p>

        <div class="mt-5 grid grid-cols-3 gap-2 rounded-sm border border-[rgba(213,215,207,0.08)] bg-canvas/70 px-3 py-3 font-mono">
          <div>
            <span class="block text-[9px] tracking-wider text-ink-dim uppercase">Time</span>
            <strong class="mt-0.5 block text-base text-ink">{formatTime(hud.elapsedSec)}</strong>
          </div>
          <div>
            <span class="block text-[9px] tracking-wider text-ink-dim uppercase">Hints</span>
            <strong class="mt-0.5 block text-base text-ink">{hud.hintsUsed}</strong>
          </div>
          <div>
            <span class="block text-[9px] tracking-wider text-ink-dim uppercase">Shuffles</span>
            <strong class="mt-0.5 block text-base text-ink">{hud.reshufflesUsed}</strong>
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onclick={() => controller?.newBoard()}
            class="mj-btn inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-sage/55 bg-sage/24 px-4 py-2.5 font-mono text-xs font-medium text-ink transition-colors hover:bg-sage/34"
          >
            <Icon icon={RefreshIcon} size={14} strokeWidth={1.9} />
            <span>Play Another Board</span>
          </button>

          {#if nextDifficulty}
            <button
              type="button"
              onclick={() => controller?.setDifficulty(nextDifficulty)}
              class="mj-btn inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-[rgba(213,215,207,0.14)] bg-surface-raised px-4 py-2 font-mono text-[11px] text-ink-muted transition-colors hover:border-ochre/45 hover:text-ink"
            >
              <span>Try {DIFFICULTIES[nextDifficulty].label} Mode</span>
            </button>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <!-- Asset Review Gallery -->
  {#if showGallery}
    <AssetGallery
      title="Tile Assets"
      storageKey="moojong-asset-review-v1"
      items={GALLERY_ITEMS}
      groups={SUIT_STYLES}
      tags={GALLERY_TAGS}
      {previews}
      onClose={() => setGalleryOpen(false)}
    />
  {/if}

  <!-- Error banner -->
  {#if errorMessage}
    <div
      role="alert"
      class="absolute top-1/2 left-1/2 z-40 max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#b86b58]/40 bg-surface px-5 py-4 text-center text-sm text-[#d49685]"
    >
      {errorMessage}
    </div>
  {/if}
</div>

<style>
  .moojong-viewport :global(canvas) {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
  }

  .mj-btn:focus-visible {
    outline: 2px solid var(--color-sage);
    outline-offset: 2px;
  }
</style>
