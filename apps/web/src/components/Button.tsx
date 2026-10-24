import type { ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent enabled:hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink enabled:hover:bg-surface-muted',
  ghost: 'text-muted enabled:hover:bg-surface-muted enabled:hover:text-ink',
};

/** `icon` is a square button for a single icon; give it an `aria-label`. */
export type ButtonSize = 'default' | 'icon';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5',
  icon: 'size-8',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'default',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
