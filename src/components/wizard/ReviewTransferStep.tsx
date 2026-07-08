"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import { useTransferJob } from "@/hooks/use-transfer-job";
import type { JobStatus, SelectedItem, TransferJob } from "@/lib/types";

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Pending",
  "transferring-chunks": "Transferring",
  consuming: "Consuming",
  done: "Submitted",
  failed: "Failed",
};

const STATUS_COLOR: Record<JobStatus, "neutral" | "primary" | "success" | "danger"> = {
  pending: "neutral",
  "transferring-chunks": "primary",
  consuming: "primary",
  done: "success",
  failed: "danger",
};

function jobProgress(job: TransferJob | null): number {
  if (!job) return 0;
  if (job.status === "done") return 100;
  if (job.status === "pending") return 0;
  if (!job.chunkSets?.length) return 10;
  const total = job.chunkSets.reduce((sum, chunkSet) => sum + chunkSet.chunkCount, 0);
  const transferred = job.chunkSets.reduce((sum, chunkSet) => sum + chunkSet.chunksTransferred, 0);
  if (total === 0) return 50;
  return Math.round((transferred / total) * 80) + 10;
}

interface ReviewTransferStepProps {
  client: ClientSDK;
  sourceContextId: string;
  destinationContextId: string;
  selections: SelectedItem[];
  onBack: () => void;
}

export function ReviewTransferStep({
  client,
  sourceContextId,
  destinationContextId,
  selections,
  onBack,
}: ReviewTransferStepProps) {
  const { job, running, start, retry } = useTransferJob(client, sourceContextId, destinationContextId);
  const notifiedRef = useRef<TransferJob["status"] | null>(null);

  useEffect(() => {
    if (!job || !running) return;
    if (job.status !== "done" && job.status !== "failed") return;
    if (notifiedRef.current === job.status) return;
    notifiedRef.current = job.status;
    if (job.status === "failed") toast.error("Migration failed");
    else toast.success("Items submitted for transfer");
  }, [job, running]);

  const handleStart = () => start(selections);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review &amp; transfer</h2>
        <p className="text-sm text-muted-foreground">
          All {selections.length} selected item{selections.length === 1 ? "" : "s"} are sent as a single
          transfer, each keeping its own scope and merge strategy.
        </p>
      </div>

      {job && (
        <div className="space-y-2 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <Badge colorScheme={STATUS_COLOR[job.status]}>{STATUS_LABEL[job.status]}</Badge>
            {job.status === "failed" && (
              <Button variant="outline" size="sm" onClick={retry}>
                Retry
              </Button>
            )}
          </div>
          <Progress value={jobProgress(job)} />
          {job.status === "failed" && job.error && <p className="text-sm text-danger-fg">{job.error}</p>}
          {job.status === "done" && (
            <p className="text-sm text-muted-foreground">
              All items were submitted to the destination. Sitecore consumes each one asynchronously, so it can
              take a few moments to finish landing — check the{" "}
              <Link href="/explorer" className="underline">
                Explorer
              </Link>{" "}
              for live status.
            </p>
          )}
        </div>
      )}

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
              <TableCell>{SCOPE_LABELS[item.scope]}</TableCell>
              <TableCell>{MERGE_STRATEGY_LABELS[item.mergeStrategy]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={running}>
          Back
        </Button>
        {!job && <Button onClick={handleStart}>Start transfer</Button>}
      </div>
    </div>
  );
}
