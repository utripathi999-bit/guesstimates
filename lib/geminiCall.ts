import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * One place where the interviewer's short-form AI calls (clarify, hint,
 * feedback) actually reach Gemini.
 *
 * It exists because of a real outage: `gemini-3.5-flash-lite` started returning
 * 503 UNAVAILABLE — "this model is currently experiencing high demand" — and
 * took clarifying questions, hints and feedback down together for everyone,
 * while question generation carried on fine because it runs on the larger
 * `gemini-3.5-flash`. A capacity problem on one model should degrade a feature,
 * not delete it, so a model being full now falls through to the next one.
 *
 * Ordered cheapest-first: flash-lite handles these one-paragraph replies well
 * and costs less, so it stays the default and flash is the safety net.
 */
const MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'] as const;

/**
 * Whether an error means "this model has no room right now" — the only class of
 * failure worth retrying elsewhere. A bad key or a malformed request will fail
 * identically on every model, so those propagate immediately rather than
 * burning another call to prove it.
 */
function isCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(message);
}

export interface InterviewerCallOptions {
  systemInstruction: string;
  userMessage: string;
  /** Gemini structured-output schema for the reply. */
  responseSchema: Record<string, unknown>;
  temperature: number;
}

export interface InterviewerCallResult {
  raw: string;
  /** Which model actually answered — logged so a silent fallback is still visible. */
  model: string;
}

/**
 * Runs the call down the model chain, returning the first success.
 *
 * Thinking is pinned to MINIMAL and the output budget left generous: Gemini 3.x
 * thinks by default and those tokens share the reply's budget, so a tight
 * ceiling can be spent before the JSON is closed. The prompts, not the ceiling,
 * are what keep these replies to a sentence or two.
 */
export async function callInterviewerModel({
  systemInstruction,
  userMessage,
  responseSchema,
  temperature,
}: InterviewerCallOptions): Promise<InterviewerCallResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: unknown;

  for (const model of MODEL_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          temperature,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          maxOutputTokens: 2048,
        },
      });

      const raw = response.text;
      if (!raw) {
        // Empty is not a capacity problem, so don't spend another model on it.
        throw new Error(
          `Empty response from ${model} (finishReason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`
        );
      }
      return { raw, model };
    } catch (error) {
      lastError = error;
      if (!isCapacityError(error)) throw error;
      console.warn(`${model} unavailable, falling through:`, error instanceof Error ? error.message : error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Every model in the chain was unavailable');
}
