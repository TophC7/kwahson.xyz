<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import Icon, { type IconData } from '../Icon.svelte';

  export type ButtonVariant = 'surface' | 'primary' | 'ghost' | 'danger';
  export type ButtonSize = 'sm' | 'md';

  type BaseProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    active?: boolean;
    icon?: IconData | Snippet;
    iconSize?: number;
    hideLabelOnMobile?: boolean;
    href?: string;
    ref?: HTMLButtonElement | HTMLAnchorElement;
    class?: string;
    children?: Snippet;
  };

  type Props = BaseProps &
    Omit<HTMLAnchorAttributes, keyof BaseProps | 'type'> &
    Omit<HTMLButtonAttributes, keyof BaseProps>;

  const VARIANTS: Record<ButtonVariant, string> = {
    surface: 'border-ink/12 bg-surface-raised text-ink hover:border-sage/45',
    primary: 'border-sage/55 bg-sage/24 text-ink hover:bg-sage/35',
    ghost:
      'border-transparent bg-transparent text-ink-muted hover:border-ink/12 hover:bg-surface-raised/70 hover:text-ink',
    danger: 'border-danger/55 bg-danger/20 text-danger-soft hover:bg-danger/32 hover:text-ink',
  };

  const SIZES: Record<ButtonSize, string> = {
    sm: 'min-h-8 min-w-8 gap-1.5 px-2.5 text-[11px]',
    md: 'min-h-9 min-w-9 gap-1.5 px-3 text-xs',
  };

  let {
    variant = 'surface',
    size = 'md',
    active,
    icon,
    iconSize,
    hideLabelOnMobile = false,
    href,
    type = 'button',
    ref = $bindable(),
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const resolvedIconSize = $derived(iconSize ?? (size === 'sm' ? 14 : 15));
  const activeClass = $derived(
    active && variant !== 'danger' ? 'border-sage/65 bg-sage/24 text-ink' : '',
  );
  const classes = $derived(
    `focus-ring inline-flex cursor-pointer items-center justify-center rounded-sm border font-mono transition-colors disabled:cursor-default disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${activeClass} ${className}`,
  );
</script>

{#snippet content()}
  {#if icon}
    {#if typeof icon === 'function'}
      {@render icon()}
    {:else}
      <Icon {icon} size={resolvedIconSize} strokeWidth={1.85} />
    {/if}
  {/if}
  {#if children}
    {#if hideLabelOnMobile}
      <span class="hidden sm:inline">{@render children()}</span>
    {:else}
      {@render children()}
    {/if}
  {/if}
{/snippet}

{#if href !== undefined}
  <a bind:this={ref} {href} class={classes} {...rest}>
    {@render content()}
  </a>
{:else}
  <button bind:this={ref} {type} aria-pressed={active} class={classes} {...rest}>
    {@render content()}
  </button>
{/if}
