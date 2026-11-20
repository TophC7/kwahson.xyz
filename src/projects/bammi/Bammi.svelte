<script lang="ts">
  import { RefreshIcon } from '@hugeicons/core-free-icons';
  import FieldBackground from '../../components/FieldBackground.svelte';
  import Icon from '../../components/Icon.svelte';
  import {
    BOARD_SIZES,
    SLICE_PATHS,
    chooseComputerMove,
    createBoard,
    ownsAll,
    playMove,
    type Board,
    type GameMode,
    type LayoutKey,
    type Player,
    type Region,
  } from './engine';

  type SpeedMs = 0 | 100 | 280;

  // Muted indigo-slate (Blueberry / B) and dusty rose-clay (Cherry / R)
  const PLAYERS = [
    {
      name: 'Blue',
      short: 'B',
      flavor: 'blueberry',
      fill: '#6c78a6',
      bright: '#9aa6d1',
      tint: '#1e2230',
      activeBadge: 'border-[#7c88b8]/75 bg-[#202536] text-[#aeb9e3]',
      idleBadge: 'border-[#6c78a6]/25 bg-[#1a1e2b] text-[#8d98bf]',
    },
    {
      name: 'Red',
      short: 'R',
      flavor: 'cherry',
      fill: '#a65f6e',
      bright: '#d19aa5',
      tint: '#2c1e23',
      activeBadge: 'border-[#b87180]/75 bg-[#332127] text-[#dfaab4]',
      idleBadge: 'border-[#a65f6e]/25 bg-[#261a1e] text-[#bd8994]',
    },
  ] as const;

  const LAYOUT_ENTRIES = Object.entries(BOARD_SIZES) as [LayoutKey, (typeof BOARD_SIZES)[LayoutKey]][];

  const MODE_OPTIONS: { value: GameMode; label: string }[] = [
    { value: 'friend', label: '2P' },
    { value: 'computer', label: 'CPU' },
  ];

  const SPEED_OPTIONS: { value: SpeedMs; label: string }[] = [
    { value: 280, label: 'Normal' },
    { value: 100, label: 'Fast' },
    { value: 0, label: 'Instant' },
  ];

  interface BurstSpec {
    x: number;
    y: number;
    player: Player;
    sparksPath: string;
    targets: { dx: number; dy: number }[];
  }

  let boardEl = $state<SVGSVGElement | null>(null);
  let mobileRestartBtnEl = $state<HTMLButtonElement | null>(null);
  let desktopRestartBtnEl = $state<HTMLButtonElement | null>(null);
  let restartDialogEl = $state<HTMLDialogElement | null>(null);

  let gameLayout = $state<LayoutKey>('medium');
  let gameMode = $state<GameMode>('friend');
  let speed = $state<SpeedMs>(280);
  let reducedMotion = $state(false);

  let boardSize = $state({ w: 8, h: 8 });
  let regions = $state<Region[]>([]);
  let borderPath = $state('');
  let turn = $state<Player>(0);
  let winner = $state<Player | null>(null);
  let busy = $state(false);
  let moves = $state(0);
  let activeRegion = $state(0);
  let message = $state('Blue starts. Empty regions are up for grabs.');
  let keyboardMode = $state(false);
  let focusedRegionId = $state<number | null>(null);
  let activeBurst = $state.raw<BurstSpec | null>(null);
  let burstProgress = $state(0);

  let pendingGame: { layout: LayoutKey; mode: GameMode } | null = null;
  let generation = 0;
  let computerTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelBurst: (() => void) | null = null;

  const effectiveSpeed = $derived<SpeedMs>(reducedMotion ? 0 : speed);

  const legalIds = $derived.by(() => {
    if (busy || winner !== null || (gameMode === 'computer' && turn === 1)) {
      return new Set<number>();
    }
    return new Set(
      regions.filter((r) => r.owner === null || r.owner === turn).map((r) => r.id),
    );
  });

  const blueCount = $derived(regions.filter((r) => r.owner === 0).length);
  const redCount = $derived(regions.filter((r) => r.owner === 1).length);
  const playerCounts = $derived<[number, number]>([blueCount, redCount]);

  const statusText = $derived(
    winner === null
      ? `${PLAYERS[turn].name}${busy ? ' · resolving...' : gameMode === 'computer' && turn === 1 ? ' · thinking...' : "'s turn"}`
      : `${PLAYERS[winner].name} wins!`,
  );

  const showKeyboardFocus = $derived(
    keyboardMode &&
      !busy &&
      winner === null &&
      focusedRegionId !== null &&
      legalIds.has(focusedRegionId),
  );

  const focusedRegion = $derived(
    showKeyboardFocus && focusedRegionId !== null ? regions[focusedRegionId] ?? null : null,
  );

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  function clearPendingTimers() {
    if (computerTimer !== null) {
      clearTimeout(computerTimer);
      computerTimer = null;
    }
    cancelBurst?.();
  }

  function newGame(layoutKey: LayoutKey = gameLayout, modeValue: GameMode = gameMode) {
    let next: Board;
    try {
      next = createBoard(BOARD_SIZES[layoutKey]);
    } catch (err) {
      message = err instanceof Error ? err.message : 'Could not generate a valid board.';
      return;
    }

    generation++;
    clearPendingTimers();
    boardSize = { w: next.w, h: next.h };
    regions = next.regions;
    borderPath = next.borderPath;
    turn = 0;
    winner = null;
    busy = false;
    moves = 0;
    activeRegion = 0;
    focusedRegionId = null;
    gameLayout = layoutKey;
    gameMode = modeValue;
    message = 'Blue starts. Empty regions are up for grabs.';
  }

  function animateExplosion(
    source: Region,
    player: Player,
    duration: number,
    token: number,
  ): Promise<void> {
    if (!duration || reducedMotion) return Promise.resolve();
    const x = source.x;
    const y = source.y - 0.045;
    let sparksPath = '';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sparksPath += `M${x + c * 0.35} ${y + s * 0.35} L${x + c * 0.44} ${y + s * 0.44} `;
    }
    const targets = source.neighbors.map((id) => ({
      dx: regions[id].x - x,
      dy: regions[id].y - 0.045 - y,
    }));

    return new Promise((resolve) => {
      let raf = 0;
      const finish = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (cancelBurst === finish) cancelBurst = null;
        activeBurst = null;
        burstProgress = 0;
        resolve();
      };

      cancelBurst = finish;
      activeBurst = { x, y, player, sparksPath, targets };
      burstProgress = 0;

      const start = performance.now();
      const frame = (now: number) => {
        if (token !== generation || reducedMotion) {
          finish();
          return;
        }
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        burstProgress = t;
        if (t < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          finish();
        }
      };
      raf = requestAnimationFrame(frame);
    });
  }

  function focusRegion(id: number) {
    activeRegion = id;
    focusedRegionId = id;
    const targetEl = boardEl?.querySelector<SVGPathElement>(`[data-region="${id}"]`);
    targetEl?.focus({ preventScroll: true });
  }

  function focusVisibleRestartButton() {
    const btn = Boolean(desktopRestartBtnEl?.offsetParent)
      ? desktopRestartBtnEl
      : Boolean(mobileRestartBtnEl?.offsetParent)
        ? mobileRestartBtnEl
        : null;
    btn?.focus({ preventScroll: true });
  }

  function handleRegionKey(event: KeyboardEvent, from: Region) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      play(from.id);
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = directions[event.key];
    if (!dir && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();

    const options = regions.filter((r) => legalIds.has(r.id));
    if (!options.length) return;
    if (event.key === 'Home' || event.key === 'End') {
      focusRegion(options[event.key === 'Home' ? 0 : options.length - 1].id);
      return;
    }

    const [vx, vy] = dir;
    let target: Region | null = null;
    let best = Infinity;
    for (const r of options) {
      const dx = r.x - from.x;
      const dy = r.y - from.y;
      if (dx * vx + dy * vy <= 0) continue;
      const score = Math.hypot(dx, dy) + 2 * Math.abs(dx * vy - dy * vx);
      if (score < best) {
        best = score;
        target = r;
      }
    }
    if (target) focusRegion(target.id);
  }

  function scheduleComputer() {
    if (gameMode !== 'computer' || turn !== 1 || winner !== null) return;
    const token = generation;
    message = 'Cherry is choosing a pie...';
    computerTimer = setTimeout(async () => {
      computerTimer = null;
      if (token !== generation || busy || winner !== null) return;
      const choice = chooseComputerMove($state.snapshot(regions));
      if (choice !== null) await play(choice, true);
    }, 400);
  }

  async function play(id: number, asComputer = false) {
    const r = regions[id];
    if (!r || busy || winner !== null || (r.owner !== null && r.owner !== turn)) return;
    if (gameMode === 'computer' && turn === 1 && !asComputer) return;

    const token = generation;
    const player = turn;
    const hadBoardFocus = focusedRegionId !== null;
    busy = true;
    moves++;

    let explosions = 0;
    for (const index of playMove(regions, id, player)) {
      explosions++;
      message = `BAMM! ${explosions} explosion${explosions === 1 ? '' : 's'} - neighbors captured.`;

      const delay = effectiveSpeed;
      if (delay) {
        await animateExplosion(regions[index], player, delay, token);
      } else if (explosions % 100 === 0) {
        await sleep(0);
      }
      if (token !== generation) return;
    }

    if (token !== generation) return;
    winner = ownsAll(regions, player) ? player : null;
    if (winner === null) turn = player === 0 ? 1 : 0;
    busy = false;

    const nextLegal = regions.filter((reg) => legalIds.has(reg.id));
    if (!legalIds.has(activeRegion) && nextLegal.length) {
      activeRegion = nextLegal[0].id;
    }

    message =
      winner !== null
        ? `Every region is ${PLAYERS[winner].flavor}. Won in ${moves} moves!`
        : explosions
          ? `Chain settled after ${explosions} explosion${explosions === 1 ? '' : 's'}.`
          : 'Tap an empty region or one of your own pies.';

    if (hadBoardFocus && keyboardMode) {
      if (winner !== null) {
        focusVisibleRestartButton();
      } else if (nextLegal.length) {
        queueMicrotask(() => focusRegion(activeRegion));
      }
    }

    scheduleComputer();
  }

  function requestNewGame(nextLayout: LayoutKey = gameLayout, nextMode: GameMode = gameMode) {
    if (!moves || winner !== null) {
      newGame(nextLayout, nextMode);
      return;
    }
    pendingGame = { layout: nextLayout, mode: nextMode };
    if (restartDialogEl) {
      restartDialogEl.returnValue = 'cancel';
      restartDialogEl.showModal();
    }
  }

  function selectLayout(nextLayout: LayoutKey) {
    if (nextLayout === gameLayout) return;
    requestNewGame(nextLayout, gameMode);
  }

  function selectMode(nextMode: GameMode) {
    if (nextMode === gameMode) return;
    requestNewGame(gameLayout, nextMode);
  }

  function handleDialogClose() {
    const pending = pendingGame;
    pendingGame = null;
    if (restartDialogEl?.returnValue === 'restart' && pending) {
      newGame(pending.layout, pending.mode);
    }
  }

  $effect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;

    const abort = new AbortController();
    const { signal } = abort;

    mq.addEventListener(
      'change',
      (event) => {
        reducedMotion = event.matches;
      },
      { signal },
    );
    document.addEventListener(
      'keydown',
      () => {
        keyboardMode = true;
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'pointerdown',
      () => {
        keyboardMode = false;
      },
      { capture: true, signal },
    );

    newGame('medium', 'friend');

    return () => {
      generation++;
      clearPendingTimers();
      abort.abort();
    };
  });
