<script lang="ts">
  import GameStage from '../../components/GameStage.svelte';
  import AssetGallery, { galleryLinked, linkGallery } from '../../components/AssetGallery.svelte';
  import Button from '../../components/ui/Button.svelte';
  import MeterBar from '../../components/ui/MeterBar.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import SegmentedControl, { type SegmentedOption } from '../../components/ui/SegmentedControl.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import TouchPad from '../../components/ui/TouchPad.svelte';
  import { GridViewIcon, PauseIcon, PlayIcon, RefreshIcon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
  import {
    DAYTIMES,
    DAYTIME_DEFS,
    LAYOUTS,
    LAYOUT_DEFS,
    POWERUP_MAP,
    SEASONS,
    SEASON_DEFS,
    type ArenaLayout,
    type DayTime,
    type PowerupId,
    type Season,
  } from './data';
  import {
    UDDER_GALLERY_GROUPS,
    UDDER_GALLERY_ITEMS,
    UDDER_GALLERY_TAGS,
  } from './models';
  import PowerupIcon from './PowerupIcon.svelte';
  import { mountUdderHavoc, type ArenaController, type ArenaHudState } from './scene';

  const SEASON_OPTIONS: SegmentedOption<Season | 'auto'>[] = [
    { value: 'auto', label: 'Random' },
    ...SEASONS.map(s => ({ value: s, label: SEASON_DEFS[s].label })),
  ];
  const DAYTIME_OPTIONS: SegmentedOption<DayTime | 'auto'>[] = [
    { value: 'auto', label: 'Random' },
    ...DAYTIMES.map(d => ({ value: d, label: DAYTIME_DEFS[d].label })),
  ];
  const LAYOUT_OPTIONS: SegmentedOption<ArenaLayout | 'auto'>[] = [
    { value: 'auto', label: 'Random' },
    ...LAYOUTS.map(l => ({ value: l, label: LAYOUT_DEFS[l].label })),
  ];

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let controller: ArenaController | null = null;
  let failed = $state(false);

  let hud = $state<ArenaHudState>({
    seed: 0,
    season: 'spring',
    daytime: 'day',
    layout: 'meadow',
    seasonLabel: 'Spring',
    daytimeLabel: 'Day',
    layoutLabel: 'Open Meadow',
    hp: 100,
    maxHp: 100,
    xp: 0,
    nextXp: 16,
    level: 1,
    wave: 1,
    elapsed: 0,
    score: 0,
    kills: 0,
    charge: 0,
    bossName: '',
    bossHp: 0,
    bossMaxHp: 0,
    powerups: {
      butter: 0,
      double: 0,
      popcorn: 0,
      goldsight: 0,
      milk: 0,
      pumpkin: 0,
      homing: 0,
      healer: 0,
      backblast: 0,
      ricochet: 0,
      bees: 0,
      trail: 0,
      magnet: 0,
    },
    pendingChoices: null,
    aimMode: 'cursor',
    paused: false,
    ended: false,
    muted: false,
    status: '',
  });

  let pickSeason = $state<Season | 'auto'>('auto');
  let pickDaytime = $state<DayTime | 'auto'>('auto');
  let pickLayout = $state<ArenaLayout | 'auto'>('auto');
  let showGallery = $state(galleryLinked());
  let resumeAfterGallery = false;

  const aimModeLabel = $derived(
    hud.aimMode === 'auto' ? 'Auto' : hud.aimMode === 'charge' ? 'Charge' : 'Cursor',
  );

  function setGalleryOpen(open: boolean) {
    if (open) {
      resumeAfterGallery = !hud.paused && !hud.ended && !hud.pendingChoices;
      if (resumeAfterGallery) controller?.togglePause();
    } else if (resumeAfterGallery) {
      resumeAfterGallery = false;
      if (hud.paused && !hud.ended) controller?.togglePause();
    }
    showGallery = open;
    linkGallery(open);
  }

  function startNewRun() {
    controller?.restart({
      season: pickSeason === 'auto' ? undefined : pickSeason,
      daytime: pickDaytime === 'auto' ? undefined : pickDaytime,
      layout: pickLayout === 'auto' ? undefined : pickLayout,
    });
  }

  const lowHp = $derived(hud.hp <= Math.round(hud.maxHp * 0.3));
  const activeStacks = $derived(
    (Object.entries(hud.powerups) as [PowerupId, number][]).filter(([, n]) => n > 0),
  );
  const clockLabel = $derived.by(() => {
    const total = Math.floor(hud.elapsed);
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  });

  $effect(() => {
    if (!viewportEl) return;
    let instance: ArenaController | undefined;
    try {
      instance = mountUdderHavoc({
        viewport: viewportEl,
        onState: patch => {
          Object.assign(hud, patch);
        },
      });
      controller = instance;
      failed = false;
    } catch {
      failed = true;
    }
    return () => {
      instance?.destroy();
      controller = null;
    };
  });
</script>

{#snippet runConfigPickers()}
  <div class="mt-4 space-y-2.5 text-left font-mono text-[10px]">
    <div>
      <span class="mb-1 block text-ink-dim uppercase">Season</span>
      <SegmentedControl
        options={SEASON_OPTIONS}
        value={pickSeason}
        onChange={v => (pickSeason = v)}
        ariaLabel="Season"
        class="w-full"
      />
    </div>
    <div>
      <span class="mb-1 block text-ink-dim uppercase">Time</span>
      <SegmentedControl
        options={DAYTIME_OPTIONS}
        value={pickDaytime}
        onChange={v => (pickDaytime = v)}
        ariaLabel="Time of day"
        class="w-full"
      />
    </div>
    <div>
      <span class="mb-1 block text-ink-dim uppercase">Map</span>
      <SegmentedControl
        options={LAYOUT_OPTIONS}
        value={pickLayout}
        onChange={v => (pickLayout = v)}
        ariaLabel="Arena map"
        class="w-full"
      />
    </div>
  </div>
{/snippet}

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Udder Havoc game">
  <GameStage bind:viewport={viewportEl} label="Udder Havoc arena" what="the 3D pasture" {failed} />

  <!-- Top floating HUD -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-2.5 sm:p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <section
        aria-label="Cow vitals"
        class="hud-surface flex items-center gap-2 rounded-md px-2.5 py-1.5 sm:gap-4 sm:px-3.5 sm:py-2"
      >
        <div class="flex flex-col">
          <span class="font-mono text-[9px] tracking-[0.12em] text-ink-dim uppercase">Wave {hud.wave}</span>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <strong class="font-mono text-base leading-none font-semibold text-ink sm:text-xl">{clockLabel}</strong>
            <span class="font-mono text-[10px] text-sage">{hud.kills} KO</span>
          </div>
        </div>

        <div class="h-7 w-px bg-ink/10" aria-hidden="true"></div>

        <div class="flex min-w-[74px] flex-col sm:min-w-[160px]">
          <div class="flex items-baseline justify-between gap-2 font-mono text-[9px] tracking-[0.1em] uppercase">
            <span class="text-ink-dim">HP</span>
            <span class="text-[11px] font-semibold {lowHp ? 'text-danger-soft' : 'text-ink'}">
              {hud.hp}/{hud.maxHp}
            </span>
          </div>
          <MeterBar
            value={hud.hp}
            max={hud.maxHp}
            tone={lowHp ? 'danger' : 'sage'}
            ariaLabel="Cow health"
            class="mt-1"
          />
          <div class="mt-1.5 flex items-center justify-between gap-2 font-mono text-[8.5px] tracking-wider uppercase">
            <span class="text-gold">Lv {hud.level}</span>
            <div class="flex-1">
              <MeterBar value={hud.xp} max={hud.nextXp} tone="gold" ariaLabel="Experience" />
            </div>
          </div>
        </div>
      </section>

      {#if hud.status}
        <div class="hidden self-center md:flex">
          <StatusPill>{hud.status}</StatusPill>
        </div>
      {/if}

      <div class="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <Button
          size="md"
          icon={GridViewIcon}
          iconSize={14}
          hideLabelOnMobile
          aria-label="Open asset gallery"
          title="3D Asset Gallery"
          onclick={() => setGalleryOpen(true)}
        >
          Assets
        </Button>
        <Button
          size="md"
          active={hud.aimMode === 'auto'}
          aria-pressed={hud.aimMode !== 'cursor'}
          class={hud.aimMode === 'auto'
            ? 'text-sage-soft'
            : hud.aimMode === 'charge'
              ? 'border-gold/55 text-gold'
              : 'text-ink-muted'}
          title="Cycle aim mode (Q)"
          onclick={() => controller?.toggleAutoAim()}
        >
          {aimModeLabel}
        </Button>
        <Button
          size="md"
          icon={hud.muted ? VolumeOffIcon : VolumeHighIcon}
          iconSize={14}
          aria-pressed={hud.muted}
          class={hud.muted ? 'text-ink-dim' : 'text-ink'}
          aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
          onclick={() => controller?.toggleMute()}
        />
        <Button
          size="md"
          icon={hud.paused ? PlayIcon : PauseIcon}
          iconSize={13}
          disabled={hud.ended || Boolean(hud.pendingChoices)}
          aria-label={hud.paused ? 'Resume' : 'Pause'}
          onclick={() => controller?.togglePause()}
        />
      </div>
    </div>

    {#if hud.bossMaxHp > 0}
      <div class="hud-surface mx-auto flex w-full max-w-[320px] flex-col gap-1 rounded-md border-danger/35 px-3 py-1.5">
        <div class="flex justify-between font-mono text-[9.5px] tracking-wider text-danger-soft uppercase">
          <span>{hud.bossName || 'Boss'}</span>
          <span>{hud.bossHp}/{hud.bossMaxHp}</span>
        </div>
        <MeterBar value={hud.bossHp} max={hud.bossMaxHp} tone="danger" ariaLabel={hud.bossName || 'Boss health'} />
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-1.5">
      <span class="hud-surface inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[9.5px] text-ink-dim">
        {hud.seasonLabel} · {hud.daytimeLabel} · {hud.layoutLabel}
      </span>
      {#each activeStacks as [id, count] (id)}
        {@const def = POWERUP_MAP[id]}
        <span class="hud-surface inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[10px] text-ink-muted">
          <PowerupIcon {id} size={14} color={def.accent} />
          <span>{def.name}</span>
          {#if count > 1}<strong class="text-ink">×{count}</strong>{/if}
        </span>
      {/each}
    </div>
  </div>

  <!-- Touch controls (mobile / coarse pointer): dual touch-following circular dragpads -->
  <TouchPad
    label="Move"
    ariaLabel="Touch move pad"
    accent="sage"
    radius={50}
    maxTravel={32}
    defaultPos={{ left: '42%', top: '62%' }}
    disabled={hud.paused || hud.ended || Boolean(hud.pendingChoices)}
    onInput={(nx, ny, active) => controller?.setStickInput(nx, ny, active)}
    class="absolute bottom-0 left-0 z-10 h-[46%] w-1/2"
  />

  <TouchPad
    label={hud.aimMode === 'auto' ? 'Charge' : 'Aim · Charge'}
    ariaLabel="Touch charge and aim pad"
    accent="gold"
    radius={50}
    maxTravel={32}
    defaultPos={{ left: '58%', top: '62%' }}
    disabled={hud.paused || hud.ended || Boolean(hud.pendingChoices)}
    onInput={(nx, ny, active) => {
      controller?.setChargeInput(active);
      controller?.setAimStickInput(nx, ny, active);
    }}
    class="absolute right-0 bottom-0 z-10 h-[46%] w-1/2"
  />

  <footer class="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden justify-center px-4 md:flex">
    <p class="hud-surface m-0 rounded-md px-3 py-1.5 font-mono text-[10px] text-ink-muted">
      WASD trot · Aim: Cursor / Charge / Auto (Q) · Hold Click or Space for Gold Pierce & Recoil Dash
    </p>
  </footer>

  <!-- Level-up Powerup Picker -->
  <ModalDialog
    open={Boolean(hud.pendingChoices && !hud.ended)}
    dismissible={false}
    eyebrow="Level {hud.level}"
    title="Pick an upgrade"
    tone="gold"
    maxWidth="40rem"
  >
    {#snippet headerExtra()}
      <span class="hidden font-mono text-[10px] text-ink-dim sm:inline">Keys 1 · 2 · 3</span>
    {/snippet}

    {#if hud.pendingChoices}
      <div class="grid gap-3 sm:grid-cols-3">
        {#each hud.pendingChoices as id, idx (id)}
          {@const def = POWERUP_MAP[id]}
          {@const stacks = hud.powerups[id]}
          <button
            type="button"
            class="focus-ring flex cursor-pointer flex-col justify-between rounded-md border border-ink/12 bg-surface-raised p-3.5 text-left transition-colors hover:border-sage/60 hover:bg-surface-raised/80"
            onclick={() => controller?.pickPowerup(id)}
          >
            <div>
              <div class="flex items-center justify-between gap-2 font-mono text-[9.5px] tracking-wider uppercase">
                <span style:color={def.accent}>{def.tag}</span>
                <span class="text-ink-dim">{stacks > 0 ? `Lv ${stacks + 1}` : `[${idx + 1}]`}</span>
              </div>
              <div class="mt-2.5 flex items-center gap-2.5">
                <span
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-ink/12 bg-canvas/70"
                  style:border-color="{def.accent}44"
                >
                  <PowerupIcon {id} size={22} color={def.accent} />
                </span>
                <strong class="text-sm leading-tight font-semibold text-ink">{def.name}</strong>
              </div>
              <p class="mt-2 mb-0 text-xs leading-relaxed text-ink-muted">{def.desc}</p>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </ModalDialog>

  <!-- Pause overlay -->
  <ModalDialog
    open={hud.paused && !hud.ended && !hud.pendingChoices && !showGallery}
    onClose={() => controller?.togglePause()}
    eyebrow="Paused"
    title="Pasture Paused"
    tone="sage"
    maxWidth="24rem"
  >
    <p class="m-0 text-center text-xs text-ink-muted">
      {hud.seasonLabel} · {hud.daytimeLabel} · {hud.layoutLabel}
    </p>
    {@render runConfigPickers()}

    {#snippet actions()}
      <Button variant="primary" icon={PlayIcon} iconSize={13} class="flex-1" onclick={() => controller?.togglePause()}>
        Resume
      </Button>
      <Button variant="surface" icon={RefreshIcon} iconSize={13} class="flex-1" onclick={startNewRun}>
        New Run
      </Button>
    {/snippet}
  </ModalDialog>

  <!-- Game Over -->
  <ModalDialog
    open={hud.ended}
    dismissible={false}
    eyebrow="Run Complete"
    title="Cow Down"
    tone="danger"
    maxWidth="24rem"
  >
    <div class="grid grid-cols-3 gap-2 rounded-sm border border-ink/8 bg-canvas/70 p-3 text-center font-mono">
      <div>
        <span class="block text-[9px] text-ink-dim uppercase">Time</span>
        <strong class="text-base text-ink">{clockLabel}</strong>
      </div>
      <div>
        <span class="block text-[9px] text-ink-dim uppercase">Level</span>
        <strong class="text-base text-gold">{hud.level}</strong>
      </div>
      <div>
        <span class="block text-[9px] text-ink-dim uppercase">KOs</span>
        <strong class="text-base text-sage">{hud.kills}</strong>
      </div>
    </div>
    {@render runConfigPickers()}

    {#snippet actions()}
      <Button variant="primary" icon={RefreshIcon} iconSize={14} class="w-full" onclick={startNewRun}>
        Run it back
      </Button>
    {/snippet}
  </ModalDialog>

  {#if showGallery}
    <AssetGallery
      title="Udder Havoc Assets"
      storageKey="udder-havoc-asset-review-v1"
      items={UDDER_GALLERY_ITEMS}
      groups={UDDER_GALLERY_GROUPS}
      tags={UDDER_GALLERY_TAGS}
      onClose={() => setGalleryOpen(false)}
    />
  {/if}
</div>
