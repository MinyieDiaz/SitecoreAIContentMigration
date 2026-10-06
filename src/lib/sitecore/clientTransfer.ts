import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { ChunkSetProgress, ConsumeOutcome, MergeStrategy, TransferScope } from "@/lib/types";

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

// createContentTransfer only returns 202 Accepted -- the source builds the
// transfer asynchronously, and ChunkSetsMetadata is empty or partial until
// State reaches Completed (per Sitecore's migration walkthrough: "Poll this
// endpoint until State is Completed"). Reading it any earlier is what made an
// ItemAndDescendants transfer "finish" instantly with nothing in it.
const TRANSFER_STATE_COMPLETED = "completed";
const TRANSFER_STATE_FAILED = "failed";
const PREPARE_TIMEOUT_MS = 30 * 60 * 1000;

// Shared by every status poll (source readiness, destination consume): the
// first check is immediate, then one every 5 seconds -- deliberately not
// faster, so a long-running transfer doesn't hammer either environment.
const STATUS_POLL_INTERVAL_MS = 5000;

function waitForNextPoll(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
}

// A Completed transfer with nothing in it would otherwise "succeed" while
// moving nothing -- fail instead.
function assertTransferNotEmpty(chunkSets: ChunkSetStatus[]): void {
  const totalItems = chunkSets.reduce((sum, chunkSet) => sum + chunkSet.totalItemCount, 0);
  if (chunkSets.length === 0 || totalItems === 0) {
    throw new ClientTransferError("Source prepared the transfer, but it contains no items");
  }
}

// The status response doesn't say which selected items went into which chunk
// set, and it isn't one chunk set per item: a live two-item transfer came back
// as a single chunk set. When the counts do match, submission order is assumed
// to line up (as this app always has); otherwise isMedia can only be resolved
// when every selected item agrees on it.
function resolveChunkSetIsMedia(itemPaths: string[], chunkSetCount: number): boolean[] {
  const itemIsMedia = itemPaths.map(isMediaItemPath);
  if (chunkSetCount === itemPaths.length) return itemIsMedia;
  if (itemIsMedia.every((isMedia) => isMedia === itemIsMedia[0])) {
    return Array<boolean>(chunkSetCount).fill(itemIsMedia[0] ?? false);
  }
  throw new ClientTransferError(
    "Source grouped media library and other items together in a way this app can't tell apart — transfer media library items separately from other content"
  );
}

// One "preparing" step: checks the source transfer's State once. Returns the
// chunk sets once it's Completed, or waits out the poll interval and returns
// null so the caller's step loop can re-render and call again.
export async function pollPreparedChunkSets(
  client: ClientSDK,
  sitecoreContextId: string,
  transferId: string,
  itemPaths: string[],
  preparingSince: number
): Promise<ChunkSetProgress[] | null> {
  const status = await getTransferStatus(client, sitecoreContextId, transferId);
  const state = status.state?.toLowerCase();

  if (state === TRANSFER_STATE_FAILED) {
    throw new ClientTransferError("Source failed to prepare the transfer — retry to create a new one");
  }

  if (state !== TRANSFER_STATE_COMPLETED) {
    const elapsedMs = Date.now() - preparingSince;
    if (elapsedMs > PREPARE_TIMEOUT_MS) {
      throw new ClientTransferError(
        `Source was still preparing the transfer after ${PREPARE_TIMEOUT_MS / 60_000} minutes (state: ${status.state})`
      );
    }
    await waitForNextPoll();
    return null;
  }

  assertTransferNotEmpty(status.chunkSets);
  const isMedia = resolveChunkSetIsMedia(itemPaths, status.chunkSets.length);
  return status.chunkSets.map((chunkSet, index) => ({
    chunkSetId: chunkSet.chunkSetId,
    chunkCount: chunkSet.chunkCount,
    totalItemCount: chunkSet.totalItemCount,
    chunksTransferred: 0,
    completed: false,
    isMedia: isMedia[index],
  }));
}

const MEDIA_LIBRARY_PATH = "/sitecore/media library";

