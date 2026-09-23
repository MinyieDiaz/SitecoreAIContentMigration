"use client";

import { useCallback, useState } from "react";
import type { MergeStrategy, SelectedItem, TransferScope, TreeNode } from "@/lib/types";

// Selection state + handlers shared by anything that browses a content tree
// and builds up a list of items with a scope/merge strategy -- the wizard's
// Select content step and the Packages Generate panel both need this.
export function useContentSelection() {
  const [selections, setSelections] = useState<SelectedItem[]>([]);
  const [globalScope, setGlobalScope] = useState<TransferScope>("SingleItem");
  const [globalMergeStrategy, setGlobalMergeStrategy] = useState<MergeStrategy>("OverrideExistingItem");

  const handleToggle = useCallback(
    (node: TreeNode, checked: boolean) => {
      setSelections((previous) => {
        if (!checked) {
          return previous.filter((item) => item.path !== node.path);
        }
        if (previous.some((item) => item.path === node.path)) {
          return previous;
        }
        return [
          ...previous,
          {
            itemId: node.itemId,
            path: node.path,
            name: node.name,
            scope: globalScope,
            mergeStrategy: globalMergeStrategy,
          },
        ];
      });
    },
    [globalScope, globalMergeStrategy]
  );

  const handleUpdate = useCallback(
    (path: string, patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => {
      setSelections((previous) => previous.map((item) => (item.path === path ? { ...item, ...patch } : item)));
    },
    []
  );

  const handleApplyToAll = useCallback((patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => {
    if (patch.scope) setGlobalScope(patch.scope);
    if (patch.mergeStrategy) setGlobalMergeStrategy(patch.mergeStrategy);
    setSelections((previous) => previous.map((item) => ({ ...item, ...patch })));
  }, []);

  return {
    selections,
    globalScope,
    globalMergeStrategy,
    handleToggle,
    handleUpdate,
    handleApplyToAll,
    setSelections,
  };
}
