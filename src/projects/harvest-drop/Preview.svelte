<script lang="ts"></script>

<svg viewBox="0 0 360 225" class="h-full w-full select-none" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="hd-meadow" x1="180" y1="148" x2="180" y2="212" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2c352a" />
      <stop offset="100%" stop-color="#1e241d" />
    </linearGradient>
    <linearGradient id="hd-crate-back" x1="180" y1="54" x2="180" y2="188" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#35281e" />
      <stop offset="100%" stop-color="#453427" />
    </linearGradient>
    <linearGradient id="hd-glass" x1="110" y1="56" x2="250" y2="184" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#dcf0eb" stop-opacity="0.11" />
      <stop offset="45%" stop-color="#dcf0eb" stop-opacity="0.02" />
      <stop offset="100%" stop-color="#dcf0eb" stop-opacity="0.07" />
    </linearGradient>
  </defs>

  <!-- Subtle starry dust -->
  <circle cx="56" cy="40" r="1.1" fill="#8a8f84" opacity="0.4" />
  <circle cx="304" cy="34" r="1.2" fill="#9f8665" opacity="0.45" />
  <circle cx="288" cy="76" r="0.9" fill="#8a8f84" opacity="0.32" />
  <circle cx="70" cy="88" r="0.9" fill="#8a8f84" opacity="0.28" />

  <!-- Isometric meadow plinth under crate -->
  <g transform="translate(0, 4)">
    <polygon points="180,148 308,180 180,212 52,180" fill="url(#hd-meadow)" stroke="#4c5a49" stroke-width="1" />
    <polygon points="52,180 180,212 180,219 52,187" fill="#23221d" />
    <polygon points="308,180 180,212 180,219 308,187" fill="#1a1a17" />
    <ellipse cx="180" cy="182" rx="84" ry="13" fill="#10130f" opacity="0.52" />

    <!-- Subtle meadow grass tufts flanking crate -->
    <path d="M84,174 L80,164 M84,174 L88,165" stroke="#5b8444" stroke-width="1.8" stroke-linecap="round" />
    <path d="M276,174 L272,165 M276,174 L281,166" stroke="#5b8444" stroke-width="1.8" stroke-linecap="round" />
  </g>

  <!-- Wooden Orchard Crate Body -->
  <g transform="translate(0, 2)">
    <!-- Back tongue-and-groove interior -->
    <rect x="112" y="54" width="136" height="132" rx="3" fill="url(#hd-crate-back)" />
    <g stroke="#2a2018" stroke-width="1.2" opacity="0.7">
      <line x1="134" y1="56" x2="134" y2="184" />
      <line x1="157" y1="56" x2="157" y2="184" />
      <line x1="180" y1="56" x2="180" y2="184" />
      <line x1="203" y1="56" x2="203" y2="184" />
      <line x1="226" y1="56" x2="226" y2="184" />
    </g>

    <!-- Danger cord -->
    <line x1="114" y1="74" x2="246" y2="74" stroke="#e86b58" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.58" />

    <!-- Dashed aim guide & hovering Lemon -->
    <line x1="180" y1="30" x2="180" y2="112" stroke="#f4ecd0" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.34" />
    <g class="hd-drop" transform="translate(180, 28)">
      <ellipse cx="0" cy="0" rx="10" ry="7.5" fill="#f2d338" transform="rotate(-14)" />
      <circle cx="-10" cy="2.2" r="2.1" fill="#e6c428" />
      <circle cx="10" cy="-2.2" r="2.1" fill="#e6c428" />
      <path d="M-2,-7 L4,-11 L6,-6 Z" fill="#629e44" />
    </g>

    <!-- Packed Crops inside the crate -->
    <!-- Prize Pumpkin (bottom-left) -->
    <g transform="translate(143, 162)">
      <ellipse cx="0" cy="0" rx="26" ry="20" fill="#cf671e" />
      <ellipse cx="-8" cy="0" rx="13" ry="19.5" fill="#e07628" />
      <ellipse cx="8" cy="0" rx="13" ry="19.5" fill="#ea8638" />
      <ellipse cx="0" cy="0" rx="9" ry="20" fill="#e07628" />
      <rect x="-2.5" y="-25" width="5" height="7" rx="1.5" fill="#587342" transform="rotate(-14)" />
      <path d="M1,-21 L8,-24 L6,-18 Z" fill="#6ea052" />
    </g>

    <!-- Striped Watermelon (bottom-right) -->
    <g transform="translate(215, 164)">
      <ellipse cx="0" cy="0" rx="23" ry="18.5" fill="#266b34" />
      <path d="M-11,-17 Q-4,0 -11,17" stroke="#7bc257" stroke-width="3" stroke-linecap="round" />
      <path d="M0,-18.5 Q4,0 0,18.5" stroke="#7bc257" stroke-width="3" stroke-linecap="round" />
      <path d="M11,-17 Q17,0 11,17" stroke="#7bc257" stroke-width="3" stroke-linecap="round" />
      <rect x="-1.5" y="-22" width="3" height="5" rx="1" fill="#5d7341" transform="rotate(12)" />
    </g>

    <!-- Turnip (center tucked behind corn & apple) -->
    <g transform="translate(178, 144)">
      <circle cx="0" cy="0" r="11.5" fill="#f2ead6" />
      <path d="M-11.5,0 A11.5,11.5 0 0 1 11.5,0 Z" fill="#99499e" />
      <path d="M-3,-11 L-6,-20 M1,-11 L2,-21 M4,-10 L8,-18" stroke="#62a348" stroke-width="2.2" stroke-linecap="round" />
    </g>

    <!-- Orchard Apple (left) -->
    <g transform="translate(133, 130)">
      <circle cx="0" cy="0" r="13.5" fill="#cf453e" />
      <rect x="-1.5" y="-17.5" width="3" height="6" rx="1" fill="#6e4d32" />
      <ellipse cx="5" cy="-14.5" rx="5" ry="2.5" fill="#6ba64c" transform="rotate(-22 5 -14.5)" />
    </g>

    <!-- Sweet Corn (angled right) -->
    <g transform="translate(222, 127) rotate(-26)">
      <rect x="-8" y="-17" width="16" height="33" rx="8" fill="#f3c842" />
      <path d="M-9,4 Q-10,16 0,20 Q10,16 9,4 Q3,12 -9,4 Z" fill="#6ba14d" />
    </g>

    <!-- Matching Strawberry pair with golden merge spark between them! -->
    <g class="hd-merge-glow" transform="translate(180, 108)">
      <circle cx="0" cy="0" r="16" fill="#ffe469" opacity="0.2" />
      <path d="M-4,0 L4,0 M0,-4 L0,4" stroke="#ffe469" stroke-width="2" stroke-linecap="round" />
    </g>

    <g class="hd-pair-l" transform="translate(162, 109) rotate(12)">
      <path d="M-7,-5 C-8,2 -3,9 0,11 C3,9 8,2 7,-5 Z" fill="#d9383a" />
      <path d="M-6,-6 L0,-3.5 L6,-6 L3,-9 L-3,-9 Z" fill="#5da145" />
      <circle cx="-2.5" cy="0" r="0.8" fill="#f7d768" />
      <circle cx="2.5" cy="1" r="0.8" fill="#f7d768" />
    </g>

    <g class="hd-pair-r" transform="translate(198, 109) rotate(-12)">
      <path d="M-7,-5 C-8,2 -3,9 0,11 C3,9 8,2 7,-5 Z" fill="#d9383a" />
      <path d="M-6,-6 L0,-3.5 L6,-6 L3,-9 L-3,-9 Z" fill="#5da145" />
      <circle cx="-2.5" cy="1" r="0.8" fill="#f7d768" />
      <circle cx="2.5" cy="0" r="0.8" fill="#f7d768" />
    </g>

    <!-- Subtle glass pane sheen -->
    <rect x="112" y="54" width="136" height="130" fill="url(#hd-glass)" />
    <line x1="113" y1="55" x2="247" y2="55" stroke="#e6f7f2" stroke-opacity="0.28" stroke-width="1.2" />

    <!-- Outer crate timber frame & pewter corner brackets -->
    <rect x="103" y="50" width="9" height="138" rx="2" fill="#c78c52" stroke="#87562f" stroke-width="0.9" />
    <rect x="248" y="50" width="9" height="138" rx="2" fill="#c78c52" stroke="#87562f" stroke-width="0.9" />
    <rect x="101" y="48" width="13" height="6" rx="1.5" fill="#d9a162" />
    <rect x="246" y="48" width="13" height="6" rx="1.5" fill="#d9a162" />
    <rect x="101" y="182" width="158" height="10" rx="2" fill="#d9a162" stroke="#87562f" stroke-width="0.9" />

    <!-- Iron corner brackets -->
    <rect x="102" y="56" width="11" height="9" rx="1" fill="#525d58" />
    <rect x="247" y="56" width="11" height="9" rx="1" fill="#525d58" />
    <rect x="102" y="172" width="11" height="10" rx="1" fill="#525d58" />
    <rect x="247" y="172" width="11" height="10" rx="1" fill="#525d58" />
    <circle cx="107.5" cy="60.5" r="1.2" fill="#92a199" />
    <circle cx="252.5" cy="60.5" r="1.2" fill="#92a199" />
    <circle cx="107.5" cy="177" r="1.2" fill="#92a199" />
    <circle cx="252.5" cy="177" r="1.2" fill="#92a199" />
  </g>
