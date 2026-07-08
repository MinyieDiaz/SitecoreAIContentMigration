"use client";

import { mdiClose } from "@mdi/js";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { ContentTree } from "@/components/tree/ContentTree";
import type { SelectedItem, TreeNode } from "@/lib/types";

interface SelectContentStepProps {
  client: ClientSDK;
  sitecoreContextId: string;
  selections: SelectedItem[];
  onToggle: (node: TreeNode, checked: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SelectContentStep({
  client,
  sitecoreContextId,
  selections,
  onToggle,
  onBack,
  onContinue,
}: SelectContentStepProps) {
  const selectedPaths = new Set(selections.map((item) => item.path));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select content</h2>
        <p className="text-sm text-muted-foreground">
          Browse the source environment&apos;s content tree and select the items to migrate.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <ContentTree
          client={client}
          sitecoreContextId={sitecoreContextId}
          isSelected={(path) => selectedPaths.has(path)}
          onToggle={onToggle}
        />

        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">
            Selected ({selections.length})
          </p>
          {selections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing selected yet.</p>
          ) : (
            <ul className="space-y-1">
              {selections.map((item) => (
                <li
                  key={item.path}
                  className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm hover:bg-neutral-bg"
                >
                  <span className="truncate" title={item.path}>
                    {item.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      onToggle(
                        { itemId: item.itemId, name: item.name, path: item.path, hasChildren: false },
                        false
                      )
                    }
                  >
                    <Icon path={mdiClose} size={0.7} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
