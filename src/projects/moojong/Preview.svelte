<script lang="ts"></script>

<svg
  viewBox="0 0 360 225"
  class="h-full w-full select-none"
  fill="none"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="mj-meadow" x1="180" y1="80" x2="180" y2="210" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2c352a" />
      <stop offset="100%" stop-color="#1e241d" />
    </linearGradient>
    <linearGradient id="mj-ivory" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eee6d4" />
      <stop offset="100%" stop-color="#dfd5c0" />
    </linearGradient>
  </defs>

  <!-- Subtle starry dust -->
  <circle cx="54" cy="40" r="1.1" fill="#8a8f84" opacity="0.4" />
  <circle cx="308" cy="44" r="1.2" fill="#9f8665" opacity="0.45" />
  <circle cx="282" cy="28" r="0.9" fill="#8a8f84" opacity="0.32" />

  <!-- Pasture tabletop frame -->
  <g transform="translate(0, 6)">
    <rect x="44" y="42" width="272" height="146" rx="8" fill="#1b1c18" />
    <rect x="44" y="34" width="272" height="146" rx="8" fill="url(#mj-meadow)" stroke="#4c5a49" stroke-width="1.2" />
    <!-- Subtle fence ticks -->
    <g stroke="#7a8d76" stroke-opacity="0.22" stroke-width="1">
      <line x1="60" y1="50" x2="300" y2="50" />
      <line x1="60" y1="164" x2="300" y2="164" />
      <line x1="60" y1="50" x2="60" y2="164" />
      <line x1="300" y1="50" x2="300" y2="164" />
    </g>

    <!-- Bottom layer Mahjong tiles -->
    <!-- Back-left (Hay) -->
    <g transform="translate(88, 62)">
      <rect x="3" y="8" width="44" height="54" rx="5" fill="#10130f" opacity="0.5" />
      <rect x="0" y="5" width="44" height="54" rx="5" fill="#4b6948" />
      <rect x="0" y="0" width="44" height="52" rx="5" fill="url(#mj-ivory)" stroke="#c7baa0" stroke-width="1" />
      <rect x="5" y="5" width="34" height="42" rx="3" fill="#f5ede0" stroke="#c3a476" stroke-width="0.9" />
      <rect x="13" y="21" width="18" height="12" rx="5" fill="#cf9e4c" />
      <line x1="18" y1="21" x2="18" y2="33" stroke="#8f672f" stroke-width="1.2" />
      <line x1="26" y1="21" x2="26" y2="33" stroke="#8f672f" stroke-width="1.2" />
    </g>

    <!-- Back-center (Barn) -->
    <g transform="translate(158, 56)">
      <rect x="3" y="8" width="44" height="54" rx="5" fill="#10130f" opacity="0.5" />
      <rect x="0" y="5" width="44" height="54" rx="5" fill="#4b6948" />
      <rect x="0" y="0" width="44" height="52" rx="5" fill="url(#mj-ivory)" stroke="#c7baa0" stroke-width="1" />
      <rect x="5" y="5" width="34" height="42" rx="3" fill="#f5ebe6" stroke="#c48a7a" stroke-width="0.9" />
      <polygon points="22,15 33,24 33,38 11,38 11,24" fill="#b85349" />
      <polyline points="10,25 22,14 34,25" stroke="#474f4c" stroke-width="2" stroke-linecap="round" />
      <rect x="18" y="28" width="8" height="10" fill="#f2ead9" />
    </g>

    <!-- Back-right (Saucer) -->
    <g transform="translate(228, 62)">
      <rect x="3" y="8" width="44" height="54" rx="5" fill="#10130f" opacity="0.5" />
      <rect x="0" y="5" width="44" height="54" rx="5" fill="#4b6948" />
      <rect x="0" y="0" width="44" height="52" rx="5" fill="url(#mj-ivory)" stroke="#c7baa0" stroke-width="1" />
      <rect x="5" y="5" width="34" height="42" rx="3" fill="#e9f1ef" stroke="#6d9c98" stroke-width="0.9" />
      <ellipse cx="22" cy="29" rx="12" ry="4.5" fill="#88a89d" />
      <path d="M 15.5,28 A 6.5,6.5 0 0 1 28.5,28 Q 22,29.8 15.5,28 Z" fill="#528a82" />
      <circle cx="16" cy="29.5" r="1.2" fill="#e6bf5e" />
      <circle cx="22" cy="30.5" r="1.2" fill="#e6bf5e" />
      <circle cx="28" cy="29.5" r="1.2" fill="#e6bf5e" />
    </g>

    <!-- Front-center base tile (Pumpkin) -->
    <g transform="translate(158, 108)">
      <rect x="3" y="8" width="44" height="54" rx="5" fill="#10130f" opacity="0.5" />
      <rect x="0" y="5" width="44" height="54" rx="5" fill="#4b6948" />
      <rect x="0" y="0" width="44" height="52" rx="5" fill="url(#mj-ivory)" stroke="#c7baa0" stroke-width="1" />
      <rect x="5" y="5" width="34" height="42" rx="3" fill="#f6ece5" stroke="#c88c75" stroke-width="0.9" />
      <ellipse cx="22" cy="30" rx="10" ry="8" fill="#d97b38" />
      <rect x="20.5" y="18" width="3" height="5" rx="1" fill="#567848" />
    </g>

    <!-- Upper stacked matching pair: Cow Tile Left (animated lift & glow) -->
    <g class="mj-match-a" transform="translate(106, 94)">
      <rect x="4" y="11" width="46" height="56" rx="5" fill="#0d100d" opacity="0.55" />
      <rect x="-2" y="-2" width="50" height="58" rx="6.5" stroke="#d9b45b" stroke-width="1.6" class="mj-glow" />
      <rect x="0" y="6" width="46" height="54" rx="5" fill="#567852" />
      <rect x="0" y="0" width="46" height="54" rx="5" fill="url(#mj-ivory)" stroke="#d9c8a9" stroke-width="1" />
      <rect x="5" y="5" width="36" height="44" rx="3" fill="#edf3e7" stroke="#7d9a76" stroke-width="1" />
      <rect x="8" y="8" width="11" height="10" rx="2" fill="#466a42" />
      <text x="13.5" y="15.5" fill="#f7f2e5" font-size="7.5" font-family="monospace" font-weight="700" text-anchor="middle">1</text>
      <!-- Tiny Pasture Patrol Cow -->
      <rect x="13" y="25" width="16" height="10" rx="2" fill="#fff8e7" stroke="#c8c2b2" stroke-width="0.6" />
      <rect x="16" y="25" width="6" height="5" fill="#3a423d" />
      <rect x="26" y="22" width="7.5" height="7.5" rx="1.5" fill="#fff8e7" stroke="#c8c2b2" stroke-width="0.6" />
      <rect x="31" y="25.5" width="4" height="3.5" rx="1" fill="#eda8a2" />
    </g>

    <!-- Upper stacked matching pair: Cow Tile Right (animated lift & glow) -->
    <g class="mj-match-b" transform="translate(208, 94)">
      <rect x="4" y="11" width="46" height="56" rx="5" fill="#0d100d" opacity="0.55" />
      <rect x="-2" y="-2" width="50" height="58" rx="6.5" stroke="#d9b45b" stroke-width="1.6" class="mj-glow" />
      <rect x="0" y="6" width="46" height="54" rx="5" fill="#567852" />
      <rect x="0" y="0" width="46" height="54" rx="5" fill="url(#mj-ivory)" stroke="#d9c8a9" stroke-width="1" />
      <rect x="5" y="5" width="36" height="44" rx="3" fill="#edf3e7" stroke="#7d9a76" stroke-width="1" />
      <rect x="8" y="8" width="11" height="10" rx="2" fill="#466a42" />
      <text x="13.5" y="15.5" fill="#f7f2e5" font-size="7.5" font-family="monospace" font-weight="700" text-anchor="middle">1</text>
      <!-- Tiny Pasture Patrol Cow -->
      <rect x="13" y="25" width="16" height="10" rx="2" fill="#fff8e7" stroke="#c8c2b2" stroke-width="0.6" />
      <rect x="16" y="25" width="6" height="5" fill="#3a423d" />
      <rect x="26" y="22" width="7.5" height="7.5" rx="1.5" fill="#fff8e7" stroke="#c8c2b2" stroke-width="0.6" />
      <rect x="31" y="25.5" width="4" height="3.5" rx="1" fill="#eda8a2" />
    </g>

    <!-- Match arc connecting the pair -->
    <path
      d="M154 114 Q180 90 206 114"
      stroke="#d9b45b"
      stroke-width="1.4"
      stroke-dasharray="3 3"
      class="mj-arc"
    />
  </g>
</svg>

<style>
  .mj-match-a {
    animation: mj-lift-a 3.4s ease-in-out infinite;
  }

  .mj-match-b {
    animation: mj-lift-b 3.4s ease-in-out infinite;
  }

  .mj-glow,
  .mj-arc {
    animation: mj-pulse 3.4s ease-in-out infinite;
  }

  :global(.project-card:hover) .mj-match-a,
  :global(.project-card:hover) .mj-match-b,
  :global(.project-card:hover) .mj-glow,
  :global(.project-card:hover) .mj-arc {
    animation-duration: 2s;
  }

  @keyframes mj-lift-a {
    0%, 100% {
      transform: translate(106px, 94px);
    }
    45%, 60% {
      transform: translate(106px, 86px);
    }
  }

  @keyframes mj-lift-b {
    0%, 100% {
      transform: translate(208px, 94px);
    }
    45%, 60% {
      transform: translate(208px, 86px);
    }
  }

  @keyframes mj-pulse {
    0%, 100% {
      opacity: 0.2;
    }
    45%, 60% {
      opacity: 0.95;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mj-match-a,
    .mj-match-b,
    .mj-glow,
    .mj-arc {
      animation: none !important;
    }
  }
</style>
