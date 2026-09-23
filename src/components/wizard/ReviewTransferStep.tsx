"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobProgress } from "@/components/jobs/JobProgress";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import { transferJobProgress } from "@/lib/jobs";
import { useTransferJob } from "@/hooks/use-transfer-job";
import type { SelectedItem, TransferJob } from "@/lib/types";

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
        <JobProgress
          status={job.status}
          progress={transferJobProgress(job)}
          error={job.error}
          onRetry={retry}
          doneContent={
            <p className="text-sm text-muted-foreground">
              All items were submitted to the destination. Sitecore consumes each one asynchronously, so it can
              take a few moments to finish landing — check the{" "}
              <Link href="/explorer" className="underline">
                Explorer
              </Link>{" "}
              for live status.
            </p>
          }
        />
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
