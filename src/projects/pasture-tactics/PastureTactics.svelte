<script lang="ts">
  import GameStage from '../../components/GameStage.svelte';
  import { untrack } from 'svelte';
  import {
    Alert02Icon, Award01Icon, Cancel01Icon, DiceIcon, GridViewIcon, HelpCircleIcon, RepeatIcon, Share08Icon,
    Undo02Icon, VolumeHighIcon, VolumeOffIcon, ZoomInAreaIcon,
  } from '@hugeicons/core-free-icons';
  import Icon from '../../components/Icon.svelte';
  import AssetGallery, { galleryLinked, linkGallery } from '../../components/AssetGallery.svelte';
  import Button from '../../components/ui/Button.svelte';
  import ModalDialog from '../../components/ui/ModalDialog.svelte';
  import SeedShareDialog from '../../components/ui/SeedShareDialog.svelte';
  import SegmentedControl, { type SegmentedOption } from '../../components/ui/SegmentedControl.svelte';
  import StatusPill from '../../components/ui/StatusPill.svelte';
  import { CROP_COUNT, DIFFICULTIES, DIFFICULTY_LEVELS, ENEMIES, ENEMY_KINDS, HEROES, HERO_KINDS, HOLD_TURNS, ITEMS, POWER_PER_TURN, type Difficulty } from './data';
  import { GALLERY_GROUPS, GALLERY_ITEMS, GALLERY_TAGS } from './models';
  import { mountPastureTactics, type TacticsController, type TacticsHudState } from './scene';

  type PendingFight = { kind: 'retry' } | { kind: 'new'; difficulty: Difficulty };

  const DIFFICULTY_OPTIONS: SegmentedOption<Difficulty>[] = DIFFICULTY_LEVELS.map((difficulty) => ({
    value: difficulty,
    label: DIFFICULTIES[difficulty].label,
    title: DIFFICULTIES[difficulty].tagline,
  }));

  const chip = 'focus-ring inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-0.5 rounded-sm border border-ink/12 bg-surface-raised px-0.5 font-mono text-ink transition-colors hover:border-sage/45 aria-pressed:border-sage aria-pressed:bg-sage/24 disabled:cursor-default disabled:opacity-45';
  const slot = 'flex h-[52px] w-full min-w-0 flex-col justify-center rounded-sm border border-ink/10 bg-surface-raised px-1.5 text-left font-mono text-[11px] leading-tight';
  const statLabel = 'block text-[8.5px] font-normal tracking-[0.12em] uppercase text-ink-dim';

  let viewportEl = $state<HTMLDivElement>();
  let topEl: HTMLDivElement;
  let panelEl: HTMLElement;
  let hintEl: HTMLElement;
  let controller: TacticsController | null = null;
  let failed = $state(false);
  let hud = $state<TacticsHudState>({
    seed: 0, difficulty: 'medium', objective: 'rout', turn: 1, power: POWER_PER_TURN,
    phase: 'player', busy: false, fastForward: false, canUndo: false, muted: false, zoomed: false,
    status: '', heroes: [], items: [], selected: null, mode: 'idle', pendingItem: null, preview: null,
    idleHeroes: 0, incoming: 0, enemiesLeft: 0, crops: CROP_COUNT, danger: false, stars: 0,
  });
  let portraits = $state.raw<Record<string, string>>({});
  let showGuide = $state(false);
  let showShare = $state(false);
  let showGallery = $state(galleryLinked());
  let pendingFight = $state<PendingFight | null>(null);
  let armedEnd = $state(false);
  let armTimer = 0;

  const locked = $derived(hud.busy || hud.phase !== 'player');
  const result = $derived(!hud.busy && (hud.phase === 'won' || hud.phase === 'lost'));
  const nextDifficulty = $derived<Difficulty | undefined>(DIFFICULTY_LEVELS[DIFFICULTY_LEVELS.indexOf(hud.difficulty) + 1]);
  const docked = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 64rem)') : null;
  const selectedHero = $derived(hud.heroes.find((hero) => hero.id === hud.selected?.id));
  const spending = $derived(hud.pendingItem ? ITEMS[hud.pendingItem].power : 0);
  const guideLine = $derived(hud.phase === 'enemy' ? 'Visitors are acting…' : 'Tap a herd animal to give orders');
  const statusTone = $derived(hud.phase === 'lost' ? 'danger' : hud.phase === 'enemy' ? 'ochre' : 'sage');

  function setGalleryOpen(open: boolean) {
    showGallery = open;
    linkGallery(open);
  }

  function runFight(next: PendingFight) {
    pendingFight = null;
    showGuide = showShare = false;
    if (next.kind === 'retry') controller?.retry();
    else controller?.newFight(next.difficulty);
  }

  function requestFight(next: PendingFight) {
    if (!result && (hud.turn > 1 || hud.canUndo)) {
      pendingFight = next;
      return;
    }
    runFight(next);
  }

  function endTurn() {
    if (locked) return;
    clearTimeout(armTimer);
    if (hud.idleHeroes > 0 && !armedEnd) {
      armedEnd = true;
      armTimer = window.setTimeout(() => (armedEnd = false), 3000);
      return;
    }
    armedEnd = false;
    controller?.endTurn();
  }

  $effect(() => {
    const viewport = viewportEl;
    if (!viewport) return;
    failed = false;
    try {
      const instance = untrack(() => mountPastureTactics({
        viewport,
        onState: (patch) => {
          if ((patch.busy && !hud.busy) || (patch.seed !== undefined && patch.seed !== hud.seed)) {
            armedEnd = false;
          }
          Object.assign(hud, patch);
        },
        chrome: [panelEl, topEl, hintEl],
        // Wide screens dock the orders panel beside the board instead of under it.
        insets: () => {
          const top = (topEl?.offsetHeight ?? 0) + 8, panel = panelEl ?? { offsetWidth: 0, offsetHeight: 0 };
          return docked?.matches ? { top, bottom: (hintEl?.offsetHeight ?? 0) + 24, left: 0, right: panel.offsetWidth + 8 } : { top, bottom: panel.offsetHeight + 8, left: 0, right: 0 };
        },
        onEndTurnKey: endTurn,
      }));
      controller = instance;
      portraits = instance.portraits;
      return () => {
        clearTimeout(armTimer);
        instance.destroy();
        controller = null;
      };
    } catch (err) {
      console.error(err);
      failed = true;
    }
  });
