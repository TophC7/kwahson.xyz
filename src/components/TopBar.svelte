<script lang="ts">
  import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
  import Icon from './Icon.svelte';
  import NovaMark from './NovaMark.svelte';
  import type { ProjectEntry } from '../projects';

  interface Props {
    activeProject: ProjectEntry | null;
    totalCount: number;
  }

  let { activeProject, totalCount }: Props = $props();
</script>

<header
  class="sticky top-0 z-40 flex h-11 shrink-0 items-center justify-between border-b border-ink/9 bg-canvas/90 px-4 backdrop-blur-md sm:px-6"
>
  <div class="flex min-w-0 items-center gap-2.5">
    <a
      href="/"
      class="group inline-flex items-center gap-2.5 text-sm font-medium tracking-tight text-ink transition-colors hover:text-[#e6e8e0] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage"
    >
      <span class="flex h-6 w-6 items-center justify-center">
        <NovaMark size={17} />
      </span>
      <span class="font-mono text-[13px] tracking-[-0.02em]">kwahson.xyz</span>
    </a>

    {#if activeProject}
      <span class="font-mono text-xs text-ink-dim select-none" aria-hidden="true">/</span>
      <span class="truncate text-[13px] font-semibold tracking-[-0.015em] text-ink"
        >{activeProject.title}<span class="text-ochre">.</span></span
      >
      <span
        class="hidden rounded-sm border border-ink/10 bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-ink-muted uppercase sm:inline-block"
      >
        {activeProject.category}
      </span>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-3">
    {#if activeProject}
      <a
        href="/"
        class="group inline-flex items-center gap-1.5 rounded-sm border border-ink/10 bg-surface px-2.5 py-1 font-mono text-[11px] text-ink-muted transition-all duration-200 hover:border-ink/22 hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
      >
        <Icon
          icon={ArrowLeft02Icon}
          size={13}
          strokeWidth={1.9}
          class="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        <span>Home</span>
      </a>
    {:else}
      <div class="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
        <span class="h-1.5 w-1.5 rounded-full bg-sage animate-gentle-pulse" aria-hidden="true"></span>
        <span>{String(totalCount).padStart(2, '0')} {totalCount === 1 ? 'PROJECT' : 'PROJECTS'}</span>
      </div>
    {/if}
  </div>
</header>
