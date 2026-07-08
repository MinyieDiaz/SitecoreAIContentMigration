"use client";

import { useCallback, useEffect, useState } from "react";
import { mdiRefresh } from "@mdi/js";
import { toast } from "sonner";
import { Icon } from "@/lib/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { TransferSummary, TransferredItemSummary } from "@/lib/sitecore/itemTransfer";

function statusColor(state: string): "success" | "danger" | "primary" | "neutral" {
  if (state === "Finished") return "success";
  if (state === "Failed") return "danger";
  if (state === "InProgress" || state === "Queued") return "primary";
  return "neutral";
}

export function TransfersPanel() {
  const [transfers, setTransfers] = useState<TransferSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [inspecting, setInspecting] = useState<TransferSummary | null>(null);
  const [items, setItems] = useState<TransferredItemSummary[] | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/explorer/transfers", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setTransfers(body.transfers);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async (transfer: TransferSummary) => {
    if (!transfer.sourceName) return;
    const response = await fetch(
      `/api/explorer/transfers/${encodeURIComponent(transfer.sourceName)}/retry?database=${transfer.databaseName ?? "master"}`,
      { method: "PUT" }
    );
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Failed to retry transfer");
      return;
    }
    toast.success("Retry started");
    load();
  };

  const handleInspect = async (transfer: TransferSummary) => {
    if (!transfer.sourceName) return;
    setInspecting(transfer);
    setItems(null);
    const response = await fetch(
      `/api/explorer/transfers/${encodeURIComponent(transfer.sourceName)}/items?database=${transfer.databaseName ?? "master"}`,
      { cache: "no-store" }
    );
    const body = await response.json();
    if (response.ok) setItems(body.items);
    else toast.error(body.error ?? "Failed to load items");
  };

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
      <Icon path={mdiRefresh} size={0.8} className={refreshing ? "animate-spin" : undefined} />
      Refresh
    </Button>
  );

  if (transfers === null) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (transfers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{refreshButton}</div>
        <EmptyStates
          variant="nothing-created"
          title="No transfers yet"
          description="Transfers will appear here once you run a migration. Consumption is asynchronous, so a just-run transfer may take a moment to appear -- use Refresh to check again."
          actions={<></>}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">{refreshButton}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Items transferred</TableHead>
            <TableHead>Total items</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((transfer) => (
            <TableRow key={transfer.id}>
              <TableCell>{transfer.sourceName}</TableCell>
              <TableCell>{transfer.databaseName}</TableCell>
              <TableCell>
                <Badge colorScheme={statusColor(transfer.transferState)}>{transfer.transferState}</Badge>
              </TableCell>
              <TableCell>{transfer.transferredItemsCount ?? "—"}</TableCell>
              <TableCell>{transfer.totalItemsCount ?? "—"}</TableCell>
              <TableCell className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleInspect(transfer)}>
                  View items
                </Button>
                {transfer.transferState === "Failed" && (
                  <Button variant="outline" size="sm" onClick={() => handleRetry(transfer)}>
                    Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={inspecting !== null} onOpenChange={(open) => !open && setInspecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferred items — {inspecting?.sourceName}</DialogTitle>
          </DialogHeader>
          {items === null ? (
            <Skeleton className="h-32 w-full" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items found for this transfer.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.itemId} className="rounded-sm border px-2 py-1 text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.itemId}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
