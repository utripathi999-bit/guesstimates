'use client';

import { ChevronDown, CircleCheckBig, Lightbulb, ShieldCheck, Sigma } from 'lucide-react';
import { useState } from 'react';
import { ProcessFlowTree } from '@/components/ProcessFlowTree';
import { Badge } from '@/components/ui/Badge';
import type { Guesstimate } from '@/lib/types';

interface SolutionViewerProps {
  guesstimate: Guesstimate;
}

export function SolutionViewer({ guesstimate }: SolutionViewerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    () => new Set(guesstimate.steps.map((s) => s.stepNumber))
  );

  function toggleStep(stepNumber: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) next.delete(stepNumber);
      else next.add(stepNumber);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border-2 border-surface-border bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 font-extrabold text-foreground">
          <Sigma className="h-5 w-5 text-primary" strokeWidth={2.5} />
          Core Equation
        </div>
        <p className="rounded-xl bg-background px-4 py-3 font-mono text-sm text-foreground">
          {guesstimate.coreEquation}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-extrabold text-foreground">Approach Flow</h3>
        <ProcessFlowTree steps={guesstimate.steps} finalAnswer={guesstimate.finalAnswer} />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-extrabold text-foreground">Step-by-Step Breakdown</h3>
        <div className="flex flex-col gap-3">
          {guesstimate.steps.map((step) => {
            const expanded = expandedSteps.has(step.stepNumber);
            return (
              <div key={step.stepNumber} className="overflow-hidden rounded-2xl border-2 border-surface-border bg-surface">
                <button
                  onClick={() => toggleStep(step.stepNumber)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 font-extrabold text-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">
                      {step.stepNumber}
                    </span>
                    {step.stepTitle}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {expanded && (
                  <div className="animate-slide-up border-t-2 border-surface-border px-4 py-4">
                    {step.formula && (
                      <p className="mb-3 rounded-lg bg-background px-3 py-2 font-mono text-xs text-text-muted">
                        {step.formula}
                      </p>
                    )}
                    <ul className="flex flex-col gap-2">
                      {step.items.map((item, i) => (
                        <li key={i} className="flex flex-col gap-1 rounded-xl bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-foreground">{item.label}</span>
                              <Badge tone={item.isFactual ? 'factual' : 'assumed'}>
                                {item.isFactual ? 'Factual Anchor' : 'Estimated Assumption'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">{item.sourceOrLogic}</p>
                          </div>
                          <span className="whitespace-nowrap font-extrabold text-primary-dark sm:pl-4">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-[#f0f9ff] px-3 py-2">
                      <span className="font-mono text-xs text-text-muted">{step.calculation}</span>
                      <span className="font-extrabold text-action-dark">{step.result}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-[#bff3d1] bg-[#f0fdf6] p-5">
        <div className="mb-2 flex items-center gap-2 font-extrabold text-factual-dark">
          <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
          Sanity Check
        </div>
        <p className="text-sm text-foreground">{guesstimate.sanityCheck}</p>
      </div>

      <div className="rounded-2xl border-2 border-[#ffe9b3] bg-[#fffbf0] p-5">
        <div className="mb-2 flex items-center gap-2 font-extrabold text-accent-dark">
          <Lightbulb className="h-5 w-5" strokeWidth={2.5} />
          Interviewer Tips
        </div>
        <ul className="flex flex-col gap-2">
          {guesstimate.interviewerTips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-accent-dark" strokeWidth={2.5} />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
