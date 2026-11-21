<script lang="ts">
  import { untrack } from 'svelte';
  import {
    Cancel01Icon,
    DiceIcon,
    HelpCircleIcon,
    RefreshIcon,
    Share08Icon,
    Tick01Icon,
    Undo02Icon,
    VolumeHighIcon,
    VolumeOffIcon,
    ZoomInAreaIcon,
  } from '@hugeicons/core-free-icons';
  import GameStage from '../../components/GameStage.svelte';
  import Icon from '../../components/Icon.svelte';
  import { mountCornShots, type CornController, type CornHudState } from './scene';

  const card = 'rounded-md border border-ink/12 bg-surface/88 backdrop-blur-md';
  const btn =
    'focus-ring inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-ink/12 bg-surface-raised px-2.5 font-mono text-[11px] text-ink transition-colors hover:border-sage/45 disabled:cursor-default disabled:opacity-40';
  const sheet =
    'm-auto max-h-[90dvh] w-[min(92vw,25rem)] overflow-y-auto rounded-md border border-ink/14 bg-surface p-5 text-ink shadow-[0_24px_70px_rgba(0,0,0,0.72)] backdrop:bg-canvas/65 backdrop:backdrop-blur-xs';

  let viewportEl = $state<HTMLDivElement>();
  let topEl: HTMLDivElement;
  let bottomEl: HTMLDivElement;
  let controller: CornController | null = null;
  let failed = $state(false);

  let hud = $state<CornHudState>({
    seed: 0,
    roomIndex: 1,
    archetype: 'bank-corner',
    par: 2,
    shotsUsed: 0,
    ammoLeft: 5,
    totalPar: 0,
    totalShots: 0,
    targetsLeft: 1,
    targetsTotal: 1,
    predictedBounces: 0,
    aimDeg: 0,
    hasMovingObstacle: false,
    phase: 'aiming',
    muted: false,
    zoomed: false,
    canUndo: false,
    status: '',
  });

  let showSeedModal = $state(false);
  let showGuide = $state(false);
  let seedInput = $state<number | undefined>(undefined);
  let copied = $state(false);
  let copyTimer = 0;

  const parDiff = $derived(hud.totalShots - hud.totalPar);
  const runDiffLabel = $derived(
    hud.totalPar === 0 ? 'E' : parDiff === 0 ? 'E' : parDiff > 0 ? `+${parDiff}` : String(parDiff),
  );
  const roomScoreLabel = $derived.by(() => {
    const diff = hud.shotsUsed - hud.par;
    if (hud.shotsUsed === 1) return 'Ace';
    if (diff <= -1) return `Under Par (${diff})`;
    if (diff === 0) return 'Par';
    return `+${diff} Over Par`;
  });

  function openDialog(node: HTMLDialogElement) {
    node.showModal();
  }

  async function shareLink(event: MouseEvent) {
    const url = location.href;
    const field = (event.currentTarget as HTMLElement)
      .closest('dialog')
      ?.querySelector<HTMLInputElement>('input[readonly]');
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Corn Shots',
          text: `Corn Shots Seed #${hud.seed} · Room ${hud.roomIndex}`,
          url,
        });
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
      field?.focus();
      field?.select();
    }
  }

  function applySeed() {
    if (!seedInput || !Number.isFinite(seedInput) || seedInput <= 0) return;
    controller?.newSeed(Math.floor(seedInput));
    seedInput = undefined;
    showSeedModal = false;
  }

  $effect(() => {
    const viewport = viewportEl;
    if (!viewport) return;
    failed = false;
    try {
      const instance = untrack(() =>
        mountCornShots({
          viewport,
          chrome: [topEl, bottomEl],
          insets: () => ({
            top: (topEl?.offsetHeight ?? 0) + 10,
            bottom: (bottomEl?.offsetHeight ?? 0) + 12,
            left: 0,
            right: 0,
          }),
          onState: (patch) => {
            Object.assign(hud, patch);
          },
        }),
      );
      controller = instance;
      return () => {
        controller = null;
        instance.destroy();
      };
    } catch {
      failed = true;
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden">
<GameStage bind:viewport={viewportEl} label="Corn Shots 3D pasture" what="Corn Shots" {failed} />
  <!-- Top HUD -->
  <div
    bind:this={topEl}
    class="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex flex-wrap items-start justify-between gap-2 sm:inset-x-4 sm:top-3"
  >
    <div class="pointer-events-auto flex flex-wrap items-center gap-2.5 {card} px-3 py-2">
      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.14em] text-ink-dim uppercase">Room</span>
        <strong class="font-mono text-base leading-none font-semibold text-ink sm:text-lg">{hud.roomIndex}</strong>
      </div>

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.14em] text-ink-dim uppercase">Shots / Par</span>
        <span class="font-mono text-xs font-semibold text-ink">
          {hud.shotsUsed} / <span class="text-sage-soft">{hud.par}</span>
        </span>
      </div>

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.14em] text-ink-dim uppercase">Corn</span>
        <div class="mt-0.5 flex items-center gap-1" aria-label="{hud.ammoLeft} corn shells left">
          {#each Array(hud.ammoLeft) as _, i (i)}
            <span class="h-2.5 w-1.5 rounded-full bg-[#ffe469]" aria-hidden="true"></span>
          {/each}
          {#if hud.ammoLeft === 0}
            <span class="font-mono text-[10px] text-[#c97a66]">0</span>
          {/if}
        </div>
      </div>

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.14em] text-ink-dim uppercase">Run</span>
        <span
          class="font-mono text-xs font-semibold {parDiff < 0
            ? 'text-[#ffe469]'
            : parDiff === 0
              ? 'text-sage-soft'
              : 'text-[#d49685]'}"
        >
          {runDiffLabel}
        </span>
      </div>
    </div>

    {#if hud.status}
      <div
        role="status"
        class="hidden items-center gap-2 self-center rounded-full border border-ink/10 bg-surface/82 px-3 py-1.5 font-mono text-[11px] text-ink-muted backdrop-blur-md md:flex"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ff5cb]" aria-hidden="true"></span>
        <span class="whitespace-nowrap">{hud.status}</span>
      </div>
    {/if}

    <div class="pointer-events-auto flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        class={btn}
        title="Room seed & share"
        onclick={() => (showSeedModal = true)}
      >
        <Icon icon={Share08Icon} size={13} strokeWidth={1.8} />
        <span class="hidden sm:inline">#{hud.seed}</span>
      </button>

      <button
        type="button"
        class={btn}
        disabled={!hud.canUndo}
        title="Undo last shot (Z)"
        aria-label="Undo last shot"
        onclick={() => controller?.undo()}
      >
        <Icon icon={Undo02Icon} size={14} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        class={btn}
        title="Retry current room (R)"
        aria-label="Retry current room"
        onclick={() => controller?.retryRoom()}
      >
        <Icon icon={RefreshIcon} size={14} strokeWidth={1.8} />
      </button>

      {#if hud.zoomed}
        <button
          type="button"
          class={btn}
          title="Reset camera zoom"
          aria-label="Reset camera zoom"
          onclick={() => controller?.resetView()}
        >
          <Icon icon={ZoomInAreaIcon} size={14} strokeWidth={1.8} />
        </button>
      {/if}

      <button
        type="button"
        class="{btn} {hud.muted ? 'text-ink-dim' : 'text-ink'}"
        aria-pressed={hud.muted}
        aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'}
        onclick={() => controller?.toggleMute()}
      >
        <Icon icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} size={14} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        class={btn}
        aria-label="How to play"
        title="How to play"
        onclick={() => (showGuide = true)}
      >
        <Icon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
      </button>
    </div>
  </div>

  <!-- Bottom Aim + Fire Controls -->
  <div
    bind:this={bottomEl}
    class="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center sm:bottom-4"
  >
    {#if hud.phase === 'cleared'}
      <div class="pointer-events-auto flex flex-wrap items-center gap-3 {card} border-sage/45 px-4 py-3 shadow-xl">
        <div class="flex flex-col">
          <span class="font-mono text-[10px] tracking-[0.14em] text-sage uppercase">Room {hud.roomIndex} Cleared</span>
          <strong class="font-serif text-lg leading-tight text-ink">
            {roomScoreLabel} · {hud.shotsUsed} {hud.shotsUsed === 1 ? 'shot' : 'shots'}
          </strong>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class={btn} onclick={() => controller?.retryRoom()}>
            <Icon icon={RefreshIcon} size={13} strokeWidth={1.8} />
            <span>Replay</span>
          </button>
          <button
            type="button"
            class="focus-ring inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-sage/55 bg-sage/28 px-4 font-mono text-xs font-semibold text-ink transition-colors hover:bg-sage/40"
            onclick={() => controller?.nextRoom()}
          >
            <span>Next Room</span>
          </button>
        </div>
      </div>
    {:else if hud.phase === 'failed'}
      <div class="pointer-events-auto flex flex-wrap items-center gap-3 {card} border-[#b86b58]/45 px-4 py-3 shadow-xl">
        <div class="flex flex-col">
          <span class="font-mono text-[10px] tracking-[0.14em] text-[#d49685] uppercase">Out of Corn</span>
          <strong class="font-serif text-base text-ink">{hud.targetsLeft} alien still standing</strong>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class={btn} disabled={!hud.canUndo} onclick={() => controller?.undo()}>
            <Icon icon={Undo02Icon} size={13} strokeWidth={1.8} />
            <span>Undo</span>
          </button>
          <button
            type="button"
            class="focus-ring inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-sage/55 bg-sage/25 px-3.5 font-mono text-xs text-ink transition-colors hover:bg-sage/35"
            onclick={() => controller?.retryRoom()}
          >
            <Icon icon={RefreshIcon} size={13} strokeWidth={1.8} />
            <span>Retry Room</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 {card} px-2.5 py-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          class="{btn} px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Rotate left 2 deg"
          onclick={() => controller?.nudgeAim(2)}
        >
          -2°
        </button>
        <button
          type="button"
          class="{btn} px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Fine left 0.25 deg (Shift+Left)"
          onclick={() => controller?.nudgeAim(0.25)}
        >
          -0.25°
        </button>

        <div class="flex min-w-[82px] flex-col items-center px-1 font-mono leading-tight">
          <span class="text-[11px] font-semibold text-ink">
            {hud.aimDeg.toFixed(1)}°
          </span>
          <span class="text-[9px] text-ink-dim uppercase">
            {hud.predictedBounces} bounce{hud.predictedBounces === 1 ? '' : 's'}
          </span>
        </div>

        <button
          type="button"
          class="{btn} px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Fine right 0.25 deg (Shift+Right)"
          onclick={() => controller?.nudgeAim(-0.25)}
        >
          +0.25°
        </button>
        <button
          type="button"
          class="{btn} px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Rotate right 2 deg"
          onclick={() => controller?.nudgeAim(-2)}
        >
          +2°
        </button>

        <div class="hidden h-6 w-px bg-ink/10 sm:block" aria-hidden="true"></div>

        <button
          type="button"
          class="focus-ring inline-flex min-h-9 cursor-pointer items-center justify-center rounded-sm border border-sage/55 bg-sage/25 px-4 font-mono text-xs font-semibold tracking-wider text-ink uppercase transition-all hover:bg-sage/36 disabled:cursor-default disabled:opacity-45"
          disabled={hud.phase !== 'aiming' || hud.ammoLeft <= 0}
          onclick={() => controller?.fire()}
        >
          Fire
        </button>
      </div>
    {/if}
  </div>

  <!-- Seed / Share Dialog -->
  {#if showSeedModal}
    <dialog class={sheet} use:openDialog onclose={() => (showSeedModal = false)}>
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="font-mono text-[10px] tracking-[0.16em] text-ink-dim uppercase">Seeded Rooms</p>
          <h2 class="mt-0.5 font-serif text-xl text-ink">Seed #{hud.seed}</h2>
        </div>
        <button type="button" class={btn} aria-label="Close" onclick={() => (showSeedModal = false)}>
          <Icon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
        </button>
      </div>

      <p class="mt-2.5 text-sm leading-relaxed text-ink-muted">
        Every room sequence is deterministically generated and verified from its seed. Share the link to challenge someone on the exact same shots.
      </p>

      <div class="mt-4 flex gap-2">
        <input
          type="text"
          readonly
          value={typeof window !== 'undefined' ? window.location.href : ''}
          class="min-w-0 flex-1 rounded-sm border border-ink/14 bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-ink-muted"
        />
        <button type="button" class={btn} onclick={shareLink}>
          <Icon icon={copied ? Tick01Icon : Share08Icon} size={13} strokeWidth={1.8} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <form
        class="mt-4 flex items-end gap-2 border-t border-ink/10 pt-4"
        onsubmit={(e) => {
          e.preventDefault();
          applySeed();
        }}
      >
        <label class="flex min-w-0 flex-1 flex-col gap-1 font-mono text-[10px] text-ink-dim uppercase">
          Jump to Seed
          <input
            type="number"
            min="1"
            step="1"
            placeholder={String(hud.seed)}
            bind:value={seedInput}
            class="rounded-sm border border-ink/14 bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink"
          />
        </label>
        <button type="submit" class={btn} disabled={!seedInput}>Load</button>
        <button
          type="button"
          class={btn}
          title="New random seed"
          onclick={() => {
            controller?.newSeed();
            showSeedModal = false;
          }}
        >
          <Icon icon={DiceIcon} size={14} strokeWidth={1.8} />
          <span>Random</span>
        </button>
      </form>
    </dialog>
  {/if}

  <!-- How to Play Dialog -->
  {#if showGuide}
    <dialog class={sheet} use:openDialog onclose={() => (showGuide = false)}>
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="font-mono text-[10px] tracking-[0.16em] text-ink-dim uppercase">Field Manual</p>
          <h2 class="mt-0.5 font-serif text-xl text-ink">Corn Shots</h2>
        </div>
        <button type="button" class={btn} aria-label="Close" onclick={() => (showGuide = false)}>
          <Icon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
        </button>
      </div>

      <ul class="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
        <li><strong class="text-ink">Aim &amp; Fire:</strong> Move cursor or drag on the board to trace ricochets; left-click anywhere on the board, press <code class="text-ink">Space</code>, or tap <strong class="text-ink">Fire</strong> to shoot.</li>
        <li><strong class="text-ink">Preview Line:</strong> The mint laser previews up to 2 bounces (3 segments); fired corn shells can bounce up to 4 times.</li>
        <li><strong class="text-ink">Shielded Visitors:</strong> Glowing mint front shields bounce corn away. Bank behind them or detonate an orange <strong class="text-ink">Pumpkin</strong> nearby.</li>
        <li><strong class="text-ink">Keys:</strong> <code class="text-ink">A/D</code> or <code class="text-ink">Left/Right</code> nudge aim (<code class="text-ink">Shift</code> for 0.1°), <code class="text-ink">Space</code> fires, <code class="text-ink">Z</code> undoes, <code class="text-ink">R</code> retries.</li>
      </ul>
    </dialog>
  {/if}
</div>
