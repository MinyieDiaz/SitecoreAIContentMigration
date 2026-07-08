import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";

// Neither the SDK's type declarations nor its docs say which `context` key
// (live vs preview) authoring/content-transfer operations expect -- both are
// opaque strings. `preview` is the reasonable default since these are CM/
// master-db operations, not published Edge delivery content, but this is
// unverified until tested against a real Marketplace app installation.
// Centralized here so flipping it later is a one-line change.
const AUTHORING_CONTEXT_KEY: "preview" | "live" = "preview";

export function getSitecoreContextId(entry: ResourceAccessEntry): string {
  return entry.context[AUTHORING_CONTEXT_KEY];
}

export function getEnvironmentLabel(entry: ResourceAccessEntry): string {
  return entry.tenantDisplayName ?? entry.tenantName ?? entry.resourceId;
}
