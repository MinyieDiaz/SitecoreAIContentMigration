"use client";

import { useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { useMarketplaceContext } from "@/components/marketplace/MarketplaceProvider";
import { getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";
import type { SelectedItem, TreeNode } from "@/lib/types";
import { ConnectStep } from "./ConnectStep";
import { ConnectionSummary } from "./ConnectionSummary";
import { SelectContentStep } from "./SelectContentStep";
import { ConfigureTransferStep } from "./ConfigureTransferStep";
import { ReviewTransferStep } from "./ReviewTransferStep";

const STEPS = [
  { label: "Connect", description: "Pick source & destination" },
  { label: "Select content", description: "Browse the content tree" },
  { label: "Configure", description: "Scope & merge strategy" },
  { label: "Review & transfer", description: "Run the migration" },
];

export function MigrationWizard() {
  const { client } = useMarketplaceContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<SelectedItem[]>([]);
  const [source, setSource] = useState<ResourceAccessEntry | null>(null);
  const [destination, setDestination] = useState<ResourceAccessEntry | null>(null);

  const handleToggle = (node: TreeNode, checked: boolean) => {
    setSelections((previous) => {
      if (!checked) {
        return previous.filter((item) => item.path !== node.path);
      }
      if (previous.some((item) => item.path === node.path)) {
        return previous;
      }
      return [
        ...previous,
        {
          itemId: node.itemId,
          path: node.path,
          name: node.name,
          scope: "SingleItem",
          mergeStrategy: "OverrideExistingItem",
        },
      ];
    });
  };

  const handleUpdate = (path: string, patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => {
    setSelections((previous) =>
      previous.map((item) => (item.path === path ? { ...item, ...patch } : item))
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <Stepper steps={STEPS} currentStep={currentStep} />

      {currentStep > 0 && source && destination && (
        <ConnectionSummary source={source} destination={destination} />
      )}

      {currentStep === 0 && (
        <ConnectStep
          source={source}
          destination={destination}
          onSelectSource={setSource}
          onSelectDestination={setDestination}
          onContinue={() => setCurrentStep(1)}
        />
      )}
      {currentStep === 1 && client && source && (
        <SelectContentStep
          client={client}
          sitecoreContextId={getSitecoreContextId(source)}
          selections={selections}
          onToggle={handleToggle}
          onBack={() => setCurrentStep(0)}
          onContinue={() => setCurrentStep(2)}
        />
      )}
      {currentStep === 2 && (
        <ConfigureTransferStep
          selections={selections}
          onUpdate={handleUpdate}
          onBack={() => setCurrentStep(1)}
          onContinue={() => setCurrentStep(3)}
        />
      )}
      {currentStep === 3 && client && source && destination && (
        <ReviewTransferStep
          client={client}
          sourceContextId={getSitecoreContextId(source)}
          destinationContextId={getSitecoreContextId(destination)}
          selections={selections}
          onBack={() => setCurrentStep(2)}
        />
      )}
    </div>
  );
}
