"use client";

import { useCallback } from "react";
import type { InstallDestination } from "@/lib/packages/installDestination";
import { useStepLoop } from "@/hooks/use-step-loop";
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
        chunksTransferred: 0,
        completed: false,
        isMedia: chunkSet.isMedia,
      })
    ),
  };
}

function isJobComplete(job: InstallPackageJob): boolean {
  return job.status === "done" || job.status === "failed";
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
            const pending = next.chunkSets.find((chunkSet) => !chunkSet.consumeRequested);
            if (!pending) {
              next.status = "done";
              break;
            }
            if (!pending.blobName) throw new Error("Chunk set is missing its completed blob name");

            const { sourceName } = await destination.consume(pending.blobName);
            pending.consumeRequested = true;
            pending.sourceName = sourceName;
            break;
          }
        }
      } catch (error) {
        next.status = "failed";
        next.error = error instanceof Error ? error.message : "Unknown error";
      }

      return next;
    },
    [destination, getChunk]
  );

  const { job, running, run, cancel } = useStepLoop<InstallPackageJob>(step, isJobComplete);

  const start = useCallback((manifest: PackageManifest) => run(createJob(manifest)), [run]);

  return { job, running, start, cancel };
}
