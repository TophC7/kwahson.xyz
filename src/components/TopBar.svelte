<script lang="ts">
  import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
  import Button from './ui/Button.svelte';
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
  class="z-40 shrink-0 border-b border-ink/9 bg-canvas/90 backdrop-blur-md"
  style="padding-top: env(safe-area-inset-top);"
>
  <div class="flex h-11 items-center justify-between px-4 sm:px-6">
    <div class="flex min-w-0 items-center gap-2.5">
    <a
      href="/"
      class="focus-ring group inline-flex items-center gap-2.5 rounded-sm text-sm font-medium tracking-tight text-ink transition-colors hover:text-[#e6e8e0]"
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
      <Button
        href="/"
        variant="surface"
        size="sm"
        class="group bg-surface text-ink-muted hover:border-ink/22 hover:text-ink"
      >
        {#snippet icon()}
          <Icon
            icon={ArrowLeft02Icon}
            size={13}
            strokeWidth={1.9}
            class="transition-transform duration-200 group-hover:-translate-x-0.5"
          />
        {/snippet}
        <span>Home</span>
      </Button>
    {:else}
      <div class="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
        <span class="h-1.5 w-1.5 rounded-full bg-sage animate-gentle-pulse" aria-hidden="true"></span>
        <span>{String(totalCount).padStart(2, '0')} {totalCount === 1 ? 'PROJECT' : 'PROJECTS'}</span>
      </div>
    {/if}
  </div>
  </div>
</header>
