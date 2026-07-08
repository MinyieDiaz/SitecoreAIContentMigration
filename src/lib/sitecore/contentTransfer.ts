import type { MergeStrategy, TransferScope } from "@/lib/types";

export class ContentTransferError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ContentTransferError";
  }
}

function baseUrl(host: string) {
  return `https://${host}/sitecore/api/content/transfer/v1`;
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function assertOk(response: Response, action: string) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ContentTransferError(`${action} failed (${response.status}): ${text}`, response.status);
  }
}

export interface DataTreeConfig {
  itemPath: string;
  scope: TransferScope;
  mergeStrategy: MergeStrategy;
}

export interface CreateTransferParams {
  transferId: string;
  dataTrees: DataTreeConfig[];
  database?: string;
}

// Called against the SOURCE environment. Per the confirmed OpenAPI spec this
// returns 202 Accepted with no body -- call getTransferStatus to find out what
// chunk sets it created.
export async function createTransfer(host: string, token: string, params: CreateTransferParams): Promise<void> {
  const response = await fetch(`${baseUrl(host)}/transfers`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      TransferId: params.transferId,
      Configuration: {
        DataTrees: params.dataTrees.map((dataTree) => ({
          ItemPath: dataTree.itemPath,
          Scope: dataTree.scope,
          MergeStrategy: dataTree.mergeStrategy,
        })),
        Database: params.database ?? "master",
      },
    }),
    cache: "no-store",
  });
  await assertOk(response, "Create transfer");
}

export type ContentTransferState = "Running" | "Completed" | "Failed" | "NotFound";

export interface ChunkSetStatus {
  chunkSetId: string;
  chunkCount: number;
  totalItemCount: number;
}

export interface TransferStatus {
  state: ContentTransferState;
  chunkSets: ChunkSetStatus[];
}

interface ChunkSetMetadataResponse {
  ChunkSetId: string;
  ChunkCount: number;
  TotalItemCount: number;
}

interface ContentTransferCreationStatusResponse {
  State: ContentTransferState;
  ChunkSetsMetadata: ChunkSetMetadataResponse[];
}

// Called against the SOURCE environment. Note the chunk sets are returned in the
// order the DataTrees were submitted, but the API does not otherwise say which
// chunk set corresponds to which nominated item.
export async function getTransferStatus(
  host: string,
  token: string,
  transferId: string
): Promise<TransferStatus> {
  const response = await fetch(`${baseUrl(host)}/transfers/${transferId}/status`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Get transfer status");
  const body: ContentTransferCreationStatusResponse = await response.json();
  return {
    state: body.State,
    chunkSets: (body.ChunkSetsMetadata ?? []).map((chunkSet) => ({
      chunkSetId: chunkSet.ChunkSetId,
      chunkCount: chunkSet.ChunkCount,
      totalItemCount: chunkSet.TotalItemCount,
    })),
  };
}

// Called against the SOURCE environment. Returns the raw chunk bytes plus the
// Content-Disposition metadata (ItemsProcessed/ItemsSkipped/IsMedia) the API attaches.
export async function downloadChunk(
  host: string,
  token: string,
  transferId: string,
  chunksetId: string,
  chunkId: number
): Promise<{ data: ArrayBuffer; contentDisposition: string | null; contentType: string | null }> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/${transferId}/chunksets/${chunksetId}/chunks/${chunkId}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  await assertOk(response, "Download chunk");
  return {
    data: await response.arrayBuffer(),
    contentDisposition: response.headers.get("content-disposition"),
    contentType: response.headers.get("content-type"),
  };
}

// Called against the DESTINATION environment — every chunk downloaded from the
// source must be uploaded here unmodified before its chunk set can be completed.
export async function uploadChunk(
  host: string,
  token: string,
  transferId: string,
  chunksetId: string,
  chunkId: number,
  data: ArrayBuffer
): Promise<void> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/${transferId}/chunksets/${chunksetId}/chunks/${chunkId}`,
    {
      method: "PUT",
      headers: authHeaders(token, { "Content-Type": "application/octet-stream" }),
      body: data,
      cache: "no-store",
    }
  );
  await assertOk(response, "Upload chunk");
}

// Called against the DESTINATION environment once every chunk in the set has been
// uploaded. Produces the .raif blob that the Item Transfer API then consumes, and
// returns its exact generated file name -- no need to guess it from a blob listing.
export async function completeChunkSet(
  host: string,
  token: string,
  transferId: string,
  chunksetId: string
): Promise<{ contentTransferFileName: string }> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/${transferId}/chunksets/${chunksetId}/complete`,
    { method: "POST", headers: authHeaders(token), cache: "no-store" }
  );
  await assertOk(response, "Complete chunk set");
  const body: { ContentTransferFileName: string } = await response.json();
  return { contentTransferFileName: body.ContentTransferFileName };
}

// Called against the SOURCE environment to release the transfer's resources.
export async function deleteTransfer(host: string, token: string, transferId: string): Promise<void> {
  const response = await fetch(`${baseUrl(host)}/transfers/${transferId}`, {
    method: "DELETE",
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Delete transfer");
}
