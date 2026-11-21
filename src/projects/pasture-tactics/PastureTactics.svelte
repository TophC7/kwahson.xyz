<script lang="ts">
  import { untrack } from 'svelte';
  import {
    Alert02Icon, Award01Icon, Cancel01Icon, DiceIcon, GridViewIcon, HelpCircleIcon, RepeatIcon, Share08Icon,
    Tick01Icon, Undo02Icon, VolumeHighIcon, VolumeOffIcon, ZoomInAreaIcon,
  } from '@hugeicons/core-free-icons';
  import Icon from '../../components/Icon.svelte';
  import AssetGallery from '../../components/AssetGallery.svelte';
  import { CROP_COUNT, DIFFICULTIES, ENEMIES, ENEMY_KINDS, HEROES, HOLD_TURNS, ITEMS, POWER_PER_TURN, type Difficulty } from './data';
  import { buildTacticsModel, GALLERY_GROUPS, GALLERY_ITEMS, GALLERY_TAGS } from './models';
  import { mountPastureTactics, type TacticsController, type TacticsHudState } from './scene';

  const difficulties = Object.keys(DIFFICULTIES) as Difficulty[];
  const card = 'rounded-md border border-[rgba(213,215,207,0.12)] bg-surface/88 backdrop-blur-md';
  const buttonBase = 'pt-btn inline-flex cursor-pointer items-center justify-center rounded-sm border border-[rgba(213,215,207,0.12)] bg-surface-raised font-mono text-ink transition-colors hover:border-sage/45 disabled:cursor-default disabled:opacity-45';
  const btn = `${buttonBase} min-h-11 min-w-11 gap-1.5 px-2 text-[11px]`;
  const chip = `${buttonBase} min-h-10 min-w-0 gap-0.5 px-0.5`;
  const primary = `${btn} border-sage/55 bg-sage/25 hover:bg-sage/35`;
  const slot = 'flex h-[52px] w-full min-w-0 flex-col justify-center rounded-sm border border-ink/10 bg-surface-raised px-1.5 text-left font-mono text-[11px] leading-tight';
  const pill = 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-[rgba(213,215,207,0.1)] bg-surface/82 px-3 py-1 font-mono text-[10.5px] text-ink-muted backdrop-blur-md';
  const sheet = 'm-auto max-h-[90dvh] w-[min(92vw,26rem)] overflow-y-auto rounded-md border border-[rgba(213,215,207,0.14)] bg-surface p-5 text-ink shadow-[0_24px_70px_rgba(0,0,0,0.72)] backdrop:bg-canvas/65 backdrop:backdrop-blur-xs';

  let viewportEl = $state<HTMLDivElement>();
  let topEl: HTMLDivElement;
  let panelEl: HTMLElement;
  let hintEl: HTMLElement;
  let controller: TacticsController | null = null;
  let errorMessage = $state('');
  let hud = $state<TacticsHudState>({
    seed: 0, difficulty: 'medium', objective: 'rout', turn: 1, power: POWER_PER_TURN,
    phase: 'player', busy: false, fastForward: false, canUndo: false, muted: false, zoomed: false,
    status: '', heroes: [], items: [], selected: null, mode: 'idle', pendingItem: null, preview: null,
    idleHeroes: 0, incoming: 0, enemiesLeft: 0, crops: CROP_COUNT, danger: false, stars: 0,
  });
  let portraits = $state.raw<Record<string, string>>({});
  let showGuide = $state(false);
  let showShare = $state(false);
  let showGallery = $state(new URLSearchParams(location.search).has('gallery'));
  let armed = $state('');
  let seedInput = $state<number>();
  let copied = $state(false);
  let armTimer = 0;
  let copyTimer = 0;
  const locked = $derived(hud.busy || hud.phase !== 'player');
  const result = $derived(!hud.busy && (hud.phase === 'won' || hud.phase === 'lost'));
  const nextDifficulty = $derived<Difficulty | undefined>(difficulties[difficulties.indexOf(hud.difficulty) + 1]);
  const docked = window.matchMedia('(min-width: 64rem)');
  const selectedHero = $derived(hud.heroes.find((hero) => hero.id === hud.selected?.id));
  const spending = $derived(hud.pendingItem ? ITEMS[hud.pendingItem].power : 0);
  const guideLine = $derived(hud.phase === 'enemy' ? 'Visitors are acting…' : 'Tap a herd animal to give orders');

  function setGalleryOpen(open: boolean) {
    showGallery = open;
    const url = new URL(location.href);
    if (open) url.searchParams.set('gallery', '1');
    else url.searchParams.delete('gallery');
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function confirmAction(key: string, needsConfirmation: boolean) {
    clearTimeout(armTimer);
    if (needsConfirmation && armed !== key) {
      armed = key;
      armTimer = window.setTimeout(() => (armed = ''), 3000);
      return false;
    }
    armed = '';
    return true;
  }

  function replaceFight(key: string, difficulty = hud.difficulty, seed?: number) {
    if (!confirmAction(key, !result && (hud.turn > 1 || hud.canUndo))) return;
    showGuide = showShare = false;
    seedInput = undefined;
    copied = false;
    if (key === 'retry') controller?.retry();
    else controller?.newFight(difficulty, seed);
  }

  // Native share sheet where available (phones), else copy. If both fail, the link field in the share sheet is selected to copy by hand.
  async function shareLink(event: MouseEvent) {
    const url = location.href, field = (event.currentTarget as HTMLElement).closest('dialog')?.querySelector<HTMLInputElement>('input[readonly]');
    if (navigator.share) {
      try { await navigator.share({ title: 'Pasture Tactics', text: `Fight #${hud.seed} · ${DIFFICULTIES[hud.difficulty].label}`, url }); return; }
      catch (err) { if ((err as DOMException).name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => (copied = false), 2000);
    } catch {
      field?.focus(); field?.select();
    }
  }

  function endTurn() {
    if (!locked && confirmAction('end', hud.idleHeroes > 0)) controller?.endTurn();
  }

  function openDialog(node: HTMLDialogElement) { node.showModal(); }

  $effect(() => {
    const viewport = viewportEl;
    if (!viewport) return;
    errorMessage = '';
    try {
      const instance = untrack(() => mountPastureTactics({
        viewport,
        onState: (patch) => {
          if ((patch.busy && !hud.busy) || (patch.seed !== undefined && patch.seed !== hud.seed)) {
            armed = '';
            copied = false;
          }
          Object.assign(hud, patch);
        },
        // Wide screens dock the orders panel beside the board instead of under it.
        insets: () => {
          const top = (topEl?.offsetHeight ?? 0) + 8, panel = panelEl ?? { offsetWidth: 0, offsetHeight: 0 };
          return docked.matches ? { top, bottom: (hintEl?.offsetHeight ?? 0) + 24, left: 0, right: panel.offsetWidth + 8 } : { top, bottom: panel.offsetHeight + 8, left: 0, right: 0 };
        },
        onEndTurnKey: endTurn,
      }));
      controller = instance;
      portraits = instance.portraits;
      const observer = new ResizeObserver(() => instance.refit());
      observer.observe(panelEl);
      observer.observe(topEl);
      observer.observe(hintEl);
      return () => {
        observer.disconnect();
        clearTimeout(armTimer);
        clearTimeout(copyTimer);
        instance.destroy();
        controller = null;
      };
    } catch (err) {
      console.error(err);
      errorMessage = 'Your browser could not start the 3D tactics board. Please enable WebGL or try a newer browser.';
    }
  });
</script>

{#snippet portrait(id: string, size: number)}
  {#if portraits[id]}<img src={portraits[id]} alt="" width={size} height={size} class="shrink-0 rounded-sm" />{/if}
{/snippet}

{#snippet pips(value: number, total: number, label: string, color = 'bg-sage-soft')}
  <span class="inline-flex shrink-0 gap-0.5" role="img" aria-label={`${value} of ${total} ${label}`}>
    <!-- Pips past the total are Mend's bonus HP. -->
    {#each {length: Math.max(value, total)} as _, i}<span class="h-1.5 w-1.5 rounded-[2px] {i >= total ? 'bg-[#f2d77e]' : i < value ? color : 'bg-ink/20'}"></span>{/each}
  </span>
{/snippet}

{#snippet guideRow(model: string, name: string, detail: string)}
  <li class="flex items-center gap-2.5 border-b border-ink/8 py-2">
    {@render portrait(model, 36)}
    <div><strong class="text-ink">{name}</strong><p class="text-ink-muted">{detail}</p></div>
  </li>
{/snippet}

{#snippet difficultySelector()}
  <div role="group" aria-label="Difficulty" class="{card} pointer-events-auto inline-flex items-center gap-0.5 p-0.5">
    {#each difficulties as difficulty}
      <button class="pt-btn min-h-10 cursor-pointer rounded-sm px-2 font-mono text-[11px] text-ink-muted uppercase hover:bg-surface-raised" aria-pressed={hud.difficulty === difficulty} title={DIFFICULTIES[difficulty].tagline}
        onclick={() => { if (difficulty !== hud.difficulty) replaceFight(difficulty, difficulty); }}>
        {armed === difficulty ? `New ${DIFFICULTIES[difficulty].label} fight?` : DIFFICULTIES[difficulty].label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet fightButtons()}
  <button class={btn} title="Restart this exact fight: same seed, map and squad" onclick={() => replaceFight('retry')}><Icon icon={RepeatIcon} size={14} />{armed === 'retry' ? 'Retry?' : 'Retry'}</button>
  <button class={btn} title="Start a fresh fight with a new random seed" onclick={() => replaceFight('new')}><Icon icon={DiceIcon} size={14} /><span>New<span class="hidden sm:inline">&nbsp;fight</span>{armed === 'new' ? '?' : ''}</span></button>
{/snippet}

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none lg:grid lg:grid-rows-[auto_minmax(0,1fr)]" aria-label="Pasture Tactics">
  <div class="bg-field-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_82%_76%_at_50%_50%,#000_25%,transparent_100%)]" aria-hidden="true"></div>
  <div class="pointer-events-none absolute inset-0" style="background:radial-gradient(circle at 50% 48%, rgba(122,141,118,.11), transparent 64%)" aria-hidden="true"></div>
  <div bind:this={viewportEl} class="pt-viewport absolute inset-0 z-0 touch-none" aria-label="3D tactics board"></div>

  <div bind:this={topEl} class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1.5 p-2 sm:p-4 lg:relative">
    <div class="flex flex-wrap items-start justify-between gap-1 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <section aria-label="Fight status" class="{card} justify-self-start px-2 py-1.5 font-mono sm:px-3.5">
        <div class="flex divide-x divide-ink/10 text-base leading-tight font-semibold sm:text-xl">
          <div class="pr-2"><small class="stat-label">Turn</small>{hud.turn}{hud.objective === 'hold' ? `/${HOLD_TURNS}` : ''}</div>
          <div class="px-2"><small class="stat-label">Visitors</small>{hud.enemiesLeft}{#if hud.incoming}<span class="text-xs text-ochre"> +{hud.incoming}</span>{/if}</div>
          <div class="pl-2 {hud.crops < CROP_COUNT ? 'text-ochre' : ''}"><small class="stat-label">Crops</small>{hud.crops}/{CROP_COUNT}</div>
        </div>
        <p class="mt-0.5 text-[10px] text-ink-muted">{hud.objective === 'hold' ? 'Hold the barn' : 'Clear the pasture'}</p>
      </section>
      <div class="pointer-events-auto hidden items-center gap-1 lg:flex">{@render difficultySelector()}{@render fightButtons()}</div>
      <div class="pointer-events-auto ml-auto flex flex-wrap justify-end gap-1">
        <button class={btn} aria-label="Share" title="Share this fight or play another seed" aria-expanded={showShare} onclick={() => (showShare = true)}><Icon icon={Share08Icon} size={16} /><span class="hidden sm:inline">Share</span></button>
        <button class={btn} aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'} title="Toggle sound (M)" aria-pressed={hud.muted} onclick={() => controller?.toggleMute()}><Icon icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} size={16} /><span class="hidden sm:inline">Sound</span></button>
        <button class={btn} aria-label="Guide" title="How to play" aria-expanded={showGuide} onclick={() => (showGuide = true)}><Icon icon={HelpCircleIcon} size={16} /><span class="hidden sm:inline">Guide</span></button>
        <button class={btn} aria-label="Assets" title="Inspect assets" aria-expanded={showGallery} onclick={() => setGalleryOpen(true)}><Icon icon={GridViewIcon} size={16} /><span class="hidden sm:inline">Assets</span></button>
        {#if hud.zoomed}<button class={btn} aria-label="Fit" title="Reset board zoom" onclick={() => controller?.resetView()}><Icon icon={ZoomInAreaIcon} size={16} /><span class="hidden sm:inline">Fit</span></button>{/if}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-1.5 lg:hidden">
      {@render difficultySelector()}
      <div class="pointer-events-auto flex gap-1">{@render fightButtons()}</div>
    </div>
    <div class="absolute inset-x-2 top-full flex items-center justify-center gap-1.5 lg:static">
      {#if hud.status}<div class={pill} role="status"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-sage"></span>{hud.preview?.join(' · ') ?? hud.status}</div>{/if}
      {#if hud.fastForward}<span class={pill}>▶▶ 3×</span>{/if}
    </div>
  </div>

  <footer bind:this={panelEl} class="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2 sm:px-4 lg:relative lg:w-[27rem] lg:max-h-full lg:self-start lg:justify-self-end lg:overflow-y-auto" style="padding-bottom:max(10px, env(safe-area-inset-bottom))">
    <div class="{card} pointer-events-auto mx-auto w-full max-w-xl">
    <fieldset disabled={locked} aria-label="Herd orders" class="grid min-w-0 gap-1 p-1 lg:gap-1.5 lg:p-1.5">
      <!-- Six controls in every squad: shared items follow the heroes in reading order. -->
      <div class="grid grid-cols-3 gap-1">
        {#each hud.heroes as hero (hero.id)}
          <button class="{chip} text-[11px] {hero.alive && !hero.canMove && !hero.canAct ? 'opacity-45' : ''}" aria-pressed={hud.selected?.id === hero.id} disabled={!hero.alive} onclick={() => controller?.select(hero.id)}>
            {@render portrait(HEROES[hero.kind].model, 28)}
            <span class="flex min-w-0 flex-col gap-0.5 text-left"><span class:line-through={!hero.alive}>{HEROES[hero.kind].name}</span><span class="flex items-center gap-0.5">
              {@render pips(hero.hp, HEROES[hero.kind].hp, 'HP')}
              {#if hero.shield}<span class="h-1.5 w-1.5 rounded-full bg-sky-100" role="img" aria-label="Shielded"></span>{/if}
            </span></span>
          </button>
        {/each}
        {#each hud.items as item (item.kind)}
          {@const info = ITEMS[item.kind]}
          <button class="{chip} text-[10px]" title={info.name} disabled={!item.usable} aria-pressed={hud.pendingItem === item.kind} onclick={() => controller?.chooseItem(item.kind)}>
            {@render portrait(info.model, 16)}<strong class="truncate">{info.name}</strong>
            <span class="flex shrink-0 flex-col items-center gap-0.5 text-ink-muted">×{item.charges}{@render pips(info.power, info.power, 'power cost', 'bg-ochre')}</span>
          </button>
        {/each}
      </div>
      <!-- Fixed-height rows keep the panel from resizing, which would refit the board under the player's finger. -->
      <div class="relative" aria-live="polite">
        <span class="pointer-events-none absolute top-1 right-2 flex items-center gap-1.5 font-mono text-ochre" role="img" aria-label={`${hud.power} of ${POWER_PER_TURN} power left`}>
          <span class="text-[9px] tracking-wider uppercase">Power</span>
          <span class="inline-flex gap-1">
            {#each {length: POWER_PER_TURN} as _, i}<span class="h-2.5 w-2.5 rounded-[3px] {i < hud.power - spending ? 'bg-ochre' : i < hud.power ? 'animate-pulse bg-ochre/45' : 'bg-ink/20'}"></span>{/each}
          </span>
        </span>
      {#if hud.pendingItem}
        {@const info = ITEMS[hud.pendingItem]}
        <div class={slot}><strong>{info.name}</strong><span class="line-clamp-2 text-ink-muted">{info.desc}</span></div>
      {:else if hud.selected?.isHero}
        <button class="{slot} pt-btn cursor-pointer disabled:cursor-default disabled:opacity-65" aria-pressed={hud.mode === 'skill'} disabled={!hud.selected.canSkill} onclick={() => controller?.chooseSkill()}>
          <span class="flex items-center gap-1.5"><strong>{hud.selected.abilityName}</strong><span class="text-[10px] text-sage-soft">Free</span></span>
          <span class="line-clamp-2 text-ink-muted">{hud.selected.abilityDesc}</span>
        </button>
      {:else if hud.selected}
        <div class="{slot} cursor-default">
          <span class="flex items-center gap-1.5"><strong>{hud.selected.name}</strong>
            {#if hud.selected.hp !== null && hud.selected.maxHp !== null}{@render pips(hud.selected.hp, hud.selected.maxHp, 'HP', hud.selected.team === 'sky' ? 'bg-[#d9614f]' : 'bg-sage-soft')}{/if}
            {#if hud.selected.move !== null}<span class="text-ink-muted">Move {hud.selected.move}</span>{/if}
          </span>
          <span class="line-clamp-2 text-ink-muted"><strong class="text-ink">{hud.selected.abilityName}:</strong> {hud.selected.abilityDesc}</span>
        </div>
      {:else}
        <div class="{slot} pr-20 text-ink-muted">{guideLine}</div>
      {/if}
      </div>
      {#if hud.preview !== null}
        <div class="grid grid-cols-2 gap-1.5">
          <button class={btn} onclick={() => controller?.cancel()}>Cancel</button><button class={primary} onclick={() => controller?.confirm()}>Confirm</button>
        </div>
      {:else}
        <div class="grid grid-cols-4 gap-1.5">
          <button class={btn} disabled={!hud.canUndo} onclick={() => controller?.undo()}><Icon icon={Undo02Icon} size={14} />Undo</button>
          <button class={btn} aria-pressed={hud.danger} aria-keyshortcuts="D" title="Stripe every tile a visitor could hit next turn (D)" onclick={() => controller?.toggleDanger()}><Icon icon={Alert02Icon} size={14} />Danger</button>
          <button class={btn} disabled={!selectedHero?.canAct} onclick={() => controller?.wait()}>Wait</button>
          <button class={primary} onclick={endTurn}>{armed === 'end' && hud.idleHeroes ? `End? ${hud.idleHeroes} idle` : 'End turn'}</button>
        </div>
      {/if}
    </fieldset>
    </div>
  </footer>

  <p bind:this={hintEl} class="pointer-events-none absolute bottom-4 left-4 hidden rounded-md border border-ink/10 bg-surface/75 px-3 py-2 font-mono text-[10.5px] text-ink-dim backdrop-blur-md lg:block">Tap a herd animal · Scroll to zoom · Hold an edge to fast-forward</p>

  {#if showGuide}
    <dialog use:openDialog class={sheet} aria-labelledby="pt-guide" oncancel={() => (showGuide = false)}>
      <div class="flex items-start justify-between gap-2"><div><p class="font-mono text-[10px] tracking-widest text-sage uppercase">Pasture rules</p><h2 id="pt-guide" class="text-xl font-semibold">How to play</h2></div>
        <button class={btn} aria-label="Close guide" onclick={() => (showGuide = false)}><Icon icon={Cancel01Icon} size={15} /></button></div>
      <ul class="my-4 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-muted">
        <li>Each animal can move, then act once per turn.</li>
        <li>Visitors move and attack on their turn. Tap one to see how far it reaches, or turn on Danger to see every tile they could hit.</li>
        <li>Signature moves are free. Items cost power ({POWER_PER_TURN} per turn; unspent power is lost) and have limited uses.</li>
        <li>Hold the barn for {HOLD_TURNS} turns, or clear every visitor; the top bar says which. Crops are your score: save them for more stars.</li>
        <li>Undo is free until you end the turn. Your fight is saved in the link.</li>
      </ul>
      <div class="space-y-3 text-xs">
        <section><h3 class="font-mono text-sage-soft uppercase">Your herd</h3><ul>{#each hud.heroes as {kind}}{@const h = HEROES[kind]}{@render guideRow(h.model, `${h.name} · ${h.skill.name}`, h.skill.desc)}{/each}</ul></section>
        <section><h3 class="font-mono text-ochre uppercase">Shared items</h3><ul>{#each hud.items as {kind, charges}}{@const i = ITEMS[kind]}{@render guideRow(i.model, i.name, `${i.desc} ${i.power} power · ${charges}/${i.charges} charges.`)}{/each}</ul></section>
        <section><h3 class="font-mono text-sage-soft uppercase">Visitors</h3><ul>{#each ENEMY_KINDS as kind}{@const e = ENEMIES[kind]}{@render guideRow(e.model, `${e.name} · ${e.attack.name}`, e.attack.desc)}{/each}</ul></section>
      </div>
      <button class="{primary} mt-3 w-full" onclick={() => (showGuide = false)}>Back to board</button>
    </dialog>
  {:else if showShare}
    <dialog use:openDialog class="{sheet} max-w-[380px]" aria-labelledby="pt-share" oncancel={() => (showShare = false)}>
      <div class="mb-3 flex items-start justify-between gap-2"><div><p class="font-mono text-[10px] tracking-widest text-sage uppercase">Share</p>
        <h2 id="pt-share" class="text-xl font-semibold">Fight #{hud.seed}</h2><p class="font-mono text-xs text-ink-muted">{DIFFICULTIES[hud.difficulty].label} · turn {hud.turn}</p></div>
        <button class={btn} aria-label="Close" onclick={() => (showShare = false)}><Icon icon={Cancel01Icon} size={15} /></button></div>
      <div class="grid gap-2">
        <p class="text-xs text-ink-muted">The link opens this exact fight, mid-turn and all.</p>
        <div class="flex gap-2">
          <input readonly value={location.href} aria-label="Fight link" onfocus={(e) => e.currentTarget.select()} class="h-11 min-w-0 flex-1 rounded-sm border border-ink/15 bg-canvas px-2 font-mono text-xs text-ink-muted select-text" />
          <button class={primary} onclick={shareLink}><Icon icon={copied ? Tick01Icon : Share08Icon} size={14} />{copied ? 'Copied' : 'Share link'}</button>
        </div>
        <form class="flex items-end gap-2" onsubmit={(e) => { e.preventDefault(); if (seedInput !== undefined) replaceFight(`seed:${seedInput}`, hud.difficulty, seedInput); }}>
          <label class="min-w-0 flex-1 font-mono text-xs text-ink-muted">Play a seed<input type="number" min="1" max="4294967295" step="1" required bind:value={seedInput} placeholder={String(hud.seed)} class="block h-11 w-full rounded-sm border border-ink/15 bg-canvas px-2 text-ink" /></label>
          <button type="submit" class={btn}>{armed === `seed:${seedInput}` ? 'Play?' : 'Play'}</button>
        </form>
      </div>
    </dialog>
  {:else if result && !showGallery}
    <dialog use:openDialog class="{sheet} max-w-[350px] border-sage/35 text-center" aria-labelledby="pt-result" oncancel={(e) => e.preventDefault()}>
      <div class="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-sage/40 bg-sage/18 text-sage-soft"><Icon icon={hud.phase === 'won' ? Award01Icon : Cancel01Icon} size={20} /></div>
      <p class="font-mono text-[10px] tracking-widest text-sage uppercase">Fight complete</p>
      <h2 id="pt-result" class="mt-1 text-2xl font-semibold">{hud.status}</h2>
      {#if hud.phase === 'won'}
        <div class="mt-2 text-xl tracking-widest text-ochre" role="img" aria-label={`${hud.stars} of 3 stars`}>{'★'.repeat(hud.stars)}{'☆'.repeat(3 - hud.stars)}</div>
      {/if}
      <p class="mt-3 font-mono text-xs text-ink-muted">Turn {hud.turn} · {hud.heroes.filter((h) => h.alive).length}/{hud.heroes.length} heroes standing</p>
      <p class="mb-3 font-mono text-xs text-ink-muted">Crops saved {hud.crops}/{CROP_COUNT}</p>
      <div class="grid gap-2">
        <button class={primary} onclick={() => controller?.retry()}>Retry this fight</button>
        <button class={btn} onclick={() => controller?.newFight(hud.difficulty)}>New fight</button>
        {#if hud.phase === 'won' && nextDifficulty}{@const next = nextDifficulty}<button class={btn} onclick={() => controller?.newFight(next)}>Try {DIFFICULTIES[next].label}</button>{/if}
      </div>
    </dialog>
  {/if}
  {#if showGallery}<AssetGallery title="Pasture Tactics Assets" storageKey="pasture-tactics-asset-review-v1" items={GALLERY_ITEMS} groups={GALLERY_GROUPS} tags={GALLERY_TAGS} build={buildTacticsModel} onClose={() => setGalleryOpen(false)} />{/if}
  {#if errorMessage}<div role="alert" class="absolute top-1/2 left-1/2 z-40 max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#b86b58]/40 bg-surface px-5 py-4 text-center text-sm text-[#d49685]">{errorMessage}</div>{/if}
</div>

<style>
  .pt-viewport :global(canvas) {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
  }
  .stat-label { display: block; font-size: 8.5px; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; color: var(--color-ink-dim); }
  :global(.pt-btn:focus-visible) { outline: 2px solid var(--color-sage); outline-offset: 2px; }
  :global(.pt-btn[aria-pressed='true']) { border-color: var(--color-sage); background-color: color-mix(in srgb, var(--color-sage) 24%, var(--color-surface)); }
</style>
