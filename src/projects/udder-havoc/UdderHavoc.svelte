<script lang="ts">
  import GameStage from '../../components/GameStage.svelte';
  import AssetGallery, { galleryLinked, linkGallery } from '../../components/AssetGallery.svelte';
  import { GridViewIcon, PauseIcon, PlayIcon, RefreshIcon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
  import Icon from '../../components/Icon.svelte';
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
    buildUdderGalleryModel,
  } from './models';
  import PowerupIcon from './PowerupIcon.svelte';
  import { mountUdderHavoc, type ArenaController, type ArenaHudState } from './scene';

  const PAD_RADIUS = 52;
  const MAX_TRAVEL = 34;

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let controlZoneEl = $state<HTMLDivElement | undefined>(undefined);
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
    autoAim: false,
    paused: false,
    ended: false,
    muted: false,
    status: '',
  });

  let activePointerId = $state<number | null>(null);
  let pad = $state<{ x: number; y: number } | null>(null);
  let knobX = $state(0);
  let knobY = $state(0);
  let chargeHeld = $state(false);
  let pickSeason = $state<Season | 'auto'>('auto');
  let pickDaytime = $state<DayTime | 'auto'>('auto');
  let pickLayout = $state<ArenaLayout | 'auto'>('auto');
  let showGallery = $state(galleryLinked());
  let resumeAfterGallery = false;

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
  const hpPct = $derived(hud.maxHp > 0 ? Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100)) : 0);
  const xpPct = $derived(hud.nextXp > 0 ? Math.max(0, Math.min(100, (hud.xp / hud.nextXp) * 100)) : 0);
  const activeStacks = $derived(
    (Object.entries(hud.powerups) as [PowerupId, number][]).filter(([, n]) => n > 0),
  );
  const clockLabel = $derived.by(() => {
    const total = Math.floor(hud.elapsed);
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  });

  function updateStick(clientX: number, clientY: number) {
    if (!pad || !controlZoneEl) return;
    const rect = controlZoneEl.getBoundingClientRect();
    const dx = clientX - rect.left - pad.x;
    const dy = clientY - rect.top - pad.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, MAX_TRAVEL);
    const angle = Math.atan2(dy, dx);
    knobX = dist > 0 ? Math.cos(angle) * clamped : 0;
    knobY = dist > 0 ? Math.sin(angle) * clamped : 0;
    controller?.setStickInput(knobX / MAX_TRAVEL, knobY / MAX_TRAVEL, true);
  }

  function handleZoneDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || hud.paused || hud.ended || hud.pendingChoices) return;
    if (activePointerId !== null || !controlZoneEl) return;
    const rect = controlZoneEl.getBoundingClientRect();
    activePointerId = e.pointerId;
    controlZoneEl.setPointerCapture(e.pointerId);
    pad = {
      x: Math.max(PAD_RADIUS, Math.min(rect.width - PAD_RADIUS, e.clientX - rect.left)),
      y: Math.max(PAD_RADIUS, Math.min(rect.height - PAD_RADIUS, e.clientY - rect.top)),
    };
    knobX = 0;
    knobY = 0;
    controller?.setStickInput(0, 0, true);
  }

  function handleZoneMove(e: PointerEvent) {
    if (e.pointerId === activePointerId) updateStick(e.clientX, e.clientY);
  }

  function handleZoneUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    pad = null;
    knobX = 0;
    knobY = 0;
    controller?.setStickInput(0, 0, false);
  }

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

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Udder Havoc game">
  <GameStage bind:viewport={viewportEl} label="Udder Havoc arena" what="the 3D pasture" {failed} />

  <!-- Top floating HUD -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
    <div class="flex items-start justify-between gap-2">
      <section
        aria-label="Cow vitals"
        class="flex items-center gap-2.5 rounded-md border border-ink/12 bg-surface/88 px-2.5 py-2 backdrop-blur-md sm:gap-4 sm:px-3.5"
      >
        <div class="flex flex-col">
          <span class="font-mono text-[9px] tracking-[0.12em] text-ink-dim uppercase">Wave {hud.wave}</span>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <strong class="font-mono text-lg leading-none font-semibold text-ink sm:text-xl">{clockLabel}</strong>
            <span class="font-mono text-[10px] text-sage">{hud.kills} KO</span>
          </div>
        </div>

        <div class="h-7 w-px bg-ink/10" aria-hidden="true"></div>

        <div class="flex min-w-[92px] flex-col sm:min-w-[160px]">
          <div class="flex items-baseline justify-between gap-2 font-mono text-[9px] tracking-[0.1em] uppercase">
            <span class="text-ink-dim">HP</span>
            <span class="text-[11px] font-semibold {lowHp ? 'text-[#c97a66]' : 'text-ink'}">
              {hud.hp}/{hud.maxHp}
            </span>
          </div>
          <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas" role="meter" aria-label="Cow health" aria-valuemin={0} aria-valuemax={hud.maxHp} aria-valuenow={hud.hp}>
            <div class="h-full rounded-full transition-[width,background-color] duration-150 {lowHp ? 'bg-[#b86b58]' : 'bg-sage'}" style="width: {hpPct}%;"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 font-mono text-[8.5px] tracking-wider uppercase">
            <span class="text-[#ffe469]">Lv {hud.level}</span>
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-canvas">
              <div class="h-full rounded-full bg-[#ffe469] transition-[width] duration-150" style="width: {xpPct}%;"></div>
            </div>
          </div>
        </div>
      </section>

      {#if hud.status}
        <div
          role="status"
          class="hidden items-center gap-2 self-center rounded-full border border-ink/10 bg-surface/82 px-3 py-1.5 font-mono text-[11px] text-ink-muted backdrop-blur-md md:flex"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden="true"></span>
          <span class="whitespace-nowrap">{hud.status}</span>
        </div>
      {/if}

      <div class="pointer-events-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="focus-ring inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-ink/12 bg-surface/88 px-2.5 font-mono text-[11px] text-ink backdrop-blur-md transition-colors hover:border-ink/26"
          aria-label="Open asset gallery"
          title="3D Asset Gallery"
          onclick={() => setGalleryOpen(true)}
        >
          <Icon icon={GridViewIcon} size={14} strokeWidth={1.8} />
          <span class="hidden sm:inline">Assets</span>
        </button>
        <button
          type="button"
          class="focus-ring inline-flex h-9 cursor-pointer items-center rounded-sm border border-ink/12 bg-surface/88 px-2.5 font-mono text-[11px] backdrop-blur-md transition-colors hover:border-ink/26 {hud.autoAim ? 'border-sage/55 text-sage-soft' : 'text-ink-muted'}"
          aria-pressed={hud.autoAim}
          title="Toggle auto-aim (Q)"
          onclick={() => controller?.toggleAutoAim()}
        >
          {hud.autoAim ? 'Auto' : 'Cursor'}
        </button>
        <button
          type="button"
          class="focus-ring inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-ink/12 bg-surface/88 px-2.5 font-mono text-[11px] backdrop-blur-md transition-colors hover:border-ink/26 {hud.muted ? 'text-ink-dim' : 'text-ink'}"
          aria-pressed={hud.muted}
          aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
          onclick={() => controller?.toggleMute()}
        >
          <Icon icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          class="focus-ring inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-ink/12 bg-surface/88 px-2.5 font-mono text-[11px] text-ink backdrop-blur-md transition-colors hover:border-ink/26 disabled:opacity-45"
          disabled={hud.ended || Boolean(hud.pendingChoices)}
          aria-label={hud.paused ? 'Resume' : 'Pause'}
          onclick={() => controller?.togglePause()}
        >
          <Icon icon={hud.paused ? PlayIcon : PauseIcon} size={13} strokeWidth={1.9} />
        </button>
      </div>
    </div>

    {#if hud.bossMaxHp > 0}
      <div class="mx-auto flex w-full max-w-[320px] flex-col gap-1 rounded-md border border-[#b86b58]/35 bg-surface/88 px-3 py-1.5 backdrop-blur-md">
        <div class="flex justify-between font-mono text-[9.5px] tracking-wider text-[#d49685] uppercase">
          <span>{hud.bossName || 'Boss'}</span>
          <span>{hud.bossHp}/{hud.bossMaxHp}</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
          <div class="h-full bg-[#d9614f] transition-[width] duration-100" style="width: {(hud.bossHp / hud.bossMaxHp) * 100}%;"></div>
        </div>
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-1.5">
      <span class="inline-flex items-center rounded-sm border border-ink/10 bg-surface/78 px-2 py-0.5 font-mono text-[9.5px] text-ink-dim backdrop-blur-md">
        {hud.seasonLabel} · {hud.daytimeLabel} · {hud.layoutLabel}
      </span>
      {#each activeStacks as [id, count] (id)}
        {@const def = POWERUP_MAP[id]}
        <span class="inline-flex items-center gap-1.5 rounded-sm border border-ink/12 bg-surface/84 px-2 py-1 font-mono text-[10px] text-ink-muted backdrop-blur-md">
          <PowerupIcon {id} size={14} color={def.accent} />
          <span>{def.name}</span>
          {#if count > 1}<strong class="text-ink">×{count}</strong>{/if}
        </span>
      {/each}
    </div>
  </div>

  <!-- Touch controls (mobile / coarse pointer) -->
  <div
    bind:this={controlZoneEl}
    class="uh-control-zone absolute bottom-0 left-0 z-10 h-[44%] w-[62%] touch-none"
    role="application"
    aria-label="Touch move stick"
    onpointerdown={handleZoneDown}
    onpointermove={handleZoneMove}
    onpointerup={handleZoneUp}
    onpointercancel={handleZoneUp}
    onlostpointercapture={handleZoneUp}
  >
    <div
      class="uh-pad"
      class:is-active={pad}
      style={pad ? `left: ${pad.x}px; top: ${pad.y}px;` : 'left: 34%; top: 62%;'}
      aria-hidden="true"
    >
      <span class="uh-knob" style="transform: translate(calc(-50% + {knobX}px), calc(-50% + {knobY}px));"></span>
    </div>
  </div>

  <button
    type="button"
    class="uh-charge-btn focus-ring absolute right-5 bottom-8 z-20 flex h-20 w-20 touch-none flex-col items-center justify-center rounded-full border border-[#ffe469]/45 font-mono text-[10px] tracking-wider text-[#ffe469] uppercase backdrop-blur-md transition-transform active:scale-95 {chargeHeld ? 'bg-[#ffe469]/20' : 'bg-surface/85'}"
    onpointerdown={e => {
      e.preventDefault();
      chargeHeld = true;
      controller?.setChargeInput(true);
    }}
    onpointerup={() => {
      chargeHeld = false;
      controller?.setChargeInput(false);
    }}
    onpointercancel={() => {
      chargeHeld = false;
      controller?.setChargeInput(false);
    }}
  >
    <span>Charge</span>
    <span class="mt-0.5 text-[9px] text-ink-muted">Dash</span>
  </button>

  <footer class="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden justify-center px-4 md:flex">
    <p class="m-0 rounded-md border border-ink/8 bg-surface/80 px-3 py-1.5 font-mono text-[10px] text-ink-muted backdrop-blur-md">
      WASD trot · Cursor aims (Q auto) · Hold Click or Space for Gold Pierce & Recoil Dash
    </p>
  </footer>

  <!-- Level-up Powerup Picker -->
  {#if hud.pendingChoices && !hud.ended}
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="uh-levelup-title"
      class="absolute inset-0 z-30 grid place-items-center bg-canvas/65 p-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-[640px] rounded-md border border-ink/14 bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.75)]">
        <div class="flex items-baseline justify-between gap-2">
          <div>
            <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-[#ffe469] uppercase">Level {hud.level}</p>
            <h2 id="uh-levelup-title" class="mt-1 mb-0 text-xl font-semibold text-ink">Pick an upgrade</h2>
          </div>
          <span class="hidden font-mono text-[10px] text-ink-dim sm:inline">Keys 1 · 2 · 3</span>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
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
                  <span style="color: {def.accent};">{def.tag}</span>
                  <span class="text-ink-dim">{stacks > 0 ? `Lv ${stacks + 1}` : `[${idx + 1}]`}</span>
                </div>
                <div class="mt-2.5 flex items-center gap-2.5">
                  <span
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-ink/12 bg-canvas/70"
                    style="border-color: {def.accent}44;"
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
      </div>
    </div>
  {/if}

  <!-- Pause overlay -->
  {#if hud.paused && !hud.ended && !hud.pendingChoices}
    <div class="absolute inset-0 z-30 grid place-items-center bg-canvas/55 p-4 backdrop-blur-xs">
      <div class="w-full max-w-[340px] rounded-md border border-ink/14 bg-surface p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-sage uppercase">Paused</p>
        <strong class="mt-1.5 block text-xl font-semibold text-ink">Pasture Paused</strong>
        <span class="mt-1.5 block text-xs text-ink-muted">{hud.seasonLabel} · {hud.daytimeLabel} · {hud.layoutLabel}</span>

        <div class="mt-4 space-y-2 text-left font-mono text-[10px]">
          <div>
            <span class="block text-ink-dim uppercase">Season</span>
            <div class="mt-1 flex flex-wrap gap-1">
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickSeason === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickSeason = 'auto')}>Random</button>
              {#each SEASONS as s (s)}
                <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickSeason === s ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickSeason = s)}>{SEASON_DEFS[s].label}</button>
              {/each}
            </div>
          </div>
          <div>
            <span class="block text-ink-dim uppercase">Time</span>
            <div class="mt-1 flex flex-wrap gap-1">
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickDaytime === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickDaytime = 'auto')}>Random</button>
              {#each DAYTIMES as d (d)}
                <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickDaytime === d ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickDaytime = d)}>{DAYTIME_DEFS[d].label}</button>
              {/each}
            </div>
          </div>
          <div>
            <span class="block text-ink-dim uppercase">Map</span>
            <div class="mt-1 flex flex-wrap gap-1">
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickLayout === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickLayout = 'auto')}>Random</button>
              {#each LAYOUTS as l (l)}
                <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickLayout === l ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickLayout = l)}>{LAYOUT_DEFS[l].label}</button>
              {/each}
            </div>
          </div>
        </div>

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            onclick={() => controller?.togglePause()}
            class="focus-ring inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-sage/50 bg-sage/20 px-3 py-2 font-mono text-xs font-medium text-ink hover:bg-sage/32"
          >
            <Icon icon={PlayIcon} size={13} strokeWidth={1.9} />
            <span>Resume</span>
          </button>
          <button
            type="button"
            onclick={startNewRun}
            class="focus-ring inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-ink/15 bg-surface-raised px-3 py-2 font-mono text-xs font-medium text-ink hover:border-sage/45"
          >
            <Icon icon={RefreshIcon} size={13} strokeWidth={1.9} />
            <span>New Run</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Game Over -->
  {#if hud.ended}
    <section
      class="absolute inset-0 z-40 grid place-items-center bg-canvas/70 p-5 backdrop-blur-sm"
      aria-labelledby="uh-gameover-title"
    >
      <div class="w-full max-w-[380px] rounded-md border border-ink/14 bg-surface p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.75)]">
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-ochre uppercase">Run Complete</p>
        <h2 id="uh-gameover-title" class="mt-1.5 mb-4 text-2xl font-semibold text-ink">Cow Down</h2>

        <div class="grid grid-cols-3 gap-2 rounded-sm border border-ink/8 bg-canvas/70 p-3 font-mono">
          <div>
            <span class="block text-[9px] text-ink-dim uppercase">Time</span>
            <strong class="text-base text-ink">{clockLabel}</strong>
          </div>
          <div>
            <span class="block text-[9px] text-ink-dim uppercase">Level</span>
            <strong class="text-base text-[#ffe469]">{hud.level}</strong>
          </div>
          <div>
            <span class="block text-[9px] text-ink-dim uppercase">KOs</span>
            <strong class="text-base text-sage">{hud.kills}</strong>
          </div>
        </div>

        <div class="mt-4 space-y-2 text-left font-mono text-[10px]">
          <div class="flex flex-wrap gap-1">
            <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickSeason === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickSeason = 'auto')}>Any Season</button>
            {#each SEASONS as s (s)}
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickSeason === s ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickSeason = s)}>{SEASON_DEFS[s].label}</button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-1">
            <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickDaytime === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickDaytime = 'auto')}>Any Time</button>
            {#each DAYTIMES as d (d)}
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickDaytime === d ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickDaytime = d)}>{DAYTIME_DEFS[d].label}</button>
            {/each}
          </div>
          <div class="flex flex-wrap gap-1">
            <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickLayout === 'auto' ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickLayout = 'auto')}>Any Map</button>
            {#each LAYOUTS as l (l)}
              <button type="button" class="cursor-pointer rounded-sm border px-2 py-1 {pickLayout === l ? 'border-sage bg-sage/25 text-ink' : 'border-ink/12 text-ink-muted'}" onclick={() => (pickLayout = l)}>{LAYOUT_DEFS[l].label}</button>
            {/each}
          </div>
        </div>

        <button
          type="button"
          class="focus-ring mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-sage/50 bg-sage/20 px-4 py-2.5 font-mono text-xs font-medium text-ink hover:bg-sage/32"
          onclick={startNewRun}
        >
          <Icon icon={RefreshIcon} size={14} strokeWidth={1.9} />
          <span>Run it back</span>
        </button>
      </div>
    </section>
  {/if}

  {#if showGallery}
    <AssetGallery
      title="Udder Havoc Assets"
      storageKey="udder-havoc-asset-review-v1"
      items={UDDER_GALLERY_ITEMS}
      groups={UDDER_GALLERY_GROUPS}
      tags={UDDER_GALLERY_TAGS}
      buildModel={buildUdderGalleryModel}
      onClose={() => setGalleryOpen(false)}
    />
  {/if}
</div>

<style>
  .uh-control-zone,
  .uh-charge-btn {
    display: none;
  }

  @media (hover: none) and (pointer: coarse), (max-width: 768px) {
    .uh-control-zone {
      display: block;
    }
    .uh-charge-btn {
      display: flex;
    }
  }

  .uh-pad {
    position: absolute;
    width: 104px;
    height: 104px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid rgba(213, 215, 207, 0.22);
    background: radial-gradient(circle, rgba(23, 25, 22, 0.62) 0%, rgba(17, 18, 16, 0.42) 100%);
    pointer-events: none;
    opacity: 0.7;
  }

  .uh-pad.is-active {
    opacity: 1;
    border-color: rgba(158, 176, 154, 0.7);
  }

  .uh-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid rgba(213, 215, 207, 0.35);
    background: rgba(158, 176, 154, 0.38);
  }
</style>
