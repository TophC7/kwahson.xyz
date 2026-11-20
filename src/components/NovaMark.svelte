<script lang="ts">
  let { size = 18 }: { size?: number } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
>
  <circle class="aura" cx="12" cy="12" r="8" />
  <path
    class="secondary-rays"
    d="M21 3 L18.9 7.5 L16.5 5.1 Z
       M21 21 L16.5 18.9 L18.9 16.5 Z
       M3 21 L5.1 16.5 L7.5 18.9 Z
       M3 3 L7.5 5.1 L5.1 7.5 Z"
  />
  <path
    class="primary-rays"
    d="M12 -2.6 L14.4 4.8 L9.6 4.8 Z
       M26.6 12 L19.2 14.4 L19.2 9.6 Z
       M12 26.6 L9.6 19.2 L14.4 19.2 Z
       M-2.6 12 L4.8 9.6 L4.8 14.4 Z"
  />
  <circle class="ring" cx="12" cy="12" r="8" stroke-width="2.5" />
  <circle class="core" cx="12" cy="12" r="3.5" />
</svg>

<style>
  svg {
    flex-shrink: 0;
    overflow: visible;
  }

  .aura {
    fill: var(--color-sage);
    fill-opacity: 0.24;
    transform-origin: 12px 12px;
    transform: scale(1.1);
    animation: nova-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .secondary-rays {
    fill: var(--color-sage);
    transform-origin: 12px 12px;
    animation: nova-spin 14s linear infinite reverse;
  }

  .primary-rays {
    fill: var(--color-sage-soft);
    transform-origin: 12px 12px;
    animation: nova-spin 9s linear infinite;
  }

  .ring {
    stroke: var(--color-sage-soft);
  }

  .core {
    fill: var(--color-ink);
  }

  @keyframes nova-pulse {
    50% {
      opacity: 0.48;
    }
  }

  @keyframes nova-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aura,
    .secondary-rays,
    .primary-rays {
      animation: none;
    }
  }
</style>
