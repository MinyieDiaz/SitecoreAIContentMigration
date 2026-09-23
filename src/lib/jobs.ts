import type { ChunkSetProgress, GeneratePackageJob, InstallPackageJob, TransferJob } from "@/lib/types";

// Fraction (0-1) of declared chunks transferred so far. Shared by every job
// type whose middle phase is "one getChunk/saveChunk per step" against the
// same ChunkSetProgress[] shape.
function chunkTransferFraction(chunkSets: ChunkSetProgress[] | undefined): number {
  if (!chunkSets?.length) return 0;
  const total = chunkSets.reduce((sum, chunkSet) => sum + chunkSet.chunkCount, 0);
  const transferred = chunkSets.reduce((sum, chunkSet) => sum + chunkSet.chunksTransferred, 0);
  return total === 0 ? 0 : transferred / total;
}

export function transferJobProgress(job: TransferJob | null): number {
  if (!job) return 0;
  if (job.status === "done") return 100;
  if (job.status === "pending") return 0;
  if (!job.chunkSets?.length) return 10;
  return Math.round(chunkTransferFraction(job.chunkSets) * 80) + 10;
}

export function generatePackageProgress(job: GeneratePackageJob | null): number {
  if (!job) return 0;
  if (job.status === "done") return 100;
  if (job.status === "pending") return 0;
  if (job.status === "packaging") return 95;
  if (!job.chunkSets?.length) return 10;
  return Math.round(chunkTransferFraction(job.chunkSets) * 80) + 10;
}

export function installPackageProgress(job: InstallPackageJob | null): number {
  if (!job) return 0;
  if (job.status === "done") return 100;
  if (job.status === "pending") return 0;
  if (!job.chunkSets?.length) return 10;
  return Math.round(chunkTransferFraction(job.chunkSets) * 80) + 10;
}
