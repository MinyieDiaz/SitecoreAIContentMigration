"use client";

import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Button } from "@/components/ui/button";
import { ContentSelector } from "@/components/content/ContentSelector";
import type { MergeStrategy, SelectedItem, TransferScope, TreeNode } from "@/lib/types";

interface SelectContentStepProps {
  client: ClientSDK;
  sitecoreContextId: string;
  selections: SelectedItem[];
  globalScope: TransferScope;
  globalMergeStrategy: MergeStrategy;
  onToggle: (node: TreeNode, checked: boolean) => void;
  onUpdate: (path: string, patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => void;
  onApplyToAll: (patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SelectContentStep({
  client,
  sitecoreContextId,
  selections,
  globalScope,
  globalMergeStrategy,
  onToggle,
  onUpdate,
  onApplyToAll,
  onBack,
  onContinue,
}: SelectContentStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select content</h2>
        <p className="text-sm text-muted-foreground">
          Browse the source environment&apos;s content tree, select the items to migrate, and choose
          each item&apos;s scope and merge strategy.
        </p>
      </div>

      <ContentSelector
        client={client}
        sitecoreContextId={sitecoreContextId}
        selections={selections}
        globalScope={globalScope}
        globalMergeStrategy={globalMergeStrategy}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onApplyToAll={onApplyToAll}
      />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={selections.length === 0}>
          Continue
        </Button>
      </div>
    </div>
  );
}
