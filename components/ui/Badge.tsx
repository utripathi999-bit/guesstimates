import { ReactNode } from 'react';

type BadgeTone = 'factual' | 'assumed' | 'primary' | 'accent' | 'action' | 'neutral' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  factual: 'bg-[#d1fae5] text-factual-dark',
  assumed: 'bg-[#f3e8ff] text-assumed-dark',
  primary: 'bg-[#e3f8cc] text-primary-dark',
  accent: 'bg-[#fff4cc] text-accent-dark',
  action: 'bg-[#d3eefd] text-action-dark',
  neutral: 'bg-[#ececec] text-[#5c5c5c]',
  danger: 'bg-[#ffe0e0] text-danger-dark',
};

export function Badge({ tone = 'neutral', children, className = '', icon }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
