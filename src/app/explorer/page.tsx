"use client";

import { mdiDatabaseOutline, mdiHistory, mdiSwapHorizontal } from "@mdi/js";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CardTabsList, CardTabsTrigger } from "@/components/common/CardTabs";
import { BlobManager } from "@/components/explorer/BlobManager";
import { HistoryTable } from "@/components/explorer/HistoryTable";
import { TransfersPanel } from "@/components/explorer/TransfersPanel";
import { EnvironmentCard } from "@/components/wizard/EnvironmentCard";
import { useEnvironments } from "@/hooks/use-environments";

const TABS = [
  {
    value: "transfers",
    icon: mdiSwapHorizontal,
    title: "Transfers",
    description: "Item Transfer sources currently in flight on this environment",
  },
  {
    value: "history",
    icon: mdiHistory,
    title: "History",
    description: "Past transfers and their outcome",
  },
  {
    value: "blobs",
    icon: mdiDatabaseOutline,
    title: "Blobs",
    description: "Raw content-transfer blobs uploaded to this environment",
  },
] as const;

export default function ExplorerPage() {
  const { destination, loading, connect, disconnect } = useEnvironments();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Inspect transfers, history, and packages on the connected destination environment.
        </p>
      </div>

      {!loading && !destination.connected && (
        <div className="max-w-md">
          <p className="mb-3 text-sm text-muted-foreground">
            Explorer inspects the destination environment&apos;s transfer history directly, so it needs its
            own connection separate from the Migration Wizard.
          </p>
          <EnvironmentCard
            role="destination"
            title="Destination"
            description="Automation client credentials for the environment to inspect."
            status={destination}
            onConnect={(host, clientId, clientSecret) => connect("destination", host, clientId, clientSecret)}
            onDisconnect={() => disconnect("destination")}
          />
        </div>
      )}

      {destination.connected && (
        <Tabs defaultValue="transfers">
          <CardTabsList columns={3}>
            {TABS.map((tab) => (
              <CardTabsTrigger
                key={tab.value}
                value={tab.value}
                icon={tab.icon}
                title={tab.title}
                description={tab.description}
              />
            ))}
          </CardTabsList>
          <TabsContent value="transfers">
            <TransfersPanel />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTable />
          </TabsContent>
          <TabsContent value="blobs">
            <BlobManager />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
