"use client";

import { mdiPackageDown, mdiPackageUp } from "@mdi/js";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CardTabsList, CardTabsTrigger } from "@/components/common/CardTabs";
import { GeneratePackagePanel } from "./GeneratePackagePanel";
import { InstallPackagePanel } from "./InstallPackagePanel";

const MODES = [
  {
    value: "generate",
    icon: mdiPackageDown,
    title: "Generate",
    description: "Back up content from an environment to a file",
  },
  {
    value: "install",
    icon: mdiPackageUp,
    title: "Install",
    description: "Replay a saved package into an environment",
  },
] as const;

export function PackagesWorkspace() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Packages</h1>
        <p className="text-sm text-muted-foreground">
          Generate a content backup to a file on your machine, or install a previously generated package
          into an environment.
        </p>
      </div>

      <Tabs defaultValue="generate">
        <CardTabsList columns={2}>
          {MODES.map((mode) => (
            <CardTabsTrigger
              key={mode.value}
              value={mode.value}
              icon={mode.icon}
              title={mode.title}
              description={mode.description}
            />
          ))}
        </CardTabsList>
        <TabsContent value="generate">
          <GeneratePackagePanel />
        </TabsContent>
        <TabsContent value="install">
          <InstallPackagePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
