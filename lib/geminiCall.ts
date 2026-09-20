import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * One place where the interviewer's short-form AI calls (clarify, hint,
 * feedback) actually reach Gemini.
 *
 * It exists because of a real outage: `gemini-3.5-flash-lite` started returning
 * 503 UNAVAILABLE — "this model is currently experiencing high demand" — and
 * took clarifying questions, hints and feedback down together for everyone.
 * A two-model chain wasn't enough: within the hour `gemini-3.5-flash` was
 * saturated too, so the fallback ran out and the feature died again.
 *
 * Hence a chain that spans model *generations* rather than just sizes. 3.5 and
 * 3.1 are served from different capacity pools, so congestion in one is not
 * congestion in the others — which is the whole point of a fallback. Ordered
 * cheapest-first: the lite models handle a two-sentence reply perfectly well,
 * and the larger ones are the safety net, not the default.
 */
const MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
] as const;

/** Raised when every model in the chain is out of capacity — a temporary, upstream condition. */
export class AllModelsBusyError extends Error {
  constructor(public readonly lastDetail: string) {
    super('Every model in the chain is at capacity');
    this.name = 'AllModelsBusyError';
  }
}

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
  /**
   * Defaults to enough room for a short reply. Generation needs far more —
   * a full case with steps and assumptions does not fit in a chat-sized budget.
   */
  maxOutputTokens?: number;
  /**
   * Lets the model look things up or run code before answering.
   *
   * Mutually exclusive with `responseSchema`: the API will not enforce a
   * response schema on a call that also has tools enabled, because the model
   * needs free turns to call them. Callers that pass tools therefore have to
   * ask for JSON in the prompt and parse it defensively — see parseLooseJson.
   */
  tools?: { googleSearch?: object; codeExecution?: object }[];
}

export interface InterviewerCallResult {
  raw: string;
  /** Which model actually answered — logged so a silent fallback is still visible. */
  model: string;
  /** False when tools were requested but the call had to fall back without them. */
  usedTools?: boolean;
}

/**
 * Runs the call down the model chain, returning the first success.
 *
 * Thinking is pinned to MINIMAL and the output budget left generous: Gemini 3.x
 * thinks by default and those tokens share the reply's budget, so a tight
 * ceiling can be spent before the JSON is closed. The prompts, not the ceiling,
 * are what keep these replies to a sentence or two.
 */
export async function callInterviewerModel(
  options: InterviewerCallOptions
): Promise<InterviewerCallResult> {
  try {
    return await runChain(options);
  } catch (error) {
    // Tool-enabled calls can fail for reasons a plain call would not — search
    // grounding and code execution carry their own quotas and availability, so
    // "every model refused" may mean "the tools are unavailable" rather than
    // "Gemini is full". A review without search is far weaker than one with it,
    // but it is enormously better than no review, so degrade rather than skip.
    if (error instanceof AllModelsBusyError && options.tools?.length) {
      console.warn('tools unavailable, retrying review without them:', error.lastDetail);
      const plain = await runChain({ ...options, tools: undefined });
      return { ...plain, usedTools: false };
    }
    throw error;
  }
}

async function runChain({
  systemInstruction,
  userMessage,
  responseSchema,
  temperature,
  maxOutputTokens = 2048,
  tools,
}: InterviewerCallOptions): Promise<InterviewerCallResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const usingTools = Boolean(tools?.length);
  let lastError: unknown;

  for (const model of MODEL_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction,
          // Schema-constrained output and tool use cannot both be on, so a
          // tool-using call asks for JSON in its prompt instead.
          ...(usingTools
            ? { tools }
            : { responseMimeType: 'application/json', responseSchema }),
          temperature,
          // Tool use needs room to think between calls; a minimal budget makes
          // the model skip the lookup it was given the tool for.
          thinkingConfig: { thinkingLevel: usingTools ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL },
          maxOutputTokens,
        },
      });

      const raw = response.text;
      if (!raw) {
        // Empty is not a capacity problem, so don't spend another model on it.
        throw new Error(
          `Empty response from ${model} (finishReason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`
        );
      }
      return { raw, model, usedTools: usingTools };
    } catch (error) {
      lastError = error;
      if (!isCapacityError(error)) throw error;
      console.warn(`${model} unavailable, falling through:`, error instanceof Error ? error.message : error);
    }
  }

  // Every model was busy. This is upstream and temporary, and the caller needs
  // to be able to say so rather than reporting a generic failure the student
  // will read as "the app is broken".
  throw new AllModelsBusyError(lastError instanceof Error ? lastError.message : String(lastError));
}

/**
 * Pulls a JSON object out of a reply that wasn't schema-constrained.
 *
 * Only needed for tool-using calls, where the API won't enforce a schema. The
 * model reliably produces the right shape when asked, but wraps it in prose or
 * a ```json fence often enough that trusting JSON.parse on the whole reply
 * would throw away good reviews over formatting.
 */
export function parseLooseJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1), raw];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}
