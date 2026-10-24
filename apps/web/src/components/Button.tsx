import type { ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-diazo text-on-diazo enabled:hover:bg-diazo-strong',
  secondary: 'border border-rule bg-sheet text-graphite enabled:hover:border-lead',
  ghost: 'text-lead enabled:hover:bg-graphite/8 enabled:hover:text-graphite',
};

/** `icon` is a square button for a single icon; give it an `aria-label`. */
export type ButtonSize = 'default' | 'icon';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5',
  icon: 'size-9',
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
