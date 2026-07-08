import { MigrationWizard } from "@/components/wizard/MigrationWizard";
import { MarketplaceProvider } from "@/components/marketplace/MarketplaceProvider";

export default function Home() {
  return (
    <MarketplaceProvider>
      <MigrationWizard />
    </MarketplaceProvider>
  );
}
