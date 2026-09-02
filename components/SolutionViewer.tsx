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
      <div className="shadow-card rounded-2xl bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 font-black text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e3f8cc] text-primary-dark">
            <Sigma className="h-4 w-4" strokeWidth={2.5} />
          </span>
          Core Equation
        </div>
        <p className="rounded-xl bg-background px-4 py-3 font-mono text-sm text-foreground">
          {guesstimate.coreEquation}
        </p>
      </div>

      <div>
        <h3 className="text-display mb-3 text-lg font-black text-foreground">Approach Flow</h3>
        <ProcessFlowTree steps={guesstimate.steps} finalAnswer={guesstimate.finalAnswer} />
      </div>

      <div>
        <h3 className="text-display mb-3 text-lg font-black text-foreground">Step-by-Step Breakdown</h3>
        <div className="flex flex-col gap-3">
          {guesstimate.steps.map((step) => {
            const expanded = expandedSteps.has(step.stepNumber);
            return (
              <div key={step.stepNumber} className="shadow-card overflow-hidden rounded-2xl bg-surface">
                <button
                  onClick={() => toggleStep(step.stepNumber)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 font-black text-foreground">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-xs text-white shadow-[0_2px_6px_-1px_hsl(96_100%_35%/0.5)]">
                      {step.stepNumber}
                    </span>
                    {step.stepTitle}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {expanded && (
                  <div className="animate-slide-up border-t border-surface-border px-4 py-4">
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
                          <span className="whitespace-nowrap font-black text-primary-dark sm:pl-4">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-[#eaf7fe] px-3 py-2">
                      <span className="font-mono text-xs text-text-muted">{step.calculation}</span>
                      <span className="font-black text-action-dark">{step.result}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shadow-card rounded-2xl bg-gradient-to-br from-[#f0fdf6] to-[#e3f8cc] p-5">
        <div className="mb-2 flex items-center gap-2 font-black text-factual-dark">
          <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
          Sanity Check
        </div>
        <p className="text-sm text-foreground">{guesstimate.sanityCheck}</p>
      </div>

      <div className="shadow-card rounded-2xl bg-gradient-to-br from-[#fffbf0] to-[#fff4cc] p-5">
        <div className="mb-2 flex items-center gap-2 font-black text-accent-dark">
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
