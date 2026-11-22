<script lang="ts">
  import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
  import AssetGallery, { type GalleryGroup, type GalleryItem } from './AssetGallery.svelte';
  import Button from './ui/Button.svelte';
  import SegmentedControl, { type SegmentedOption } from './ui/SegmentedControl.svelte';
  import { router } from '../lib/router.svelte';
  import { ASSET_CATALOGS, type AssetCatalog } from '../projects/assets';

  const selectedSlug = $derived(new URLSearchParams(router.search).get('game') ?? 'all');

  const activeCatalog = $derived<AssetCatalog | null>(
    ASSET_CATALOGS.find((c) => c.slug === selectedSlug) ?? null,
  );

  const { ALL_ITEMS, ALL_GROUPS, ALL_TAGS } = (() => {
    const seen = new Map<string, GalleryItem<string>>();
    const counts = new Map<string, number>();

    for (const c of ASSET_CATALOGS) {
      for (const item of c.items) {
        counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
        if (!seen.has(item.id)) {
          seen.set(item.id, {
            id: item.id,
            name: item.name,
            group: c.slug,
            badge: item.badge,
          });
        }
      }
    }

    const items = Array.from(seen.values());
    const usedGroups = new Set(items.map((i) => i.group));
    const groups: Record<string, GalleryGroup> = Object.fromEntries(
      ASSET_CATALOGS.filter((c) => usedGroups.has(c.slug)).map((c) => [
        c.slug,
        { label: c.title, accent: c.accent },
      ]),
    );
    const tags: Record<string, string> = {};
    for (const [id, count] of counts) {
      if (count > 1) tags[id] = `${count} games`;
    }
    return { ALL_ITEMS: items, ALL_GROUPS: groups, ALL_TAGS: tags };
  })();

  const gameOptions: SegmentedOption<string>[] = [
    { value: 'all', label: `All (${ALL_ITEMS.length})` },
    ...ASSET_CATALOGS.map((c) => ({
      value: c.slug,
      label: `${c.title} (${c.items.length})`,
    })),
  ];

  function selectGame(slug: string) {
    router.replace(slug === 'all' ? '/assets' : `/assets?game=${slug}`);
  }

  const galleryProps = $derived.by(() => {
    if (!activeCatalog) {
      return {
        title: 'All Game Assets',
        storageKey: 'all-assets-review-v1',
        items: ALL_ITEMS,
        groups: ALL_GROUPS,
        tags: ALL_TAGS,
        previews: undefined,
      };
    }
    return {
      title: `${activeCatalog.title} Assets`,
      storageKey: activeCatalog.storageKey,
      items: activeCatalog.items,
      groups: activeCatalog.groups,
      tags: activeCatalog.tags,
      previews: activeCatalog.loadPreviews?.(),
    };
  });
</script>

<div class="min-h-full bg-canvas text-ink">
  <section class="border-b border-ink/10 bg-canvas px-3 py-5 sm:px-5 sm:py-6">
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="font-mono text-[11px] tracking-[0.14em] text-sage uppercase">
            // Living Assets
          </p>
          <h1 class="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-3xl">
            {activeCatalog ? activeCatalog.title : 'Every 3D miniature, side by side.'}
          </h1>
          <p class="mt-1.5 max-w-2xl text-sm text-ink-muted">
            Browse the shared low-poly pasture models by game. Click any card to inspect it up close.
          </p>
        </div>

        {#if activeCatalog}
          <Button
            href="/{activeCatalog.slug}"
            variant="primary"
            size="sm"
            icon={ArrowRight02Icon}
            iconSize={14}
          >
            Play {activeCatalog.title}
          </Button>
        {/if}
      </div>

      <SegmentedControl
        options={gameOptions}
        value={activeCatalog ? activeCatalog.slug : 'all'}
        onChange={selectGame}
        ariaLabel="Select game assets"
      />
    </div>
  </section>

  <AssetGallery
    title={galleryProps.title}
    storageKey={galleryProps.storageKey}
    items={galleryProps.items}
    groups={galleryProps.groups}
    tags={galleryProps.tags}
    previews={galleryProps.previews}
  />
</div>
