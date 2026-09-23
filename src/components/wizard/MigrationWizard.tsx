"use client";

import { useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { useMarketplaceContext } from "@/components/marketplace/MarketplaceProvider";
import { useContentSelection } from "@/hooks/use-content-selection";
import { getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";
import { ConnectStep } from "./ConnectStep";
import { ConnectionSummary } from "./ConnectionSummary";
import { SelectContentStep } from "./SelectContentStep";
import { ReviewTransferStep } from "./ReviewTransferStep";

const STEPS = [
  { label: "Connect", description: "Pick source & destination" },
  { label: "Select content", description: "Browse, scope & merge strategy" },
  { label: "Review & transfer", description: "Run the migration" },
];

export function MigrationWizard() {
  const { client } = useMarketplaceContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [source, setSource] = useState<ResourceAccessEntry | null>(null);
  const [destination, setDestination] = useState<ResourceAccessEntry | null>(null);
  const { selections, globalScope, globalMergeStrategy, handleToggle, handleUpdate, handleApplyToAll } =
    useContentSelection();

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
          globalScope={globalScope}
          globalMergeStrategy={globalMergeStrategy}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onApplyToAll={handleApplyToAll}
          onBack={() => setCurrentStep(0)}
          onContinue={() => setCurrentStep(2)}
        />
      )}
      {currentStep === 2 && client && source && destination && (
        <ReviewTransferStep
          client={client}
          sourceContextId={getSitecoreContextId(source)}
          destinationContextId={getSitecoreContextId(destination)}
          selections={selections}
          onBack={() => setCurrentStep(1)}
        />
      )}
    </div>
  );
}
