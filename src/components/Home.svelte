<script lang="ts">
  import FieldBackground from './FieldBackground.svelte';
  import ProjectCard from './ProjectCard.svelte';
  import SegmentedControl from './ui/SegmentedControl.svelte';
  import type { ProjectEntry } from '../projects';

  interface Props {
    projects: ProjectEntry[];
  }

  let { projects }: Props = $props();

  let selectedCategory = $state<ProjectEntry['category'] | 'all'>('all');

  const categories = $derived(Array.from(new Set(projects.map((p) => p.category))));

  const filterOptions = $derived([
    { value: 'all' as const, label: `All (${projects.length})` },
    ...categories.map((cat) => ({ value: cat, label: cat })),
  ]);

  const filtered = $derived(
    selectedCategory === 'all'
      ? projects
      : projects.filter((p) => p.category === selectedCategory),
  );
</script>

<div class="relative min-h-full overflow-x-hidden bg-canvas">
  <FieldBackground />

  <div class="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-10">
    <section class="mb-8 flex flex-col gap-5 border-b border-ink/8 pb-7 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div class="max-w-xl">
        <p class="font-mono text-[11px] tracking-[0.14em] text-sage uppercase">
          // Playground
        </p>
        <h1 class="mt-2.5 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Tiny games, tools, and 3D curiosities.
        </h1>
        <p class="mt-3 text-[15px] leading-relaxed text-ink-muted">
          A shelf of small web experiments and weekend rabbit holes I made for fun. Pick one and
          poke around.
        </p>
      </div>

      {#if categories.length > 1}
        <SegmentedControl
          options={filterOptions}
          value={selectedCategory}
          onChange={(v) => (selectedCategory = v)}
          ariaLabel="Filter projects"
          class="[&_button]:uppercase"
        />
      {/if}
    </section>

    <section aria-label="Projects" class="flex-1">
      <div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {#each filtered as project, i (project.slug)}
          <ProjectCard {project} index={i} />
        {/each}
      </div>
    </section>

    <footer
      class="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4 font-mono text-[11px] text-ink-dim"
    >
      <span>
        Made for fun by
        <a
          href="https://toph.cc"
          target="_blank"
          rel="noreferrer"
          class="focus-ring rounded-xs text-ink-muted underline underline-offset-3 transition-colors hover:text-ink"
        >
          Toph
        </a>
      </span>
      <span>kwahson.xyz</span>
    </footer>
  </div>
</div>
