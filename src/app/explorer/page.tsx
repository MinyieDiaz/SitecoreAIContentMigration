"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlobManager } from "@/components/explorer/BlobManager";
import { HistoryTable } from "@/components/explorer/HistoryTable";
import { TransfersPanel } from "@/components/explorer/TransfersPanel";

export default function ExplorerPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Inspect transfers, history, and packages on the connected destination environment.
        </p>
      </div>

      <Tabs defaultValue="transfers">
        <TabsList>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="blobs">Blobs</TabsTrigger>
        </TabsList>
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
    </div>
  );
}
