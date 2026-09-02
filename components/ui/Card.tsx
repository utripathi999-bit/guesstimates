import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ interactive = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border-2 border-surface-border bg-surface p-5 transition-shadow
        ${interactive ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-transform' : ''}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
