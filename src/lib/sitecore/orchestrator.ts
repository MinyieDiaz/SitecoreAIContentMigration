import { randomUUID } from "node:crypto";
import type { EnvironmentConnection } from "@/lib/session";
import type { SelectedItem, TransferJob } from "@/lib/types";
import * as contentTransfer from "./contentTransfer";
import * as itemTransfer from "./itemTransfer";

const DATABASE_NAME = "master";

// Single-process, in-memory job store. Fine for an internal tool running as one
// Next.js instance; a multi-instance deployment would need a shared store instead.
//
// Pinned to globalThis rather than plain module scope: in dev, Next.js can
// recompile/evict a route handler's module graph independently of others
// (on edits, or on-demand-entry eviction), which would otherwise reset this
// Map out from under an in-flight job -- see the identical fix in session.ts.
interface JobStoreGlobal {
  contentMigrationJobStore?: Map<string, TransferJob>;
}

const globalForJobs = globalThis as unknown as JobStoreGlobal;
const jobs = globalForJobs.contentMigrationJobStore ?? new Map<string, TransferJob>();
globalForJobs.contentMigrationJobStore = jobs;

export function createJob(selections: SelectedItem[]): TransferJob {
  const job: TransferJob = {
    jobId: randomUUID(),
    createdAt: Date.now(),
    items: selections,
    status: "pending",
  };
  jobs.set(job.jobId, job);
  return job;
}

export function getJob(jobId: string): TransferJob | undefined {
  return jobs.get(jobId);
}

export function isJobComplete(job: TransferJob): boolean {
  return job.status === "done" || job.status === "failed";
}

export function resetJob(job: TransferJob): TransferJob {
  job.status = "pending";
  job.error = undefined;
  job.sourceTransferId = undefined;
  job.chunkSets = undefined;
  return job;
}

// Advances the job by exactly one unit of work (one chunk, one chunk-set
// completion, one poll) so a single HTTP request never blocks on a whole
// migration. The caller polls this repeatedly until isJobComplete(job) is true.
export async function stepJob(
  job: TransferJob,
  source: EnvironmentConnection,
  destination: EnvironmentConnection
): Promise<TransferJob> {
  if (isJobComplete(job)) return job;

  try {
    switch (job.status) {
      case "pending":
        await stepPending(job, source);
        break;
      case "transferring-chunks":
        await stepTransferringChunks(job, source, destination);
        break;
      case "consuming":
        await stepConsuming(job, source, destination);
        break;
    }
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
  }

  return job;
}

async function stepPending(job: TransferJob, source: EnvironmentConnection): Promise<void> {
  const transferId = randomUUID();
  await contentTransfer.createTransfer(source.host, source.token, {
    transferId,
    database: DATABASE_NAME,
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
  job: TransferJob,
  source: EnvironmentConnection,
  destination: EnvironmentConnection
): Promise<void> {
  const transferId = job.sourceTransferId;
  if (!transferId) throw new Error("Missing source transfer ID");

  if (!job.chunkSets) {
    const status = await contentTransfer.getTransferStatus(source.host, source.token, transferId);
    // Chunk sets come back in the same order the DataTrees were submitted --
    // the API doesn't otherwise say which chunk set came from which item, so
    // that submission order is what index-aligns chunkSets[i] with items[i].
    job.chunkSets = status.chunkSets.map((chunkSet) => ({
      chunkSetId: chunkSet.chunkSetId,
      chunkCount: chunkSet.chunkCount,
      chunksTransferred: 0,
      completed: false,
    }));
    return;
  }

  const pendingChunkSet = job.chunkSets.find((chunkSet) => !chunkSet.completed);
  if (!pendingChunkSet) {
    job.status = "consuming";
    return;
  }

  if (pendingChunkSet.chunksTransferred < pendingChunkSet.chunkCount) {
    const chunkId = pendingChunkSet.chunksTransferred;
    const chunk = await contentTransfer.downloadChunk(
      source.host,
      source.token,
      transferId,
      pendingChunkSet.chunkSetId,
      chunkId
    );
    await contentTransfer.uploadChunk(
      destination.host,
      destination.token,
      transferId,
      pendingChunkSet.chunkSetId,
      chunkId,
      chunk.data
    );
    pendingChunkSet.chunksTransferred += 1;
    return;
  }

  const { contentTransferFileName } = await contentTransfer.completeChunkSet(
    destination.host,
    destination.token,
    transferId,
    pendingChunkSet.chunkSetId
  );
  pendingChunkSet.blobName = contentTransferFileName;
  pendingChunkSet.completed = true;

  if (job.chunkSets.every((chunkSet) => chunkSet.completed)) {
    job.status = "consuming";
  }
}

// Each chunk set produced its own .raif file, and each .raif file must be
// consumed as its own, independent Item Transfer operation -- there is no
// batched "consume everything at once" endpoint.
//
// The job does not poll the destination to confirm the consume actually
// finished: consumption is asynchronous, and in practice a small/fast transfer
// can 404 on GET /transfers/{id} indefinitely even after the item has visibly
// landed in the destination (the record appears to age out of that lookup
// faster than it can be confirmed). So "done" here means every item's consume
// request was accepted, not that the destination confirmed completion --
// actual outcome is tracked separately via the Explorer's Transfers/History
// panels, which the user can refresh on demand once enough time has passed.
async function stepConsuming(
  job: TransferJob,
  source: EnvironmentConnection,
  destination: EnvironmentConnection
): Promise<void> {
  if (!job.chunkSets) throw new Error("Missing chunk set metadata");

  const pendingChunkSet = job.chunkSets.find((chunkSet) => !chunkSet.destinationSourceName);
  if (!pendingChunkSet) {
    if (job.sourceTransferId) {
      await contentTransfer.deleteTransfer(source.host, source.token, job.sourceTransferId);
    }
    job.status = "done";
    return;
  }
  if (!pendingChunkSet.blobName) throw new Error("Chunk set is missing its completed blob name");

  const { sourceName } = await itemTransfer.startConsume(
    destination.host,
    destination.token,
    DATABASE_NAME,
    pendingChunkSet.blobName
  );
  pendingChunkSet.destinationSourceName = sourceName;
}
