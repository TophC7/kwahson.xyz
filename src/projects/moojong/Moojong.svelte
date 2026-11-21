<script module lang="ts">
  import { TILE_DESIGNS } from './deck';

  const GALLERY_ITEMS = TILE_DESIGNS.map((d) => ({ id: d.id, name: d.name, group: d.suit, badge: d.badge }));
  const GALLERY_TAGS = Object.fromEntries(
    ['cow', 'healer-cow', 'hay-bale', 'rock', 'stump', 'crate', 'ufo'].map((id) => [id, 'Patrol']),
  );
</script>

<script lang="ts">
  import GameStage from '../../components/GameStage.svelte';
  import {
    Award01Icon,
    BulbIcon,
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
  import Button from '../../components/ui/Button.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import SegmentedControl, { type SegmentedOption } from '../../components/ui/SegmentedControl.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import { DIFFICULTIES, type Difficulty } from './board';
  import { SUIT_STYLES, TOTAL_TILES } from './deck';
  import { mountMoojong, type MoojongController, type MoojongHudState } from './scene';
  import AssetGallery, { galleryLinked, linkGallery } from '../../components/AssetGallery.svelte';

  const DIFFICULTY_LIST = Object.keys(DIFFICULTIES) as Difficulty[];
  const DIFFICULTY_OPTIONS: SegmentedOption<Difficulty>[] = DIFFICULTY_LIST.map((diff) => ({
    value: diff,
    label: DIFFICULTIES[diff].label,
    title: DIFFICULTIES[diff].tagline,
  }));
  const SEASON_IDS = TILE_DESIGNS.filter((d) => d.suit === 'season').map((d) => d.id);
  const BLOOM_IDS = TILE_DESIGNS.filter((d) => d.suit === 'bloom').map((d) => d.id);

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let topEl: HTMLDivElement;
  let footerEl: HTMLElement;
  let controller: MoojongController | null = null;
  let failed = $state(false);
  let showGuide = $state(false);
  let showGallery = $state(galleryLinked());
  let endModalDismissed = $state(false);

  function setGalleryOpen(open: boolean) {
    showGallery = open;
    if (open) showGuide = false;
    linkGallery(open);
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
    failed = false;

    try {
      const instance = mountMoojong({
        viewport: viewportEl,
        chrome: [topEl, footerEl],
        insets: (w, h) => {
          const side = w < h ? 6 : 24;
          return { top: topEl.offsetHeight + 4, bottom: footerEl.offsetHeight + 8, left: side, right: side };
        },
        onState: (patch) => {
          if (patch.phase === 'playing') endModalDismissed = false;
          Object.assign(hud, patch);
        },
      });
      controller = instance;
      previews = instance.previews;
      return () => {
        instance.destroy();
        controller = null;
      };
    } catch (err) {
      console.error(err);
      failed = true;
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Moojong Mahjong Solitaire">
  <GameStage bind:viewport={viewportEl} label="3D Mahjong board" what="the 3D Mahjong table" {failed} />

  <!-- Top floating HUD -->
  <div
    bind:this={topEl}
    class="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[auto_1fr] items-center gap-2 p-2.5 sm:p-4 md:grid-cols-[auto_1fr_auto]"
  >
    <!-- Telemetry card -->
    <section
      aria-label="Board status"
      class="hud-surface pointer-events-auto col-start-1 row-start-1 flex items-center gap-2.5 justify-self-start rounded-md px-2.5 py-1.5 sm:gap-3.5 sm:px-3.5 sm:py-2"
    >
      <div class="flex flex-col">
        <span class="font-mono text-[8.5px] tracking-[0.12em] text-ink-dim uppercase">Tiles</span>
        <strong class="font-mono text-base leading-tight font-semibold text-ink sm:text-xl">
          {String(hud.tilesLeft).padStart(2, '0')}
        </strong>
      </div>

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

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

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[8.5px] tracking-[0.12em] text-ink-dim uppercase">Time</span>
        <strong class="font-mono text-sm leading-tight font-medium text-ink-muted sm:text-base">
          {formatTime(hud.elapsedSec)}
        </strong>
      </div>
    </section>

    <SegmentedControl
      variant="floating"
      ariaLabel="Difficulty"
      options={DIFFICULTY_OPTIONS}
      value={hud.difficulty}
      onChange={(diff) => controller?.setDifficulty(diff)}
      class="col-start-1 row-start-2 justify-self-start md:col-start-2 md:row-start-1 md:justify-self-center"
    />

    <!-- Right utility buttons -->
    <div class="pointer-events-auto col-start-2 row-start-1 flex shrink-0 items-center gap-1.5 justify-self-end md:col-start-3">
      <Button
        variant="surface"
        icon={hud.muted ? VolumeOffIcon : VolumeHighIcon}
        iconSize={14}
        hideLabelOnMobile
        class="bg-surface/85 backdrop-blur-md {hud.muted ? 'text-ink-dim' : 'text-ink'}"
        aria-pressed={hud.muted}
        aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
        title="Toggle sound (M)"
        onclick={() => controller?.toggleMute()}
      >
        {hud.muted ? 'Off' : 'On'}
      </Button>

      <Button
        variant="surface"
        icon={GridViewIcon}
        iconSize={14}
        hideLabelOnMobile
        class="bg-surface/85 backdrop-blur-md"
        aria-expanded={showGallery}
        aria-label="Inspect all 42 tile assets"
        title={import.meta.env.DEV ? 'Inspect & comment on all 42 tile assets' : 'Inspect all 42 tile assets'}
        onclick={() => setGalleryOpen(true)}
      >
        Assets
      </Button>

      <Button
        variant="surface"
        icon={HelpCircleIcon}
        iconSize={14}
        hideLabelOnMobile
        class="bg-surface/85 backdrop-blur-md"
        aria-expanded={showGuide}
        aria-label="How to play and bonus tiles"
        title="Tile guide & rules"
        onclick={() => (showGuide = !showGuide)}
      >
        Guide
      </Button>
    </div>

    <!-- Status pill. Fixed min-height avoids bouncing the board when a toast appears/clears. -->
    <div class="col-start-2 row-start-2 flex min-h-7 min-w-0 items-center justify-end md:col-span-3 md:col-start-1 md:justify-center">
      {#if hud.status || hud.selectedName}
        <StatusPill tone={hud.selectedName ? 'ochre' : 'sage'}>
          {hud.status || `Selected: ${hud.selectedName}`}
        </StatusPill>
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
    <div class="hud-surface hidden items-center gap-2 rounded-md px-3 py-2 font-mono text-[10.5px] text-ink-dim lg:flex">
      <span class="text-ink-muted">{hud.layoutName}</span>
      <span>·</span>
      <span>#{hud.seed}</span>
    </div>

    <!-- Primary gameplay controls -->
    <div class="hud-surface pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-md p-1.5">
      <Button
        variant="surface"
        icon={Undo02Icon}
        iconSize={14}
        disabled={!hud.canUndo}
        onclick={() => controller?.undo()}
        title="Undo last match (Z)"
      >
        Undo
      </Button>

      <Button
        variant="surface"
        disabled={hud.phase !== 'playing'}
        onclick={() => controller?.hint()}
        class="hover:border-ochre/45"
        title="Show a valid match (H)"
      >
        {#snippet icon()}
          <Icon icon={BulbIcon} size={14} strokeWidth={1.85} class="text-ochre" />
        {/snippet}
        Hint
      </Button>

      <Button
        variant="surface"
        icon={EyeIcon}
        iconSize={14}
        active={hud.highlightFree}
        onclick={() => controller?.toggleHighlightFree()}
        title="Dim blocked tiles to highlight free tiles (F)"
      >
        Free
      </Button>

      {#if hud.zoomed}
        <Button
          variant="primary"
          icon={ZoomInAreaIcon}
          iconSize={14}
          onclick={() => controller?.resetView()}
          title="Reset board zoom"
        >
          Fit
        </Button>
      {/if}

      <Button
        variant="surface"
        icon={RefreshIcon}
        iconSize={14}
        onclick={() => controller?.newBoard()}
        title="Generate a fresh guaranteed-solvable board"
      >
        New
      </Button>
    </div>

    <p class="hud-surface m-0 hidden rounded-md px-3 py-2 font-mono text-[10.5px] text-ink-dim lg:block">
      Tap free pairs · Pinch/scroll to zoom
    </p>
  </footer>

  <!-- Quick Guide Modal -->
  <ModalDialog
    open={showGuide}
    onClose={() => (showGuide = false)}
    eyebrow="Pasture Rules"
    title="How to Play Moojong"
    tone="sage"
    maxWidth="24.5rem"
  >
    <ul class="space-y-2.5 text-xs leading-relaxed text-ink-muted">
      <li>
        <strong class="text-ink">Match free pairs:</strong> A tile is free when nothing sits on top of it and at least one side (left or right) is open.
      </li>
      <li>
        <strong class="text-ink">144-tile pasture deck:</strong> 34 core designs (4 copies each) plus 8 unique bonus tiles.
      </li>
      <li>
        <strong class="text-ink">Bonus matching:</strong> Any two <span class="text-ochre">Seasons (S1-S4)</span> match each other, and any two <span class="text-danger-soft">Blooms (F1-F4)</span> match each other.
      </li>
    </ul>

    {#if previews[SEASON_IDS[0]] && previews[BLOOM_IDS[0]]}
      <div class="mt-4 grid grid-cols-2 gap-2.5 rounded-sm border border-ink/8 bg-canvas/70 p-2.5">
        {#each [{ label: 'Seasons (Any 2)', ids: SEASON_IDS, cls: 'text-ochre' }, { label: 'Blooms (Any 2)', ids: BLOOM_IDS, cls: 'text-danger-soft' }] as group}
          <div>
            <p class="mb-1.5 font-mono text-[9.5px] tracking-wider uppercase {group.cls}">{group.label}</p>
            <div class="grid grid-cols-4 gap-1">
              {#each group.ids as id}
                <img src={previews[id]} alt={id} class="w-full rounded-[3px] border border-ink/12" />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <p class="mt-3.5 font-mono text-[10px] text-ink-dim">
      Pinch or scroll to zoom · Drag to pan · Keys: Z undo, H hint, F free tiles, M mute
    </p>

    {#snippet actions()}
      <Button variant="primary" class="w-full" onclick={() => (showGuide = false)}>
        Back to Board
      </Button>
    {/snippet}
  </ModalDialog>

  <!-- Dead-End Modal -->
  <ModalDialog
    open={hud.phase === 'deadend' && !endModalDismissed}
    onClose={() => (endModalDismissed = true)}
    eyebrow="Dead End"
    title="No Moves Left"
    tone="default"
    maxWidth="21.25rem"
  >
    <p class="m-0 text-xs leading-relaxed text-ink-muted">
      {hud.tilesLeft} tiles remain with no free matching pairs. Reshuffle the remaining tiles to keep going, or start fresh.
    </p>

    {#snippet actions()}
      <Button variant="primary" icon={ShuffleIcon} iconSize={14} class="w-full" onclick={() => controller?.reshuffle()}>
        Reshuffle Remaining
      </Button>

      <div class="grid w-full grid-cols-2 gap-2">
        <Button variant="surface" size="sm" icon={Undo02Icon} iconSize={13} onclick={() => controller?.retryBoard()}>
          Retry Board
        </Button>

        <Button variant="surface" size="sm" icon={RefreshIcon} iconSize={13} onclick={() => controller?.newBoard()}>
          New Board
        </Button>
      </div>
    {/snippet}
  </ModalDialog>

  <!-- Victory Modal -->
  <ModalDialog
    open={hud.phase === 'won' && !endModalDismissed}
    onClose={() => (endModalDismissed = true)}
    eyebrow="{isPureClear ? 'Pure Clear' : 'Board Complete'} · {TOTAL_TILES} / {TOTAL_TILES}"
    title="Pasture Cleared!"
    tone="sage"
    maxWidth="22rem"
  >
    <div class="text-center">
      <div class="mx-auto mb-2.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-sage/40 bg-sage/18 text-sage-soft">
        <Icon icon={Award01Icon} size={20} strokeWidth={1.8} />
      </div>
      <p class="m-0 font-mono text-[11px] text-ink-dim">
        {hud.layoutName} · {DIFFICULTIES[hud.difficulty].label}
      </p>

      <div class="mt-4 grid grid-cols-3 gap-2 rounded-sm border border-ink/8 bg-canvas/70 px-3 py-3 font-mono">
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
    </div>

    {#snippet actions()}
      <Button variant="primary" icon={RefreshIcon} iconSize={14} class="w-full" onclick={() => controller?.newBoard()}>
        Play Another Board
      </Button>

      {#if nextDifficulty}
        <Button
          variant="surface"
          size="sm"
          class="w-full hover:border-ochre/45"
          onclick={() => controller?.setDifficulty(nextDifficulty)}
        >
          Try {DIFFICULTIES[nextDifficulty].label} Mode
        </Button>
      {/if}
    {/snippet}
  </ModalDialog>

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
</div>
