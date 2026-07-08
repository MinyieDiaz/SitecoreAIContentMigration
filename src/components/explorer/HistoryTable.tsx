"use client";

import { useCallback, useEffect, useState } from "react";
import { mdiRefresh } from "@mdi/js";
import { Icon } from "@/lib/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyStates } from "@/components/ui/empty-states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MERGE_STRATEGY_LABELS } from "@/lib/labels";
import type { HistoryEntry } from "@/lib/sitecore/itemTransfer";

function statusColor(state: string): "success" | "danger" | "primary" | "neutral" {
  if (state === "Finished") return "success";
  if (state === "Failed") return "danger";
  if (state === "InProgress" || state === "Queued") return "primary";
  return "neutral";
}

function latestState(entry: HistoryEntry): string {
  return entry.events[entry.events.length - 1]?.state ?? "Unknown";
}

export function HistoryTable() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/explorer/history", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setHistory(body.history ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
      <Icon path={mdiRefresh} size={0.8} className={refreshing ? "animate-spin" : undefined} />
      Refresh
    </Button>
  );

  if (history === null) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (history.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{refreshButton}</div>
        <EmptyStates
          variant="nothing-created"
          title="No history yet"
          description="Completed and failed transfers will be listed here. Consumption is asynchronous, so a just-run transfer may take a moment to appear -- use Refresh to check again."
          actions={<></>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{refreshButton}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Merge strategy</TableHead>
            <TableHead>Consumed at</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((entry, index) => (
            <TableRow key={`${entry.sourceName}-${index}`}>
              <TableCell>{entry.sourceName}</TableCell>
              <TableCell>{MERGE_STRATEGY_LABELS[entry.strategy] ?? entry.strategy}</TableCell>
              <TableCell>{new Date(entry.consumeDate).toLocaleString()}</TableCell>
              <TableCell>
                <Badge colorScheme={statusColor(latestState(entry))}>{latestState(entry)}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
