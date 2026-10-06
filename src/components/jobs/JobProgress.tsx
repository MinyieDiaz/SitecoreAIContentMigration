"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/labels";
import type { PackageJobStatus } from "@/lib/types";

interface JobProgressProps {
  status: PackageJobStatus;
  progress: number;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
  // Offered alongside onRetry when retrying resumes rather than restarting.
  onStartOver?: () => void;
  doneContent?: ReactNode;
}

// The status badge + progress bar + error/retry block shared by the wizard's
// transfer job, and Packages' generate/install jobs. What "done" actually
// means (submitted vs downloaded) differs per flow, so that's left to the
// caller's doneContent rather than baked in here.
export function JobProgress({
  status,
  progress,
  error,
  onRetry,
  retryLabel = "Retry",
  onStartOver,
  doneContent,
}: JobProgressProps) {
  return (
    <div className="space-y-2 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <Badge colorScheme={JOB_STATUS_COLORS[status]}>{JOB_STATUS_LABELS[status]}</Badge>
        {status === "failed" && (onRetry || onStartOver) && (
          <div className="flex gap-2">
            {onStartOver && (
              <Button variant="ghost" size="sm" onClick={onStartOver}>
                Start over
              </Button>
            )}
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      <Progress value={progress} />
      {status === "failed" && error && <p className="text-sm text-danger-fg">{error}</p>}
      {status === "done-with-errors" && error && <p className="text-sm text-warning-fg">{error}</p>}
      {status === "done" && doneContent}
    </div>
  );
}
