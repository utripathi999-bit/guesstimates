interface ProgressProps {
  value: number; // 0-100
  className?: string;
  tone?: 'primary' | 'accent' | 'action';
}

const TONE_CLASSES: Record<NonNullable<ProgressProps['tone']>, string> = {
  primary: 'bg-gradient-to-r from-primary to-primary-dark',
  accent: 'bg-gradient-to-r from-accent to-accent-dark',
  action: 'bg-gradient-to-r from-action to-action-dark',
};

export function Progress({ value, className = '', tone = 'primary' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-3.5 w-full overflow-hidden rounded-full bg-surface-border/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${TONE_CLASSES[tone]}`}
        style={{ width: `${clamped}%` }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
