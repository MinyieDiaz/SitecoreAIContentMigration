"use client";

import { useCallback, useRef } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import * as clientTransfer from "@/lib/sitecore/clientTransfer";
import { useStepLoop } from "@/hooks/use-step-loop";
import { PackageArchiveWriter, downloadBlob, packageFileName } from "@/lib/packages/archive";
import { PACKAGE_FORMAT_VERSION } from "@/lib/types";
import type { GeneratePackageJob, PackageChunkSetManifest, PackageManifest, SelectedItem } from "@/lib/types";

function createJob(items: SelectedItem[]): GeneratePackageJob {
  return {
    jobId: crypto.randomUUID(),
    createdAt: Date.now(),
    items,
    status: "pending",
  };
}

function isJobComplete(job: GeneratePackageJob): boolean {
  return job.status === "done" || job.status === "failed";
}

export function useGeneratePackage(client: ClientSDK, sourceContextId: string, sourceEnvironmentLabel: string) {
  const writerRef = useRef<PackageArchiveWriter | null>(null);

  const step = useCallback(
    async (job: GeneratePackageJob): Promise<GeneratePackageJob> => {
      const next: GeneratePackageJob = { ...job, chunkSets: job.chunkSets ? [...job.chunkSets] : job.chunkSets };

      try {
        switch (next.status) {
          case "pending": {
            const transferId = crypto.randomUUID();
            await clientTransfer.createTransfer(client, sourceContextId, {
              transferId,
              dataTrees: next.items.map((item) => ({
                itemPath: item.path,
                scope: item.scope,
                mergeStrategy: item.mergeStrategy,
              })),
            });
            next.sourceTransferId = transferId;
            next.preparingSince = Date.now();
            next.status = "preparing";
            writerRef.current = new PackageArchiveWriter();
            break;
          }

          case "preparing": {
            const transferId = next.sourceTransferId;
            if (!transferId) throw new Error("Missing source transfer ID");

            const chunkSets = await clientTransfer.pollPreparedChunkSets(
              client,
              sourceContextId,
              transferId,
              next.items.map((item) => item.path),
              next.preparingSince ?? Date.now()
            );
            if (!chunkSets) break;
            next.chunkSets = chunkSets;
            next.status = "transferring-chunks";
            break;
          }

          case "transferring-chunks": {
            const transferId = next.sourceTransferId;
            if (!transferId) throw new Error("Missing source transfer ID");
            if (!next.chunkSets) throw new Error("Missing chunk set metadata");

            const pendingIndex = next.chunkSets.findIndex((chunkSet) => !chunkSet.completed);
            if (pendingIndex === -1) {
              next.status = "packaging";
              break;
            }
            const pending = next.chunkSets[pendingIndex];

            if (pending.chunksTransferred < pending.chunkCount) {
              const chunkId = pending.chunksTransferred;
              const chunk = await clientTransfer.getChunk(
                client,
                sourceContextId,
                transferId,
                pending.chunkSetId,
                chunkId
              );
              const bytes = new Uint8Array(await chunk.arrayBuffer());
              if (!writerRef.current) throw new Error("Package writer was not initialized");
              writerRef.current.addChunk(pending.chunkSetId, chunkId, bytes);
              pending.chunksTransferred += 1;
              break;
            }

            pending.completed = true;
            if (next.chunkSets.every((chunkSet) => chunkSet.completed)) {
              next.status = "packaging";
            }
            break;
          }

          case "packaging": {
            if (!next.chunkSets || !next.sourceTransferId || !writerRef.current) {
              throw new Error("Missing chunk set metadata");
            }

            const chunkSets: PackageChunkSetManifest[] = next.chunkSets.map((chunkSet, itemIndex) => ({
              chunkSetId: chunkSet.chunkSetId,
              chunkCount: chunkSet.chunkCount,
              totalItemCount: chunkSet.totalItemCount ?? 0,
              isMedia: chunkSet.isMedia ?? false,
              itemIndex,
            }));

            const manifest: PackageManifest = {
              formatVersion: PACKAGE_FORMAT_VERSION,
              packageId: next.jobId,
              createdAt: new Date().toISOString(),
              sourceEnvironment: sourceEnvironmentLabel,
              transferId: next.sourceTransferId,
              items: next.items,
              chunkSets,
            };

            const blob = await writerRef.current.finish(manifest);
            await clientTransfer.deleteTransfer(client, sourceContextId, next.sourceTransferId);
            downloadBlob(blob, packageFileName(sourceEnvironmentLabel));
            next.status = "done";
            break;
          }
        }
      } catch (error) {
        next.status = "failed";
        next.error = error instanceof Error ? error.message : "Unknown error";
      }

      return next;
    },
    [client, sourceContextId, sourceEnvironmentLabel]
  );

  const { job, running, run, cancel } = useStepLoop<GeneratePackageJob>(step, isJobComplete);

  const start = useCallback((items: SelectedItem[]) => run(createJob(items)), [run]);

  return { job, running, start, cancel };
}
