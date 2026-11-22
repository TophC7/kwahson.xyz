<script module lang="ts">
  const PIE_DY = 0.045;
  const RULES = [
    ['Claim', 'Tap an empty region or your own pie to add a slice.'],
    ['Burst', 'Pies hold 1 slice per neighbor. One extra explodes and captures them.'],
    ['Win', 'Chains resolve automatically. Take every region to win.'],
  ] as const;

  function slicePath(index: number, cap: number): string {
    const radius = 0.3;
    const a = -Math.PI / 2 + (index * 2 * Math.PI) / cap;
    const b = a + (2 * Math.PI) / cap;
    return `M0 0 L${radius * Math.cos(a)} ${radius * Math.sin(a)} A${radius} ${radius} 0 0 1 ${radius * Math.cos(b)} ${radius * Math.sin(b)} Z`;
  }

  const SLICE_PATHS: Record<number, readonly string[]> = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => {
      const cap = i + 2;
      return [cap, Array.from({ length: cap }, (_, s) => slicePath(s, cap))];
    }),
  );
</script>

<script lang="ts">
  import { RefreshIcon } from '@hugeicons/core-free-icons';
  import FieldBackground from '../../components/FieldBackground.svelte';
  import Button from '../../components/ui/Button.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import SegmentedControl, { type SegmentedOption } from '../../components/ui/SegmentedControl.svelte';
  import { readStorage, writeStorage } from '../../lib/gameSave';
  import {
    BOARD_SIZES,
    canPlay,
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

  const LAYOUT_OPTIONS: SegmentedOption<LayoutKey>[] = (
    Object.entries(BOARD_SIZES) as [LayoutKey, (typeof BOARD_SIZES)[LayoutKey]][]
  ).map(([value, spec]) => ({
    value,
    label: spec.label,
    suffix: spec.count,
  }));

  const MODE_OPTIONS: SegmentedOption<GameMode>[] = [
    { value: 'friend', label: '2P' },
    { value: 'computer', label: 'CPU' },
  ];

  const SPEED_OPTIONS: SegmentedOption<SpeedMs>[] = [
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
  let restartBtnEl = $state<HTMLButtonElement | HTMLAnchorElement>();

  let gameLayout = $state<LayoutKey>('medium');
  let gameMode = $state<GameMode>('friend');
  let speed = $state<SpeedMs>(280);
  let reducedMotion = $state(false);

  let board = $state<Board | null>(null);
  const regions = $derived(board?.regions ?? []);
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

  let pendingGame = $state<{ layout: LayoutKey; mode: GameMode } | null>(null);
  let generation = 0;
  let computerTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelBurst: (() => void) | null = null;

  const effectiveSpeed = $derived<SpeedMs>(reducedMotion ? 0 : speed);
  const computerTurn = $derived(gameMode === 'computer' && turn === 1);
  const speedControlOptions = $derived<SegmentedOption<SpeedMs>[]>(
    SPEED_OPTIONS.map((opt) => ({
      ...opt,
      disabled: reducedMotion && opt.value !== 0,
      title: reducedMotion && opt.value !== 0 ? 'Disabled while reduced motion is enabled' : undefined,
    })),
  );

  const legalIds = $derived.by(() => {
    if (busy || winner !== null || computerTurn) return new Set<number>();
    return new Set(regions.filter((r) => canPlay(r, turn)).map((r) => r.id));
  });

  const playerCounts = $derived([0, 1].map((p) => regions.filter((r) => r.owner === p).length));

  const statusText = $derived(
    winner === null
      ? `${PLAYERS[turn].name}${busy ? ' · resolving...' : computerTurn ? ' · thinking...' : "'s turn"}`
      : `${PLAYERS[winner].name} wins!`,
  );

  const focusedRegion = $derived(
    keyboardMode && focusedRegionId !== null && legalIds.has(focusedRegionId) ? regions[focusedRegionId] : null,
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

  const SAVE_KEY = 'bammi-save-v1';

  function saveGame() {
    if (!board?.regions.length) return;
    writeStorage(
      SAVE_KEY,
      JSON.stringify({
        v: 1,
        layout: gameLayout,
        mode: gameMode,
        turn,
        moves,
        winner,
        board: $state.snapshot(board),
      }),
    );
  }

  function loadSavedGame(): boolean {
    const raw = readStorage(SAVE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        parsed.v !== 1 ||
        !(parsed.layout in BOARD_SIZES) ||
        (parsed.mode !== 'friend' && parsed.mode !== 'computer') ||
        (parsed.turn !== 0 && parsed.turn !== 1) ||
        typeof parsed.moves !== 'number' ||
        (parsed.winner !== null && parsed.winner !== 0 && parsed.winner !== 1) ||
        !parsed.board ||
        !Array.isArray(parsed.board.regions) ||
        !parsed.board.regions.length
      ) {
        return false;
      }
      board = parsed.board;
      gameLayout = parsed.layout;
      gameMode = parsed.mode;
      turn = parsed.turn;
      moves = parsed.moves;
      winner = parsed.winner;
      busy = false;
      focusedRegionId = null;
      const firstLegal = board?.regions.find((reg) => reg.owner === null || reg.owner === turn);
      activeRegion = firstLegal?.id ?? 0;
      message =
        winner !== null
          ? `Every region is ${PLAYERS[winner].flavor}. Won in ${moves} moves!`
          : 'Match resumed.';
      scheduleComputer();
      return true;
    } catch {
      return false;
    }
  }

  function newGame(layoutKey: LayoutKey, modeValue: GameMode) {
    try {
      board = createBoard(BOARD_SIZES[layoutKey]);
    } catch (err) {
      message = err instanceof Error ? err.message : 'Could not generate a valid board.';
      return;
    }

    generation++;
    clearPendingTimers();
    turn = 0;
    winner = null;
    busy = false;
    moves = 0;
    activeRegion = 0;
    focusedRegionId = null;
    gameLayout = layoutKey;
    gameMode = modeValue;
    message = 'Blue starts. Empty regions are up for grabs.';
    saveGame();
  }

  function animateExplosion(
    source: Region,
    player: Player,
    duration: number,
    token: number,
  ): Promise<void> {
    const x = source.x;
    const y = source.y - PIE_DY;
    let sparksPath = '';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sparksPath += `M${x + c * 0.35} ${y + s * 0.35} L${x + c * 0.44} ${y + s * 0.44} `;
    }
    const targets = source.neighbors.map((id) => ({
      dx: regions[id].x - x,
      dy: regions[id].y - PIE_DY - y,
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
    if (!computerTurn || winner !== null) return;
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
    if (!asComputer && !legalIds.has(id)) return;

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
        restartBtnEl?.focus({ preventScroll: true });
      } else if (nextLegal.length) {
        queueMicrotask(() => focusRegion(activeRegion));
      }
    }

    saveGame();
    scheduleComputer();
  }

  function requestNewGame(nextLayout: LayoutKey = gameLayout, nextMode: GameMode = gameMode) {
    if (!moves || winner !== null) {
      newGame(nextLayout, nextMode);
      return;
    }
    pendingGame = { layout: nextLayout, mode: nextMode };
  }

  function cancelPendingGame() {
    pendingGame = null;
  }

  function confirmPendingGame() {
    const pending = pendingGame;
    pendingGame = null;
    if (pending) newGame(pending.layout, pending.mode);
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

    if (!loadSavedGame()) newGame('medium', 'friend');

    return () => {
      generation++;
      clearPendingTimers();
      abort.abort();
    };
  });
</script>

<div class="relative min-h-full bg-canvas text-ink lg:h-full lg:overflow-hidden">
  <FieldBackground />

  <div
    class="relative mx-auto flex min-h-full max-w-[1160px] flex-col gap-3 px-3 py-3 sm:px-5 sm:py-4 lg:h-full lg:flex-row lg:items-center lg:gap-5 lg:py-5"
    style="padding-bottom: max(16px, env(safe-area-inset-bottom));"
  >
    <!-- Primary Board Stage: container-query square auto-fits both width and height cleanly in Firefox & Chromium -->
    <div class="bammi-stage-wrap order-2 flex min-h-0 min-w-0 flex-1 items-center justify-center lg:order-1 lg:h-full lg:self-stretch">
      <div
        class="bammi-stage relative overflow-hidden rounded-md border border-ink/16 bg-[#151714] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.9)]"
      >
        {#if board}
          <svg
            bind:this={boardEl}
            class="bammi-board"
            viewBox="0 0 {board.w} {board.w}"
            role="group"
            aria-label="Bammi board"
            aria-describedby="bammi-rules-summary"
            aria-busy={busy}
          >
            <!-- Regions -->
            {#each regions as r (r.id)}
              {@const legal = legalIds.has(r.id)}
              <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
              <path
                d={r.path}
                fill={r.owner === null ? '#161815' : PLAYERS[r.owner].tint}
                class="bammi-region"
                class:legal
                role="button"
                tabindex={legal && r.id === activeRegion ? 0 : -1}
                data-region={r.id}
                aria-disabled={!legal}
                aria-label="Region {r.id + 1}, {r.owner === null
                  ? 'unclaimed'
                  : `${PLAYERS[r.owner].flavor}, ${PLAYERS[r.owner].short}`}, {r.count} of {r.cap} slices{r.count === r.cap
                  ? ', full: one more slice explodes'
                  : ''}"
                onclick={() => play(r.id)}
                onkeydown={(e) => handleRegionKey(e, r)}
                onfocus={() => {
                  if (legal) {
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
            <path d={board.borderPath} class="bammi-border" aria-hidden="true" />

            <!-- Pies -->
            {#each regions as r (r.id)}
              <g transform="translate({r.x} {r.y - PIE_DY})" aria-hidden="true" pointer-events="none">
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
                {#each ([['#111210', 5], ['#d5d7cf', 2]] as const) as [stroke, width]}
                  <rect
                    x={focusedRegion.x - 0.46}
                    y={focusedRegion.y - 0.46}
                    width="0.92"
                    height="0.92"
                    rx="0.06"
                    fill="none"
                    {stroke}
                    stroke-width={width}
                    vector-effect="non-scaling-stroke"
                  />
                {/each}
              </g>
            {/if}
          </svg>
        {/if}
      </div>
    </div>

    <!-- Side Rail on desktop / Split header + bottom deck on mobile via contents -->
    <aside
      class="contents lg:order-2 lg:flex lg:max-h-full lg:w-[320px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:rounded-md lg:border lg:border-ink/10 lg:bg-surface"
    >
      <!-- Unified Status Header (above board on mobile; top of rail on desktop) -->
      <div
        class="order-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-md border border-ink/10 bg-surface px-3 py-2 lg:order-none lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
      >
        <div class="hidden lg:col-start-1 lg:row-start-1 lg:block lg:border-b lg:border-ink/8 lg:py-3.5 lg:pl-4">
          <h1 class="m-0 text-xl font-semibold tracking-[-0.025em] text-ink">
            Bammi<span class="text-ochre">.</span>
          </h1>
          <p class="mt-0.5 m-0 text-[11.5px] text-ink-dim">Exploding pies</p>
        </div>

        <div class="col-start-3 row-start-1 lg:col-start-2 lg:row-start-1 lg:flex lg:items-center lg:border-b lg:border-ink/8 lg:py-3.5 lg:pr-4">
          <Button
            bind:ref={restartBtnEl}
            variant="primary"
            size="sm"
            icon={RefreshIcon}
            iconSize={13}
            title="Start over with a newly randomized board"
            aria-label="New game"
            onclick={() => requestNewGame()}
          >
            <span class="hidden lg:inline">New game</span>
          </Button>
        </div>

        <div class="col-start-1 row-start-1 min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:px-4 lg:pt-3.5">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            class="text-sm font-semibold tracking-tight lg:text-base"
            style="color: {PLAYERS[winner ?? turn].bright};"
          >
            {statusText}
          </div>
          <p class="m-0 max-lg:truncate text-[11px] text-ink-muted lg:mt-1 lg:mb-3 lg:min-h-[2.4em] lg:text-xs lg:leading-relaxed">
            {message}
          </p>
        </div>

        <div
          class="col-start-2 row-start-1 flex shrink-0 items-center gap-1.5 font-mono text-[11px] lg:col-span-2 lg:col-start-1 lg:row-start-3 lg:grid lg:grid-cols-2 lg:gap-2 lg:border-b lg:border-ink/8 lg:px-4 lg:pb-3.5 lg:text-xs"
          aria-label="Regions owned by each player"
        >
          {#each PLAYERS as p, i}
            <div
              aria-label="{p.flavor[0].toUpperCase()}{p.flavor.slice(1)} owns {playerCounts[i]} of {regions.length} regions"
              class="flex items-baseline justify-between rounded-sm border px-1.5 py-0.5 transition-all lg:px-2.5 lg:py-2 {winner === null && turn === i
                ? p.activeBadge
                : p.idleBadge}"
            >
              <span class="lg:hidden">{p.short}&nbsp;</span>
              <span class="hidden lg:inline">{p.name}</span>
              <span><strong>{playerCounts[i]}</strong><span class="hidden lg:inline">/{regions.length}</span></span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Compact Controls + Rules Deck -->
      <div
        class="order-3 overflow-hidden rounded-md border border-ink/10 bg-surface lg:order-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent"
      >
        <div class="grid gap-2.5 border-b border-ink/8 bg-canvas/35 px-3.5 py-3 sm:px-4">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">Size</span>
            <SegmentedControl
              variant="inset"
              ariaLabel="Board size"
              options={LAYOUT_OPTIONS}
              value={gameLayout}
              onChange={(v) => v !== gameLayout && requestNewGame(v)}
            />
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">Mode</span>
            <SegmentedControl
              variant="inset"
              ariaLabel="Opponent mode"
              options={MODE_OPTIONS}
              value={gameMode}
              onChange={(v) => v !== gameMode && requestNewGame(gameLayout, v)}
            />
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-[10px] tracking-wider text-ink-dim uppercase">Speed</span>
            <SegmentedControl
              variant="inset"
              ariaLabel="Animation speed"
              options={speedControlOptions}
              value={effectiveSpeed}
              onChange={(value) => (speed = value)}
            />
          </div>
        </div>

        <!-- Concise always-visible rules -->
        <footer id="bammi-rules-summary" class="px-3.5 py-3 sm:px-4">
          <div class="grid grid-cols-1 gap-2 text-[11.5px] leading-relaxed text-ink-muted sm:grid-cols-3 lg:grid-cols-1 lg:gap-2.5">
            {#each RULES as [title, text], i}
              <div>
                <span class="font-mono text-[10px] tracking-wider text-sage uppercase">0{i + 1} · {title}</span>
                <p class="mt-0.5 m-0">{text}</p>
              </div>
            {/each}
          </div>

          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/6 pt-2.5 font-mono text-[10px] text-ink-dim">
            <span>B = Blue · R = Red</span>
            <a
              href="https://www.bammi.com/about.asp"
              target="_blank"
              rel="noopener"
              class="focus-ring rounded-xs text-ink-muted underline underline-offset-3 hover:text-ink"
            >
              Original rules
            </a>
          </div>
        </footer>
      </div>
    </aside>
  </div>

  <ModalDialog
    open={pendingGame !== null}
    onClose={cancelPendingGame}
    title="Start a new game?"
    tone="sage"
    maxWidth="26.25rem"
  >
    <p class="m-0 leading-relaxed">
      Your current game will be lost and a freshly randomized board will be generated.
    </p>

    {#snippet actions()}
      <Button variant="surface" onclick={cancelPendingGame}>Keep playing</Button>
      <Button variant="primary" onclick={confirmPendingGame}>New game</Button>
    {/snippet}
  </ModalDialog>
</div>

<style>
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

  .bammi-region:focus {
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
</style>
