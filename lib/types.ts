export type GuesstimateCategory =
  | 'Market Sizing'
  | 'Volume Estimation'
  | 'Revenue Estimation'
  | 'Infrastructure & Operations';

export type GuesstimateRegion = 'India' | 'Global';

export type GuesstimateDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type GuesstimateApproach = 'Top-Down' | 'Bottom-Up' | 'Supply-Side' | 'Demand-Side';

export type StepType = 'TOP_DOWN' | 'BOTTOM_UP' | 'SEGMENTATION' | 'CALCULATION';

export interface GuesstimateStepItem {
  label: string;
  value: string;
  isFactual: boolean; // TRUE = Factual anchor; FALSE = Educated estimate
  sourceOrLogic: string;
}

export interface GuesstimateStep {
  stepNumber: number;
  stepTitle: string;
  type: StepType;
  formula?: string;
  calculation: string;
  result: string;
  items: GuesstimateStepItem[];
}

export interface Guesstimate {
  id: string;
  title: string;
  category: GuesstimateCategory;
  region: GuesstimateRegion;
  difficulty: GuesstimateDifficulty;
  approach: GuesstimateApproach;
  clarifyingQuestions: string[];
  keyAssumptions: string[];
  coreEquation: string;
  steps: GuesstimateStep[];
  finalAnswer: string;
  interviewerTips: string[];
  sanityCheck: string;
}

export type FactCategory = 'Demographics' | 'Digital & Tech' | 'Urban & Mobility' | 'Retail & Economy';

export interface FactFlashcard {
  id: string;
  metric: string;
  value: string;
  region: 'India' | 'Global';
  category: FactCategory;
  contextSnippet: string;
}

export type QuestionStatus = 'Unsolved' | 'In Progress' | 'Completed';

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null; // YYYY-MM-DD
  totalCompleted: number;
  xp: number;
  freezesAvailable: number;
  freezesUsedDates: string[];
  completedQuestionIds: string[];
  /** Every question ever opened — attempt points are awarded once per id. */
  attemptedQuestionIds: string[];
  bookmarkedIds: string[];
  inProgressIds: string[];
  scratchpadNotes: Record<string, string>;
  flashcardMastery: Record<string, 'known' | 'revision'>;
  dailyCompletionDates: string[]; // dates where both daily questions were completed
}
