'use client';

import { motion } from 'framer-motion';
import { ArrowDown, Layers, Sigma, SplitSquareVertical, Target } from 'lucide-react';
import type { GuesstimateStep, StepType } from '@/lib/types';

const TYPE_META: Record<StepType, { label: string; icon: typeof Layers; className: string }> = {
  TOP_DOWN: { label: 'Top-Down', icon: Layers, className: 'bg-[#d3eefd] text-action-dark' },
  BOTTOM_UP: { label: 'Bottom-Up', icon: Layers, className: 'bg-[#e3f8cc] text-primary-dark' },
  SEGMENTATION: { label: 'Segmentation', icon: SplitSquareVertical, className: 'bg-[#f3e8ff] text-assumed-dark' },
  CALCULATION: { label: 'Calculation', icon: Sigma, className: 'bg-[#fff4cc] text-accent-dark' },
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
              className="w-full rounded-2xl border-2 border-surface-border bg-surface p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-extrabold text-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">
                    {step.stepNumber}
                  </span>
                  {step.stepTitle}
                </span>
                <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold uppercase ${meta.className}`}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {meta.label}
                </span>
              </div>
              <p className="font-mono text-sm text-text-muted">{step.calculation}</p>
              <p className="mt-1 text-lg font-extrabold text-primary-dark">{step.result}</p>
            </motion.div>
            {index < steps.length - 1 && (
              <ArrowDown className="my-1 h-5 w-5 shrink-0 text-surface-border" strokeWidth={2.5} />
            )}
          </div>
        );
      })}

      <ArrowDown className="mx-auto my-1 h-5 w-5 shrink-0 text-surface-border" strokeWidth={2.5} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: steps.length * 0.08 }}
        className="flex items-center gap-3 rounded-2xl border-b-4 border-accent-dark bg-accent p-4 text-white"
      >
        <Target className="h-6 w-6 shrink-0" strokeWidth={2.5} />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-90">Final Estimate</p>
          <p className="text-lg font-extrabold">{finalAnswer}</p>
        </div>
      </motion.div>
    </div>
  );
}
