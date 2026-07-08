"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClientSDK, type ApplicationContext } from "@sitecore-marketplace-sdk/client";
import { XMC } from "@sitecore-marketplace-sdk/xmc";

export type ResourceAccessEntry = NonNullable<ApplicationContext["resourceAccess"]>[number];

interface MarketplaceClientState {
  client: ClientSDK | null;
  appContext: ApplicationContext | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: Error | null;
}

// Module-level singleton: the handshake with the host is per-browser-tab, not
// per-component, so every consumer of this hook should share one ClientSDK
// instance rather than re-negotiating the postMessage handshake.
let cachedClient: ClientSDK | undefined;

async function getMarketplaceClient(): Promise<ClientSDK> {
  if (cachedClient) return cachedClient;
  cachedClient = await ClientSDK.init({ target: window.parent, modules: [XMC] });
  return cachedClient;
}

export function useMarketplaceClient() {
  // If the app isn't embedded in an iframe, ClientSDK.init() has nothing to
  // handshake with and will just hang until its internal timeout -- this check
  // lets the UI show "open this from Sitecore Cloud Portal" immediately instead.
  const [notEmbedded] = useState(() => typeof window !== "undefined" && window.parent === window);

  const [state, setState] = useState<MarketplaceClientState>({
    client: null,
    appContext: null,
    isLoading: false,
    isInitialized: false,
    error: null,
  });

  const isInitializingRef = useRef(false);

  const initialize = useCallback(async () => {
    if (notEmbedded || isInitializingRef.current) return;
    isInitializingRef.current = true;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    try {
      const client = await getMarketplaceClient();
      const { data: appContext } = await client.query("application.context");
      setState({
        client,
        appContext: appContext ?? null,
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    } catch (error) {
      cachedClient = undefined;
      setState({
        client: null,
        appContext: null,
        isLoading: false,
        isInitialized: false,
        error: error instanceof Error ? error : new Error("Failed to initialize Marketplace client"),
      });
    } finally {
      isInitializingRef.current = false;
    }
  }, [notEmbedded]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return { ...state, notEmbedded, initialize };
}
