"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import * as clientTransfer from "@/lib/sitecore/clientTransfer";
import type { ChunkSetProgress, SelectedItem, TransferJob } from "@/lib/types";

function createJob(selections: SelectedItem[]): TransferJob {
  return {
    jobId: crypto.randomUUID(),
    createdAt: Date.now(),
    items: selections,
    status: "pending",
  };
}

function isJobComplete(job: TransferJob): boolean {
  return job.status === "done" || job.status === "failed";
}

// Advances the job by exactly one unit of work (one chunk, one chunk-set
// completion, one poll), mirroring the step-per-call shape the old server-side
// orchestrator used -- kept the same even though there's no longer an HTTP
// request to keep short, since it makes progress observable between renders.
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

  if (!job.chunkSets) {
    const status = await clientTransfer.getTransferStatus(client, sourceContextId, transferId);
    job.chunkSets = status.chunkSets.map(
      (chunkSet): ChunkSetProgress => ({
        chunkSetId: chunkSet.chunkSetId,
        chunkCount: chunkSet.chunkCount,
        chunksTransferred: 0,
        completed: false,
      })
    );
    return;
  }

  const pendingChunkSet = job.chunkSets.find((chunkSet) => !chunkSet.completed);
  if (!pendingChunkSet) {
    job.status = "consuming";
    return;
  }

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
      chunk
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

  const pendingChunkSet = job.chunkSets.find((chunkSet) => !chunkSet.consumeRequested);
  if (!pendingChunkSet) {
    if (job.sourceTransferId) {
      await clientTransfer.deleteTransfer(client, sourceContextId, job.sourceTransferId);
    }
    job.status = "done";
    return;
  }
  if (!pendingChunkSet.blobName) throw new Error("Chunk set is missing its completed blob name");

  await clientTransfer.consumeFile(client, destinationContextId, pendingChunkSet.blobName);
  pendingChunkSet.consumeRequested = true;
}

export function useTransferJob(client: ClientSDK, sourceContextId: string, destinationContextId: string) {
  const [job, setJob] = useState<TransferJob | null>(null);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    []
  );

  const runLoop = useCallback(
    async (initialJob: TransferJob) => {
      cancelledRef.current = false;
      setRunning(true);
      try {
        let current = initialJob;
        while (!cancelledRef.current && !isJobComplete(current)) {
          current = await stepJob(client, current, sourceContextId, destinationContextId);
          setJob(current);
        }
      } finally {
        setRunning(false);
      }
    },
    [client, sourceContextId, destinationContextId]
  );

  const start = useCallback(
    (selections: SelectedItem[]) => {
      const newJob = createJob(selections);
      setJob(newJob);
      runLoop(newJob);
    },
    [runLoop]
  );

  const retry = useCallback(() => {
    if (!job) return;
    const resetJob: TransferJob = {
      ...job,
      status: "pending",
      error: undefined,
      sourceTransferId: undefined,
      chunkSets: undefined,
    };
    setJob(resetJob);
    runLoop(resetJob);
  }, [job, runLoop]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return { job, running, start, retry, cancel };
}