</script>

{#snippet portrait(id: string, size: number)}
  {#if portraits[id]}<img src={portraits[id]} alt="" width={size} height={size} class="shrink-0 rounded-sm" />{/if}
{/snippet}

{#snippet pips(value: number, total: number, label: string, color = 'bg-sage-soft')}
  <span class="inline-flex shrink-0 gap-0.5" role="img" aria-label={`${value} of ${total} ${label}`}>
    <!-- Pips past the total are Mend's bonus HP. -->
    {#each {length: Math.max(value, total)} as _, i}<span class="h-1.5 w-1.5 rounded-[2px] {i >= total ? 'bg-gold' : i < value ? color : 'bg-ink/20'}"></span>{/each}
  </span>
{/snippet}

{#snippet guideRow(model: string, name: string, detail: string)}
  <li class="flex items-center gap-2.5 border-b border-ink/8 py-2">
    {@render portrait(model, 36)}
    <div><strong class="text-ink">{name}</strong><p class="text-ink-muted">{detail}</p></div>
  </li>
{/snippet}

<div class="relative h-full w-full overflow-hidden bg-canvas text-ink select-none lg:grid lg:grid-rows-[auto_minmax(0,1fr)]" aria-label="Pasture Tactics">
  <GameStage bind:viewport={viewportEl} label="3D tactics board" what="the 3D tactics board" {failed} />

  <div bind:this={topEl} class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1.5 p-2 sm:p-4 lg:relative">
    <div class="flex flex-wrap items-start justify-between gap-1.5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <section aria-label="Fight status" class="hud-surface order-1 justify-self-start rounded-md px-2 py-1.5 font-mono sm:px-3.5">
        <div class="flex divide-x divide-ink/10 text-base leading-tight font-semibold sm:text-xl">
          <div class="pr-2"><small class={statLabel}>Turn</small>{hud.turn}{hud.objective === 'hold' ? `/${HOLD_TURNS}` : ''}</div>
          <div class="px-2"><small class={statLabel}>Visitors</small>{hud.enemiesLeft}{#if hud.incoming}<span class="text-xs text-ochre"> +{hud.incoming}</span>{/if}</div>
          <div class="pl-2 {hud.crops < CROP_COUNT ? 'text-ochre' : ''}"><small class={statLabel}>Crops</small>{hud.crops}/{CROP_COUNT}</div>
        </div>
        <p class="mt-0.5 text-[10px] text-ink-muted">{hud.objective === 'hold' ? 'Hold the barn' : 'Clear the pasture'}</p>
      </section>

      <div class="pointer-events-auto order-3 flex basis-full flex-wrap items-center gap-1.5 lg:order-2 lg:basis-auto">
        <SegmentedControl
          options={DIFFICULTY_OPTIONS}
          value={hud.difficulty}
          onChange={(difficulty) => {
            if (difficulty !== hud.difficulty) requestFight({ kind: 'new', difficulty });
          }}
          variant="floating"
          ariaLabel="Difficulty"
        />
        <Button
          variant="surface"
          size="md"
          icon={RepeatIcon}
          iconSize={14}
          title="Restart this exact fight: same seed, map and squad"
          onclick={() => requestFight({ kind: 'retry' })}
        >
          Retry
        </Button>
        <Button
          variant="surface"
          size="md"
          icon={DiceIcon}
          iconSize={14}
          title="Start a fresh fight with a new random seed"
          onclick={() => requestFight({ kind: 'new', difficulty: hud.difficulty })}
        >
          <span>New<span class="hidden sm:inline">&nbsp;fight</span></span>
        </Button>
      </div>

      <div class="pointer-events-auto order-2 ml-auto flex flex-wrap justify-end gap-1 lg:order-3">
        <Button variant="surface" size="md" icon={Share08Icon} iconSize={16} hideLabelOnMobile aria-label="Share" title="Share this fight or play another seed" aria-expanded={showShare} onclick={() => (showShare = true)}>Share</Button>
        <Button variant="surface" size="md" icon={hud.muted ? VolumeOffIcon : VolumeHighIcon} iconSize={16} hideLabelOnMobile active={hud.muted} aria-label={hud.muted ? 'Unmute sound' : 'Mute sound'} title="Toggle sound (M)" onclick={() => controller?.toggleMute()}>Sound</Button>
        <Button variant="surface" size="md" icon={HelpCircleIcon} iconSize={16} hideLabelOnMobile aria-label="Guide" title="How to play" aria-expanded={showGuide} onclick={() => (showGuide = true)}>Guide</Button>
        <Button variant="surface" size="md" icon={GridViewIcon} iconSize={16} hideLabelOnMobile aria-label="Assets" title="Inspect assets" aria-expanded={showGallery} onclick={() => setGalleryOpen(true)}>Assets</Button>
        {#if hud.zoomed}
          <Button variant="surface" size="md" icon={ZoomInAreaIcon} iconSize={16} hideLabelOnMobile aria-label="Fit" title="Reset board zoom" onclick={() => controller?.resetView()}>Fit</Button>
        {/if}
      </div>
    </div>

    <div class="absolute inset-x-2 top-full flex items-center justify-center gap-1.5 lg:static">
      {#if hud.status}
        <StatusPill tone={statusTone}>{hud.preview?.join(' · ') ?? hud.status}</StatusPill>
      {/if}
      {#if hud.fastForward}
        <StatusPill tone="ochre">▶▶ 3×</StatusPill>
      {/if}
    </div>
  </div>

  <footer bind:this={panelEl} class="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2 sm:px-4 lg:relative lg:w-[27rem] lg:max-h-full lg:self-start lg:justify-self-end lg:overflow-y-auto" style="padding-bottom:max(10px, env(safe-area-inset-bottom))">
    <div class="hud-surface pointer-events-auto mx-auto w-full max-w-xl rounded-md">
      <fieldset disabled={locked} aria-label="Herd orders" class="grid min-w-0 gap-1 p-1 lg:gap-1.5 lg:p-1.5">
        <!-- Six controls in every squad: shared items follow the heroes in reading order. -->
        <div class="grid grid-cols-3 gap-1">
          {#each hud.heroes as hero (hero.id)}
            <button class="{chip} text-[11px] {hero.alive && !hero.canMove && !hero.canAct ? 'opacity-45' : ''}" aria-pressed={hud.selected?.id === hero.id} disabled={!hero.alive} onclick={() => controller?.select(hero.id)}>
              {@render portrait(HEROES[hero.kind].model, 28)}
              <span class="flex min-w-0 flex-col gap-0.5 text-left"><span class:line-through={!hero.alive}>{HEROES[hero.kind].name}</span><span class="flex items-center gap-0.5">
                {@render pips(hero.hp, HEROES[hero.kind].hp, 'HP')}
                {#if hero.shield}<span class="h-1.5 w-1.5 rounded-full bg-mint" role="img" aria-label="Shielded"></span>{/if}
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
            <button class="{slot} focus-ring cursor-pointer transition-colors hover:border-sage/45 aria-pressed:border-sage aria-pressed:bg-sage/24 disabled:cursor-default disabled:opacity-65" aria-pressed={hud.mode === 'skill'} disabled={!hud.selected.canSkill} onclick={() => controller?.chooseSkill()}>
              <span class="flex items-center gap-1.5"><strong>{hud.selected.abilityName}</strong><span class="text-[10px] text-sage-soft">Free</span></span>
              <span class="line-clamp-2 text-ink-muted">{hud.selected.abilityDesc}</span>
            </button>
          {:else if hud.selected}
            <div class="{slot} cursor-default">
              <span class="flex items-center gap-1.5"><strong>{hud.selected.name}</strong>
                {#if hud.selected.hp !== null && hud.selected.maxHp !== null}{@render pips(hud.selected.hp, hud.selected.maxHp, 'HP', hud.selected.team === 'sky' ? 'bg-danger-soft' : 'bg-sage-soft')}{/if}
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
            <Button variant="surface" class="min-h-10 px-2 text-[11px]" onclick={() => controller?.cancel()}>Cancel</Button>
            <Button variant="primary" class="min-h-10 px-2 text-[11px]" onclick={() => controller?.confirm()}>Confirm</Button>
          </div>
        {:else}
          <div class="grid grid-cols-4 gap-1.5">
            <Button variant="surface" icon={Undo02Icon} iconSize={14} class="min-h-10 px-2 text-[11px]" disabled={!hud.canUndo} onclick={() => controller?.undo()}>Undo</Button>
            <Button variant="surface" icon={Alert02Icon} iconSize={14} class="min-h-10 px-2 text-[11px]" active={hud.danger} aria-keyshortcuts="D" title="Stripe every tile a visitor could hit next turn (D)" onclick={() => controller?.toggleDanger()}>Danger</Button>
            <Button variant="surface" class="min-h-10 px-2 text-[11px]" disabled={!selectedHero?.canAct} onclick={() => controller?.wait()}>Wait</Button>
            <Button variant="primary" class="min-h-10 px-2 text-[11px]" onclick={endTurn}>{armedEnd && hud.idleHeroes ? `End? ${hud.idleHeroes} idle` : 'End turn'}</Button>
          </div>
        {/if}
      </fieldset>
    </div>
  </footer>

  <p bind:this={hintEl} class="hud-surface pointer-events-none absolute bottom-4 left-4 hidden rounded-md px-3 py-2 font-mono text-[10.5px] text-ink-dim lg:block">Tap a herd animal · Scroll to zoom · Hold an edge to fast-forward</p>

  <ModalDialog open={showGuide} onClose={() => (showGuide = false)} eyebrow="Pasture rules" title="How to play" tone="sage" maxWidth="26rem">
    <ul class="mb-4 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-muted">
      <li>Each animal can move, then act once per turn.</li>
      <li>Visitors move and attack on their turn. Tap one to see how far it reaches, or turn on Danger to see every tile they could hit.</li>
      <li>Signature moves are free. Items cost power ({POWER_PER_TURN} per turn; unspent power is lost) and have limited uses.</li>
      <li>Hold the barn for {HOLD_TURNS} turns, or clear every visitor; the top bar says which. Crops are your score: save them for more stars.</li>
      <li>Undo is free until you end the turn. Your fight is saved in the link.</li>
    </ul>
    <div class="space-y-3 text-xs">
      <section><h3 class="font-mono text-sage-soft uppercase">Heroes</h3><ul>{#each HERO_KINDS as kind}{@const h = HEROES[kind]}{@render guideRow(h.model, `${h.name} · ${h.skill.name}`, h.skill.desc)}{/each}</ul></section>
      <section><h3 class="font-mono text-ochre uppercase">Shared items</h3><ul>{#each hud.items as {kind, charges}}{@const i = ITEMS[kind]}{@render guideRow(i.model, i.name, `${i.desc} ${i.power} power · ${charges}/${i.charges} charges.`)}{/each}</ul></section>
      <section><h3 class="font-mono text-sage-soft uppercase">Visitors</h3><ul>{#each ENEMY_KINDS as kind}{@const e = ENEMIES[kind]}{@render guideRow(e.model, `${e.name} · ${e.attack.name}`, e.attack.desc)}{/each}</ul></section>
    </div>
    {#snippet actions()}
      <Button variant="primary" class="w-full" onclick={() => (showGuide = false)}>Back to board</Button>
    {/snippet}
  </ModalDialog>

  <SeedShareDialog
    open={showShare}
    onClose={() => (showShare = false)}
    seed={hud.seed}
    title={`Fight #${hud.seed}`}
    subtitle={`${DIFFICULTIES[hud.difficulty].label} · turn ${hud.turn}`}
    description="The link opens this exact fight, mid-turn and all."
    shareTitle="Pasture Tactics"
    shareText={`Fight #${hud.seed} · ${DIFFICULTIES[hud.difficulty].label}`}
    maxSeed={4294967295}
    onSelectSeed={(seed) => {
      showShare = false;
      controller?.newFight(hud.difficulty, seed);
    }}
    onRandomSeed={() => {
      showShare = false;
      controller?.newFight(hud.difficulty);
    }}
  />

  <ModalDialog
    open={pendingFight !== null}
    onClose={() => (pendingFight = null)}
    eyebrow="Confirm"
    title={pendingFight?.kind === 'retry'
      ? 'Restart this fight?'
      : pendingFight?.difficulty && pendingFight.difficulty !== hud.difficulty
        ? `New ${DIFFICULTIES[pendingFight.difficulty].label} fight?`
        : 'Start a new fight?'}
    maxWidth="22rem"
  >
    <p class="text-xs leading-relaxed text-ink-muted">
      Your current progress on turn {hud.turn} will be replaced.
    </p>
    {#snippet actions()}
      <Button variant="surface" onclick={() => (pendingFight = null)}>Keep playing</Button>
      <Button variant="primary" onclick={() => pendingFight && runFight(pendingFight)}>
        {pendingFight?.kind === 'retry' ? 'Restart' : 'Start fight'}
      </Button>
    {/snippet}
  </ModalDialog>

  <ModalDialog
    open={result && !showGallery && !showGuide && !showShare && pendingFight === null}
    dismissible={false}
    eyebrow="Fight complete"
    title={hud.status}
    tone={hud.phase === 'won' ? 'sage' : 'danger'}
    maxWidth="22rem"
    class="text-center"
  >
    <div class="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border {hud.phase === 'won' ? 'border-sage/40 bg-sage/18 text-sage-soft' : 'border-danger/40 bg-danger/18 text-danger-soft'}">
      <Icon icon={hud.phase === 'won' ? Award01Icon : Cancel01Icon} size={20} />
    </div>
    {#if hud.phase === 'won'}
      <div class="text-xl tracking-widest text-ochre" role="img" aria-label={`${hud.stars} of 3 stars`}>{'★'.repeat(hud.stars)}{'☆'.repeat(3 - hud.stars)}</div>
    {/if}
    <p class="mt-3 font-mono text-xs text-ink-muted">Turn {hud.turn} · {hud.heroes.filter((h) => h.alive).length}/{hud.heroes.length} heroes standing</p>
    <p class="mt-1 font-mono text-xs text-ink-muted">Crops saved {hud.crops}/{CROP_COUNT}</p>
    {#snippet actions()}
      <div class="grid w-full gap-2">
        <Button variant="primary" class="w-full" onclick={() => controller?.retry()}>Retry this fight</Button>
        <Button variant="surface" class="w-full" onclick={() => controller?.newFight(hud.difficulty)}>New fight</Button>
        {#if hud.phase === 'won' && nextDifficulty}
          {@const next = nextDifficulty}
          <Button variant="surface" class="w-full" onclick={() => controller?.newFight(next)}>Try {DIFFICULTIES[next].label}</Button>
        {/if}
      </div>
    {/snippet}
  </ModalDialog>

  {#if showGallery}<AssetGallery title="Pasture Tactics Assets" storageKey="pasture-tactics-asset-review-v1" items={GALLERY_ITEMS} groups={GALLERY_GROUPS} tags={GALLERY_TAGS} onClose={() => setGalleryOpen(false)} />{/if}
</div>
