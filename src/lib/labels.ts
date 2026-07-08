import type { MergeStrategy, TransferScope } from "@/lib/types";

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
