<script lang="ts"></script>

<svg
  viewBox="0 0 360 225"
  class="h-full w-full select-none"
  fill="none"
  aria-hidden="true"
>
  <!-- Stylized irregular board frame (4x3 cells scaled to 56px) -->
  <g transform="translate(68, 28)">
    <!-- Board background -->
    <rect x="0" y="0" width="224" height="168" rx="4" fill="#181a17" stroke="#3e423c" stroke-width="1.5" />

    <!-- Muted blueberry regions (desaturated indigo-slate) -->
    <path d="M0 0 H112 V56 H56 V112 H0 Z" fill="#232635" />
    <path d="M168 0 H224 V112 H168 Z" fill="#202331" />

    <!-- Muted cherry regions (desaturated clay-rose) -->
    <path d="M56 56 H168 V112 H112 V168 H56 Z" fill="#312227" />
    <path d="M112 112 H224 V168 H112 Z" fill="#2b1f23" />

    <!-- Unclaimed region bottom-left & top-middle -->
    <path d="M112 0 H168 V56 H112 Z" fill="#1c1e1a" />
    <path d="M0 112 H56 V168 H0 Z" fill="#1c1e1a" />

    <!-- Crisp region borders -->
    <path
      d="M112 0 V56 M168 0 V112 M56 56 H168 M56 56 V168 M0 112 H56 M112 112 H224 M112 112 V168"
      stroke="#4b5049"
      stroke-width="1.35"
      stroke-linecap="square"
    />

    <!-- Pie 1: Blueberry 2/3 (top-left) -->
    <g transform="translate(28, 28)">
      <circle r="15" fill="#161815" stroke="#545b68" stroke-width="1" />
      <path d="M0 0 L0 -15 A15 15 0 0 1 13 7.5 Z" fill="#68729c" stroke="#181a17" stroke-width="1" />
      <path d="M0 0 L13 7.5 A15 15 0 0 1 -13 7.5 Z" fill="#68729c" stroke="#181a17" stroke-width="1" />
      <circle r="17.5" stroke="#5b6175" stroke-width="1" opacity="0.65" />
    </g>

    <!-- Pie 2: Unclaimed 0/3 (top-center) -->
    <g transform="translate(140, 28)">
      <circle r="14" fill="#161815" stroke="#474c45" stroke-width="1" />
      <path d="M0 -14 V0 M0 0 L12 7 M0 0 L-12 7" stroke="#3c403a" stroke-width="0.9" />
    </g>

    <!-- Pie 3: Blueberry 2/2 FULL (right) -->
    <g transform="translate(196, 56)">
      <circle r="14.5" fill="#68729c" stroke="#181a17" stroke-width="1" />
      <line x1="0" y1="-14.5" x2="0" y2="14.5" stroke="#181a17" stroke-width="1" />
      <circle r="17.5" stroke="#7d88b4" stroke-width="1.6" />
    </g>

    <!-- Pie 4: Cherry 4/4 FULL / exploding center pie -->
    <g transform="translate(84, 84)">
      <circle r="16" fill="#9c5a67" stroke="#181a17" stroke-width="1" />
      <path d="M0 -16 V16 M-16 0 H16" stroke="#181a17" stroke-width="1" />
      <circle r="19" stroke="#b6727f" stroke-width="1.8" class="bm-ring" />
      <!-- Subtle radiating burst ticks -->
      <g class="bm-sparks" stroke="#b6727f" stroke-width="1.4" stroke-linecap="round">
        <line x1="0" y1="-23" x2="0" y2="-27" />
        <line x1="23" y1="0" x2="27" y2="0" />
        <line x1="0" y1="23" x2="0" y2="27" />
        <line x1="-23" y1="0" x2="-27" y2="0" />
        <line x1="16" y1="-16" x2="19" y2="-19" />
        <line x1="16" y1="16" x2="19" y2="19" />
        <line x1="-16" y1="16" x2="-19" y2="19" />
        <line x1="-16" y1="-16" x2="-19" y2="-19" />
      </g>
    </g>

    <!-- Flying cherry slice wedges toward neighbors -->
    <path
      d="M-4 -4 L5 0 L-4 4 Q-6 0 -4 -4 Z"
      fill="#b6727f"
      class="bm-wedge-right"
    />
    <path
      d="M-4 -4 L5 0 L-4 4 Q-6 0 -4 -4 Z"
      fill="#b6727f"
      class="bm-wedge-down"
    />

    <!-- Pie 5: Cherry 1/3 (bottom-right) -->
    <g transform="translate(168, 140)">
      <circle r="15" fill="#161815" stroke="#644a50" stroke-width="1" />
      <path d="M0 0 L0 -15 A15 15 0 0 1 13 7.5 Z" fill="#9c5a67" stroke="#181a17" stroke-width="1" />
      <path d="M0 0 L-13 7.5" stroke="#473a3d" stroke-width="0.9" />
      <circle r="17.5" stroke="#644a50" stroke-width="1" opacity="0.65" />
    </g>

    <!-- Pie 6: Unclaimed 0/2 (bottom-left) -->
    <g transform="translate(28, 140)">
      <circle r="13.5" fill="#161815" stroke="#474c45" stroke-width="1" />
      <line x1="0" y1="-13.5" x2="0" y2="13.5" stroke="#3c403a" stroke-width="0.9" />
    </g>
  </g>
</svg>

<style>
  .bm-ring {
    transform-origin: 0 0;
    animation: bm-pulse 3.2s ease-in-out infinite;
  }

  .bm-sparks {
    transform-origin: 0 0;
    animation: bm-spark 3.2s ease-out infinite;
  }

  .bm-wedge-right {
    animation: bm-fly-right 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .bm-wedge-down {
    animation: bm-fly-down 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  :global(.project-card:hover) .bm-ring,
  :global(.project-card:hover) .bm-sparks,
  :global(.project-card:hover) .bm-wedge-right,
  :global(.project-card:hover) .bm-wedge-down {
    animation-duration: 1.9s;
  }

  @keyframes bm-pulse {
    0%, 100% {
      opacity: 0.55;
      transform: scale(0.98);
    }
    45% {
      opacity: 1;
      transform: scale(1.06);
    }
  }

  @keyframes bm-spark {
    0%, 35% {
      opacity: 0;
      transform: scale(0.8);
    }
    55% {
      opacity: 0.85;
      transform: scale(1.04);
    }
    100% {
      opacity: 0;
      transform: scale(1.18);
    }
  }

  @keyframes bm-fly-right {
    0%, 35% {
      opacity: 0;
      transform: translate(84px, 84px) scale(0.7);
    }
    48% {
      opacity: 0.9;
    }
    85% {
      opacity: 0;
      transform: translate(152px, 128px) rotate(32deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(152px, 128px) rotate(32deg) scale(1);
    }
  }

  @keyframes bm-fly-down {
    0%, 35% {
      opacity: 0;
      transform: translate(84px, 84px) rotate(135deg) scale(0.7);
    }
    48% {
      opacity: 0.9;
    }
    85% {
      opacity: 0;
      transform: translate(34px, 134px) rotate(135deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(34px, 134px) rotate(135deg) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bm-ring,
    .bm-sparks,
    .bm-wedge-right,
    .bm-wedge-down {
      animation: none !important;
      opacity: 0;
    }
    .bm-ring {
      opacity: 0.75;
    }
  }
</style>
