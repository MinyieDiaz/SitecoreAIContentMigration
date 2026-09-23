import { PackagesWorkspace } from "@/components/packages/PackagesWorkspace";
import { MarketplaceProvider } from "@/components/marketplace/MarketplaceProvider";

export default function PackagesPage() {
  return (
    <MarketplaceProvider>
      <PackagesWorkspace />
    </MarketplaceProvider>
  );
}
