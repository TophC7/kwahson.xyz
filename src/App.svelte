<script lang="ts">
  import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
  import Button from './components/ui/Button.svelte';
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
          <div class="max-w-sm rounded-md border border-ink/12 bg-surface p-6 text-center">
            <p class="font-mono text-xs text-ochre uppercase">Load Error</p>
            <p class="mt-2 text-sm text-ink-muted">Could not load this project.</p>
            <Button href="/" variant="surface" size="sm" class="mt-4">Back home</Button>
          </div>
        </div>
      {/await}
    {:else}
      <div class="bg-field-grid grid h-full place-items-center p-6">
        <div class="max-w-sm rounded-md border border-ink/10 bg-surface p-7 text-center">
          <p class="font-mono text-[11px] tracking-widest text-ink-dim uppercase">404 // Nothing here</p>
          <h1 class="mt-2 text-lg font-semibold text-ink">Nothing lives at /{router.slug}</h1>
          <p class="mt-2 text-sm text-ink-muted">
            Either it moved or it hasn't been built yet.
          </p>
          <Button href="/" variant="surface" size="sm" icon={ArrowLeft02Icon} iconSize={13} class="mt-5">
            Back to kwahson.xyz
          </Button>
        </div>
      </div>
    {/if}
  </main>
</div>
