import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { MergeStrategy, TransferScope } from "@/lib/types";

export class ClientTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientTransferError";
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

// `xmc.contentTransfer.*` mutations/queries proxy hey-api-generated functions
// through the Marketplace host. The generated types model a `ThrowOnError`
// type parameter this app never sets, which is why the resolved shape includes
// an extra arm with no `error` field at all -- the `"error" in result` guard
// (rather than a plain `result.error`) is what makes this compile against all
// three arms. This unwrapping is inferred from the SDK's type declarations and
// hasn't been exercised against a real Marketplace app installation yet.
function assertNoError(result: unknown, action: string): void {
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new ClientTransferError(`${action} failed: ${describeError(result.error)}`);
  }
}

// For operations with an actual response payload -- not the fire-and-forget
// ones whose success response is an empty/`unknown` body, where requiring
// `data !== undefined` would misreport a normal empty-body success as a failure.
function unwrapPayload<T>(result: { data?: T }, action: string): T {
  assertNoError(result, action);
  if (result.data === undefined) {
    throw new ClientTransferError(`${action}: response contained no data`);
  }
  return result.data;
}

// Unwraps the ClientSDK's own query wrapper (a plain, always-present
// {data, error, status, ...} shape -- distinct from the hey-api shape inside
// it). `result.data` here is the inner hey-api object itself, which should
// always be present once the query has resolved -- undefined means the query
// never got a response at all, not a normal empty-body success.
function unwrapQueryOuter<T>(result: { data?: T; error?: Error }, action: string): T {
  if (result.error) {
    throw new ClientTransferError(`${action} failed: ${result.error.message}`);
  }
  if (result.data === undefined) {
    throw new ClientTransferError(`${action}: no response from Marketplace host`);
  }
  return result.data;
}

const DATABASE_NAME = "master";

export interface DataTreeConfig {
  itemPath: string;
  scope: TransferScope;
  mergeStrategy: MergeStrategy;
}

// Called against the SOURCE environment's sitecoreContextId.
export async function createTransfer(
  client: ClientSDK,
  sitecoreContextId: string,
  params: { transferId: string; dataTrees: DataTreeConfig[] }
): Promise<void> {
  const result = await client.mutate("xmc.contentTransfer.createContentTransfer", {
    params: {
      query: { sitecoreContextId },
      body: {
        transferId: params.transferId,
        configuration: { dataTrees: params.dataTrees },
      },
    },
  });
  assertNoError(result, "Create transfer");
}

export interface ChunkSetStatus {
  chunkSetId: string;
  chunkCount: number;
  totalItemCount: number;
}

// Called against the SOURCE environment's sitecoreContextId. Chunk sets come
// back in the order the data trees were submitted -- the API doesn't otherwise
// say which chunk set corresponds to which nominated item.
export async function getTransferStatus(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string
): Promise<{ state: string; chunkSets: ChunkSetStatus[] }> {
  const outer = await client.query("xmc.contentTransfer.getContentTransferStatus", {
    params: { path: { transferId }, query: { sitecoreContextId } },
  });
  const body = unwrapPayload(unwrapQueryOuter(outer, "Get transfer status"), "Get transfer status");
  return {
    state: body.State,
    chunkSets: (body.ChunkSetsMetadata ?? []).map((chunkSet) => ({
      chunkSetId: chunkSet.ChunkSetId,
      chunkCount: chunkSet.ChunkCount,
      totalItemCount: chunkSet.TotalItemCount,
    })),
  };
}

// Called against the SOURCE environment's sitecoreContextId.
export async function getChunk(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string,
  chunksetId: string,
  chunkId: number
): Promise<Blob> {
  const outer = await client.query("xmc.contentTransfer.getChunk", {
    params: { path: { transferId, chunksetId, chunkId }, query: { sitecoreContextId } },
  });
  const chunk = unwrapPayload(unwrapQueryOuter(outer, "Get chunk"), "Get chunk");
  return chunk instanceof Blob ? chunk : new Blob([chunk]);
}

// Called against the DESTINATION environment's sitecoreContextId -- every chunk
// downloaded from the source must be saved here unmodified before its chunk set
// can be completed.
export async function saveChunk(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string,
  chunksetId: string,
  chunkId: number,
  data: Blob
): Promise<void> {
  const result = await client.mutate("xmc.contentTransfer.saveChunk", {
    params: {
      path: { transferId, chunksetId, chunkId },
      query: { sitecoreContextId },
      body: data,
    },
  });
  assertNoError(result, "Save chunk");
}

// Called against the DESTINATION environment's sitecoreContextId once every
// chunk in the set has been saved. Produces the .raif blob that consumeFile
// then consumes, returning its exact generated file name.
export async function completeChunkSet(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string,
  chunksetId: string
): Promise<{ contentTransferFileName: string }> {
  const result = await client.mutate("xmc.contentTransfer.completeChunkSetTransfer", {
    params: { path: { transferId, chunksetId }, query: { sitecoreContextId } },
  });
  const body = unwrapPayload(result, "Complete chunk set");
  return { contentTransferFileName: body.ContentTransferFileName };
}

// Called against the DESTINATION environment's sitecoreContextId to start
// consuming a completed .raif blob. Unlike the raw Item Transfer API's
// startConsume, this has no response body/headers -- there's no sourceName to
// recover from it, only confirmation the request was accepted.
export async function consumeFile(
  client: ClientSDK,
  sitecoreContextId: string,
  fileName: string
): Promise<void> {
  const outer = await client.query("xmc.contentTransfer.consumeFile", {
    params: { query: { databaseName: DATABASE_NAME, fileName, sitecoreContextId } },
  });
  assertNoError(unwrapQueryOuter(outer, "Consume file"), "Consume file");
}

// Called against the SOURCE environment's sitecoreContextId to release the
// transfer's resources.
export async function deleteTransfer(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string
): Promise<void> {
  const result = await client.mutate("xmc.contentTransfer.deleteContentTransfer", {
    params: { path: { transferId }, query: { sitecoreContextId } },
  });
  assertNoError(result, "Delete transfer");
}
