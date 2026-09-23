"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Button } from "@/components/ui/button";
import { EmptyStates } from "@/components/ui/empty-states";
import { ErrorStates } from "@/components/ui/error-states";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentSelector } from "@/components/content/ContentSelector";
import { EnvironmentSelect } from "@/components/environments/EnvironmentSelect";
import { JobProgress } from "@/components/jobs/JobProgress";
import { useMarketplaceContext } from "@/components/marketplace/MarketplaceProvider";
import { useContentSelection } from "@/hooks/use-content-selection";
import { useGeneratePackage } from "@/hooks/use-generate-package";
import { generatePackageProgress } from "@/lib/jobs";
import { getEnvironmentLabel, getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";
import type { GeneratePackageJob } from "@/lib/types";

export function GeneratePackagePanel() {
  const { client, resourceAccess, isLoading, isInitialized, error, notEmbedded, initialize } =
    useMarketplaceContext();
  const [source, setSource] = useState<ResourceAccessEntry | null>(null);
  const { selections, globalScope, globalMergeStrategy, handleToggle, handleUpdate, handleApplyToAll } =
    useContentSelection();

  const sourceContextId = source ? getSitecoreContextId(source) : "";
  const sourceLabel = source ? getEnvironmentLabel(source) : "";
  // Hooks must run every render regardless of the early returns below; client
  // is only null before the Marketplace handshake completes, by which point
  // `source` (and therefore the Generate button) can't be set yet either.
  const { job, running, start } = useGeneratePackage(client as ClientSDK, sourceContextId, sourceLabel);
  const notifiedRef = useRef<GeneratePackageJob["status"] | null>(null);

  useEffect(() => {
    if (!job || !running) return;
    if (job.status !== "done" && job.status !== "failed") return;
    if (notifiedRef.current === job.status) return;
    notifiedRef.current = job.status;
    if (job.status === "failed") toast.error("Package generation failed");
    else toast.success("Package downloaded");
  }, [job, running]);

  if (notEmbedded) {
    return (
      <ErrorStates
        variant="generic"
        title="Open this app from the Sitecore Cloud Portal"
        description="Packages reads its connected environments from the Marketplace host, so it only works when opened inside Sitecore Cloud Portal."
        actions={<></>}
      />
    );
  }

  if (isLoading || !isInitialized) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <ErrorStates
        variant="generic"
        title="Couldn't connect to the Marketplace host"
        description={error.message}
        actions={
          <Button variant="link" onClick={() => initialize()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (resourceAccess.length === 0) {
    return (
      <EmptyStates
        variant="nothing-created"
        title="No environments granted"
        description="This app installation has no granted environments to back up."
        actions={<></>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <EnvironmentSelect
          label="Source environment"
          placeholder="Select the environment to back up"
          resourceAccess={resourceAccess}
          value={source}
          onChange={setSource}
        />
      </div>

      {client && source && (
        <ContentSelector
          client={client}
          sitecoreContextId={sourceContextId}
          selections={selections}
          globalScope={globalScope}
          globalMergeStrategy={globalMergeStrategy}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onApplyToAll={handleApplyToAll}
        />
      )}

      {job && (
        <JobProgress
          status={job.status}
          progress={generatePackageProgress(job)}
          error={job.error}
          doneContent={
            <p className="text-sm text-muted-foreground">
              Package downloaded to your machine. Check your browser&apos;s downloads if you don&apos;t see it.
            </p>
          }
        />
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => start(selections)}
          disabled={!source || selections.length === 0 || running || job?.status === "done"}
        >
          Generate package
        </Button>
      </div>
    </div>
  );
}
