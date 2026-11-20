<script lang="ts"></script>

<svg viewBox="0 0 360 225" class="h-full w-full select-none" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="pt-meadow" x1="180" y1="34" x2="180" y2="194" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2c352a" />
      <stop offset="1" stop-color="#1e241d" />
    </linearGradient>
  </defs>

  <circle cx="54" cy="21" r="1.1" fill="#8a8f84" opacity="0.4" />
  <circle cx="308" cy="23" r="1.2" fill="#9f8665" opacity="0.45" />
  <rect x="44" y="36" width="272" height="164" rx="8" fill="#1b1c18" />
  <rect x="44" y="28" width="272" height="164" rx="8" fill="url(#pt-meadow)" stroke="#4c5a49" stroke-width="1.2" />
  <g stroke="#7a8d76" stroke-opacity="0.34">
    <rect x="59" y="36" width="242" height="148" rx="2" />
    {#each [66, 94, 122, 150, 178, 206, 234, 262, 290] as x (x)}
      <path d={`M${x} 33v6 M${x} 181v6`} />
    {/each}
  </g>

  <g transform="translate(78 42)">
    {#each [0, 1, 2, 3] as y (y)}
      {#each [0, 1, 2, 3, 4, 5] as x (x)}
        <rect x={x * 34} y={y * 34} width="34" height="34" rx="2"
          fill={(x + y) % 2 ? '#52694c' : '#5c7354'} stroke="#344431" />
      {/each}
    {/each}
    {#each [[1, 1], [2, 2], [1, 3]] as [x, y], i (y)}
      <rect class="pt-move" style:animation-delay={`${i * 0.25}s`} x={x * 34 + 1} y={y * 34 + 1} width="32" height="32" rx="2" fill="#6fb3d9" />
    {/each}
    {#each [[4, 0], [3, 1], [4, 1], [5, 1], [4, 2]] as [x, y] (x + y * 6)}
      <rect class="pt-danger" x={x * 34 + 1} y={y * 34 + 1} width="32" height="32" rx="2" fill="#d9614f" />
    {/each}

    <!-- Cow on (1, 2), facing the visitor. -->
    <g transform="translate(34 68)"><g class="pt-cow">
      <ellipse cx="17" cy="28" rx="13" ry="3" fill="#1b241a" opacity="0.45" />
      <path d="M7 23v5m11-5v5" stroke="#3a423d" stroke-width="4" />
      <rect x="4" y="13" width="20" height="12" rx="3" fill="#fff8e7" stroke="#c8c2b2" />
      <rect x="7" y="13" width="8" height="6" rx="1.5" fill="#3a423d" />
      <rect x="20" y="10" width="9" height="10" rx="2" fill="#fff8e7" stroke="#c8c2b2" />
      <circle cx="26" cy="13" r="1" fill="#3a423d" />
      <rect x="25" y="16" width="7" height="4" rx="1.5" fill="#eda8a2" />
      {#each [7, 14, 21] as x (x)}
        <rect {x} y="2" width="6" height="3" rx="1" fill="#c3d4b8" />
      {/each}
    </g></g>

    <g transform="translate(136 34)">
      <ellipse cx="17" cy="29" rx="12" ry="3" fill="#1b241a" opacity="0.45" />
      <path d="m12 14-3-5m13 5 3-5" stroke="#8fe08a" stroke-width="2.5" stroke-linecap="round" />
      <rect x="9" y="20" width="16" height="9" rx="4" fill="#4fb85a" />
      <rect x="6" y="12" width="22" height="13" rx="6" fill="#67d964" />
      <path d="m10 17 4 2m8-2-4 2" stroke="#18261c" stroke-width="2.5" stroke-linecap="round" />
      {#each [7, 14, 21] as x (x)}
        <rect {x} y="2" width="6" height="3" rx="1" fill="#e58b79" />
      {/each}
    </g>
  </g>
</svg>

<style>
  .pt-move { animation: pt-move 3.4s ease-in-out infinite; }
  .pt-danger { animation: pt-danger 2.8s ease-in-out infinite; }
  .pt-cow { animation: pt-hop 3.4s ease-in-out infinite; }

  :global(.project-card:hover) .pt-move,
  :global(.project-card:hover) .pt-cow { animation-duration: 2s; }

  @keyframes pt-move {
    0%, 100% { opacity: 0.15; }
    40%, 60% { opacity: 0.5; }
  }
  @keyframes pt-danger {
    0%, 100% { opacity: 0.22; }
    50% { opacity: 0.42; }
  }
  @keyframes pt-hop {
    0%, 55%, 100% { transform: translate(0, 0); }
    65% { transform: translate(5px, -7px); }
    75% { transform: translate(8px, 0); }
    88% { transform: translate(0, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .pt-move, .pt-danger, .pt-cow { animation: none !important; }
    .pt-move, .pt-danger { opacity: 0.4; }
  }
</style>
