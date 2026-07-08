"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ApplicationContext, ClientSDK } from "@sitecore-marketplace-sdk/client";
import { useMarketplaceClient, type ResourceAccessEntry } from "@/hooks/use-marketplace-client";

interface MarketplaceContextValue {
  client: ClientSDK | null;
  appContext: ApplicationContext | null;
  resourceAccess: ResourceAccessEntry[];
  isLoading: boolean;
  isInitialized: boolean;
  error: Error | null;
  notEmbedded: boolean;
  initialize: () => void;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const state = useMarketplaceClient();

  const value = useMemo<MarketplaceContextValue>(
    () => ({ ...state, resourceAccess: state.appContext?.resourceAccess ?? [] }),
    [state]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplaceContext(): MarketplaceContextValue {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error("useMarketplaceContext must be used within a MarketplaceProvider");
  }
  return context;
}
