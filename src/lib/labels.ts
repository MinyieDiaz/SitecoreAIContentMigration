import type { MergeStrategy, PackageJobStatus, TransferScope } from "@/lib/types";

export const SCOPE_LABELS: Record<TransferScope, string> = {
  SingleItem: "This item only",
  ItemAndDescendants: "This item and all descendants",
};

export const MERGE_STRATEGY_LABELS: Record<MergeStrategy, string> = {
  OverrideExistingItem: "Override existing item",
  KeepExistingItem: "Keep existing item",
  LatestWin: "Latest wins",
  OverrideExistingTree: "Override existing tree",
};

// Shared across every client-side job hook (transfer, generate package,
// install package) -- PackageJobStatus is the superset ("packaging" only
// applies to generate, "consuming" only to transfer/install) so one map
// covers all three rather than duplicating pending/transferring-chunks/done/
// failed per flow. The specific outcome ("submitted" vs "downloaded") is left
// to each JobProgress caller's doneContent, not the badge.
export const JOB_STATUS_LABELS: Record<PackageJobStatus, string> = {
  pending: "Pending",
  preparing: "Preparing on source",
  "transferring-chunks": "Transferring",
  packaging: "Packaging",
  consuming: "Consuming",
  done: "Done",
  "done-with-errors": "Done with errors",
  failed: "Failed",
};

export const JOB_STATUS_COLORS: Record<PackageJobStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  preparing: "primary",
  "transferring-chunks": "primary",
  packaging: "primary",
  consuming: "primary",
  done: "success",
  "done-with-errors": "warning",
  failed: "danger",
};
