<script lang="ts">
  import { PauseIcon, PlayIcon, RefreshIcon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
  import Icon from '../../components/Icon.svelte';
  import { MAX_LEVEL, mountPasturePatrol, type PastureController, type PastureHudState } from './game';

  const PAD_RADIUS = 56;
  const MAX_TRAVEL = 38;

  let viewportEl = $state<HTMLDivElement | undefined>(undefined);
  let controlZoneEl = $state<HTMLDivElement | undefined>(undefined);
  let restartBtnEl = $state<HTMLButtonElement | undefined>(undefined);

  let controller: PastureController | null = null;
  let errorMessage = $state('');

  let hud = $state<PastureHudState>({
    score: 0,
    health: 100,
    level: 1,
    status: '',
    paused: false,
    ended: false,
    muted: false,
    legends: {
      cow: '',
      healer: '',
      hazards: '',
    },
  });

  // Floating circular axis pad state
  let activePointerId = $state<number | null>(null);
  let padActive = $state(false);
  let padX = $state<number | null>(null);
  let padY = $state<number | null>(null);
  let knobX = $state(0);
  let knobY = $state(0);

  function resetPad() {
    activePointerId = null;
    padActive = false;
    padX = null;
    padY = null;
    knobX = 0;
    knobY = 0;
    controller?.setStickInput(0, 0, false);
  }

  function handleZoneDown(event: PointerEvent) {
    if (hud.paused || hud.ended || activePointerId !== null || !controlZoneEl) return;

    const rect = controlZoneEl.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    // Keep the floating circle pad cleanly inside the control zone bounds.
    const margin = PAD_RADIUS + 8;
    const clampedX = Math.min(Math.max(margin, rawX), Math.max(margin, rect.width - margin));
    const clampedY = Math.min(Math.max(margin, rawY), Math.max(margin, rect.height - margin));

    activePointerId = event.pointerId;
    padActive = true;
    padX = clampedX;
    padY = clampedY;
    knobX = 0;
    knobY = 0;
    controlZoneEl.setPointerCapture(event.pointerId);
    controller?.setStickInput(0, 0, true);
  }

  function handleZoneMove(event: PointerEvent) {
    if (!padActive || event.pointerId !== activePointerId || !controlZoneEl || padX === null || padY === null) {
      return;
    }
    const rect = controlZoneEl.getBoundingClientRect();
    const dx = event.clientX - rect.left - padX;
    const dy = event.clientY - rect.top - padY;
    const dist = Math.hypot(dx, dy);

    if (dist > MAX_TRAVEL) {
      const scale = MAX_TRAVEL / dist;
      knobX = dx * scale;
      knobY = dy * scale;
    } else {
      knobX = dx;
      knobY = dy;
    }
    controller?.setStickInput(knobX / MAX_TRAVEL, knobY / MAX_TRAVEL, true);
  }

  function handleZoneUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    resetPad();
  }

  $effect(() => {
    if (hud.paused || hud.ended) {
      resetPad();
    }
  });

  $effect(() => {
    if (hud.ended && restartBtnEl) {
      restartBtnEl.focus();
    }
  });

  $effect(() => {
    if (!viewportEl) return;
    errorMessage = '';

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
      errorMessage =
        'Your browser could not start the 3D pasture. Please enable WebGL or try a newer browser.';
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Pasture Patrol game">
  <!-- Subtle twilight vignette + dot grid behind the transparent 3D diorama -->
  <div
    class="bg-field-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_80%_75%_at_50%_50%,#000_25%,transparent_100%)]"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute inset-0"
    style="background: radial-gradient(circle at 50% 48%, rgba(122, 141, 118, 0.11), rgba(17, 18, 16, 0) 62%);"
    aria-hidden="true"
  ></div>

  <!-- Full-bleed 3D WebGL stage -->
  <div class="pasture-viewport absolute inset-0 z-0 touch-none" bind:this={viewportEl} aria-label="Game arena"></div>

  <!-- Top floating HUD -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
    <div class="flex items-start justify-between gap-2">
      <!-- Unified Score + Hull Telemetry -->
      <section
        aria-label="Game status"
        class="pointer-events-auto flex items-center gap-3 rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/85 px-3 py-2 backdrop-blur-md sm:gap-4 sm:px-3.5"
      >
        <div class="flex flex-col">
          <span class="font-mono text-[9px] tracking-[0.12em] text-ink-dim uppercase">Score</span>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <strong class="font-mono text-xl leading-none font-semibold text-ink sm:text-2xl">
              {String(hud.score).padStart(2, '0')}
            </strong>
            <span class="font-mono text-[9px] tracking-wider text-ink-dim uppercase">cows</span>
          </div>
        </div>

        <div class="h-7 w-px bg-[rgba(213,215,207,0.1)]" aria-hidden="true"></div>

        <div class="flex min-w-[116px] flex-col sm:min-w-[152px]">
          <div class="flex items-baseline justify-between gap-2 font-mono text-[9px] tracking-[0.1em] uppercase">
            <span class="text-ink-dim">Hull</span>
            <span class="text-[11px] font-semibold {hud.health <= 40 ? 'text-[#c97a66]' : 'text-ink'}">
              {hud.health}
            </span>
          </div>
          <div
            class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas"
            role="meter"
            aria-label="Ship health"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hud.health}
          >
            <div
              class="h-full rounded-full transition-[width,background-color] duration-200 {hud.health <= 40
                ? 'bg-[#b86b58]'
                : 'bg-sage'}"
              style="width: {hud.health}%;"
            ></div>
          </div>
          <div class="mt-1 flex items-center justify-between font-mono text-[8.5px] tracking-wider text-ink-dim uppercase">
            <span>Pressure</span>
            <span class="text-ink-muted">{hud.level} / {MAX_LEVEL}</span>
          </div>
        </div>
      </section>

      <!-- Desktop centered status pill -->
      {#if hud.status}
        <div
          role="status"
          class="hidden items-center gap-2 self-center rounded-full border border-[rgba(213,215,207,0.1)] bg-surface/80 px-3 py-1.5 font-mono text-[11px] text-ink-muted backdrop-blur-md md:flex"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden="true"></span>
          <span class="whitespace-nowrap">{hud.status}</span>
        </div>
      {/if}

      <!-- Compact Audio + Pause controls -->
      <div class="pointer-events-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="pp-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 font-mono text-[11px] backdrop-blur-md transition-colors hover:border-[rgba(213,215,207,0.26)] hover:bg-surface-raised {hud.muted
            ? 'text-ink-dim'
            : 'text-ink'}"
          aria-pressed={hud.muted}
          aria-label={hud.muted ? 'Sound muted (press M to unmute)' : 'Sound on (press M to mute)'}
          aria-keyshortcuts="m"
          title="Toggle sound (M)"
          onclick={() => controller?.toggleMute()}
        >
          <Icon icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} size={14} strokeWidth={1.8} />
          <span class="hidden sm:inline">{hud.muted ? 'Off' : 'On'}</span>
        </button>

        <button
          type="button"
          class="pp-btn inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface/85 px-2.5 font-mono text-[11px] text-ink backdrop-blur-md transition-colors hover:border-[rgba(213,215,207,0.26)] hover:bg-surface-raised disabled:cursor-default disabled:opacity-45"
          disabled={hud.ended}
          aria-controls="pasture-pause-panel"
          aria-pressed={hud.paused}
          aria-keyshortcuts="Escape"
          onclick={() => controller?.togglePause()}
        >
          <Icon icon={hud.paused ? PlayIcon : PauseIcon} size={13} strokeWidth={1.9} />
          <span class="hidden sm:inline">{hud.paused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>
    </div>

    <!-- Mobile status pill -->
    {#if hud.status}
      <div class="flex items-center justify-between gap-2 md:hidden">
        <div
          role="status"
          class="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-[rgba(213,215,207,0.1)] bg-surface/80 px-2.5 py-1 font-mono text-[10px] text-ink-muted backdrop-blur-md"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden="true"></span>
          <span class="truncate">{hud.status}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Touch / Mobile Floating Circular Control Zone -->
  <div
    bind:this={controlZoneEl}
    class="pp-control-zone absolute inset-x-0 bottom-0 z-10 h-[44%] touch-none"
    role="application"
    aria-label="Touch steering zone. Touch and slide anywhere in the lower area to steer your UFO."
    onpointerdown={handleZoneDown}
    onpointermove={handleZoneMove}
    onpointerup={handleZoneUp}
    onpointercancel={handleZoneUp}
    onlostpointercapture={handleZoneUp}
  >
    <div
      class="pp-pad"
      class:is-active={padActive}
      style={padX !== null && padY !== null
        ? `left: ${padX}px; top: ${padY}px;`
        : 'left: 50%; top: 54%;'}
      aria-hidden="true"
    >
      <span class="pp-axis-h"></span>
      <span class="pp-axis-v"></span>
      <span class="pp-inner-ring"></span>
      <span
        class="pp-knob"
        style="transform: translate(calc(-50% + {knobX}px), calc(-50% + {knobY}px));"
      ></span>
    </div>
  </div>

  <!-- Bottom legend and desktop hint -->
  <footer
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-3 px-3 pb-3 sm:px-4 sm:pb-4 lg:justify-between"
    style="padding-bottom: max(12px, env(safe-area-inset-bottom));"
  >
    <div
      aria-label="Collection and hazard guide"
      class="flex items-center gap-3 rounded-md border border-[rgba(213,215,207,0.1)] bg-surface/82 px-2.5 py-1.5 backdrop-blur-md sm:gap-4 sm:px-3.5 sm:py-2"
    >
      <div class="flex items-center gap-1.5 sm:gap-2">
        {#if hud.legends.cow}
          <img src={hud.legends.cow} alt="normal cow model" class="h-7 w-7 object-contain sm:h-9 sm:w-9" />
        {/if}
        <div class="leading-tight">
          <strong class="block font-mono text-[9px] tracking-wider text-ink uppercase">Cow</strong>
          <small class="font-mono text-[9px] text-sage">+1</small>
        </div>
      </div>

      <div class="h-6 w-px bg-[rgba(213,215,207,0.08)]" aria-hidden="true"></div>

      <div class="flex items-center gap-1.5 sm:gap-2">
        {#if hud.legends.healer}
          <img src={hud.legends.healer} alt="pink healer cow model" class="h-7 w-7 object-contain sm:h-9 sm:w-9" />
        {/if}
        <div class="leading-tight">
          <strong class="block font-mono text-[9px] tracking-wider text-ink uppercase">Pink</strong>
          <small class="font-mono text-[9px] text-[#c995a8]">+25 hp</small>
        </div>
      </div>

      <div class="h-6 w-px bg-[rgba(213,215,207,0.08)]" aria-hidden="true"></div>

      <div class="flex items-center gap-1.5 sm:gap-2">
        {#if hud.legends.hazards}
          <img
            src={hud.legends.hazards}
            alt="Rock, stump, crate, and rolling hay bale"
            class="h-7 w-14 object-contain sm:h-9 sm:w-18"
          />
        {/if}
        <div class="leading-tight">
          <strong class="block font-mono text-[9px] tracking-wider text-ink uppercase">Hazards</strong>
          <small class="font-mono text-[9px] text-[#c97a66]">-20 hp</small>
        </div>
      </div>
    </div>

    <p class="m-0 hidden rounded-md border border-[rgba(213,215,207,0.08)] bg-surface/75 px-3 py-2 font-mono text-[10.5px] text-ink-dim backdrop-blur-md lg:block">
      Cursor steers · Beam always on · Fly away to drop hazards
    </p>
  </footer>

  <!-- Pause overlay -->
  {#if hud.paused && !hud.ended}
    <div class="absolute inset-0 z-30 grid place-items-center bg-canvas/55 p-4 backdrop-blur-xs">
      <div
        id="pasture-pause-panel"
        role="status"
        class="w-full max-w-[300px] rounded-md border border-[rgba(213,215,207,0.14)] bg-surface p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
      >
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-sage uppercase">Paused</p>
        <strong class="mt-1.5 block text-xl font-semibold tracking-tight text-ink">Flight Paused</strong>
        <span class="mt-2 block text-xs text-ink-muted">Press Esc or resume to keep gathering.</span>
        <button
          type="button"
          onclick={() => controller?.togglePause()}
          class="pp-btn mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-sage/50 bg-sage/20 px-4 py-2 font-mono text-xs font-medium text-ink transition-colors hover:bg-sage/32"
        >
          <Icon icon={PlayIcon} size={13} strokeWidth={1.9} />
          <span>Resume</span>
        </button>
      </div>
    </div>
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

  <!-- Game Over overlay -->
  {#if hud.ended}
    <section
      class="absolute inset-0 z-40 grid place-items-center bg-canvas/65 p-5 backdrop-blur-sm"
      aria-labelledby="pasture-game-over-title"
    >
      <div class="w-full max-w-[340px] rounded-md border border-[rgba(213,215,207,0.14)] bg-surface p-7 text-center shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
        <p class="m-0 font-mono text-[10px] tracking-[0.14em] text-ochre uppercase">Run Complete</p>
        <h2 id="pasture-game-over-title" class="mt-1.5 mb-5 text-2xl font-semibold tracking-tight text-ink">
          Flight Over
        </h2>

        <div class="flex items-baseline justify-center gap-2.5 rounded-sm border border-[rgba(213,215,207,0.08)] bg-canvas/70 py-3 font-mono">
          <span class="text-[10px] tracking-[0.12em] text-ink-dim uppercase">Score</span>
          <strong class="text-3xl font-semibold text-ink">{hud.score}</strong>
          <span class="text-[10px] tracking-wider text-sage uppercase">cows</span>
        </div>

        <button
          bind:this={restartBtnEl}
          type="button"
          class="pp-btn mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-sage/50 bg-sage/20 px-4 py-2.5 font-mono text-xs font-medium text-ink transition-colors hover:bg-sage/32"
          onclick={() => controller?.restart()}
        >
          <Icon icon={RefreshIcon} size={14} strokeWidth={1.9} />
          <span>Take another flight</span>
        </button>
      </div>
    </section>
  {/if}
</div>

<style>
  .pasture-viewport :global(canvas) {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
  }

  .pp-btn:focus-visible {
    outline: 2px solid var(--color-sage);
    outline-offset: 2px;
  }

  /* Show floating circular touch pad on touch devices or narrow viewports */
  .pp-control-zone {
    display: none;
  }

  @media (hover: none) and (pointer: coarse), (max-width: 768px) {
    .pp-control-zone {
      display: block;
    }
  }

  .pp-pad {
    position: absolute;
    width: 112px;
    height: 112px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid rgba(213, 215, 207, 0.2);
    background: radial-gradient(circle, rgba(23, 25, 22, 0.62) 0%, rgba(17, 18, 16, 0.42) 100%);
    backdrop-filter: blur(4px);
    box-shadow: inset 0 0 0 1px rgba(213, 215, 207, 0.04);
    pointer-events: none;
    opacity: 0.72;
    transition:
      left 220ms cubic-bezier(0.22, 1, 0.36, 1),
      top 220ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .pp-pad.is-active {
    opacity: 1;
    border-color: rgba(158, 176, 154, 0.65);
    box-shadow:
      0 0 0 1px rgba(158, 176, 154, 0.2),
      inset 0 0 18px rgba(122, 141, 118, 0.14);
    transition:
      opacity 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .pp-axis-h,
  .pp-axis-v {
    position: absolute;
    background: rgba(213, 215, 207, 0.16);
  }

  .pp-axis-h {
    left: 14px;
    right: 14px;
    top: 50%;
    height: 1px;
    transform: translateY(-0.5px);
  }

  .pp-axis-v {
    top: 14px;
    bottom: 14px;
    left: 50%;
    width: 1px;
    transform: translateX(-0.5px);
  }

  .pp-pad.is-active .pp-axis-h,
  .pp-pad.is-active .pp-axis-v {
    background: rgba(158, 176, 154, 0.32);
  }

  .pp-inner-ring {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px dashed rgba(213, 215, 207, 0.15);
  }

  .pp-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1.5px solid rgba(158, 176, 154, 0.7);
    background: rgba(122, 141, 118, 0.28);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    transition:
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .pp-pad.is-active .pp-knob {
    border-color: var(--color-ochre);
    background: rgba(159, 134, 101, 0.42);
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .pp-pad,
    .pp-knob {
      transition: none !important;
    }
  }
</style>
