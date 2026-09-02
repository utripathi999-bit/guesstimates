'use client';

import { motion } from 'framer-motion';
import { ArrowDown, Layers, Sigma, SplitSquareVertical, Target } from 'lucide-react';
import type { GuesstimateStep, StepType } from '@/lib/types';

const TYPE_META: Record<StepType, { label: string; icon: typeof Layers; className: string }> = {
  TOP_DOWN: { label: 'Top-Down', icon: Layers, className: 'bg-[#d3eefd] text-action-dark ring-1 ring-inset ring-[#94d4fa]' },
  BOTTOM_UP: { label: 'Bottom-Up', icon: Layers, className: 'bg-[#e3f8cc] text-primary-dark ring-1 ring-inset ring-[#b9ea82]' },
  SEGMENTATION: {
    label: 'Segmentation',
    icon: SplitSquareVertical,
    className: 'bg-[#f3e8ff] text-assumed-dark ring-1 ring-inset ring-[#d5b3fb]',
  },
  CALCULATION: { label: 'Calculation', icon: Sigma, className: 'bg-[#fff4cc] text-accent-dark ring-1 ring-inset ring-[#ffdd7a]' },
};

interface ProcessFlowTreeProps {
  steps: GuesstimateStep[];
  finalAnswer: string;
}

export function ProcessFlowTree({ steps, finalAnswer }: ProcessFlowTreeProps) {
  return (
    <div className="flex flex-col items-stretch">
      {steps.map((step, index) => {
        const meta = TYPE_META[step.type];
        const Icon = meta.icon;
        return (
          <div key={step.stepNumber} className="flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="shadow-card w-full rounded-2xl bg-surface p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-black text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-xs text-white shadow-[0_2px_6px_-1px_hsl(96_100%_35%/0.5)]">
                    {step.stepNumber}
                  </span>
                  {step.stepTitle}
                </span>
                <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black uppercase ${meta.className}`}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {meta.label}
                </span>
              </div>
              <p className="rounded-lg bg-background px-3 py-2 font-mono text-sm text-text-muted">{step.calculation}</p>
              <p className="mt-2 text-lg font-black text-primary-dark">{step.result}</p>
            </motion.div>
            {index < steps.length - 1 && (
              <ArrowDown className="my-1 h-5 w-5 shrink-0 text-action" strokeWidth={2.5} />
            )}
          </div>
        );
      })}

      <ArrowDown className="mx-auto my-1 h-5 w-5 shrink-0 text-action" strokeWidth={2.5} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: steps.length * 0.08 }}
        className="flex items-center gap-3 rounded-2xl border-b-4 border-accent-dark bg-gradient-to-br from-accent to-accent-dark p-4 text-white shadow-[0_10px_24px_-8px_hsl(45_100%_45%/0.5)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Target className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide opacity-90">Final Estimate</p>
          <p className="text-lg font-black">{finalAnswer}</p>
        </div>
      </motion.div>
    </div>
  );
}
