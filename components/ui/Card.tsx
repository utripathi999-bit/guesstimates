import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ interactive = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`shadow-card rounded-3xl bg-surface p-5 transition-all duration-200
        ${interactive ? 'cursor-pointer hover:-translate-y-1 hover:shadow-card-hover' : ''}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
