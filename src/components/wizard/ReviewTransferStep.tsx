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
import { ChunkSetTable } from "@/components/jobs/ChunkSetTable";
import { JobProgress } from "@/components/jobs/JobProgress";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import { hasUnconfirmedConsume } from "@/lib/consume";
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
  const { job, running, start, canResume, resume, startOver } = useTransferJob(
    client,
    sourceContextId,
    destinationContextId
  );
  const notifiedRef = useRef<TransferJob["status"] | null>(null);

  useEffect(() => {
    if (!job || !running) return;
    if (job.status !== "done" && job.status !== "done-with-errors" && job.status !== "failed") return;
    if (notifiedRef.current === job.status) return;
    notifiedRef.current = job.status;
    if (job.status === "failed") toast.error("Migration failed");
    else if (job.status === "done-with-errors") toast.warning("Migration finished with errors");
    else toast.success("Migration complete");
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
          onRetry={canResume ? resume : startOver}
          retryLabel={canResume ? "Resume" : "Retry"}
          onStartOver={canResume ? startOver : undefined}
          doneContent={
            <p className="text-sm text-muted-foreground">
              {hasUnconfirmedConsume(job.chunkSets)
                ? "Every part was submitted, but the destination didn't report an import status for all of them, so completion isn't confirmed. Check the "
                : "The destination finished importing every part. See the "}
              <Link href="/explorer" className="underline">
                Explorer
              </Link>{" "}
              for transfer status and history.
            </p>
          }
        />
      )}

      {job?.chunkSets && <ChunkSetTable chunkSets={job.chunkSets} />}

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
