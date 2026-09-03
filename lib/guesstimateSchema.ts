import { Type } from '@google/genai';
import { z } from 'zod';

const CATEGORIES = ['Market Sizing', 'Volume Estimation', 'Revenue Estimation', 'Infrastructure & Operations'] as const;
const REGIONS = ['India', 'Global'] as const;
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;
const APPROACHES = ['Top-Down', 'Bottom-Up', 'Supply-Side', 'Demand-Side'] as const;
const STEP_TYPES = ['TOP_DOWN', 'BOTTOM_UP', 'SEGMENTATION', 'CALCULATION'] as const;

export const GuesstimateStepItemZ = z.object({
  label: z.string(),
  value: z.string(),
  isFactual: z.boolean(),
  sourceOrLogic: z.string(),
});

export const GuesstimateStepZ = z.object({
  stepNumber: z.number(),
  stepTitle: z.string(),
  type: z.enum(STEP_TYPES),
  formula: z.string().optional(),
  calculation: z.string(),
  result: z.string(),
  items: z.array(GuesstimateStepItemZ).min(1),
});

/**
 * The number the student must commit before the solution unlocks.
 *
 * Optional here because the bundled seed set predates it and states its answers
 * as prose ranges. Anything the model generates must include it — see
 * `guesstimateResponseSchema` below, where it is required.
 */
export const AnswerSpecZ = z.object({
  label: z.string().min(3),
  unit: z.string().min(1),
  value: z.number().positive().finite(),
});

export const GuesstimateZ = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(CATEGORIES),
  region: z.enum(REGIONS),
  difficulty: z.enum(DIFFICULTIES),
  approach: z.enum(APPROACHES),
  clarifyingQuestions: z.array(z.string()).min(1),
  keyAssumptions: z.array(z.string()).min(1),
  coreEquation: z.string(),
  steps: z.array(GuesstimateStepZ).min(2),
  finalAnswer: z.string(),
  answer: AnswerSpecZ.optional(),
  interviewerTips: z.array(z.string()).min(1),
  sanityCheck: z.string(),
});

export const DailyGuesstimatePairZ = z.array(GuesstimateZ).length(2);

export type GeneratedGuesstimate = z.infer<typeof GuesstimateZ>;

/**
 * Gemini structured-output schema mirroring GuesstimateZ above, expressed in
 * the @google/genai Type/Schema format for responseSchema-constrained generation.
 */
const stepItemSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    value: { type: Type.STRING },
    isFactual: { type: Type.BOOLEAN, description: 'true = verifiable factual anchor, false = educated assumption' },
    sourceOrLogic: { type: Type.STRING },
  },
  required: ['label', 'value', 'isFactual', 'sourceOrLogic'],
};

const stepSchema = {
  type: Type.OBJECT,
  properties: {
    stepNumber: { type: Type.INTEGER },
    stepTitle: { type: Type.STRING },
    type: { type: Type.STRING, enum: [...STEP_TYPES] },
    formula: { type: Type.STRING },
    calculation: { type: Type.STRING },
    result: { type: Type.STRING },
    items: { type: Type.ARRAY, items: stepItemSchema },
  },
  required: ['stepNumber', 'stepTitle', 'type', 'calculation', 'result', 'items'],
};

const answerSpecSchema = {
  type: Type.OBJECT,
  properties: {
    label: {
      type: Type.STRING,
      description:
        'The exact quantity the student must produce, naming the metric unambiguously, e.g. "Total annual revenue from gym memberships" — never just "the answer".',
    },
    unit: {
      type: Type.STRING,
      description:
        'The unit AND scale that number is in, e.g. "₹ crore per year", "million units per year", "cups per day". This is shown beside the input box, so it must remove any doubt about money vs volume.',
    },
    value: {
      type: Type.NUMBER,
      description: 'The worked answer as a plain number expressed in that unit. 4200 for "₹4,200 crore per year".',
    },
  },
  required: ['label', 'unit', 'value'],
};

export const guesstimateResponseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: 'kebab-case slug unique to this question' },
      title: { type: Type.STRING },
      category: { type: Type.STRING, enum: [...CATEGORIES] },
      region: { type: Type.STRING, enum: [...REGIONS] },
      difficulty: { type: Type.STRING, enum: [...DIFFICULTIES] },
      approach: { type: Type.STRING, enum: [...APPROACHES] },
      clarifyingQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      keyAssumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
      coreEquation: { type: Type.STRING },
      steps: { type: Type.ARRAY, items: stepSchema },
      finalAnswer: { type: Type.STRING },
      answer: answerSpecSchema,
      interviewerTips: { type: Type.ARRAY, items: { type: Type.STRING } },
      sanityCheck: { type: Type.STRING },
    },
    required: [
      'id', 'title', 'category', 'region', 'difficulty', 'approach',
      'clarifyingQuestions', 'keyAssumptions', 'coreEquation', 'steps',
      'finalAnswer', 'answer', 'interviewerTips', 'sanityCheck',
    ],
  },
};
