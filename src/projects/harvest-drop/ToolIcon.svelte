<script lang="ts">
  import type { PowerupKind } from './sim';

  let {
    kind,
    size = 26,
    color = 'currentColor',
  }: {
    kind: PowerupKind;
    size?: number;
    color?: string;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class="shrink-0"
>
  {#if kind === 'abduct'}
    <!-- Mini UFO + glowing tractor beam cone pulling a crop upward -->
    <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" fill={color} fill-opacity="0.22" />
    <ellipse cx="12" cy="9.5" rx="7.5" ry="2.2" fill={color} fill-opacity="0.24" />
    <path d="M8.5 11.7 5.5 20.5h13l-3-8.8" fill={color} fill-opacity="0.14" />
    <circle cx="12" cy="17.2" r="1.7" fill={color} fill-opacity="0.45" />
    <path d="M12 15v-2.2" />
  {:else if kind === 'shake'}
    <!-- Tilted crate rattling between motion arcs -->
    <g transform="rotate(-8 12 13)">
      <rect x="6.5" y="7.5" width="11" height="10.5" rx="1.6" fill={color} fill-opacity="0.2" />
      <path d="M6.5 11h11M6.5 14.5h11M10 7.5v10.5M14 7.5v10.5" />
    </g>
    <path d="M3.5 9.5c-.9 1.6-.9 3.6 0 5.2M20.5 9.5c.9 1.6.9 3.6 0 5.2" />
    <path d="M9.5 4.2 12 2.4l2.5 1.8" />
  {:else if kind === 'grow'}
    <!-- Rising sprout + upward promotion chevron & sparkle -->
    <path d="M12 19.5v-8.5" />
    <path d="M12 14.5c-3.8 0-5.8-2.2-5.8-5.2 2.8 0 5.2 1.4 5.8 5.2Z" fill={color} fill-opacity="0.24" />
    <path d="M12 12.2c3.8 0 5.8-2.2 5.8-5.2-2.8 0-5.2 1.4-5.8 5.2Z" fill={color} fill-opacity="0.24" />
    <path d="M5.5 19.5h13" />
    <path d="M12 3.5v3M10.5 5h3" />
  {:else if kind === 'pineapple'}
    <!-- Faceted pineapple bomb with spiky crown & sparkling blast star -->
    <ellipse cx="12" cy="14.5" rx="5.5" ry="6" fill={color} fill-opacity="0.24" />
    <path d="M8.5 11.5 15.5 17.5M15.5 11.5 8.5 17.5" />
    <path d="M9 8.8 7.5 4.8l3.2 2.4L12 3.5l1.3 3.7 3.2-2.4-1.5 4" fill={color} fill-opacity="0.2" />
    <path d="M18.5 4.5v2M17.5 5.5h2" />
  {:else if kind === 'sweep'}
    <!-- Farm broom sweeping away small pea/berry clutter -->
    <path d="M16.5 3.5 12 11.5" stroke-width="2.1" />
    <path d="M9.5 10.5 14.5 12.8 11.8 19.5l-7-3.2 4.7-5.8Z" fill={color} fill-opacity="0.22" />
    <path d="M7.8 14.2 6.5 17M10.5 15.2l-1.2 3" />
    <circle cx="18.2" cy="15.5" r="1.4" fill={color} fill-opacity="0.35" />
    <circle cx="20.2" cy="18.8" r="1.1" fill={color} fill-opacity="0.35" />
    <path d="M16 19.5h2.5" />
  {/if}
</svg>
