<script lang="ts">
  let { viewport = $bindable(), label, what, failed }: {
    viewport?: HTMLDivElement;
    /** aria-label of the viewport. */
    label: string;
    /** Completes "Your browser could not start …". */
    what: string;
    failed: boolean;
  } = $props();
</script>

<!-- Twilight dot grid and sage vignette behind the transparent canvas. -->
<div
  class="bg-field-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_82%_76%_at_50%_50%,#000_25%,transparent_100%)]"
  aria-hidden="true"
></div>
<div
  class="pointer-events-none absolute inset-0"
  style="background: radial-gradient(circle at 50% 48%, rgba(122, 141, 118, 0.11), rgba(17, 18, 16, 0) 64%);"
  aria-hidden="true"
></div>
<div bind:this={viewport} class="game-viewport absolute inset-0 z-0 touch-none" aria-label={label}></div>
{#if failed}
  <div
    role="alert"
    class="absolute top-1/2 left-1/2 z-50 max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#b86b58]/40 bg-surface px-5 py-4 text-center text-sm text-[#d49685]"
  >
    Your browser could not start {what}. Please enable WebGL or try a newer browser.
  </div>
{/if}

<style>
  .game-viewport :global(canvas) {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;
  }
</style>