</script>

{#snippet pillGroup<T extends string | number>(
  label: string,
  ariaLabel: string,
  items: { value: T; label: string; suffix?: number; disabled?: boolean; title?: string }[],
  selected: T,
  onSelect: (value: T) => void,
  padClass: string,
)}
  <div class="flex items-center justify-between gap-2" role="group" aria-label={ariaLabel}>
    <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">{label}</span>
    <div class="inline-flex rounded-sm border border-[rgba(213,215,207,0.1)] bg-canvas p-0.5">
      {#each items as opt}
        <button
          type="button"
          disabled={opt.disabled}
          title={opt.title}
          aria-pressed={selected === opt.value}
          onclick={() => onSelect(opt.value)}
          class="bammi-control rounded-[3px] {padClass} py-1 font-mono text-[11px] transition-colors {selected === opt.value
            ? 'bg-surface-raised text-ink'
            : opt.disabled
              ? 'cursor-not-allowed text-ink-dim/40'
              : 'cursor-pointer text-ink-dim hover:text-ink-muted'}"
        >
          {opt.label}{#if opt.suffix !== undefined}<span class="ml-1 opacity-60">{opt.suffix}</span>{/if}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="relative min-h-full bg-canvas text-ink lg:h-full lg:overflow-hidden">
  <FieldBackground />

  <div
    class="relative mx-auto flex min-h-full max-w-[1160px] flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4 lg:h-full lg:flex-row lg:items-center lg:gap-5 lg:py-5"
    style="padding-bottom: max(16px, env(safe-area-inset-bottom));"
  >
    <!-- Mobile compact status header (above board on small screens; desktop shows this in the right rail) -->
    <div
      class="flex items-center justify-between gap-2 rounded-md border border-[rgba(213,215,207,0.1)] bg-surface px-3 py-2 lg:hidden"
    >
      <div class="min-w-0">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          class="text-sm font-semibold tracking-tight"
          style="color: {PLAYERS[winner ?? turn].bright};"
        >
          {statusText}
        </div>
        <p class="m-0 truncate text-[11px] text-ink-muted">{message}</p>
      </div>

      <div class="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
        {#each PLAYERS as p, i}
          <span
            class="rounded-sm border px-1.5 py-0.5 {winner === null && turn === i
              ? p.activeBadge
              : p.idleBadge}"
          >
            {p.short} <strong>{playerCounts[i]}</strong>
          </span>
        {/each}
        <button
          bind:this={mobileRestartBtnEl}
          type="button"
          title="New game"
          aria-label="New game"
          onclick={() => requestNewGame(gameLayout, gameMode)}
          class="bammi-control inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border border-sage/45 bg-sage/18 text-ink"
        >
          <Icon icon={RefreshIcon} size={13} strokeWidth={1.9} />
        </button>
      </div>
    </div>

    <!-- Primary Board Stage: container-query square auto-fits both width and height cleanly in Firefox & Chromium -->
    <div class="bammi-stage-wrap flex min-h-0 min-w-0 flex-1 items-center justify-center lg:h-full lg:self-stretch">
      <div
        class="bammi-stage relative overflow-hidden rounded-md border border-[rgba(213,215,207,0.16)] bg-[#151714] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.9)]"
      >
        {#if regions.length > 0}
          <svg
            bind:this={boardEl}
            class="bammi-board"
            viewBox="0 0 {boardSize.w} {boardSize.h}"
            role="group"
            aria-label="Bammi board"
            aria-describedby="bammi-rules-summary"
            aria-busy={busy}
          >
            <!-- Regions -->
            {#each regions as r (r.id)}
              {@const canPlay = legalIds.has(r.id)}
              <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
              <path
                d={r.path}
                fill={r.owner === null ? '#161815' : PLAYERS[r.owner].tint}
                class="bammi-region"
                class:legal={canPlay}
                role="button"
                tabindex={canPlay && r.id === activeRegion ? 0 : -1}
                data-region={r.id}
                aria-disabled={!canPlay}
                aria-label="Region {r.id + 1}, {r.owner === null
                  ? 'unclaimed'
                  : `${PLAYERS[r.owner].flavor}, ${PLAYERS[r.owner].short}`}, {r.count} of {r.cap} slices{r.count === r.cap
                  ? ', full: one more slice explodes'
                  : ''}"
                onclick={() => play(r.id)}
                onkeydown={(e) => handleRegionKey(e, r)}
                onfocus={() => {
                  if (canPlay) {
                    activeRegion = r.id;
                    focusedRegionId = r.id;
                  }
                }}
                onblur={() => {
                  if (focusedRegionId === r.id) focusedRegionId = null;
                }}
              />
            {/each}

            <!-- Crisp borders -->
            <path d={borderPath} class="bammi-border" aria-hidden="true" />

            <!-- Pies -->
            {#each regions as r (r.id)}
              <g transform="translate({r.x} {r.y - 0.045})" aria-hidden="true" pointer-events="none">
                {#each SLICE_PATHS[r.cap] as d, s}
                  <path
                    {d}
                    fill={r.owner !== null && s < r.count ? PLAYERS[r.owner].fill : '#131512'}
                    stroke="#3c413a"
                    stroke-width="0.015"
                  />
                {/each}
                <circle
                  r="0.325"
                  fill="none"
                  stroke={r.count >= r.cap && r.owner !== null ? PLAYERS[r.owner].bright : '#4d524a'}
                  stroke-width={r.count >= r.cap ? 0.042 : 0.018}
                />
                <text y="0.48" class="bammi-caption">
                  {r.owner === null ? '' : `${PLAYERS[r.owner].short} `}{r.count}/{r.cap}
                </text>
              </g>
            {/each}

            <!-- Explosion particles -->
            {#if activeBurst}
              <g aria-hidden="true" pointer-events="none">
                <path
                  d={activeBurst.sparksPath}
                  fill="none"
                  stroke={PLAYERS[activeBurst.player].bright}
                  stroke-width="0.036"
                  stroke-linecap="round"
                  opacity={1 - burstProgress}
                />
                {#each activeBurst.targets as target, i (i)}
                  <path
                    d="M-.09 -.10 L.11 0 L-.09 .10 Q-.13 0 -.09 -.10 Z"
                    transform="translate({activeBurst.x + target.dx * burstProgress} {activeBurst.y + target.dy * burstProgress})"
                    fill={PLAYERS[activeBurst.player].bright}
                    stroke="#141613"
                    stroke-width="0.016"
                  />
                {/each}
              </g>
            {/if}

            <!-- Keyboard focus outline -->
            {#if focusedRegion}
              <g aria-hidden="true" pointer-events="none">
                <rect
                  x={focusedRegion.x - 0.46}
                  y={focusedRegion.y - 0.46}
                  width="0.92"
                  height="0.92"
                  rx="0.06"
                  fill="none"
                  stroke="#111210"
                  stroke-width="5"
                  vector-effect="non-scaling-stroke"
                />
                <rect
                  x={focusedRegion.x - 0.46}
                  y={focusedRegion.y - 0.46}
                  width="0.92"
                  height="0.92"
                  rx="0.06"
                  fill="none"
                  stroke="#d5d7cf"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                />
              </g>
            {/if}
          </svg>
        {/if}
      </div>
    </div>

    <!-- Side Rail on desktop / Compact bottom deck on mobile -->
    <aside
      class="flex shrink-0 flex-col overflow-hidden rounded-md border border-[rgba(213,215,207,0.1)] bg-surface lg:max-h-full lg:w-[320px] lg:overflow-y-auto"
    >
      <!-- Desktop Title + New Game -->
      <div
        class="hidden items-center justify-between gap-3 border-b border-[rgba(213,215,207,0.08)] px-4 py-3.5 lg:flex"
      >
        <div>
          <h1 class="m-0 text-xl font-semibold tracking-[-0.025em] text-ink">
            Bammi<span class="text-ochre">.</span>
          </h1>
          <p class="mt-0.5 m-0 text-[11.5px] text-ink-dim">Exploding pies</p>
        </div>

        <button
          bind:this={desktopRestartBtnEl}
          type="button"
          title="Start over with a newly randomized board"
          onclick={() => requestNewGame(gameLayout, gameMode)}
          class="bammi-control inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-sage/45 bg-sage/18 px-3 font-mono text-[11px] font-medium text-ink transition-colors hover:border-sage/70 hover:bg-sage/28"
        >
          <Icon icon={RefreshIcon} size={13} strokeWidth={1.9} />
          <span>New game</span>
        </button>
      </div>

      <!-- Desktop Turn + Scores -->
      <div class="hidden border-b border-[rgba(213,215,207,0.08)] px-4 py-3.5 lg:block">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          class="text-base font-semibold tracking-tight"
          style="color: {PLAYERS[winner ?? turn].bright};"
        >
          {statusText}
        </div>
        <p class="mt-1 mb-3 min-h-[2.4em] text-xs leading-relaxed text-ink-muted">{message}</p>

        <div class="grid grid-cols-2 gap-2 font-mono text-xs" aria-label="Regions owned by each player">
          {#each PLAYERS as p, i}
            <div
              aria-label="{p.flavor[0].toUpperCase()}{p.flavor.slice(1)} owns {playerCounts[i]} of {regions.length} regions"
              class="flex items-baseline justify-between rounded-sm border px-2.5 py-2 transition-all {winner === null && turn === i
                ? p.activeBadge
                : p.idleBadge}"
            >
              <span>{p.name}</span>
              <span><strong>{playerCounts[i]}</strong>/{regions.length}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Always-visible compact controls -->
      <div class="grid gap-2.5 border-b border-[rgba(213,215,207,0.08)] bg-canvas/35 px-3.5 py-3 sm:px-4">
        {@render pillGroup(
          'Size',
          'Board size',
          LAYOUT_ENTRIES.map(([key, spec]) => ({ value: key, label: spec.label, suffix: spec.count })),
          gameLayout,
          selectLayout,
          'px-2',
        )}
        {@render pillGroup(
          'Mode',
          'Opponent mode',
          MODE_OPTIONS,
          gameMode,
          selectMode,
          'px-2.5',
        )}
        {@render pillGroup(
          'Speed',
          'Animation speed',
          SPEED_OPTIONS.map((opt) => ({
            ...opt,
            disabled: reducedMotion && opt.value !== 0,
            title: reducedMotion && opt.value !== 0 ? 'Disabled while reduced motion is enabled' : undefined,
          })),
          effectiveSpeed,
          (value) => (speed = value),
          'px-2',
        )}
      </div>

      <!-- Concise always-visible rules -->
      <footer id="bammi-rules-summary" class="px-3.5 py-3 sm:px-4">
        <div class="grid grid-cols-1 gap-2 text-[11.5px] leading-relaxed text-ink-muted sm:grid-cols-3 lg:grid-cols-1 lg:gap-2.5">
          <div>
            <span class="font-mono text-[10px] tracking-wider text-sage uppercase">01 · Claim</span>
            <p class="mt-0.5 m-0">Tap an empty region or your own pie to add a slice.</p>
          </div>
          <div>
            <span class="font-mono text-[10px] tracking-wider text-sage uppercase">02 · Burst</span>
            <p class="mt-0.5 m-0">Pies hold 1 slice per neighbor. One extra explodes and captures them.</p>
          </div>
          <div>
            <span class="font-mono text-[10px] tracking-wider text-sage uppercase">03 · Win</span>
            <p class="mt-0.5 m-0">Chains resolve automatically. Take every region to win.</p>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(213,215,207,0.06)] pt-2.5 font-mono text-[10px] text-ink-dim">
          <span>B = Blue · R = Red</span>
          <a
            href="https://www.bammi.com/about.asp"
            target="_blank"
            rel="noopener"
            class="text-ink-muted underline underline-offset-3 hover:text-ink"
          >
            Original rules
          </a>
        </div>
      </footer>
    </aside>
  </div>

  <dialog
    bind:this={restartDialogEl}
    onclose={handleDialogClose}
    aria-labelledby="bammi-restart-title"
    aria-describedby="bammi-restart-desc"
    class="bammi-dialog"
  >
    <h2 id="bammi-restart-title" class="m-0 text-lg font-semibold text-ink">Start a new game?</h2>
    <p id="bammi-restart-desc" class="mt-2 mb-6 text-sm leading-relaxed text-ink-muted">
      Your current game will be lost and a freshly randomized board will be generated.
    </p>
    <form method="dialog" class="flex flex-wrap justify-end gap-2.5">
      <button
        value="cancel"
        class="bammi-control cursor-pointer rounded-sm border border-[rgba(213,215,207,0.14)] bg-surface-raised px-3.5 py-2 font-mono text-xs text-ink-muted hover:border-[rgba(213,215,207,0.28)] hover:text-ink"
      >
        Keep playing
      </button>
      <button
        value="restart"
        class="bammi-control cursor-pointer rounded-sm border border-sage/50 bg-sage/20 px-3.5 py-2 font-mono text-xs font-medium text-ink hover:bg-sage/32"
      >
        New game
      </button>
    </form>
  </dialog>
</div>

<style>
  .bammi-control:focus-visible {
    outline: 2px solid var(--color-sage);
    outline-offset: 2px;
  }

  .bammi-stage {
    width: 100%;
    max-width: min(100%, 680px);
    aspect-ratio: 1 / 1;
  }

  @media (min-width: 1024px) {
    .bammi-stage-wrap {
      container-type: size;
    }

    .bammi-stage {
      width: min(100cqw, 100cqh);
      height: min(100cqw, 100cqh);
      max-width: none;
    }
  }

  .bammi-board {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .bammi-region {
    cursor: default;
    transition: filter 120ms ease;
  }

  .bammi-region.legal {
    cursor: pointer;
  }

  .bammi-region.legal:hover {
    filter: brightness(1.18);
  }

  .bammi-region:focus,
  .bammi-region:focus-visible {
    outline: none;
  }

  .bammi-border {
    stroke: #494e47;
    stroke-width: 0.028;
    fill: none;
    pointer-events: none;
    stroke-linecap: square;
  }

  .bammi-caption {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 0.19px;
    text-anchor: middle;
    fill: #d5d7cf;
    paint-order: stroke;
    stroke: #131512;
    stroke-width: 0.032;
  }

  .bammi-dialog {
    margin: auto;
    width: min(420px, calc(100% - 32px));
    padding: 22px;
    background: var(--color-surface);
    color: var(--color-ink);
    border: 1px solid rgba(213, 215, 207, 0.16);
    border-radius: 6px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.72);
  }

  .bammi-dialog::backdrop {
    background: rgba(11, 12, 10, 0.74);
    backdrop-filter: blur(3px);
  }
</style>
