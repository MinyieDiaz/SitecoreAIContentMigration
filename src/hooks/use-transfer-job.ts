"use client";

import { useCallback } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import * as clientTransfer from "@/lib/sitecore/clientTransfer";
import { useStepLoop } from "@/hooks/use-step-loop";
import { consumeResult, restartConsumeClocks, stepConsume } from "@/lib/consume";
import type { SelectedItem, TransferJob } from "@/lib/types";

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
    next.failedAt = job.status;
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

  const settled = await stepConsume(job.chunkSets, {
    consume: async (blobName) => {
      await clientTransfer.consumeFile(client, destinationContextId, blobName);
      return { sourceName: null };
    },
    pollConsumeOutcome: (blobName, consumeStartedAt) =>
      clientTransfer.pollConsumeOutcome(client, destinationContextId, blobName, consumeStartedAt),
  });
  if (!settled) return;

  if (job.sourceTransferId) {
    await clientTransfer.deleteTransfer(client, sourceContextId, job.sourceTransferId);
  }
  const { status, error } = consumeResult(job.chunkSets);
  job.status = status;
  job.error = error;
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

  // Resumable once the source transfer exists: chunks already copied, chunk
  // sets already completed, and imports already confirmed are kept. Wait
  // clocks restart so a resumed poll isn't immediately over its time limit.
  const canResume = Boolean(job?.failedAt && job.failedAt !== "pending" && job.sourceTransferId);

  const resume = useCallback(() => {
    if (!job?.failedAt || !canResume) return;
    run({
      ...job,
      status: job.failedAt,
      failedAt: undefined,
      error: undefined,
      preparingSince: job.failedAt === "preparing" ? Date.now() : job.preparingSince,
      chunkSets: restartConsumeClocks(job.chunkSets),
    });
  }, [job, canResume, run]);

  // Throws away all progress and creates a new source transfer. The old one is
  // deleted best-effort -- it's only cleanup, so a failure there is ignored.
  const startOver = useCallback(() => {
    if (!job) return;
    if (job.sourceTransferId) {
      clientTransfer.deleteTransfer(client, sourceContextId, job.sourceTransferId).catch(() => {});
    }
    run({
      ...job,
      status: "pending",
      error: undefined,
      failedAt: undefined,
      sourceTransferId: undefined,
      preparingSince: undefined,
      chunkSets: undefined,
    });
  }, [job, run, client, sourceContextId]);

  return { job, running, start, canResume, resume, startOver, cancel };
}
