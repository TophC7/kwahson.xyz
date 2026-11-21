<script lang="ts"></script>

<svg viewBox="0 0 360 225" class="h-full w-full select-none" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="cs-meadow" x1="180" y1="90" x2="180" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2c352a" />
      <stop offset="100%" stop-color="#1e241d" />
    </linearGradient>
  </defs>

  <g transform="translate(0, 6)">
    <!-- Pasture slab -->
    <polygon points="180,96 310,148 180,200 50,148" fill="url(#cs-meadow)" stroke="#4c5a49" stroke-width="1" />
    <polygon points="50,148 180,200 180,209 50,157" fill="#23221d" />
    <polygon points="310,148 180,200 180,209 310,157" fill="#1a1a17" />

    <!-- Farm crate divider forcing a bank shot -->
    <g transform="translate(166, 134)">
      <ellipse cx="13" cy="22" rx="12" ry="4" fill="#111310" opacity="0.4" />
      <rect x="4" y="5" width="18" height="17" rx="1.5" fill="#c88c52" />
      <rect x="6" y="4" width="3" height="19" fill="#f0cb85" />
      <rect x="17" y="4" width="3" height="19" fill="#f0cb85" />
      <line x1="5" y1="6" x2="21" y2="20" stroke="#f0cb85" stroke-width="2" />
    </g>

    <!-- Angled Tractor reflector (top-middle lane) -->
    <g transform="translate(172, 92) rotate(-18)">
      <ellipse cx="14" cy="22" rx="14" ry="4" fill="#111310" opacity="0.4" />
      <rect x="4" y="7" width="20" height="10" rx="2" fill="#5f8c52" />
      <rect x="8" y="2" width="10" height="7" rx="1.5" fill="#dde8e2" />
      <rect x="7" y="1" width="12" height="2.5" rx="1" fill="#5f8c52" />
      <circle cx="9" cy="17" r="4.5" fill="#343936" />
      <circle cx="9" cy="17" r="2" fill="#e8be58" />
      <circle cx="21" cy="18" r="3" fill="#343936" />
      <circle cx="21" cy="18" r="1.2" fill="#e8be58" />
    </g>

    <!-- Hay Bale bumper (right corner) -->
    <g transform="translate(242, 134)">
      <ellipse cx="13" cy="21" rx="13" ry="4" fill="#111310" opacity="0.4" />
      <rect x="2" y="5" width="22" height="14" rx="3" fill="#d6b15e" />
      <rect x="2" y="5" width="22" height="4" rx="2" fill="#e2c170" />
      <line x1="8" y1="5" x2="8" y2="19" stroke="#8f663a" stroke-width="1.6" />
      <line x1="18" y1="5" x2="18" y2="19" stroke="#8f663a" stroke-width="1.6" />
    </g>

    <!-- Glowing Bank-Shot Laser Sight (Cow -> Tractor -> Hay Bale -> Alien flank) -->
    <polyline
      points="126,141 186,108 249,142 214,158"
      stroke="#ffe469"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="cs-beam"
    />
    <circle cx="186" cy="108" r="3.2" fill="#ffe469" class="cs-spark" />
    <circle cx="249" cy="142" r="3.2" fill="#ffe469" class="cs-spark" />
    <circle cx="214" cy="158" r="9" fill="#ffe469" opacity="0.24" class="cs-lock" />

    <!-- Bazooka Cow (matches Udder Havoc / Moojong silhouette + corn on top) -->
    <g transform="translate(92, 131)">
      <ellipse cx="17" cy="24" rx="14" ry="4" fill="#111310" opacity="0.45" />
      <rect x="4" y="9" width="22" height="13" rx="2.5" fill="#fff8e7" />
      <rect x="8" y="9" width="8" height="6.5" fill="#3a423d" />
      <rect x="21" y="5" width="10" height="10" rx="2" fill="#fff8e7" />
      <rect x="28" y="10" width="5.5" height="4.5" rx="1.2" fill="#eda8a2" />
      <rect x="9" y="2" width="19" height="6" rx="3" fill="#f4cf47" />
      <path d="M 9,3 Q 14,1 16,5 Q 12,7 9,6 Z" fill="#6ba14d" />
    </g>

    <!-- Shielded Alien Visitor (shield facing left toward cow, hit from right flank bounce) -->
    <g transform="translate(198, 141)">
      <ellipse cx="17" cy="29" rx="12" ry="3" fill="#1b241a" opacity="0.45" />
      <!-- Curved mint shield arc facing left -->
      <path d="M 4,8 Q -4,19 4,29" stroke="#8ff5cb" stroke-width="2.6" stroke-linecap="round" opacity="0.88" />
      <path d="m12 14-3-5m13 5 3-5" stroke="#8fe08a" stroke-width="2.5" stroke-linecap="round" />
      <rect x="9" y="20" width="16" height="9" rx="4" fill="#4fb85a" />
      <rect x="6" y="12" width="22" height="13" rx="6" fill="#67d964" />
      <path d="m10 17 4 2m8-2-4 2" stroke="#18261c" stroke-width="2.5" stroke-linecap="round" />
    </g>
  </g>
</svg>

<style>
  .cs-beam {
    stroke-dasharray: 260;
    animation: cs-trace 2.8s ease-in-out infinite;
  }
  .cs-lock {
    animation: cs-pulse 2.8s ease-in-out infinite;
  }
  .cs-spark {
    animation: cs-pulse 2.8s ease-in-out infinite;
  }

  :global(.project-card:hover) .cs-beam,
  :global(.project-card:hover) .cs-lock,
  :global(.project-card:hover) .cs-spark {
    animation-duration: 1.6s;
  }

  @keyframes cs-trace {
    0%, 15% {
      opacity: 0.42;
      stroke-dashoffset: 60;
    }
    45%, 80% {
      opacity: 1;
      stroke-dashoffset: 0;
    }
    100% {
      opacity: 0.42;
      stroke-dashoffset: 60;
    }
  }
  @keyframes cs-pulse {
    0%, 25%, 100% {
      opacity: 0.25;
      transform: scale(0.92);
    }
    55% {
      opacity: 0.95;
      transform: scale(1.06);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cs-beam,
    .cs-lock,
    .cs-spark {
      animation: none !important;
    }
  }
</style>