</svg>

<style>
  .hd-drop {
    animation: hd-drop 2.4s ease-in-out infinite;
  }
  .hd-merge-glow {
    animation: hd-pulse 2.4s ease-in-out infinite;
  }
  .hd-pair-l {
    animation: hd-nudge-l 2.4s ease-in-out infinite;
  }
  .hd-pair-r {
    animation: hd-nudge-r 2.4s ease-in-out infinite;
  }

  :global(.project-card:hover) .hd-drop,
  :global(.project-card:hover) .hd-merge-glow,
  :global(.project-card:hover) .hd-pair-l,
  :global(.project-card:hover) .hd-pair-r {
    animation-duration: 1.3s;
  }

  @keyframes hd-drop {
    0%, 100% {
      transform: translate(180px, 26px);
    }
    50% {
      transform: translate(180px, 34px);
    }
  }
  @keyframes hd-pulse {
    0%, 100% {
      opacity: 0.4;
      transform: translate(180px, 108px) scale(0.85);
    }
    50% {
      opacity: 1;
      transform: translate(180px, 108px) scale(1.25);
    }
  }
  @keyframes hd-nudge-l {
    0%, 100% {
      transform: translate(161px, 109px) rotate(12deg);
    }
    50% {
      transform: translate(166px, 109px) rotate(16deg);
    }
  }
  @keyframes hd-nudge-r {
    0%, 100% {
      transform: translate(199px, 109px) rotate(-12deg);
    }
    50% {
      transform: translate(194px, 109px) rotate(-16deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hd-drop,
    .hd-merge-glow,
    .hd-pair-l,
    .hd-pair-r {
      animation: none !important;
    }
  }
</style>