// Matches the Media Library root itself as well as anything under it. The
// docs say isMedia should come from getChunk's Content-Disposition header, but
// the SDK's getChunk only hands back a Blob, so the selected item's path is
// the only signal available on this path.
export function isMediaItemPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === MEDIA_LIBRARY_PATH || normalized.startsWith(`${MEDIA_LIBRARY_PATH}/`);
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
  data: Blob,
  isMedia: boolean
): Promise<void> {
  const result = await client.mutate("xmc.contentTransfer.saveChunk", {
    params: {
      path: { transferId, chunksetId, chunkId },
      query: { sitecoreContextId, isMedia },
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
//
// `fileName` requires an explicit `blob://` or `file://` schema prefix -- the
// completeChunkSetTransfer-produced .raif always lives in blob storage, so
// this always prefixes with `blob://` rather than taking the schema as a param.
export async function consumeFile(
  client: ClientSDK,
  sitecoreContextId: string,
  blobName: string
): Promise<void> {
  const outer = await client.query("xmc.contentTransfer.consumeFile", {
    params: { query: { databaseName: DATABASE_NAME, fileName: `blob://${blobName}`, sitecoreContextId } },
  });
  assertNoError(unwrapQueryOuter(outer, "Consume file"), "Consume file");
}

// The SDK types GetBlobState's response as `{ status, details }`, but the live
// body is PascalCase like the rest of this API (confirmed against a real
// environment):
//   { BlobState: "Transferred", Error: null, ConsumedName: "consumed.<ts>.<guid>",
//     Actions: { Details: "/sitecore/shell/api/v2/ItemsTransfer/StatusDetails?..." } }
// ConsumedName is the Item Transfer sourceName the Explorer works with.
interface BlobStateResponse {
  BlobState?: string;
  Error?: unknown;
  ConsumedName?: string;
}

function readBlobState(body: unknown): string {
  const { BlobState, Error: error } = (body ?? {}) as BlobStateResponse;
  if (BlobState) return BlobState;
  return error ? "Error" : "Unknown";
}

// Terminal states only -- anything else (Uploaded, Queued, Initializing,
// Consumed, ...) means the destination is still working on it. "Consumed" is
// NOT terminal: items are readable at that point, but the background sync to
// the database hasn't finished until "Transferred" (a consumed blob was later
// seen listed as Transferred).
function classifyBlobState(state: string): ConsumeOutcome | "not-found" | null {
  switch (state.toLowerCase()) {
    case "transferred":
      return "transferred";
    case "transferredwitherrors":
      return "transferred-with-errors";
    case "error":
    case "failed":
      return "error";
    case "notfound":
      return "not-found";
    default:
      return null;
  }
}

// A missing blob comes back as an error, not as `status: NotFound` -- the
// live response was a 404 with Azure's "BlobNotFound" error code embedded in
// the message. Normalize it to the NotFound state so callers can decide.
const BLOB_NOT_FOUND = /BlobNotFound|\b404\b/i;

async function queryBlobState(client: ClientSDK, sitecoreContextId: string, fileName: string): Promise<string> {
  try {
    const outer = await client.query("xmc.contentTransfer.getBlobState", {
      params: { query: { fileName, sitecoreContextId } },
    });
    return readBlobState(unwrapPayload(unwrapQueryOuter(outer, "Get blob state"), "Get blob state"));
  } catch (error) {
    if (error instanceof Error && BLOB_NOT_FOUND.test(error.message)) return "NotFound";
    throw error;
  }
}

// Called against the DESTINATION environment's sitecoreContextId. Takes the
// BARE blob name -- unlike consumeFile, which requires `blob://`. Confirmed
// live: `blob://<name>` came back BlobNotFound while the same .raif was listed
// (by bare name) in the destination's blob sources as Transferred.
export async function getBlobState(
  client: ClientSDK,
  sitecoreContextId: string,
  blobName: string
): Promise<string> {
  return queryBlobState(client, sitecoreContextId, blobName);
}

const CONSUME_TIMEOUT_MS = 60 * 60 * 1000;
// A blob can briefly be unknown to GetBlobState right after consume is
// requested; past this, NotFound means the status can't be read at all, and
// the chunk set ends "unconfirmed" rather than failed -- the consume itself
// was accepted, and the content may well have landed.
const CONSUME_NOT_FOUND_GRACE_MS = 2 * 60 * 1000;
export const UNCONFIRMED_DESTINATION_STATE = "Submitted (status unavailable)";

// One "consuming" check for a single chunk set's .raif: reads its state once,
// and if it isn't terminal yet, waits out the poll interval before returning
// so the caller's step loop calls again.
export async function pollConsumeOutcome(
  client: ClientSDK,
  sitecoreContextId: string,
  blobName: string,
  consumeStartedAt: number
): Promise<{ state: string; outcome: ConsumeOutcome | null }> {
  const state = await getBlobState(client, sitecoreContextId, blobName);
  const outcome = classifyBlobState(state);
  if (outcome && outcome !== "not-found") return { state, outcome };

  const elapsedMs = Date.now() - consumeStartedAt;
  if (outcome === "not-found" && elapsedMs > CONSUME_NOT_FOUND_GRACE_MS) {
    return { state: UNCONFIRMED_DESTINATION_STATE, outcome: "unconfirmed" };
  }
  if (elapsedMs > CONSUME_TIMEOUT_MS) {
    throw new ClientTransferError(
      `Destination was still importing ${blobName} after ${CONSUME_TIMEOUT_MS / 60_000} minutes (state: ${state}) — check the Explorer`
    );
  }
  await waitForNextPoll();
  return { state, outcome: null };
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
