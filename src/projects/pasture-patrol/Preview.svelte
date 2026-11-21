<script lang="ts"></script>

<svg
  viewBox="0 0 360 225"
  class="h-full w-full select-none"
  fill="none"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="pp-beam" x1="180" y1="68" x2="180" y2="165" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9bb095" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#9bb095" stop-opacity="0.02" />
    </linearGradient>
    <linearGradient id="pp-meadow" x1="180" y1="104" x2="180" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2c352a" />
      <stop offset="100%" stop-color="#1e241d" />
    </linearGradient>
  </defs>

  <!-- Subtle starry dust -->
  <circle cx="52" cy="42" r="1.1" fill="#8a8f84" opacity="0.45" />
  <circle cx="98" cy="28" r="0.9" fill="#8a8f84" opacity="0.32" />
  <circle cx="272" cy="36" r="1.2" fill="#9f8665" opacity="0.45" />
  <circle cx="312" cy="64" r="0.9" fill="#8a8f84" opacity="0.35" />
  <circle cx="44" cy="96" r="0.8" fill="#8a8f84" opacity="0.28" />

  <!-- Isometric meadow slab -->
  <g transform="translate(0, 10)">
    <polygon points="180,104 306,154 180,204 54,154" fill="url(#pp-meadow)" stroke="#4c5a49" stroke-width="1" />
    <polygon points="54,154 180,204 180,213 54,163" fill="#23221d" />
    <polygon points="306,154 180,204 180,213 306,163" fill="#1a1a17" />

    <!-- Subtle pasture grid lines -->
    <path
      d="M117,129 L243,179 M148.5,116.5 L274.5,166.5 M85.5,141.5 L211.5,191.5 M243,129 L117,179 M211.5,116.5 L85.5,166.5 M274.5,141.5 L148.5,191.5"
      stroke="#7a8d76"
      stroke-opacity="0.14"
      stroke-width="0.9"
    />

    <!-- Suction ring on ground -->
    <ellipse
      cx="180"
      cy="154"
      rx="30"
      ry="13"
      stroke="#9bb095"
      stroke-opacity="0.55"
      stroke-width="1.2"
      class="pp-ring"
    />
    <ellipse cx="180" cy="154" rx="16" ry="7" fill="#111310" opacity="0.45" />

    <!-- Stylized tiny cows + rock -->
    <g transform="translate(120, 146)">
      <ellipse cx="7.5" cy="10.5" rx="6.5" ry="2.5" fill="#111310" opacity="0.45" />
      <rect x="1.5" y="2" width="11" height="7" rx="1.5" fill="#fff8e7" />
      <rect x="4" y="2" width="4.5" height="3.5" fill="#3a423d" />
      <rect x="10.5" y="0" width="5" height="5" rx="1" fill="#fff8e7" />
      <rect x="14" y="2.5" width="2.8" height="2.4" rx="0.8" fill="#eda8a2" />
    </g>

    <g transform="translate(226, 152)">
      <ellipse cx="7.5" cy="10.5" rx="6.5" ry="2.5" fill="#111310" opacity="0.45" />
      <rect x="2.5" y="2" width="11" height="7" rx="1.5" fill="#ffd8e5" />
      <rect x="6" y="2" width="4" height="3.5" fill="#e87fa8" />
      <rect x="0" y="0" width="5" height="5" rx="1" fill="#ffd8e5" />
      <rect x="-1.2" y="2.5" width="2.8" height="2.4" rx="0.8" fill="#f1ada6" />
    </g>

    <!-- Lifted cow inside tractor beam -->
    <g class="pp-lifted-cow" transform="translate(173, 124)">
      <rect x="1" y="2" width="11" height="7" rx="1.5" fill="#fff8e7" />
      <rect x="4" y="2" width="4.5" height="3.5" fill="#3a423d" />
      <rect x="10" y="0" width="5" height="5" rx="1" fill="#fff8e7" />
      <rect x="13.5" y="2.5" width="2.8" height="2.4" rx="0.8" fill="#eda8a2" />
    </g>

    <!-- Small hay bale & rock -->
    <g transform="translate(212, 127)">
      <ellipse cx="7" cy="9" rx="6" ry="2.6" fill="#111310" opacity="0.4" />
      <rect x="2" y="2" width="10" height="7" rx="3" fill="#9f8665" />
      <line x1="5" y1="2" x2="5" y2="9" stroke="#6f5c44" stroke-width="1" />
      <line x1="9" y1="2" x2="9" y2="9" stroke="#6f5c44" stroke-width="1" />
    </g>
    <polygon points="138,172 145,163 153,167 151,175 140,176" fill="#6d7675" />
  </g>

  <!-- Tractor beam -->
  <polygon points="169,75 191,75 210,164 150,164" fill="url(#pp-beam)" class="pp-beam-cone" />

  <!-- Hovering UFO -->
  <g class="pp-ufo" transform="translate(180, 66)">
    <ellipse cx="0" cy="6" rx="28" ry="8.5" fill="#394943" stroke="#6d8177" stroke-width="1" />
    <ellipse cx="0" cy="3" rx="31" ry="8" fill="#889b90" />
    <path d="M -15,2 A 15,14 0 0 1 15,2 Q 0,5.5 -15,2 Z" fill="#576f68" stroke="#99ada1" stroke-width="0.9" />
    <path d="M -9,-4 Q -4.5,-8.5 1.5,-7" stroke="#c7d4cc" stroke-width="2" stroke-linecap="round" opacity="0.45" />
    <line x1="0" y1="-12" x2="0" y2="-19" stroke="#6f8379" stroke-width="1.4" />
    <circle cx="0" cy="-20" r="2.2" fill="#a68b67" />
    <!-- Rim lights (muted ochre) -->
    <circle cx="-21" cy="3.5" r="1.7" fill="#c0a57c" />
    <circle cx="-10" cy="6.2" r="1.7" fill="#c0a57c" />
    <circle cx="0" cy="7" r="1.7" fill="#c0a57c" />
    <circle cx="10" cy="6.2" r="1.7" fill="#c0a57c" />
    <circle cx="21" cy="3.5" r="1.7" fill="#c0a57c" />
  </g>
</svg>

<style>
  .pp-ufo {
    animation: pp-hover 4.2s ease-in-out infinite;
  }

  .pp-lifted-cow {
    animation: pp-float 3.4s ease-in-out infinite;
  }

  .pp-beam-cone {
    animation: pp-beam-pulse 3.6s ease-in-out infinite;
  }

  .pp-ring {
    transform-origin: 180px 154px;
    animation: pp-ring-pulse 3.6s ease-in-out infinite;
  }

  :global(.project-card:hover) .pp-ufo,
  :global(.project-card:hover) .pp-beam-cone {
    animation-duration: 2.2s;
  }

  @keyframes pp-hover {
    0%, 100% {
      transform: translate(180px, 66px);
    }
    50% {
      transform: translate(180px, 60px);
    }
  }

  @keyframes pp-float {
    0%, 100% {
      transform: translate(173px, 126px) rotate(-2deg);
    }
    50% {
      transform: translate(173px, 114px) rotate(3deg);
    }
  }

  @keyframes pp-beam-pulse {
    0%, 100% {
      opacity: 0.65;
    }
    50% {
      opacity: 0.95;
    }
  }

  @keyframes pp-ring-pulse {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.85;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pp-ufo,
    .pp-lifted-cow,
    .pp-beam-cone,
    .pp-ring {
      animation: none !important;
    }
  }
</style>
