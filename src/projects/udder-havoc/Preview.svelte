<script lang="ts"></script>

<svg viewBox="0 0 360 225" class="h-full w-full select-none" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="uh-meadow" x1="180" y1="90" x2="180" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2c352a" />
      <stop offset="100%" stop-color="#1e241d" />
    </linearGradient>
    <linearGradient id="uh-beam" x1="148" y1="70" x2="148" y2="154" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9bb095" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#9bb095" stop-opacity="0.02" />
    </linearGradient>
  </defs>

  <g transform="translate(0, 8)">
    <polygon points="180,96 310,148 180,200 50,148" fill="url(#uh-meadow)" stroke="#4c5a49" stroke-width="1" />
    <polygon points="50,148 180,200 180,209 50,157" fill="#23221d" />
    <polygon points="310,148 180,200 180,209 310,157" fill="#1a1a17" />

    <!-- Suction ring on ground (matches Pasture Patrol) -->
    <ellipse
      cx="148"
      cy="146"
      rx="24"
      ry="10"
      stroke="#9bb095"
      stroke-opacity="0.55"
      stroke-width="1.2"
      class="uh-ring"
    />
    <ellipse cx="148" cy="146" rx="13" ry="5.5" fill="#111310" opacity="0.45" />

    <!-- Recoil dust puffs -->
    <g class="uh-dust" opacity="0.7">
      <circle cx="110" cy="162" r="5" fill="#d5d7cf" opacity="0.45" />
      <circle cx="99" cy="166" r="3.5" fill="#d5d7cf" opacity="0.35" />
    </g>

    <!-- Bazooka Cow (matches Moojong cow silhouette, no outline + corn on top) -->
    <g class="uh-cow" transform="translate(116, 134)">
      <ellipse cx="17" cy="24" rx="14" ry="4" fill="#111310" opacity="0.45" />
      <rect x="4" y="9" width="22" height="13" rx="2.5" fill="#fff8e7" />
      <rect x="8" y="9" width="8" height="6.5" fill="#3a423d" />
      <rect x="21" y="5" width="10" height="10" rx="2" fill="#fff8e7" />
      <rect x="28" y="10" width="5.5" height="4.5" rx="1.2" fill="#eda8a2" />
      <!-- Corn bazooka mounted cleanly on top -->
      <rect x="9" y="2" width="19" height="6" rx="3" fill="#f4cf47" />
      <path d="M 9,3 Q 14,1 16,5 Q 12,7 9,6 Z" fill="#6ba14d" />
    </g>

    <!-- Gold sight laser hitting alien visitor from Tactics preview -->
    <line x1="149" y1="140" x2="238" y2="122" stroke="#ffe469" stroke-width="2.5" stroke-linecap="round" class="uh-laser" />
    <circle cx="242" cy="121" r="10" fill="#ffe469" opacity="0.22" class="uh-pop" />

    <!-- Alien Visitor (matching Pasture Tactics Preview) -->
    <g transform="translate(226, 102)">
      <ellipse cx="17" cy="29" rx="12" ry="3" fill="#1b241a" opacity="0.45" />
      <path d="m12 14-3-5m13 5 3-5" stroke="#8fe08a" stroke-width="2.5" stroke-linecap="round" />
      <rect x="9" y="20" width="16" height="9" rx="4" fill="#4fb85a" />
      <rect x="6" y="12" width="22" height="13" rx="6" fill="#67d964" />
      <path d="m10 17 4 2m8-2-4 2" stroke="#18261c" stroke-width="2.5" stroke-linecap="round" />
    </g>
  </g>

  <!-- Tractor beam (matches Pasture Patrol) -->
  <polygon points="139,70 157,70 172,154 124,154" fill="url(#uh-beam)" class="uh-beam-cone" />

  <!-- Hovering UFO (matching Pasture Patrol Preview with proper dome) -->
  <g transform="translate(148, 62)" class="uh-ufo">
    <ellipse cx="0" cy="5.5" rx="23" ry="7" fill="#394943" stroke="#6d8177" stroke-width="0.9" />
    <ellipse cx="0" cy="3" rx="26" ry="6.8" fill="#889b90" />
    <path d="M -12.5,2 A 12.5,11.5 0 0 1 12.5,2 Q 0,5 -12.5,2 Z" fill="#576f68" stroke="#99ada1" stroke-width="0.85" />
    <path d="M -7.5,-3 Q -3.5,-7 1.5,-5.5" stroke="#c7d4cc" stroke-width="1.6" stroke-linecap="round" opacity="0.45" />
    <line x1="0" y1="-9.5" x2="0" y2="-15.5" stroke="#6f8379" stroke-width="1.2" />
    <circle cx="0" cy="-16.5" r="1.9" fill="#a68b67" />
    <circle cx="-17.5" cy="3.2" r="1.4" fill="#c0a57c" />
    <circle cx="-8.5" cy="5.5" r="1.4" fill="#c0a57c" />
    <circle cx="0" cy="6.2" r="1.4" fill="#c0a57c" />
    <circle cx="8.5" cy="5.5" r="1.4" fill="#c0a57c" />
    <circle cx="17.5" cy="3.2" r="1.4" fill="#c0a57c" />
  </g>
</svg>

<style>
  .uh-cow { animation: uh-recoil 2.4s ease-in-out infinite; }
  .uh-laser { animation: uh-flash 2.4s ease-in-out infinite; }
  .uh-ufo { animation: uh-hover 3.6s ease-in-out infinite; }
  .uh-beam-cone { animation: uh-beam-pulse 3.6s ease-in-out infinite; }
  .uh-ring { animation: uh-ring-pulse 3.6s ease-in-out infinite; }

  :global(.project-card:hover) .uh-cow,
  :global(.project-card:hover) .uh-laser {
    animation-duration: 1.4s;
  }

  :global(.project-card:hover) .uh-ufo,
  :global(.project-card:hover) .uh-beam-cone,
  :global(.project-card:hover) .uh-ring {
    animation-duration: 2.1s;
  }

  @keyframes uh-recoil {
    0%, 100% { transform: translate(120px, 134px); }
    35% { transform: translate(110px, 138px); }
    65% { transform: translate(120px, 134px); }
  }
  @keyframes uh-flash {
    0%, 20%, 100% { opacity: 0.35; }
    35% { opacity: 1; }
  }
  @keyframes uh-hover {
    0%, 100% { transform: translate(148px, 62px); }
    50% { transform: translate(148px, 57px); }
  }
  @keyframes uh-beam-pulse {
    0%, 100% { opacity: 0.65; }
    50% { opacity: 0.95; }
  }
  @keyframes uh-ring-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.85; }
  }
  @media (prefers-reduced-motion: reduce) {
    .uh-cow, .uh-laser, .uh-ufo, .uh-beam-cone, .uh-ring { animation: none !important; }
  }
</style>
