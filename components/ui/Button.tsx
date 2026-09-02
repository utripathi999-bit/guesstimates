import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'accent' | 'action' | 'danger' | 'neutral' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white border-primary-dark hover:brightness-105 disabled:bg-[#e5e5e5] disabled:border-[#d0d0d0] disabled:text-[#a0a0a0]',
  accent:
    'bg-accent text-white border-accent-dark hover:brightness-105 disabled:bg-[#e5e5e5] disabled:border-[#d0d0d0] disabled:text-[#a0a0a0]',
  action:
    'bg-action text-white border-action-dark hover:brightness-105 disabled:bg-[#e5e5e5] disabled:border-[#d0d0d0] disabled:text-[#a0a0a0]',
  danger:
    'bg-danger text-white border-danger-dark hover:brightness-105 disabled:bg-[#e5e5e5] disabled:border-[#d0d0d0] disabled:text-[#a0a0a0]',
  neutral:
    'bg-surface text-foreground border-surface-border hover:bg-[color-mix(in_srgb,var(--color-surface)_90%,black)]',
  ghost: 'bg-transparent text-foreground border-transparent hover:bg-black/5',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, disabled, ...props }, ref) => {
    const isFlat = variant === 'ghost';
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold uppercase tracking-wide transition-all select-none
          ${isFlat ? '' : 'border-b-4 active:border-b-0 active:translate-y-1'}
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
