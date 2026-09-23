"use client";

import { Button } from "@/components/ui/button";
import { EmptyStates } from "@/components/ui/empty-states";
import { ErrorStates } from "@/components/ui/error-states";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentSelect } from "@/components/environments/EnvironmentSelect";
import { useMarketplaceContext } from "@/components/marketplace/MarketplaceProvider";
import { getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";

interface ConnectStepProps {
  source: ResourceAccessEntry | null;
  destination: ResourceAccessEntry | null;
  onSelectSource: (entry: ResourceAccessEntry | null) => void;
  onSelectDestination: (entry: ResourceAccessEntry | null) => void;
  onContinue: () => void;
}

export function ConnectStep({
  source,
  destination,
  onSelectSource,
  onSelectDestination,
  onContinue,
}: ConnectStepProps) {
  const { resourceAccess, isLoading, isInitialized, error, notEmbedded, initialize } =
    useMarketplaceContext();

  const heading = (
    <div>
      <h2 className="text-lg font-semibold">Connect environments</h2>
      <p className="text-sm text-muted-foreground">
        Pick the source and destination environments this app was granted access to. No
        credentials are needed here — Sitecore authenticates each call on this app&apos;s behalf.
      </p>
    </div>
  );

  if (notEmbedded) {
    return (
      <div className="space-y-6">
        {heading}
        <ErrorStates
          variant="generic"
          title="Open this app from the Sitecore Cloud Portal"
          description="This app reads its connected environments from the Marketplace host, so it only works when opened inside Sitecore Cloud Portal."
          actions={<></>}
        />
      </div>
    );
  }

  if (isLoading || !isInitialized) {
    return (
      <div className="space-y-6">
        {heading}
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {heading}
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
      </div>
    );
  }

  if (resourceAccess.length < 2) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyStates
          variant="nothing-created"
          title="Not enough environments granted"
          description="This app installation only has access to one environment. Ask your Sitecore admin to grant it access to a second environment so you have a source and a destination to migrate between."
          actions={<></>}
        />
      </div>
    );
  }

  const bothSelected = !!source && !!destination;
  const sameEntry =
    !!source && !!destination && getSitecoreContextId(source) === getSitecoreContextId(destination);

  return (
    <div className="space-y-6">
      {heading}

      <div className="grid gap-4 md:grid-cols-2">
        <EnvironmentSelect
          label="Source environment"
          placeholder="Select the environment to read from"
          resourceAccess={resourceAccess}
          value={source}
          onChange={onSelectSource}
        />

        <EnvironmentSelect
          label="Destination environment"
          placeholder="Select the environment to write to"
          resourceAccess={resourceAccess}
          value={destination}
          onChange={onSelectDestination}
        />
      </div>

      {sameEntry && (
        <p className="text-sm text-danger-fg">Source and destination must be different environments.</p>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={!bothSelected || sameEntry}>
          Continue
        </Button>
      </div>
    </div>
  );
}
