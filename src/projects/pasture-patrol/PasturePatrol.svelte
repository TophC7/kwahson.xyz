<script lang="ts">
  import { PauseIcon, PlayIcon, RefreshIcon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
  import GameStage from '../../components/GameStage.svelte';
  import Button from '../../components/ui/Button.svelte';
  import MeterBar from '../../components/ui/MeterBar.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import TouchPad from '../../components/ui/TouchPad.svelte';
  import { mountPasturePatrol, type PastureController, type PastureHudState } from './game';

  const fieldGuide = [
    ['cow', 'Cow', 1, '+1 point. Hover until your beam lifts it aboard.'],
    ['chicken', 'Chicken', 1, '+1 point. From level 3 it drops egg bombs: so light that grazing one pulls it aboard. They pop after a few seconds.'],
    ['healer', 'Pink cow', 1, '+25 hull. A healer arrives every 12 seconds, a little less often each level.'],
    ['hazards', 'Loose hazards', 1, '−20 hull if collected. Fly away to drop them.'],
    ['goat', 'Goat', 2, '+2 points. Now and then it kicks nearby debris at your UFO.'],
    ['sheep', 'Sheep', 2, '+1 point each. Flocks are good for chaining captures.'],
    ['pumpkin', 'Pumpkin mortar', 2, 'Dodge out of the marked ring before the pumpkin lands.'],
    ['pig', 'Pig', 3, '+3 points. Keep it in the beam a little longer.'],
    ['bee', 'Bees', 3, 'Keep moving. The swarm chases you but soon disperses.'],
    ['tractor', 'Tractor', 4, 'Watch for its flash. It pushes loose hazards into your path.'],
    ['gunner', 'Bazooka cow', 5, '+4 points. Fires corn along its aim line; sidestep once the line turns gold, or beam it up.'],
  ] as const;

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let restartBtnEl = $state<HTMLButtonElement | HTMLAnchorElement | undefined>(undefined);
  let guideOpen = $state(false);
  let resumeAfterGuide = false;

  function openGuide() {
    if (!controller || hud.ended) return;
    resumeAfterGuide = !hud.paused;
    if (resumeAfterGuide) controller.togglePause();
    guideOpen = true;
  }

  function closeGuide() {
    guideOpen = false;
    if (resumeAfterGuide && hud.paused) controller?.togglePause();
    resumeAfterGuide = false;
  }

  let controller: PastureController | null = null;
  let failed = $state(false);

  let hud = $state<PastureHudState>({
    score: 0,
    combo: 1,
    abductions: 0,
    nextLevelAt: 10,
    health: 100,
    level: 1,
    status: '',
    paused: false,
    ended: false,
    muted: false,
    legends: {},
  });
  const lowHull = $derived(hud.health <= 40);

  $effect(() => {
    if (hud.ended && restartBtnEl) {
      restartBtnEl.focus();
    }
  });

  $effect(() => {
    if (!viewportEl) return;
    failed = false;

    try {
      const instance = mountPasturePatrol({
        viewport: viewportEl,
        onState: (patch) => {
          Object.assign(hud, patch);
        },
      });
      controller = instance;
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

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Pasture Patrol game">
  <GameStage bind:viewport={viewportEl} label="Game arena" what="the 3D pasture" {failed} />

  <!-- Top floating HUD -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
    <!-- Unified Score + Hull Telemetry -->
    <section
      aria-label="Game status"
      class="hud-surface order-1 flex items-center gap-2 rounded-md px-2 py-2 sm:gap-4 sm:px-3.5"
    >
      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.12em] text-ink-dim uppercase">Score</span>
        <div class="mt-0.5 flex items-baseline gap-1.5">
          <strong class="font-mono text-xl leading-none font-semibold text-ink sm:text-2xl">
            {String(hud.score).padStart(2, '0')}
          </strong>
          <span class="font-mono text-[9px] tracking-wider text-ink-dim uppercase">pts</span>
          <span class="font-mono text-xs font-semibold text-sage" aria-label="Score multiplier ×{hud.combo}">×{hud.combo}</span>
        </div>
      </div>

      <div class="h-7 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex min-w-[64px] flex-col sm:min-w-[152px]">
        <div class="flex items-baseline justify-between gap-2 font-mono text-[9px] tracking-[0.1em] uppercase">
          <span class="text-ink-dim">Hull</span>
          <span class="text-[11px] font-semibold {lowHull ? 'text-danger-soft' : 'text-ink'}">
            {hud.health}
          </span>
        </div>
        <MeterBar
          value={hud.health}
          max={100}
          tone={lowHull ? 'danger' : 'sage'}
          ariaLabel="Ship health"
          class="mt-1.5"
        />
        <div class="mt-1 flex items-center justify-between font-mono text-[8.5px] tracking-wider text-ink-dim uppercase">
          <span>Lv {hud.level}</span>
          <span class="text-ink-muted" title="Abductions toward the next level">{hud.abductions}/{hud.nextLevelAt}</span>
        </div>
      </div>
    </section>

    <!-- Responsive status pill (second row on mobile, centered on desktop) -->
    {#if hud.status}
      <div class="order-3 flex w-full min-w-0 justify-start md:order-2 md:w-auto md:max-w-[44%] md:flex-1 md:justify-center md:self-center">
        <StatusPill>{hud.status}</StatusPill>
      </div>
    {/if}

    <!-- Compact Audio + Pause controls -->
    <div class="pointer-events-auto order-2 flex shrink-0 items-center gap-1.5 md:order-3">
      <Button
        variant="surface"
        size="sm"
        class="hud-surface min-h-9 border-sage/35 px-2.5"
        aria-haspopup="dialog"
        aria-label="Open field guide"
        onclick={openGuide}
      >
        Guide
      </Button>

      <Button
        variant="surface"
        size="sm"
        class="hud-surface min-h-9 {hud.muted ? 'text-ink-dim' : 'text-ink'}"
        icon={hud.muted ? VolumeOffIcon : VolumeHighIcon}
        iconSize={14}
        hideLabelOnMobile
        aria-pressed={hud.muted}
        aria-label={hud.muted ? 'Sound muted (press M to unmute)' : 'Sound on (press M to mute)'}
        aria-keyshortcuts="m"
        title="Toggle sound (M)"
        onclick={() => controller?.toggleMute()}
      >
        {hud.muted ? 'Off' : 'On'}
      </Button>

      <Button
        variant="surface"
        size="sm"
        class="hud-surface min-h-9"
        icon={hud.paused ? PlayIcon : PauseIcon}
        iconSize={13}
        hideLabelOnMobile
        disabled={hud.ended}
        aria-label={hud.paused ? 'Resume flight' : 'Pause flight'}
        aria-pressed={hud.paused}
        aria-keyshortcuts="Escape"
        onclick={() => controller?.togglePause()}
      >
        {hud.paused ? 'Resume' : 'Pause'}
      </Button>
    </div>
  </div>

  <!-- Touch / Mobile Floating Circular Control Zone -->
  <TouchPad
    ariaLabel="Touch steering zone. Touch and slide anywhere in the lower area to steer your UFO."
    radius={56}
    maxTravel={38}
    defaultPos={{ left: '50%', top: '54%' }}
    disabled={hud.paused || hud.ended || guideOpen}
    onInput={(nx, ny, active) => controller?.setStickInput(nx, ny, active)}
    class="absolute inset-x-0 bottom-0 z-10 h-[44%]"
  />

  <footer class="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-end justify-center gap-3 px-4 lg:justify-between">
    <ul aria-label="Quick field guide" class="hud-surface m-0 hidden list-none items-center gap-4 rounded-md border-sage/20 px-3 py-1 lg:flex">
      {#each [['cow', 'Cow', '+1 pt'], ['healer', 'Pink cow', '+25 hull'], ['hazards', 'Debris', '−20 hull']] as [key, name, value] (key)}
        <li class="flex items-center gap-1.5 font-mono text-[10px]">
          {#if hud.legends[key]}
            <img src={hud.legends[key]} alt="" class="h-9 object-contain" class:w-9={key !== 'hazards'} class:w-14={key === 'hazards'} />
          {/if}
          <span>{name}<small class="block text-ink-muted">{value}</small></span>
        </li>
      {/each}
    </ul>
    <p class="m-0 text-center font-mono text-[10px] text-ink-muted lg:rounded-md lg:border lg:border-ink/12 lg:bg-surface/85 lg:px-3 lg:py-2 lg:backdrop-blur-md">
      <span class="hidden md:inline">Cursor steers</span><span class="md:hidden">Slide below to steer</span> · Beam always on
    </p>
  </footer>

  <!-- Field Guide Dialog -->
  <ModalDialog
    open={guideOpen}
    onClose={closeGuide}
    eyebrow="Flight paused"
    title="Field guide"
    tone="sage"
    maxWidth="34rem"
  >
    <div class="space-y-3 text-ink">
      <p>Steer with your cursor or drag in the lower touch zone. Your beam is always on: hover over a critter to collect it.</p>
      <p><strong class="text-sage">Level progress:</strong> Every abduction counts once. Levels 2–7 start at 10, 25, 45, 70, 100, and 135 abductions. Extra points and combos don’t speed up unlocks.</p>
      <p>Threats give you breathers between attacks. Use a quiet stretch to finish a capture or look for a pink cow.</p>
      <p><strong class="text-sage">Chain bonus:</strong> Make your next capture within 2.5 seconds to raise the score multiplier by one, up to ×4. A missed window or hull damage resets it to ×1.</p>
      <ul class="grid list-none gap-2 p-0 sm:grid-cols-2">
        {#each fieldGuide as [key, name, level, note] (key)}
          <li class="flex items-center gap-2 rounded-sm border border-sage/15 p-2">
            {#if hud.legends[key]}
              <img src={hud.legends[key]} alt="" class="h-11 w-12 shrink-0 object-contain" />
            {/if}
            <div>
              <strong class="text-sm">{name}</strong> <span class="font-mono text-[10px] text-sage">L{level}</span>
              <p class="m-0 text-xs leading-snug text-ink-muted">{note}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </ModalDialog>

  <!-- Pause Dialog -->
  <ModalDialog
    open={hud.paused && !hud.ended && !guideOpen}
    onClose={() => {
      if (hud.paused && !hud.ended && !guideOpen) controller?.togglePause();
    }}
    eyebrow="Paused"
    title="Flight Paused"
    tone="sage"
    maxWidth="20rem"
  >
    <p class="m-0 text-center text-xs text-ink-muted">Press Esc or resume to keep gathering.</p>
    {#snippet actions()}
      <Button variant="ghost" size="md" aria-haspopup="dialog" onclick={openGuide}>
        Field guide
      </Button>
      <Button variant="primary" size="md" icon={PlayIcon} iconSize={13} onclick={() => controller?.togglePause()}>
        Resume
      </Button>
    {/snippet}
  </ModalDialog>

  <!-- Game Over Dialog -->
  <ModalDialog
    open={hud.ended}
    dismissible={false}
    eyebrow="Run Complete"
    title="Flight Over"
    tone="default"
    maxWidth="22rem"
  >
    <div class="flex items-baseline justify-center gap-2.5 rounded-sm border border-ink/8 bg-canvas/70 py-3 font-mono">
      <span class="text-[10px] tracking-[0.12em] text-ink-dim uppercase">Score</span>
      <strong class="text-3xl font-semibold text-ink">{hud.score}</strong>
      <span class="text-[10px] tracking-wider text-sage uppercase">points</span>
    </div>
    {#snippet actions()}
      <Button
        bind:ref={restartBtnEl}
        variant="primary"
        size="md"
        icon={RefreshIcon}
        iconSize={14}
        class="w-full"
        onclick={() => controller?.restart()}
      >
        Take another flight
      </Button>
    {/snippet}
  </ModalDialog>
</div>
