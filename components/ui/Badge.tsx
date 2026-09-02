import { ReactNode } from 'react';

type BadgeTone = 'factual' | 'assumed' | 'primary' | 'accent' | 'action' | 'neutral' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  factual: 'bg-[#d1fae5] text-factual-dark ring-1 ring-inset ring-[#8fe4c4]',
  assumed: 'bg-[#f3e8ff] text-assumed-dark ring-1 ring-inset ring-[#d5b3fb]',
  primary: 'bg-[#e3f8cc] text-primary-dark ring-1 ring-inset ring-[#b9ea82]',
  accent: 'bg-[#fff4cc] text-accent-dark ring-1 ring-inset ring-[#ffdd7a]',
  action: 'bg-[#d3eefd] text-action-dark ring-1 ring-inset ring-[#94d4fa]',
  neutral: 'bg-[#ececec] text-[#5c5850] ring-1 ring-inset ring-[#d8d4c8]',
  danger: 'bg-[#ffe0e0] text-danger-dark ring-1 ring-inset ring-[#ffb3b3]',
};

export function Badge({ tone = 'neutral', children, className = '', icon }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
