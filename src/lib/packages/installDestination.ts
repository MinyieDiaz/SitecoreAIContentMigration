import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { ConsumeDriver } from "@/lib/consume";
import * as clientTransfer from "@/lib/sitecore/clientTransfer";

// The destination side of an install job, extracted so useInstallPackage can
// stay agnostic to how the destination is reached -- see
// docs/plans/credentialed-install.md. One job loop, one progress model, one
// panel; two drivers.
export interface InstallDestination extends ConsumeDriver {
  saveChunk(
    transferId: string,
    chunkSetId: string,
    chunkId: number,
    bytes: Uint8Array,
    isMedia: boolean
  ): Promise<void>;
  completeChunkSet(transferId: string, chunkSetId: string): Promise<{ blobName: string }>;
}

// Routes through the Marketplace SDK's xmc.contentTransfer.* bridge, keyed by
// the destination's sitecoreContextId -- the path the Migration Wizard and
// today's granted-environment install use.
export function sdkInstallDestination(client: ClientSDK, sitecoreContextId: string): InstallDestination {
  return {
    async saveChunk(transferId, chunkSetId, chunkId, bytes, isMedia) {
      await clientTransfer.saveChunk(
        client,
        sitecoreContextId,
        transferId,
        chunkSetId,
        chunkId,
        new Blob([bytes as BlobPart]),
        isMedia
      );
    },
    async completeChunkSet(transferId, chunkSetId) {
      const { contentTransferFileName } = await clientTransfer.completeChunkSet(
        client,
        sitecoreContextId,
        transferId,
        chunkSetId
      );
      return { blobName: contentTransferFileName };
    },
    async consume(blobName) {
      await clientTransfer.consumeFile(client, sitecoreContextId, blobName);
      return { sourceName: null };
    },
    pollConsumeOutcome(blobName, consumeStartedAt) {
      return clientTransfer.pollConsumeOutcome(client, sitecoreContextId, blobName, consumeStartedAt);
    },
  };
}

async function readJsonError(response: Response, action: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new Error(body.error ?? `${action} failed (${response.status})`);
}

// Routes through this app's own /api/packages/install/* server routes, which
// hold an installTarget session connection and speak the raw CM-host REST
// form described in docs/plans/credentialed-install.md -- install into any
// environment via automation client credentials, not just granted ones.
export function credentialedInstallDestination(): InstallDestination {
  return {
    async saveChunk(transferId, chunkSetId, chunkId, bytes, isMedia) {
      const response = await fetch(
        `/api/packages/install/chunks/${encodeURIComponent(transferId)}/${encodeURIComponent(
          chunkSetId
        )}/${chunkId}?isMedia=${isMedia}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes as BodyInit,
        }
      );
      if (!response.ok) await readJsonError(response, "Save chunk");
    },
    async completeChunkSet(transferId, chunkSetId) {
      const response = await fetch(
        `/api/packages/install/complete/${encodeURIComponent(transferId)}/${encodeURIComponent(chunkSetId)}`,
        { method: "POST" }
      );
      if (!response.ok) await readJsonError(response, "Complete chunk set");
      return response.json();
    },
    async consume(blobName) {
      const response = await fetch("/api/packages/install/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobName }),
      });
      if (!response.ok) await readJsonError(response, "Consume");
      return response.json();
    },
  };
}
