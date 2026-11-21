<script lang="ts">
  import { untrack } from 'svelte';
  import {
    GridViewIcon,
    HelpCircleIcon,
    RefreshIcon,
    VolumeHighIcon,
    VolumeOffIcon,
  } from '@hugeicons/core-free-icons';
  import AssetGallery, { galleryLinked, linkGallery } from '../../components/AssetGallery.svelte';
  import GameStage from '../../components/GameStage.svelte';
  import Button from '../../components/ui/Button.svelte';
  import MeterBar from '../../components/ui/MeterBar.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import { CROPS, cropByTier } from './crops';
  import {
    HARVEST_GALLERY_GROUPS,
    HARVEST_GALLERY_ITEMS,
    HARVEST_GALLERY_TAGS,
  } from './models';
  import { mountHarvestDrop, type HarvestController, type HarvestHudState } from './scene';
  import { MAX_POWERUP_SLOTS, POWERUP_DEFS } from './sim';
  import ToolIcon from './ToolIcon.svelte';

  let viewportEl = $state<HTMLDivElement>();
  let topEl: HTMLDivElement;
  let bottomEl: HTMLDivElement;
  let controller: HarvestController | null = null;
  let failed = $state(false);
  let showGuide = $state(false);
  let showGallery = $state(galleryLinked());
  let cropIcons = $state.raw<Record<number, string>>({});
  const DEV = import.meta.env.DEV;

  let hud = $state<HarvestHudState>({
    score: 0,
    bestScore: 0,
    combo: 0,
    pumpkinsHarvested: 0,
    bestPumpkins: 0,
    currentTier: 1,
    nextTier: 1,
    maxDropTier: 3,
    nextUnlockScore: 450,
    highestTierSeen: 3,
    capUpgradeAlert: null,
    toolAlertSlot: null,
    dangerProgress: 0,
    phase: 'playing',
    heldPowerups: [],
    canUseSlot: [],
    targetingSlot: null,
    devAllTools: false,
    muted: false,
    status: '',
  });

  const maxDropCrop = $derived(cropByTier(hud.maxDropTier));
  const targetingKind = $derived(
    hud.targetingSlot !== null ? (hud.heldPowerups[hud.targetingSlot] ?? null) : null,
  );
  const urgent = $derived(hud.dangerProgress > 0.35);
  const focusToolSlot = $derived.by(() => {
    if (hud.devAllTools || hud.targetingSlot !== null) return null;
    if (urgent) {
      if (hud.toolAlertSlot !== null && hud.canUseSlot[hud.toolAlertSlot]) return hud.toolAlertSlot;
      const usableIdx = hud.canUseSlot.findIndex(Boolean);
      return usableIdx >= 0 ? usableIdx : null;
    }
    return hud.toolAlertSlot;
  });

  function syncPaused() {
    controller?.setPaused(showGallery || showGuide);
  }

  function setGalleryOpen(open: boolean) {
    showGallery = open;
    if (open) showGuide = false;
    syncPaused();
    linkGallery(open);
  }

  function setGuideOpen(open: boolean) {
    showGuide = open;
    syncPaused();
  }

  $effect(() => {
    const viewport = viewportEl;
    if (!viewport) return;
    failed = false;
    try {
      const instance = untrack(() => {
        const mounted = mountHarvestDrop({
          viewport,
          chrome: [topEl, bottomEl],
          insets: () => ({
            top: (topEl?.offsetHeight ?? 48) + 12,
            bottom: (bottomEl?.offsetHeight ?? 76) + 18,
            left: 12,
            right: 12,
          }),
          onState: (patch) => {
            Object.assign(hud, patch);
          },
        });
        controller = mounted;
        cropIcons = mounted.cropIcons;
        syncPaused();
        return mounted;
      });
      return () => {
        controller = null;
        instance.destroy();
      };
    } catch {
      failed = true;
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Harvest Drop game">
  <GameStage bind:viewport={viewportEl} label="Harvest Drop 3D crate" what="Harvest Drop" {failed} />

  <!-- Fixed-Height Top HUD Bar (never wraps or resizes on toasts) -->
  <div
    bind:this={topEl}
    class="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-2 sm:inset-x-4 sm:top-3"
  >
    <div class="pointer-events-auto hud-surface flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 sm:gap-2.5 sm:px-3">
      <div class="flex flex-col">
        <span class="font-mono text-[8.5px] tracking-[0.14em] text-ink-dim uppercase">Score</span>
        <strong class="font-mono text-sm leading-none font-semibold text-ink sm:text-lg">{hud.score}</strong>
      </div>

      <div class="h-5 w-px bg-ink/10 sm:h-6" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[8.5px] tracking-[0.14em] text-ink-dim uppercase">Best</span>
        <span class="font-mono text-[11px] font-semibold text-ink-muted sm:text-xs">{hud.bestScore}</span>
      </div>

      <div class="h-5 w-px bg-ink/10 sm:h-6" aria-hidden="true"></div>

      <div class="flex flex-col" title={`Prize Pumpkins poofed this run (best: ${hud.bestPumpkins})`}>
        <span class="font-mono text-[8.5px] tracking-[0.14em] text-ink-dim uppercase">Pumpkins</span>
        <span class="font-mono text-[11px] font-semibold text-gold sm:text-xs">
          {hud.pumpkinsHarvested}{#if hud.bestPumpkins > 0}<span class="font-normal text-ink-dim"> / {hud.bestPumpkins}</span>{/if}
        </span>
      </div>

      <div class="hidden h-6 w-px bg-ink/10 sm:block" aria-hidden="true"></div>

      <div
        class="hidden flex-col sm:flex"
        title="Highest crop currently in your drop pool (auto-unlocks up to Turnip)"
      >
        <span class="font-mono text-[8.5px] tracking-[0.14em] text-ink-dim uppercase">Drop Cap</span>
        <span class="font-mono text-[11px] leading-tight font-semibold text-sage-soft">
          ≤ {maxDropCrop.name}
          {#if hud.nextUnlockScore}
            <span class="font-normal text-ink-dim">· {hud.nextUnlockScore}</span>
          {/if}
        </span>
      </div>
    </div>

    <div class="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
      <Button
        size="sm"
        icon={GridViewIcon}
        iconSize={13}
        hideLabelOnMobile
        aria-label="Open asset gallery"
        aria-expanded={showGallery}
        title="Crop 3D Asset Gallery"
        onclick={() => setGalleryOpen(true)}
      >
        Assets
      </Button>

      <Button
        size="sm"
        icon={hud.muted ? VolumeOffIcon : VolumeHighIcon}
        iconSize={14}
        class={hud.muted ? 'text-ink-dim' : ''}
        aria-pressed={hud.muted}
        aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
        onclick={() => controller?.toggleMute()}
      />

      <Button
        size="sm"
        icon={HelpCircleIcon}
        iconSize={14}
        aria-label="How to play & crop order"
        aria-expanded={showGuide}
        title="How to play & crop order"
        onclick={() => setGuideOpen(true)}
      />

      <Button
        size="sm"
        icon={RefreshIcon}
        iconSize={14}
        title="New crate (R)"
        aria-label="Restart game"
        onclick={() => controller?.restart()}
      />
    </div>
  </div>

  <!-- Floating Toasts / Overflow Warning (overlay only — does NOT shift camera or crate) -->
  <div class="pointer-events-none absolute inset-x-3 top-13 z-20 flex justify-center sm:top-16">
    {#if hud.dangerProgress > 0.04 && hud.phase === 'playing'}
      <div class="hud-surface flex w-48 flex-col gap-1 rounded-md border-danger/55 px-3 py-1.5 shadow-lg">
        <div class="flex justify-between font-mono text-[9.5px] tracking-wider text-danger-soft uppercase">
          <span>Overflow!</span>
          <span>{Math.round(hud.dangerProgress * 100)}%</span>
        </div>
        <MeterBar value={hud.dangerProgress} max={1} tone="danger" ariaLabel="Crate overflow warning" />
      </div>
    {:else if hud.capUpgradeAlert}
      <div
        role="status"
        class="hud-surface flex items-center gap-2.5 rounded-md border-gold/75 bg-surface-raised/95 px-3 py-1.5 shadow-lg"
      >
        {#if cropIcons[hud.capUpgradeAlert.tier]}
          <img
            src={cropIcons[hud.capUpgradeAlert.tier]}
            alt={hud.capUpgradeAlert.name}
            class="h-7 w-7 shrink-0 object-contain drop-shadow"
          />
        {/if}
        <div class="flex flex-col">
          <span class="font-mono text-[9px] tracking-[0.14em] text-gold uppercase">Drop Cap Upgraded!</span>
          <strong class="font-sans text-xs font-semibold text-ink">
            Now dropping up to {hud.capUpgradeAlert.name} (T{hud.capUpgradeAlert.tier})
          </strong>
        </div>
      </div>
    {:else if targetingKind}
      <StatusPill tone="mint">
        {targetingKind === 'pineapple'
          ? 'Tap anywhere inside crate to throw Pineapple Bomb (Esc to cancel)'
          : `Tap a crop for ${POWERUP_DEFS[targetingKind].name} (Esc to cancel)`}
      </StatusPill>
    {:else if hud.status}
      <StatusPill tone={hud.combo >= 2 ? 'ochre' : 'sage'}>{hud.status}</StatusPill>
    {/if}
  </div>

  <!-- Right Side Crop Order Ladder (Always shown: thin icon column below xl, full card on xl+) -->
  <aside
    class="pointer-events-none absolute top-1/2 right-2 z-10 flex -translate-y-1/2 sm:right-3 xl:right-4"
    aria-label="Crop order"
  >
    <div class="hud-surface flex w-11 flex-col gap-0.5 rounded-md p-1 xl:w-56 xl:px-2.5 xl:py-2.5">
      <div class="mb-0.5 hidden items-center justify-between px-1 font-mono text-[9.5px] tracking-[0.14em] text-ink-dim uppercase xl:flex">
        <span>Crop Order</span>
        <span>Small → Big</span>
      </div>
      <div class="mb-0.5 text-center font-mono text-[8px] tracking-wider text-ink-dim uppercase xl:hidden">
        Order
      </div>

      {#each CROPS as crop (crop.tier)}
        {@const isCurrent = crop.tier === hud.currentTier}
        {@const isNext = crop.tier === hud.nextTier}
        {@const isCap = crop.tier === hud.maxDropTier}
        {@const seen = crop.tier <= hud.highestTierSeen}
        <div
          title={`${crop.tier}. ${crop.name}${isCurrent ? ' (Dropping now)' : isNext ? ' (Up next)' : isCap ? ' (Drop cap)' : ''}`}
          class="relative flex items-center justify-center rounded-sm py-0.5 text-[11px] transition-colors xl:justify-between xl:px-1.5 {isCurrent
            ? 'bg-sage/26 text-ink ring-1 ring-sage/75'
            : isNext
              ? 'bg-gold/16 text-ink ring-1 ring-gold/65'
              : seen
                ? 'text-ink-muted'
                : 'text-ink-dim/70'}"
        >
          <div class="flex items-center gap-2 truncate">
            {#if cropIcons[crop.tier]}
              <img
                src={cropIcons[crop.tier]}
                alt={crop.name}
                class="h-5 w-5 shrink-0 object-contain sm:h-6 sm:w-6 {seen || isCurrent || isNext ? '' : 'opacity-60'}"
              />
            {:else}
              <span
                class="h-3 w-3 shrink-0 rounded-full"
                style:background={crop.accentCss}
                aria-hidden="true"
              ></span>
            {/if}
            <span class="hidden truncate font-sans font-medium xl:inline">{crop.name}</span>
          </div>

          <!-- Compact mobile corner markers for Now / Next -->
          {#if isCurrent}
            <span
              class="absolute -top-0.5 -right-0.5 rounded-xs bg-sage px-0.5 font-mono text-[7px] leading-tight font-bold text-canvas xl:hidden"
            >
              NOW
            </span>
          {:else if isNext}
            <span
              class="absolute -top-0.5 -right-0.5 rounded-xs bg-gold px-0.5 font-mono text-[7px] leading-tight font-bold text-canvas xl:hidden"
            >
              NXT
            </span>
          {:else if isCap}
            <span
              class="absolute right-0 bottom-0 h-1.5 w-1.5 rounded-full bg-sage-soft xl:hidden"
              aria-hidden="true"
            ></span>
          {/if}

          <span
            class="ml-1.5 hidden shrink-0 font-mono text-[9px] font-semibold xl:inline {isCurrent
              ? 'text-sage-soft'
              : isNext
                ? 'text-gold'
                : isCap
                  ? 'text-sage-soft'
                  : 'text-ink-dim'}"
          >
            {isCurrent ? 'NOW' : isNext ? 'NEXT' : isCap ? 'CAP' : `${crop.tier}`}
          </span>
        </div>
      {/each}

      <div class="mt-1 hidden border-t border-ink/10 px-1 pt-1.5 font-mono text-[9.5px] text-gold/90 xl:block">
        2× Prize Pumpkin → Poof (+2000)
      </div>
    </div>
  </aside>

  <!-- Bottom Farm Tool Shelf / Game Over Panel (fixed shelf height; tooltip floats via absolute positioning) -->
  <div
    bind:this={bottomEl}
    class="pointer-events-none absolute inset-x-2 bottom-0 z-20 flex justify-center pb-[max(14px,env(safe-area-inset-bottom))] sm:inset-x-3 sm:pb-4"
  >
    {#if hud.phase === 'gameover'}
      <div
        class="pointer-events-auto hud-surface flex flex-wrap items-center gap-3 rounded-md border-danger/45 px-4 py-2.5 shadow-xl sm:gap-4 sm:py-3"
      >
        <div class="flex flex-col">
          <span class="font-mono text-[10px] tracking-[0.14em] text-danger-soft uppercase">Crate Overflowed</span>
          <strong class="font-sans text-base leading-tight font-semibold text-ink sm:text-lg">
            {hud.score} pts · {hud.pumpkinsHarvested} {hud.pumpkinsHarvested === 1 ? 'Pumpkin' : 'Pumpkins'}
          </strong>
          <span class="font-mono text-[9.5px] text-ink-dim">
            Best: {hud.bestScore} pts · {hud.bestPumpkins} {hud.bestPumpkins === 1 ? 'Pumpkin' : 'Pumpkins'}
          </span>
        </div>
        <Button variant="primary" size="md" icon={RefreshIcon} iconSize={14} onclick={() => controller?.restart()}>
          Play Again
        </Button>
      </div>
    {:else}
      <div
        class="pointer-events-auto hud-surface relative flex w-full flex-col items-center gap-1 rounded-md border-ochre/30 px-2 pt-1.5 pb-1.5 shadow-lg sm:w-auto sm:gap-1.5 sm:px-2.5 sm:pb-2 {hud.devAllTools
          ? 'max-w-[96vw]'
          : 'max-w-[344px] sm:max-w-none'}"
        aria-label="Farm tool shelf"
      >
        <!-- Floating attention tooltip anchored above shelf without changing shelf layout height -->
        {#if focusToolSlot !== null}
          {@const focusKind = hud.heldPowerups[focusToolSlot]}
          {#if focusKind}
            {@const focusMeta = POWERUP_DEFS[focusKind]}
            <div
              class="pointer-events-none absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-semibold whitespace-nowrap shadow-lg motion-safe:animate-bounce sm:text-[10.5px] {urgent
                ? 'border-danger/70 bg-danger/25 text-ink'
                : 'border-gold/75 bg-surface-raised/95 text-gold'}"
            >
              <span
                class="h-2 w-2 rounded-full {urgent ? 'bg-danger' : ''}"
                style:background={urgent ? undefined : focusMeta.accentCss}
                aria-hidden="true"
              ></span>
              <span>
                {urgent
                  ? `Crate high! Use ${focusMeta.shortName} [${focusToolSlot + 1}]`
                  : `New Tool: ${focusMeta.name}! Tap or press [${focusToolSlot + 1}]`}
              </span>
            </div>
          {/if}
        {/if}

        <div class="flex w-full items-center justify-between gap-2 px-1">
          <div class="flex items-center gap-2">
            <span class="font-mono text-[8.5px] tracking-[0.16em] text-ink-dim uppercase sm:text-[9px]">Tool Shelf</span>
            {#if DEV}
              <button
                type="button"
                aria-pressed={hud.devAllTools}
                onclick={() => controller?.setDevAllTools(!hud.devAllTools)}
                class="focus-ring cursor-pointer rounded-xs border px-1.5 py-0.5 font-mono text-[8.5px] transition-colors {hud.devAllTools
                  ? 'border-mint/70 bg-mint/20 text-mint'
                  : 'border-ink/15 bg-canvas/60 text-ink-dim hover:text-ink'}"
              >
                {hud.devAllTools ? 'Dev: All Tools ON' : 'Dev: All Tools'}
              </button>
            {/if}
          </div>
          {#if hud.targetingSlot !== null}
            <button
              type="button"
              class="focus-ring cursor-pointer font-mono text-[9px] text-mint hover:underline sm:text-[9.5px]"
              onclick={() => controller?.cancelTargeting()}
            >
              Cancel target
            </button>
          {:else if hud.devAllTools}
            <span class="font-mono text-[8.5px] text-mint sm:text-[9px]">Keys 1-5</span>
          {:else if hud.heldPowerups.length > 0}
            <span class="font-mono text-[8.5px] text-gold sm:text-[9px]">Tap or press 1-2</span>
          {:else}
            <span class="font-mono text-[8.5px] text-ink-dim/80 sm:text-[9px]">Earned on merges</span>
          {/if}
        </div>

        <div
          class="flex w-full items-stretch gap-1.5 sm:w-auto sm:gap-2 {hud.devAllTools
            ? 'flex-wrap justify-center'
            : ''}"
        >
          {#each Array(hud.devAllTools ? hud.heldPowerups.length : MAX_POWERUP_SLOTS) as _, slotIdx (slotIdx)}
            {@const kind = hud.heldPowerups[slotIdx]}
            {#if kind}
              {@const meta = POWERUP_DEFS[kind]}
              {@const usable = hud.canUseSlot[slotIdx] ?? false}
              {@const active = hud.targetingSlot === slotIdx}
              {@const isNew = !hud.devAllTools && hud.toolAlertSlot === slotIdx}
              <button
                type="button"
                disabled={!usable}
                title={`${meta.name}: ${meta.description}`}
                onclick={() => controller?.triggerPowerup(slotIdx)}
                style:border-color={active ? undefined : isNew ? meta.accentCss : undefined}
                class="focus-ring relative flex min-w-0 cursor-pointer items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-all disabled:cursor-default disabled:opacity-45 sm:gap-2.5 sm:px-2.5 {hud.devAllTools
                  ? 'sm:min-w-[136px]'
                  : 'flex-1 sm:min-w-[158px] sm:flex-none'} {active
                  ? 'border-mint bg-mint/18 shadow-[0_0_0_1px_rgba(143,245,203,0.35)]'
                  : isNew
                    ? 'bg-surface-raised shadow-[0_0_16px_rgba(243,200,66,0.22)] hover:-translate-y-0.5'
                    : 'border-ink/20 bg-surface-raised/95 hover:-translate-y-0.5 hover:border-ochre/65'}"
              >
                {#if isNew && !active}
                  <span class="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center">
                    <span
                      class="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75"
                      style:background={meta.accentCss}
                    ></span>
                    <span
                      class="relative inline-flex h-2 w-2 rounded-full"
                      style:background={meta.accentCss}
                    ></span>
                  </span>
                {/if}
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-ink/10 bg-canvas/75 sm:h-9 sm:w-9"
                >
                  <ToolIcon {kind} size={22} color={meta.accentCss} />
                </span>
                <div class="flex min-w-0 flex-col">
                  <span class="truncate font-sans text-[11px] leading-tight font-semibold text-ink sm:text-xs">
                    {meta.name}
                  </span>
                  <span class="truncate font-mono text-[8.5px] sm:text-[9.5px] {isNew ? 'text-gold' : 'text-ink-dim'}">
                    {active ? (kind === 'pineapple' ? 'Tap crate…' : 'Tap crop…') : isNew ? 'Ready!' : meta.hint}
                  </span>
                </div>
                <kbd
                  class="absolute top-1 right-1 hidden rounded-xs border border-ink/12 bg-canvas/80 px-1 font-mono text-[8.5px] text-ink-dim sm:inline"
                >
                  {slotIdx + 1}
                </kbd>
              </button>
            {:else}
              <div
                class="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-dashed border-ink/12 bg-canvas/35 px-2 py-1.5 opacity-60 sm:min-w-[158px] sm:flex-none sm:gap-2.5 sm:px-2.5"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-ink/10 font-mono text-[10px] text-ink-dim/60 sm:h-9 sm:w-9"
                >
                  {slotIdx + 1}
                </span>
                <div class="flex min-w-0 flex-col">
                  <span class="truncate font-mono text-[9.5px] text-ink-dim sm:text-[10px]">Empty Slot</span>
                  <span class="truncate font-mono text-[8.5px] text-ink-dim/60 sm:text-[9px]">Merge T4+</span>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- How to Play & Full Crop Order Modal -->
  <ModalDialog
    open={showGuide}
    onClose={() => setGuideOpen(false)}
    eyebrow="Field Manual"
    title="Harvest Drop"
    maxWidth="30rem"
  >
    <div class="space-y-3 text-sm leading-relaxed text-ink-muted">
      <ul class="space-y-1.5">
        <li>
          <strong class="text-ink">Aim &amp; Drop:</strong> Move your cursor or finger across the crate and click/release to drop. Or use <code class="text-ink">A/D</code> + <code class="text-ink">Space</code>.
        </li>
        <li>
          <strong class="text-ink">Merge Up:</strong> Touching two identical crops merges them into the next bigger crop. Irregular shapes like <strong class="text-ink">Carrots</strong> and <strong class="text-ink">Sweet Corn</strong> roll and wedge!
        </li>
        <li>
          <strong class="text-ink">Max Tier Poof:</strong> Merge two <strong class="text-ink">Prize Pumpkins</strong> (Tier 12) to poof them out of the crate for <strong class="text-gold">+2000 pts</strong> and extra space.
        </li>
        <li>
          <strong class="text-ink">Drop Cap Unlocks:</strong> Runs start with <strong class="text-ink">Pea, Blueberry &amp; Strawberry</strong>. As your score climbs (<code class="text-ink">450</code>, <code class="text-ink">1350</code>, <code class="text-ink">2800</code>), you automatically unlock <strong class="text-ink">Lemon</strong>, <strong class="text-ink">Garlic Bulb</strong>, and <strong class="text-ink">Turnip</strong>.
        </li>
        <li>
          <strong class="text-ink">Farm Tools:</strong> Big merges and chain combos occasionally place tools on your <strong class="text-ink">Tool Shelf</strong> (<code class="text-ink">1</code> / <code class="text-ink">2</code>): <em>UFO Abduct</em>, <em>Crate Shake</em>, <em>Bumper Grow</em>, <em>Compost Sweep</em>, and the rare <em>Pineapple Bomb</em>!
        </li>
      </ul>

      <div class="border-t border-ink/10 pt-2.5">
        <div class="mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-dim uppercase">
          12-Tier Crop Order
        </div>
        <div class="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          {#each CROPS as crop (crop.tier)}
            <div class="flex items-center gap-2 rounded-sm bg-canvas/50 px-2 py-1 text-ink-muted">
              {#if cropIcons[crop.tier]}
                <img src={cropIcons[crop.tier]} alt={crop.name} class="h-6 w-6 shrink-0 object-contain" />
              {:else}
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background={crop.accentCss}></span>
              {/if}
              <span>{crop.tier}. {crop.name}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </ModalDialog>

  {#if showGallery}
    <AssetGallery
      title="Harvest Drop Crop Assets"
      storageKey="harvest-drop-gallery-notes"
      items={HARVEST_GALLERY_ITEMS}
      groups={HARVEST_GALLERY_GROUPS}
      tags={HARVEST_GALLERY_TAGS}
      onClose={() => setGalleryOpen(false)}
    />
  {/if}
</div>
