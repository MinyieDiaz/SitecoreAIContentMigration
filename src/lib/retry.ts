// Network-level and gateway failures worth retrying. "Failed to fetch" is the
// browser's own network error, which is also what a gateway timeout looks like
// from inside the Marketplace host (the error response carries no CORS headers,
// so the host's fetch can't read it).
const TRANSIENT_ERROR = /failed to fetch|network ?error|load failed|timed? ?out|\b(408|429|502|503|504)\b/i;

// The Marketplace SDK's own "[client SDK] Request timed out": the request
// already waited the full SDK timeout (see use-marketplace-client.ts), so one
// more try is worth it -- the source may have finished building the chunk in
// the meantime -- but several more would just stack up long waits.
const SDK_TIMEOUT_ERROR = /\[client SDK\] Request timed out/i;
const SDK_TIMEOUT_ATTEMPTS = 2;

export function isTransientError(error: unknown): boolean {
  return error instanceof Error && TRANSIENT_ERROR.test(error.message);
}

const DEFAULT_ATTEMPTS = 4;
const BASE_DELAY_MS = 2000;

// Only for calls that are safe to repeat (reads, and writes addressed by a
// fixed ID like saveChunk's chunkId). Waits 2s, 4s, 8s (+/-25% jitter) between
// attempts; a non-transient error is rethrown immediately.
export async function withRetry<T>(action: () => Promise<T>, attempts = DEFAULT_ATTEMPTS): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (!isTransientError(error)) throw error;
      const maxAttempts = SDK_TIMEOUT_ERROR.test((error as Error).message)
        ? Math.min(attempts, SDK_TIMEOUT_ATTEMPTS)
        : attempts;
      if (attempt >= maxAttempts) {
        (error as Error).message += ` (after ${attempt} attempts)`;
        throw error;
      }
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
