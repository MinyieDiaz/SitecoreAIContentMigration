"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
  selections: SelectedItem[];
  onBack: () => void;
}

export function ReviewTransferStep({ selections, onBack }: ReviewTransferStepProps) {
  const [job, setJob] = useState<TransferJob | null>(null);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    []
  );

  const runLoop = useCallback(async (jobId: string) => {
    cancelledRef.current = false;
    setRunning(true);
    try {
      while (!cancelledRef.current) {
        const response = await fetch(`/api/transfer/${jobId}/step`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) {
          toast.error(body.error ?? "Transfer step failed");
          break;
        }
        setJob(body.job);
        if (body.complete) {
          if ((body.job as TransferJob).status === "failed") toast.error("Migration failed");
          else toast.success("Items submitted for transfer");
          break;
        }
      }
    } finally {
      setRunning(false);
    }
  }, []);

  const handleStart = async () => {
    const response = await fetch("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: selections }),
    });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Failed to start transfer");
      return;
    }
    setJob(body.job);
    runLoop(body.job.jobId);
  };

  const handleRetry = async () => {
    if (!job) return;
    const response = await fetch(`/api/transfer/${job.jobId}/retry`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Failed to retry");
      return;
    }
    setJob(body.job);
    runLoop(job.jobId);
  };

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
              <Button variant="outline" size="sm" onClick={handleRetry}>
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
