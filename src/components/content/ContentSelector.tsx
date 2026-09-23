"use client";

import { mdiClose } from "@mdi/js";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContentTree } from "@/components/tree/ContentTree";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import type { MergeStrategy, SelectedItem, TransferScope, TreeNode } from "@/lib/types";

const SCOPE_OPTIONS = Object.entries(SCOPE_LABELS) as [TransferScope, string][];

// LatestWin is excluded from the picker: Sitecore has a confirmed bug in that
// merge strategy. It's kept in MergeStrategy/MERGE_STRATEGY_LABELS so past jobs
// that used it still display correctly in the Explorer.
const MERGE_STRATEGY_OPTIONS = (Object.entries(MERGE_STRATEGY_LABELS) as [MergeStrategy, string][]).filter(
  ([value]) => value !== "LatestWin"
);

interface ContentSelectorProps {
  client: ClientSDK;
  sitecoreContextId: string;
  selections: SelectedItem[];
  globalScope: TransferScope;
  globalMergeStrategy: MergeStrategy;
  onToggle: (node: TreeNode, checked: boolean) => void;
  onUpdate: (path: string, patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => void;
  onApplyToAll: (patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => void;
}

export function ContentSelector({
  client,
  sitecoreContextId,
  selections,
  globalScope,
  globalMergeStrategy,
  onToggle,
  onUpdate,
  onApplyToAll,
}: ContentSelectorProps) {
  const selectedPaths = new Set(selections.map((item) => item.path));

  const globals = { scope: globalScope, mergeStrategy: globalMergeStrategy };
  const uniform = <K extends "scope" | "mergeStrategy">(key: K) =>
    selections.length === 0
      ? globals[key]
      : selections.every((item) => item[key] === selections[0][key])
        ? selections[0][key]
        : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <ContentTree
          client={client}
          sitecoreContextId={sitecoreContextId}
          isSelected={(path) => selectedPaths.has(path)}
          onToggle={onToggle}
        />

        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">Selected ({selections.length})</p>
          <p className="text-sm text-muted-foreground">
            {selections.length === 0
              ? "Nothing selected yet."
              : "Use the table header to apply scope/merge strategy to all items, or set them per row below."}
          </p>
        </div>
      </div>

      {selections.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="global-scope">Scope</FieldLabel>
                  <Select
                    value={uniform("scope")}
                    onValueChange={(value) => onApplyToAll({ scope: value as TransferScope })}
                  >
                    <SelectTrigger id="global-scope" className="w-full">
                      <SelectValue placeholder="Mixed" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableHead>
              <TableHead>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="global-merge-strategy">Merge strategy</FieldLabel>
                  <Select
                    value={uniform("mergeStrategy")}
                    onValueChange={(value) => onApplyToAll({ mergeStrategy: value as MergeStrategy })}
                  >
                    <SelectTrigger id="global-merge-strategy" className="w-full">
                      <SelectValue placeholder="Mixed" />
                    </SelectTrigger>
                    <SelectContent>
                      {MERGE_STRATEGY_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {selections.map((item) => (
              <TableRow key={item.path}>
                <TableCell>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.path}</p>
                </TableCell>
                <TableCell>
                  <Select
                    value={item.scope}
                    onValueChange={(value) => onUpdate(item.path, { scope: value as TransferScope })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={item.mergeStrategy}
                    onValueChange={(value) => onUpdate(item.path, { mergeStrategy: value as MergeStrategy })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MERGE_STRATEGY_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
