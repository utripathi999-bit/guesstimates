interface ProgressProps {
  value: number; // 0-100
  className?: string;
  tone?: 'primary' | 'accent' | 'action';
}

const TONE_CLASSES: Record<NonNullable<ProgressProps['tone']>, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  action: 'bg-action',
};

export function Progress({ value, className = '', tone = 'primary' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-4 w-full overflow-hidden rounded-full bg-[#e5e5e5] ${className}`}>
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
