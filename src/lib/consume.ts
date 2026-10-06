import { UNCONFIRMED_DESTINATION_STATE } from "@/lib/sitecore/clientTransfer";
import type { ChunkSetProgress, ConsumeOutcome } from "@/lib/types";

// The destination half every job ends with -- the wizard's transfer job and
// Packages' install job both consume their completed chunk sets through this,
// whatever route reaches the destination (SDK bridge or credentialed server
// routes).
export interface ConsumeDriver {
  // sourceName is only recoverable on the credentialed path (from the raw
  // API's `location` header); the SDK's consumeFile exposes no response.
  consume(blobName: string): Promise<{ sourceName: string | null }>;
  // Absent when the destination can't report a blob's import status -- each
  // chunk set then ends "unconfirmed" as soon as its consume is accepted.
  pollConsumeOutcome?(
    blobName: string,
    consumeStartedAt: number
  ): Promise<{ state: string; outcome: ConsumeOutcome | null }>;
}

// One consuming step: requests the next chunk set's consume, or checks on the
// one already requested. Strictly one chunk set at a time -- the next consume
// isn't requested until the previous one reaches a terminal state. Returns
// true once every chunk set has an outcome.
export async function stepConsume(chunkSets: ChunkSetProgress[], driver: ConsumeDriver): Promise<boolean> {
  const pending = chunkSets.find((chunkSet) => !chunkSet.consumeOutcome);
  if (!pending) return true;
  if (!pending.blobName) throw new Error("Chunk set is missing its completed blob name");

  if (!pending.consumeRequested) {
    const { sourceName } = await driver.consume(pending.blobName);
    pending.consumeRequested = true;
    pending.consumeStartedAt = Date.now();
    pending.sourceName = sourceName;
    if (!driver.pollConsumeOutcome) {
      pending.destinationState = UNCONFIRMED_DESTINATION_STATE;
      pending.consumeOutcome = "unconfirmed";
    }
    return false;
  }

  if (!driver.pollConsumeOutcome) throw new Error("Destination can't report import status");
  const { state, outcome } = await driver.pollConsumeOutcome(
    pending.blobName,
    pending.consumeStartedAt ?? Date.now()
  );
  pending.destinationState = state;
  if (outcome) pending.consumeOutcome = outcome;
  return false;
}

// A chunk set that failed to import doesn't stop the remaining ones -- each is
// its own .raif -- but it does make the whole job "failed". Reported by part,
// not item path: chunk sets don't map to selected items.
export function consumeResult(chunkSets: ChunkSetProgress[]): {
  status: "done" | "done-with-errors" | "failed";
  error?: string;
} {
  const countWith = (outcome: ConsumeOutcome) =>
    chunkSets.filter((chunkSet) => chunkSet.consumeOutcome === outcome).length;

  const failed = countWith("error");
  if (failed) {
    return {
      status: "failed",
      error: `Destination failed to import ${failed} of ${chunkSets.length} part(s) — see the Explorer for details`,
    };
  }
  const partial = countWith("transferred-with-errors");
  if (partial) {
    return {
      status: "done-with-errors",
      error: `${partial} of ${chunkSets.length} part(s) imported with errors — see the Explorer's Transfers panel for details`,
    };
  }
  return { status: "done" };
}

export function hasUnconfirmedConsume(chunkSets: ChunkSetProgress[] | undefined): boolean {
  return Boolean(chunkSets?.some((chunkSet) => chunkSet.consumeOutcome === "unconfirmed"));
}

// On resume, restarts the wait clock of any consume still in flight, so a
// resumed status check isn't immediately over its time limit.
export function restartConsumeClocks(chunkSets: ChunkSetProgress[] | undefined): ChunkSetProgress[] | undefined {
  const now = Date.now();
  return chunkSets?.map((chunkSet) =>
    chunkSet.consumeRequested && !chunkSet.consumeOutcome ? { ...chunkSet, consumeStartedAt: now } : chunkSet
  );
}
