<script lang="ts">
  import type { PowerupId } from './data';

  let { id, size = 28, color = 'currentColor' }: {
    id: PowerupId;
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
  {#if id === 'butter'}
    <path d="M5 12.5 13 7l6 3.5-8 5.5-6-3.5Z" fill={color} fill-opacity="0.22" />
    <path d="M5 12.5V16l6 3.5 8-5.5v-3.5" />
    <path d="M8 18.5c0 1.4 1.5 2 2.5 1" />
  {:else if id === 'double'}
    <ellipse cx="9" cy="11" rx="3" ry="6.5" transform="rotate(-18 9 11)" fill={color} fill-opacity="0.2" />
    <ellipse cx="15.5" cy="12" rx="3" ry="6.5" transform="rotate(12 15.5 12)" fill={color} fill-opacity="0.2" />
    <path d="M6.5 16.5 9 19M14.5 17.5 16 20" />
  {:else if id === 'popcorn'}
    <circle cx="9" cy="10" r="3" fill={color} fill-opacity="0.24" />
    <circle cx="15" cy="9.5" r="2.8" fill={color} fill-opacity="0.24" />
    <circle cx="12" cy="14" r="3.2" fill={color} fill-opacity="0.24" />
    <path d="M5 5l1.5 1.5M19 5l-1.5 1.5M12 3v2" />
  {:else if id === 'goldsight'}
    <circle cx="12" cy="12" r="6.5" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    <circle cx="12" cy="12" r="2" fill={color} />
  {:else if id === 'milk'}
    <path d="M9.5 3.5h5l.8 3 1.7 3.5V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19v-9l1.7-3.5.8-3Z" fill={color} fill-opacity="0.2" />
    <path d="M4 11l-1.5-1M20 11l1.5-1M4.5 15.5 3 16.5M19.5 15.5 21 16.5" />
  {:else if id === 'pumpkin'}
    <ellipse cx="12" cy="13.5" rx="7" ry="5.8" fill={color} fill-opacity="0.22" />
    <path d="M12 7.7c-2.2 0-3.2 2.6-3.2 5.8s1 5.8 3.2 5.8 3.2-2.6 3.2-5.8-1-5.8-3.2-5.8Z" />
    <path d="M12 7.7V5l2-1.5" />
  {:else if id === 'homing'}
    <path d="M4.5 18.5C5 11.5 9.5 8 17.5 7.5" />
    <path d="m14.5 4.5 3.5 3-3 3.5" />
    <circle cx="19" cy="15.5" r="2.2" fill={color} fill-opacity="0.3" />
  {:else if id === 'healer'}
    <rect x="4" y="4" width="16" height="16" rx="4" fill={color} fill-opacity="0.16" />
    <path d="M12 8v8M8 12h8" stroke-width="2.4" />
  {:else if id === 'backblast'}
    <path d="m19 12-9-5v10l9-5Z" fill={color} fill-opacity="0.22" />
    <path d="M7.5 9 3.5 6.5M6.5 12H2.5M7.5 15l-4 2.5" />
  {:else if id === 'ricochet'}
    <path d="M4 17 11 6l5.5 10.5L20.5 7" />
    <path d="m17.5 6.5 3 .5-.5 3" />
    <circle cx="11" cy="6" r="1.4" fill={color} />
    <circle cx="16.5" cy="16.5" r="1.4" fill={color} />
  {:else if id === 'bees'}
    <ellipse cx="12" cy="13" rx="5.2" ry="3.8" fill={color} fill-opacity="0.24" />
    <path d="M10.5 9.4v7.2M13.5 9.4v7.2" />
    <path d="M10.5 9.2C8.8 6 11.8 4.8 12 8.8M13.5 9.2c1.7-3.2 4.7-2 2.8 1.4" />
    <path d="M17.2 13h2.3" />
  {:else if id === 'trail'}
    <circle cx="6.5" cy="16.5" r="2.3" fill={color} fill-opacity="0.28" />
    <circle cx="12.5" cy="12.5" r="2.3" fill={color} fill-opacity="0.28" />
    <circle cx="18" cy="7.5" r="2.6" fill={color} fill-opacity="0.28" />
    <path d="M18 3.5v1.3M21.5 7.5h-1.3" />
  {:else if id === 'magnet'}
    <path d="M6.5 5.5v6.5a5.5 5.5 0 0 0 11 0V5.5" stroke-width="2.4" />
    <path d="M5 5.5h3M16 5.5h3M4 11c0 1.2.4 2.3 1 3.2M20 11c0 1.2-.4 2.3-1 3.2" />
  {/if}
</svg>
