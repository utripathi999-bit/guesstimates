/** Pulls the `{ error }` message out of a failed API response, falling back if the body isn't JSON or has none. */
export async function extractApiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: { error?: string } = await res.json();
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}
