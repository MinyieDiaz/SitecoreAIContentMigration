"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import type { MergeStrategy, SelectedItem, TransferScope } from "@/lib/types";

const SCOPE_OPTIONS = Object.entries(SCOPE_LABELS) as [TransferScope, string][];
const MERGE_STRATEGY_OPTIONS = Object.entries(MERGE_STRATEGY_LABELS) as [MergeStrategy, string][];

interface ConfigureTransferStepProps {
  selections: SelectedItem[];
  onUpdate: (path: string, patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ConfigureTransferStep({
  selections,
  onUpdate,
  onBack,
  onContinue,
}: ConfigureTransferStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Configure transfer</h2>
        <p className="text-sm text-muted-foreground">
          Choose a scope and merge strategy for each selected item.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Merge strategy</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
