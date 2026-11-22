<script lang="ts"></script>

<svg viewBox="0 0 360 225" class="h-full w-full select-none" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="la-bg" x1="180" y1="26" x2="180" y2="198" gradientUnits="userSpaceOnUse">
      <stop stop-color="#252b23" />
      <stop offset="1" stop-color="#181c17" />
    </linearGradient>
  </defs>

  <rect x="40" y="28" width="280" height="168" rx="8" fill="url(#la-bg)" stroke="#4c5a49" stroke-width="1.2" />

  <!-- Specimen grid: 3x2 asset cards -->
  <!-- Card 1: Cow -->
  <g transform="translate(56 44)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <ellipse cx="38" cy="48" rx="18" ry="3.5" fill="#111410" opacity="0.6" />
    <g class="la-float">
      <rect x="24" y="26" width="22" height="14" rx="3" fill="#fff8e7" />
      <rect x="29" y="26" width="9" height="7" rx="1" fill="#3a423d" />
      <rect x="42" y="21" width="11" height="11" rx="2.5" fill="#fff8e7" />
      <rect x="50" y="27" width="6" height="5" rx="1.5" fill="#eda8a2" />
    </g>
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">01</text>
  </g>

  <!-- Card 2: Saucer -->
  <g transform="translate(142 44)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <ellipse cx="38" cy="48" rx="17" ry="3.5" fill="#111410" opacity="0.6" />
    <g class="la-float" style:animation-delay="0.4s">
      <ellipse cx="38" cy="34" rx="18" ry="6.5" fill="#88a89d" />
      <path d="M27 32 A11 11 0 0 1 49 32 Q38 35 27 32 Z" fill="#528a82" />
      <circle cx="30" cy="35" r="1.6" fill="#e6bf5e" />
      <circle cx="38" cy="36.5" r="1.6" fill="#e6bf5e" />
      <circle cx="46" cy="35" r="1.6" fill="#e6bf5e" />
    </g>
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">02</text>
  </g>

  <!-- Card 3: Pumpkin -->
  <g transform="translate(228 44)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <ellipse cx="38" cy="48" rx="15" ry="3.5" fill="#111410" opacity="0.6" />
    <g class="la-float" style:animation-delay="0.8s">
      <ellipse cx="38" cy="35" rx="14" ry="11" fill="#d97b38" />
      <ellipse cx="38" cy="35" rx="7" ry="11" fill="#e58c48" />
      <rect x="36" y="19" width="4" height="6" rx="1.2" fill="#567848" />
    </g>
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">03</text>
  </g>

  <!-- Card 4: Barn -->
  <g transform="translate(56 116)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <polygon points="38,16 54,28 54,48 22,48 22,28" fill="#b85349" />
    <polyline points="20,29 38,15 56,29" stroke="#d5d7cf" stroke-width="2" stroke-linecap="round" />
    <rect x="32" y="34" width="12" height="14" fill="#f2ead9" />
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">04</text>
  </g>

  <!-- Card 5: Corn -->
  <g transform="translate(142 116)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <ellipse cx="38" cy="34" rx="8" ry="15" fill="#e5b842" transform="rotate(-14 38 34)" />
    <path d="M29 41 Q38 48 48 40" stroke="#5b8449" stroke-width="4" stroke-linecap="round" />
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">05</text>
  </g>

  <!-- Card 6: Alien -->
  <g transform="translate(228 116)">
    <rect width="76" height="62" rx="5" fill="#1e231c" stroke="#3b4738" />
    <path d="M31 24 L27 17 M45 24 L49 17" stroke="#8fe08a" stroke-width="2.2" stroke-linecap="round" />
    <rect x="26" y="23" width="24" height="16" rx="7" fill="#67d964" />
    <rect x="30" y="37" width="16" height="10" rx="4" fill="#4fb85a" />
    <circle cx="33" cy="30" r="2.2" fill="#18261c" />
    <circle cx="43" cy="30" r="2.2" fill="#18261c" />
    <text x="8" y="13" fill="#8b9a84" font-size="7" font-family="monospace">06</text>
  </g>
</svg>

<style>
  .la-float {
    animation: la-bob 3.6s ease-in-out infinite;
  }

  :global(.project-card:hover) .la-float {
    animation-duration: 2.1s;
  }

  @keyframes la-bob {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2.5px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .la-float {
      animation: none !important;
    }
  }
</style>
