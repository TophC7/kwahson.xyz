<script lang="ts">
  import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
  import Icon from './components/Icon.svelte';
  import TopBar from './components/TopBar.svelte';
  import Home from './components/Home.svelte';
  import { router } from './lib/router.svelte';
  import { projects } from './projects';

  const activeProject = $derived(
    router.slug ? projects.find((project) => project.slug === router.slug) ?? null : null,
  );

  let mainEl = $state<HTMLElement | undefined>(undefined);

  $effect(() => {
    document.title = activeProject ? `${activeProject.title} — kwahson.xyz` : 'kwahson.xyz';
  });

  $effect(() => {
    void router.pathname;
    mainEl?.scrollTo({ top: 0 });
  });
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
  <TopBar {activeProject} totalCount={projects.length} />

  <main bind:this={mainEl} class="relative min-h-0 flex-1 overflow-auto">
    {#if router.slug === null}
      <Home {projects} />
    {:else if activeProject}
      {#await activeProject.load().catch((err) => {
        console.error(err);
        throw err;
      })}
        <div class="grid h-full place-items-center bg-canvas">
          <div class="flex items-center gap-2.5 font-mono text-xs text-ink-muted">
            <span class="h-2 w-2 rounded-full bg-sage animate-gentle-pulse"></span>
            <span>Loading {activeProject.title}...</span>
          </div>
        </div>
      {:then mod}
        {@const ActiveView = mod.default}
        <div class="h-full w-full">
          <ActiveView />
        </div>
      {:catch}
        <div class="grid h-full place-items-center p-6">
          <div class="max-w-sm rounded-md border border-[rgba(213,215,207,0.12)] bg-surface p-6 text-center">
            <p class="font-mono text-xs text-ochre uppercase">Load Error</p>
            <p class="mt-2 text-sm text-ink-muted">Could not load this project.</p>
            <a
              href="/"
              class="mt-4 inline-block rounded-sm border border-[rgba(213,215,207,0.14)] bg-surface-raised px-3 py-1.5 font-mono text-xs text-ink hover:border-sage/40"
            >
              Back home
            </a>
          </div>
        </div>
      {/await}
    {:else}
      <div class="bg-field-grid grid h-full place-items-center p-6">
        <div class="max-w-sm rounded-md border border-[rgba(213,215,207,0.1)] bg-surface p-7 text-center">
          <p class="font-mono text-[11px] tracking-widest text-ink-dim uppercase">404 // Nothing here</p>
          <h1 class="mt-2 text-lg font-semibold text-ink">Nothing lives at /{router.slug}</h1>
          <p class="mt-2 text-sm text-ink-muted">
            Either it moved or it hasn't been built yet.
          </p>
          <a
            href="/"
            class="mt-5 inline-flex items-center gap-1.5 rounded-sm border border-[rgba(213,215,207,0.14)] bg-surface-raised px-3.5 py-1.5 font-mono text-xs text-ink transition-colors hover:border-sage/40"
          >
            <Icon icon={ArrowLeft02Icon} size={13} strokeWidth={1.9} />
            <span>Back to kwahson.xyz</span>
          </a>
        </div>
      </div>
    {/if}
  </main>
</div>
