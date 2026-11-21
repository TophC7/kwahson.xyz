<script lang="ts" module>
  export type IconData = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

  const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
</script>

<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  let {
    icon,
    size = 24,
    strokeWidth,
    ...rest
  }: SVGAttributes<SVGSVGElement> & { icon: IconData; size?: number; strokeWidth?: number } = $props();

  // Hugeicons data uses React-style attributes; SVG needs kebab-case and no React key.
  const nodes = $derived(
    icon.map(([tag, attrs]) => {
      const out: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(attrs)) if (key !== 'key') out[kebab(key)] = value;
      if (strokeWidth !== undefined && 'stroke-width' in out) out['stroke-width'] = strokeWidth;
      return [tag, out] as const;
    }),
  );
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden={rest['aria-label'] ? undefined : true}
  {...rest}
>
  {#each nodes as [tag, attrs], i (i)}
    <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
  {/each}
</svg>
