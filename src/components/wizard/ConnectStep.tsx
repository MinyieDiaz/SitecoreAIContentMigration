"use client";

import { Button } from "@/components/ui/button";
import { useEnvironments } from "@/hooks/use-environments";
import { EnvironmentCard } from "./EnvironmentCard";

interface ConnectStepProps {
  onContinue: () => void;
}

export function ConnectStep({ onContinue }: ConnectStepProps) {
  const { source, destination, connect, disconnect, loading } = useEnvironments();

  const bothConnected = source.connected && destination.connected;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Connect environments</h2>
        <p className="text-sm text-muted-foreground">
          Provide automation client credentials for the source and destination SitecoreAI
          environments. Credentials are exchanged for an access token and held only for this
          browser session — nothing is stored on disk.
        </p>
      </div>

      {!loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <EnvironmentCard
            role="source"
            title="Source"
            description="Content is read from this environment."
            status={source}
            onConnect={(host, clientId, clientSecret) => connect("source", host, clientId, clientSecret)}
            onDisconnect={() => disconnect("source")}
          />
          <EnvironmentCard
            role="destination"
            title="Destination"
            description="Content is written to this environment."
            status={destination}
            onConnect={(host, clientId, clientSecret) =>
              connect("destination", host, clientId, clientSecret)
            }
            onDisconnect={() => disconnect("destination")}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={!bothConnected}>
          Continue
        </Button>
      </div>
    </div>
  );
}
