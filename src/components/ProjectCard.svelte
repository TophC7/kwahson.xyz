<script lang="ts">
  import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
  import Icon from './Icon.svelte';
  import type { ProjectEntry } from '../lib/types';

  interface Props {
    project: ProjectEntry;
    index: number;
  }

  let { project, index }: Props = $props();

  function handlePointerMove(event: PointerEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }
</script>

<a
  href="/{project.slug}"
  onpointermove={handlePointerMove}
  style:--stagger="{index * 75}ms"
  class="project-card animate-card-reveal group relative flex flex-col overflow-hidden rounded-md border border-[rgba(213,215,207,0.09)] bg-surface transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-[rgba(148,164,144,0.32)] hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.85)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sage"
>
  <div
    class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    style="background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), rgba(145, 162, 141, 0.11), transparent 65%);"
    aria-hidden="true"
  ></div>

  <div
    class="relative aspect-[16/10] w-full overflow-hidden border-b border-[rgba(213,215,207,0.08)] bg-[#141613]"
  >
    <div
      class="bg-field-grid absolute inset-0 opacity-55 transition-transform duration-500 ease-out group-hover:scale-[1.03]"
      aria-hidden="true"
    ></div>

    {#if project.preview}
      {@const Preview = project.preview}
      <div class="relative h-full w-full">
        <Preview />
      </div>
    {:else}
      <div class="relative grid h-full w-full place-items-center font-mono text-xs text-ink-dim">
        /{project.slug}
      </div>
    {/if}

    <div
      class="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.1)] bg-canvas/80 px-2 py-0.5 font-mono text-[10px] tracking-wider text-ink-muted uppercase backdrop-blur-xs"
    >
      <span>{String(index + 1).padStart(2, '0')}</span>
      <span class="text-ink-dim">/</span>
      <span>{project.category}</span>
    </div>

    <div
      class="pointer-events-none absolute top-3 right-3 font-mono text-[10px] text-ink-dim transition-colors duration-200 group-hover:text-ink-muted"
    >
      {project.year}
    </div>
  </div>

  <div class="relative flex flex-1 flex-col justify-between gap-4 p-4 sm:p-5">
    <div>
      <div class="flex items-start justify-between gap-3">
        <h2
          class="text-[17px] font-semibold tracking-[-0.015em] text-ink transition-colors duration-200 group-hover:text-[#e7e9e1]"
        >
          {project.title}
        </h2>
        <span
          class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-[rgba(213,215,207,0.08)] bg-surface-raised/70 text-ink-muted transition-all duration-300 group-hover:border-sage/40 group-hover:bg-sage/12 group-hover:text-ink"
          aria-hidden="true"
        >
          <Icon
            icon={ArrowUpRight01Icon}
            size={14}
            strokeWidth={1.9}
            class="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </span>
      </div>

      <p class="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
        {project.description}
      </p>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div class="flex flex-wrap gap-1.5">
        {#each project.tags as tag}
          <span
            class="rounded-sm border border-[rgba(213,215,207,0.08)] bg-canvas/70 px-2 py-0.5 font-mono text-[10.5px] text-ink-dim transition-colors duration-200 group-hover:border-[rgba(213,215,207,0.14)] group-hover:text-ink-muted"
          >
            {tag}
          </span>
        {/each}
      </div>

      <span class="font-mono text-[10.5px] text-sage/0 transition-all duration-300 group-hover:text-sage/90">
        {project.category === 'game' ? 'play' : 'open'}
      </span>
    </div>
  </div>
</a>
