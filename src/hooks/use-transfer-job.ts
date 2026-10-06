"use client";

import { useCallback } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import * as clientTransfer from "@/lib/sitecore/clientTransfer";
import { useStepLoop } from "@/hooks/use-step-loop";
import type { ConsumeOutcome, SelectedItem, TransferJob } from "@/lib/types";

function createJob(selections: SelectedItem[]): TransferJob {
  return {
    jobId: crypto.randomUUID(),
    createdAt: Date.now(),
    items: selections,
    status: "pending",
  };
}

function isJobComplete(job: TransferJob): boolean {
  return job.status === "done" || job.status === "done-with-errors" || job.status === "failed";
}

// Advances the job by exactly one unit of work (one source-readiness poll, one
// chunk, one chunk-set completion, one consume request, one consume-status
// poll), mirroring the step-per-call shape the old server-side orchestrator
// used -- kept the same even though there's no longer an HTTP request to keep
// short, since it makes progress observable between renders.
async function stepJob(
  client: ClientSDK,
  job: TransferJob,
  sourceContextId: string,
  destinationContextId: string
): Promise<TransferJob> {
  if (isJobComplete(job)) return job;

  const next: TransferJob = { ...job, chunkSets: job.chunkSets ? [...job.chunkSets] : job.chunkSets };

  try {
    switch (next.status) {
      case "pending":
        await stepPending(client, next, sourceContextId);
        break;
      case "preparing":
        await stepPreparing(client, next, sourceContextId);
        break;
      case "transferring-chunks":
        await stepTransferringChunks(client, next, sourceContextId, destinationContextId);
        break;
      case "consuming":
        await stepConsuming(client, next, sourceContextId, destinationContextId);
        break;
    }
  } catch (error) {
    next.status = "failed";
    next.error = error instanceof Error ? error.message : "Unknown error";
  }

  return next;
}

async function stepPending(client: ClientSDK, job: TransferJob, sourceContextId: string): Promise<void> {
  const transferId = crypto.randomUUID();
  await clientTransfer.createTransfer(client, sourceContextId, {
    transferId,
    dataTrees: job.items.map((item) => ({
      itemPath: item.path,
      scope: item.scope,
      mergeStrategy: item.mergeStrategy,
    })),
  });
  job.sourceTransferId = transferId;
  job.preparingSince = Date.now();
  job.status = "preparing";
}

async function stepPreparing(client: ClientSDK, job: TransferJob, sourceContextId: string): Promise<void> {
  const transferId = job.sourceTransferId;
  if (!transferId) throw new Error("Missing source transfer ID");

  const chunkSets = await clientTransfer.pollPreparedChunkSets(
    client,
    sourceContextId,
    transferId,
    job.items.map((item) => item.path),
    job.preparingSince ?? Date.now()
  );
  if (!chunkSets) return;
  job.chunkSets = chunkSets;
  job.status = "transferring-chunks";
}

async function stepTransferringChunks(
  client: ClientSDK,
  job: TransferJob,
  sourceContextId: string,
  destinationContextId: string
): Promise<void> {
  const transferId = job.sourceTransferId;
  if (!transferId) throw new Error("Missing source transfer ID");
  if (!job.chunkSets) throw new Error("Missing chunk set metadata");

  const pendingChunkSetIndex = job.chunkSets.findIndex((chunkSet) => !chunkSet.completed);
  if (pendingChunkSetIndex === -1) {
    job.status = "consuming";
    return;
  }
  const pendingChunkSet = job.chunkSets[pendingChunkSetIndex];

  if (pendingChunkSet.chunksTransferred < pendingChunkSet.chunkCount) {
    const chunkId = pendingChunkSet.chunksTransferred;
    const chunk = await clientTransfer.getChunk(
      client,
      sourceContextId,
      transferId,
      pendingChunkSet.chunkSetId,
      chunkId
    );
    await clientTransfer.saveChunk(
      client,
      destinationContextId,
      transferId,
      pendingChunkSet.chunkSetId,
      chunkId,
      chunk,
      pendingChunkSet.isMedia ?? false
    );
    pendingChunkSet.chunksTransferred += 1;
    return;
  }

  const { contentTransferFileName } = await clientTransfer.completeChunkSet(
    client,
    destinationContextId,
    transferId,
    pendingChunkSet.chunkSetId
  );
  pendingChunkSet.blobName = contentTransferFileName;
  pendingChunkSet.completed = true;

  if (job.chunkSets.every((chunkSet) => chunkSet.completed)) {
    job.status = "consuming";
  }
}

async function stepConsuming(
  client: ClientSDK,
  job: TransferJob,
  sourceContextId: string,
  destinationContextId: string
): Promise<void> {
  if (!job.chunkSets) throw new Error("Missing chunk set metadata");

  // Strictly one chunk set at a time, in the order the source returned them:
  // the next consume is only requested once the previous one reached a
  // terminal state.
  const pendingIndex = job.chunkSets.findIndex((chunkSet) => !chunkSet.consumeOutcome);
  if (pendingIndex === -1) {
    if (job.sourceTransferId) {
      await clientTransfer.deleteTransfer(client, sourceContextId, job.sourceTransferId);
    }
    finishJob(job);
    return;
  }
  const pendingChunkSet = job.chunkSets[pendingIndex];
  if (!pendingChunkSet.blobName) throw new Error("Chunk set is missing its completed blob name");

  if (!pendingChunkSet.consumeRequested) {
    await clientTransfer.consumeFile(client, destinationContextId, pendingChunkSet.blobName);
    pendingChunkSet.consumeRequested = true;
    pendingChunkSet.consumeStartedAt = Date.now();
    return;
  }

  const { state, outcome } = await clientTransfer.pollConsumeOutcome(
    client,
    destinationContextId,
    pendingChunkSet.blobName,
    pendingChunkSet.consumeStartedAt ?? Date.now()
  );
  pendingChunkSet.destinationState = state;
  if (outcome) pendingChunkSet.consumeOutcome = outcome;
}

// A part (chunk set) that failed to import doesn't stop the remaining ones --
// each is its own .raif -- but it does make the whole job "failed". Reported
// by part, not item path: chunk sets don't map to selected items.
function finishJob(job: TransferJob): void {
  const chunkSets = job.chunkSets ?? [];
  const countWith = (outcome: ConsumeOutcome) =>
    chunkSets.filter((chunkSet) => chunkSet.consumeOutcome === outcome).length;

  const failed = countWith("error");
  const partial = countWith("transferred-with-errors");
  if (failed) {
    job.status = "failed";
    job.error = `Destination failed to import ${failed} of ${chunkSets.length} part(s) — see the Explorer for details`;
  } else if (partial) {
    job.status = "done-with-errors";
    job.error = `${partial} of ${chunkSets.length} part(s) imported with errors — see the Explorer's Transfers panel for details`;
  } else {
    job.status = "done";
  }
}

export function useTransferJob(client: ClientSDK, sourceContextId: string, destinationContextId: string) {
  const step = useCallback(
    (job: TransferJob) => stepJob(client, job, sourceContextId, destinationContextId),
    [client, sourceContextId, destinationContextId]
  );
  const { job, running, run, cancel } = useStepLoop<TransferJob>(step, isJobComplete);

  const start = useCallback(
    (selections: SelectedItem[]) => run(createJob(selections)),
    [run]
  );

  const retry = useCallback(() => {
    if (!job) return;
    run({
      ...job,
      status: "pending",
      error: undefined,
      sourceTransferId: undefined,
      preparingSince: undefined,
      chunkSets: undefined,
    });
  }, [job, run]);

  return { job, running, start, retry, cancel };
}
