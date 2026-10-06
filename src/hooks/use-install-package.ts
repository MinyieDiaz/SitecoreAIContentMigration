"use client";

import { useCallback } from "react";
import type { InstallDestination } from "@/lib/packages/installDestination";
import { useStepLoop } from "@/hooks/use-step-loop";
import { consumeResult, restartConsumeClocks, stepConsume } from "@/lib/consume";
import type { ChunkSetProgress, InstallPackageJob, PackageManifest } from "@/lib/types";

function createJob(manifest: PackageManifest): InstallPackageJob {
  return {
    jobId: crypto.randomUUID(),
    createdAt: Date.now(),
    manifest,
    status: "pending",
    chunkSets: manifest.chunkSets.map(
      (chunkSet): ChunkSetProgress => ({
        chunkSetId: chunkSet.chunkSetId,
        chunkCount: chunkSet.chunkCount,
        totalItemCount: chunkSet.totalItemCount,
        chunksTransferred: 0,
        completed: false,
        isMedia: chunkSet.isMedia,
      })
    ),
  };
}

function isJobComplete(job: InstallPackageJob): boolean {
  return job.status === "done" || job.status === "done-with-errors" || job.status === "failed";
}

// Scope/merge strategy were fixed on the source at generate time (baked into
// the archived chunks), so install only ever replays chunks/completes/
// consumes -- there is no createTransfer here at all, and no strategy picker.
export function useInstallPackage(
  destination: InstallDestination,
  getChunk: (chunkSetId: string, chunkId: number) => Uint8Array
) {
  const step = useCallback(
    async (job: InstallPackageJob): Promise<InstallPackageJob> => {
      const next: InstallPackageJob = { ...job, chunkSets: job.chunkSets ? [...job.chunkSets] : job.chunkSets };
      const transferId = next.manifest.transferId;

      try {
        switch (next.status) {
          case "pending":
            next.status = "transferring-chunks";
            break;

          case "transferring-chunks": {
            if (!next.chunkSets) throw new Error("Missing chunk set metadata");

            const pendingIndex = next.chunkSets.findIndex((chunkSet) => !chunkSet.completed);
            if (pendingIndex === -1) {
              next.status = "consuming";
              break;
            }
            const pending = next.chunkSets[pendingIndex];

            if (pending.chunksTransferred < pending.chunkCount) {
              const chunkId = pending.chunksTransferred;
              const bytes = getChunk(pending.chunkSetId, chunkId);
              await destination.saveChunk(transferId, pending.chunkSetId, chunkId, bytes, pending.isMedia ?? false);
              pending.chunksTransferred += 1;
              break;
            }

            const { blobName } = await destination.completeChunkSet(transferId, pending.chunkSetId);
            pending.blobName = blobName;
            pending.completed = true;
            if (next.chunkSets.every((chunkSet) => chunkSet.completed)) {
              next.status = "consuming";
            }
            break;
          }

          case "consuming": {
            if (!next.chunkSets) throw new Error("Missing chunk set metadata");
            if (await stepConsume(next.chunkSets, destination)) {
              const { status, error } = consumeResult(next.chunkSets);
              next.status = status;
              next.error = error;
            }
            break;
          }
        }
      } catch (error) {
        next.status = "failed";
        next.failedAt = job.status;
        next.error = error instanceof Error ? error.message : "Unknown error";
      }

      return next;
    },
    [destination, getChunk]
  );

  const { job, running, run, cancel } = useStepLoop<InstallPackageJob>(step, isJobComplete);

  const start = useCallback((manifest: PackageManifest) => run(createJob(manifest)), [run]);

  // Resume keeps every chunk already saved and continues from the failed step
  // -- the package's chunks are still in memory as long as the page is open.
  const canResume = Boolean(job?.failedAt);

  const resume = useCallback(() => {
    if (!job?.failedAt) return;
    run({
      ...job,
      status: job.failedAt,
      failedAt: undefined,
      error: undefined,
      chunkSets: restartConsumeClocks(job.chunkSets),
    });
  }, [job, run]);

  const startOver = useCallback(() => {
    if (job) run(createJob(job.manifest));
  }, [job, run]);

  return { job, running, start, canResume, resume, startOver, cancel };
}
