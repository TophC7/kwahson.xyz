<script lang="ts">
  import { untrack } from 'svelte';
  import {
    HelpCircleIcon,
    RefreshIcon,
    Share08Icon,
    Undo02Icon,
    VolumeHighIcon,
    VolumeOffIcon,
    ZoomInAreaIcon,
  } from '@hugeicons/core-free-icons';
  import GameStage from '../../components/GameStage.svelte';
  import Button from '../../components/ui/Button.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import SeedShareDialog from '../../components/ui/SeedShareDialog.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import { mountCornShots, type CornController, type CornHudState } from './scene';

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

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none" aria-label="Corn Shots game">
  <GameStage bind:viewport={viewportEl} label="Corn Shots 3D pasture" what="Corn Shots" {failed} />

  <!-- Top HUD -->
  <div
    bind:this={topEl}
    class="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex flex-wrap items-start justify-between gap-2 sm:inset-x-4 sm:top-3"
  >
    <div class="pointer-events-auto hud-surface flex flex-wrap items-center gap-2.5 rounded-md px-3 py-2">
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
            <span class="h-2.5 w-1.5 rounded-full bg-gold" aria-hidden="true"></span>
          {/each}
          {#if hud.ammoLeft === 0}
            <span class="font-mono text-[10px] text-danger-soft">0</span>
          {/if}
        </div>
      </div>

      <div class="h-6 w-px bg-ink/10" aria-hidden="true"></div>

      <div class="flex flex-col">
        <span class="font-mono text-[9px] tracking-[0.14em] text-ink-dim uppercase">Run</span>
        <span
          class="font-mono text-xs font-semibold {parDiff < 0
            ? 'text-gold'
            : parDiff === 0
              ? 'text-sage-soft'
              : 'text-danger-soft'}"
        >
          {runDiffLabel}
        </span>
      </div>
    </div>

    {#if hud.status}
      <div class="order-last flex basis-full justify-center md:order-none md:basis-auto md:self-center">
        <StatusPill tone="mint">{hud.status}</StatusPill>
      </div>
    {/if}

    <div class="pointer-events-auto flex shrink-0 items-center gap-1.5">
      <Button
        size="sm"
        icon={Share08Icon}
        iconSize={13}
        hideLabelOnMobile
        title="Room seed & share"
        aria-label="Room seed and share"
        onclick={() => (showSeedModal = true)}
      >
        #{hud.seed}
      </Button>

      <Button
        size="sm"
        icon={Undo02Icon}
        iconSize={14}
        disabled={!hud.canUndo}
        title="Undo last shot (Z)"
        aria-label="Undo last shot"
        onclick={() => controller?.undo()}
      />

      <Button
        size="sm"
        icon={RefreshIcon}
        iconSize={14}
        title="Retry current room (R)"
        aria-label="Retry current room"
        onclick={() => controller?.retryRoom()}
      />

      {#if hud.zoomed}
        <Button
          size="sm"
          icon={ZoomInAreaIcon}
          iconSize={14}
          title="Reset camera zoom"
          aria-label="Reset camera zoom"
          onclick={() => controller?.resetView()}
        />
      {/if}

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
        aria-label="How to play"
        title="How to play"
        onclick={() => (showGuide = true)}
      />
    </div>
  </div>

  <!-- Bottom Aim + Fire Controls -->
  <div
    bind:this={bottomEl}
    class="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center sm:bottom-4"
  >
    {#if hud.phase === 'cleared'}
      <div class="pointer-events-auto hud-surface flex flex-wrap items-center gap-3 rounded-md border-sage/45 px-4 py-3 shadow-xl">
        <div class="flex flex-col">
          <span class="font-mono text-[10px] tracking-[0.14em] text-sage uppercase">Room {hud.roomIndex} Cleared</span>
          <strong class="font-sans text-lg leading-tight font-semibold text-ink">
            {roomScoreLabel} · {hud.shotsUsed} {hud.shotsUsed === 1 ? 'shot' : 'shots'}
          </strong>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="surface" size="md" icon={RefreshIcon} iconSize={13} onclick={() => controller?.retryRoom()}>
            Replay
          </Button>
          <Button variant="primary" size="md" class="font-semibold" onclick={() => controller?.nextRoom()}>
            Next Room
          </Button>
        </div>
      </div>
    {:else if hud.phase === 'failed'}
      <div class="pointer-events-auto hud-surface flex flex-wrap items-center gap-3 rounded-md border-danger/45 px-4 py-3 shadow-xl">
        <div class="flex flex-col">
          <span class="font-mono text-[10px] tracking-[0.14em] text-danger-soft uppercase">Out of Corn</span>
          <strong class="font-sans text-base font-semibold text-ink">
            {hud.targetsLeft} {hud.targetsLeft === 1 ? 'alien' : 'aliens'} still standing
          </strong>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="surface" size="md" icon={Undo02Icon} iconSize={13} disabled={!hud.canUndo} onclick={() => controller?.undo()}>
            Undo
          </Button>
          <Button variant="primary" size="md" icon={RefreshIcon} iconSize={13} onclick={() => controller?.retryRoom()}>
            Retry Room
          </Button>
        </div>
      </div>
    {:else}
      <div class="pointer-events-auto hud-surface flex flex-wrap items-center justify-center gap-1.5 rounded-md px-2.5 py-2 sm:gap-2 sm:px-3">
        <Button
          size="sm"
          class="px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Rotate left 2 deg"
          onclick={() => controller?.nudgeAim(2)}
        >
          -2°
        </Button>
        <Button
          size="sm"
          class="px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Fine left 0.25 deg"
          onclick={() => controller?.nudgeAim(0.25)}
        >
          -0.25°
        </Button>

        <div class="flex min-w-[82px] flex-col items-center px-1 font-mono leading-tight">
          <span class="text-[11px] font-semibold text-ink">
            {hud.aimDeg.toFixed(1)}°
          </span>
          <span class="text-[9px] text-ink-dim uppercase">
            {hud.predictedBounces} bounce{hud.predictedBounces === 1 ? '' : 's'}
          </span>
        </div>

        <Button
          size="sm"
          class="px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Fine right 0.25 deg"
          onclick={() => controller?.nudgeAim(-0.25)}
        >
          +0.25°
        </Button>
        <Button
          size="sm"
          class="px-2 text-[10.5px]"
          disabled={hud.phase !== 'aiming'}
          title="Rotate right 2 deg"
          onclick={() => controller?.nudgeAim(-2)}
        >
          +2°
        </Button>

        <div class="hidden h-6 w-px bg-ink/10 sm:block" aria-hidden="true"></div>

        <Button
          variant="primary"
          size="md"
          class="px-4 font-semibold tracking-wider uppercase"
          disabled={hud.phase !== 'aiming' || hud.ammoLeft <= 0}
          onclick={() => controller?.fire()}
        >
          Fire
        </Button>
      </div>
    {/if}
  </div>

  <!-- Seed / Share Dialog -->
  <SeedShareDialog
    open={showSeedModal}
    onClose={() => (showSeedModal = false)}
    seed={hud.seed}
    eyebrow="Seeded Rooms"
    description="Every room sequence is deterministically generated and verified from its seed. Share the link to challenge someone on the exact same shots."
    shareTitle="Corn Shots"
    shareText={`Corn Shots Seed #${hud.seed} · Room ${hud.roomIndex}`}
    seedLabel="Jump to Seed"
    onSelectSeed={(seed) => controller?.newSeed(seed)}
    onRandomSeed={() => controller?.newSeed()}
  />

  <!-- How to Play Dialog -->
  <ModalDialog
    open={showGuide}
    onClose={() => (showGuide = false)}
    eyebrow="Field Manual"
    title="Corn Shots"
    maxWidth="25rem"
  >
    <ul class="space-y-2 text-sm leading-relaxed text-ink-muted">
      <li><strong class="text-ink">Aim &amp; Fire:</strong> Move cursor or drag on the board to trace ricochets; left-click anywhere on the board, press <code class="text-ink">Space</code>, or tap <strong class="text-ink">Fire</strong> to shoot.</li>
      <li><strong class="text-ink">Preview Line:</strong> The mint laser previews up to 2 bounces (3 segments); fired corn shells can bounce up to 4 times.</li>
      <li><strong class="text-ink">Shielded Visitors:</strong> Glowing mint front shields bounce corn away. Bank behind them or detonate an orange <strong class="text-ink">Pumpkin</strong> nearby.</li>
      <li><strong class="text-ink">Keys:</strong> <code class="text-ink">A/D</code> or <code class="text-ink">Left/Right</code> nudge aim (0.75°, hold <code class="text-ink">Shift</code> for 0.1°), <code class="text-ink">Space</code> fires, <code class="text-ink">Z</code> undoes, <code class="text-ink">R</code> retries.</li>
    </ul>
  </ModalDialog>
</div>
