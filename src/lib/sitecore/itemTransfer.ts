import type { MergeStrategy } from "@/lib/types";

export class ItemTransferError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ItemTransferError";
  }
}

function baseUrl(host: string) {
  return `https://${host}/sitecore/shell/api/v3/ItemsTransfer`;
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function assertOk(response: Response, action: string) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ItemTransferError(`${action} failed (${response.status}): ${text}`, response.status);
  }
}

export type BlobState =
  | "Unknown"
  | "Uploading"
  | "Uploaded"
  | "Initializing"
  | "Error"
  | "Consumed"
  | "Transferred"
  | "TransferredWithErrors"
  | "Queued"
  | "Discarded";

export interface BlobSummary {
  blobName: string;
  state: BlobState;
}

interface BlobSourceInfoResponse {
  Name: string;
  BlobState: BlobState;
}

export async function listBlobs(host: string, token: string): Promise<BlobSummary[]> {
  const response = await fetch(`${baseUrl(host)}/sources/blobs`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "List blobs");
  const body: { Sources?: BlobSourceInfoResponse[] } = await response.json();
  return (body.Sources ?? []).map((source) => ({ blobName: source.Name, state: source.BlobState }));
}

export async function deleteBlob(host: string, token: string, blobName: string): Promise<void> {
  const response = await fetch(`${baseUrl(host)}/sources/blobs/${encodeURIComponent(blobName)}`, {
    method: "DELETE",
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Delete blob");
}

// Called against the DESTINATION environment. blobName is a query parameter --
// this endpoint takes no request body. The response has no JSON body either; the
// `location` header's final path segment is the source name used everywhere else
// (getTransfer, retryTransfer, listTransferredItems, ...).
export async function startConsume(
  host: string,
  token: string,
  databaseName: string,
  blobName: string
): Promise<{ sourceName: string }> {
  const url = new URL(`${baseUrl(host)}/transfers/databases/${encodeURIComponent(databaseName)}/sources`);
  url.searchParams.set("blobName", blobName);

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Start consuming blob");

  const location = response.headers.get("location");
  const sourceName = location?.split("/").pop();
  if (!sourceName) {
    throw new ItemTransferError("Start consume response did not include a location header");
  }
  return { sourceName: decodeURIComponent(sourceName) };
}

export type TransferState = "Unknown" | "InProgress" | "Finished" | "Failed" | "Queued" | "Discarded";

export interface TransferSummary {
  id: string;
  sourceName: string;
  databaseName: string;
  consumedDate: string;
  transferState: TransferState;
  strategy: MergeStrategy;
  description?: string;
  totalItemsCount?: number;
  transferredItemsCount?: number;
  validationErrors?: string[];
  sourcesCount?: number;
}

interface TransferDetailsResultResponse {
  Id: string;
  SourceName: string;
  DatabaseName: string;
  ConsumedDate: string;
  TransferState: TransferState;
  Strategy: MergeStrategy;
  Description?: string;
  TotalItemsCount?: number;
  TransferredItemsCount?: number;
  ValidationErrors?: string[];
  SourcesCount?: number;
}

function toTransferSummary(raw: TransferDetailsResultResponse): TransferSummary {
  return {
    id: raw.Id,
    sourceName: raw.SourceName,
    databaseName: raw.DatabaseName,
    consumedDate: raw.ConsumedDate,
    transferState: raw.TransferState,
    strategy: raw.Strategy,
    description: raw.Description,
    totalItemsCount: raw.TotalItemsCount,
    transferredItemsCount: raw.TransferredItemsCount,
    validationErrors: raw.ValidationErrors,
    sourcesCount: raw.SourcesCount,
  };
}

export async function listTransfers(host: string, token: string): Promise<TransferSummary[]> {
  const response = await fetch(`${baseUrl(host)}/transfers`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "List transfers");
  const body: { Transfers?: TransferDetailsResultResponse[] } = await response.json();
  return (body.Transfers ?? []).map(toTransferSummary);
}

// transferId here is the source/blob file name (e.g. "content-transfer-....raif")
// -- the API reuses that name as the transfer identifier once consumption starts.
export async function getTransfer(host: string, token: string, transferId: string): Promise<TransferSummary> {
  const response = await fetch(`${baseUrl(host)}/transfers/${encodeURIComponent(transferId)}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Get transfer");
  return toTransferSummary(await response.json());
}

export async function retryTransfer(
  host: string,
  token: string,
  databaseName: string,
  sourceName: string
): Promise<void> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/databases/${encodeURIComponent(databaseName)}/sources/${encodeURIComponent(sourceName)}`,
    { method: "PUT", headers: authHeaders(token), cache: "no-store" }
  );
  await assertOk(response, "Retry transfer");
}

// The Item Transfer API doesn't expose a path for transferred items -- only the
// item's own name and its ParentId. Reconstructing a full path would require
// separately walking the ParentId chain, which this API doesn't support either.
export interface TransferredItemSummary {
  itemId: string;
  name: string;
  parentId: string;
  templateId: string;
  isTransferred: boolean;
  timeStampDate: string;
}

interface ItemDataResponse {
  Id: string;
  Name: string;
  ParentId: string;
  TemplateId: string;
  MasterId: string;
  IsTransferred: boolean;
  TimeStamp: number;
  TimeStampDate: string;
  SourceName: string;
}

function toTransferredItemSummary(raw: ItemDataResponse): TransferredItemSummary {
  return {
    itemId: raw.Id,
    name: raw.Name,
    parentId: raw.ParentId,
    templateId: raw.TemplateId,
    isTransferred: raw.IsTransferred,
    timeStampDate: raw.TimeStampDate,
  };
}

export async function listTransferredItems(
  host: string,
  token: string,
  databaseName: string,
  sourceName: string
): Promise<TransferredItemSummary[]> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/databases/${encodeURIComponent(databaseName)}/sources/${encodeURIComponent(sourceName)}/items`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  await assertOk(response, "List transferred items");
  const body: { Items?: ItemDataResponse[] } = await response.json();
  return (body.Items ?? []).map(toTransferredItemSummary);
}

export interface TransferredItemField {
  id: string;
  value: string;
  language?: string;
  version?: number;
}

export interface TransferredItemDetail extends TransferredItemSummary {
  fields: TransferredItemField[];
}

interface FieldDataResponse {
  Id: string;
  Value: string;
  Language?: string;
  Version?: number;
}

export async function getTransferredItem(
  host: string,
  token: string,
  databaseName: string,
  sourceName: string,
  itemId: string
): Promise<TransferredItemDetail> {
  const response = await fetch(
    `${baseUrl(host)}/transfers/databases/${encodeURIComponent(databaseName)}/sources/${encodeURIComponent(sourceName)}/items/${encodeURIComponent(itemId)}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  await assertOk(response, "Get transferred item");
  const body: ItemDataResponse & { Fields?: FieldDataResponse[] } = await response.json();
  return {
    ...toTransferredItemSummary(body),
    fields: (body.Fields ?? []).map((field) => ({
      id: field.Id,
      value: field.Value,
      language: field.Language,
      version: field.Version,
    })),
  };
}

export interface HistoryEvent {
  state: TransferState;
  date: string;
}

export interface HistoryEntry {
  name: string;
  sourceName: string;
  consumeDate: string;
  strategy: MergeStrategy;
  events: HistoryEvent[];
}

interface HistoryEventResponse {
  Name: TransferState;
  Date: string;
}

interface TransfersHistoryResponse {
  Name: string;
  SourceName: string;
  ConsumeDate: string;
  Strategy: MergeStrategy;
  Events: HistoryEventResponse[];
}

export async function getHistory(host: string, token: string): Promise<HistoryEntry[]> {
  const response = await fetch(`${baseUrl(host)}/history`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  await assertOk(response, "Get history");
  const body: { Sources?: TransfersHistoryResponse[] } = await response.json();
  return (body.Sources ?? []).map((entry) => ({
    name: entry.Name,
    sourceName: entry.SourceName,
    consumeDate: entry.ConsumeDate,
    strategy: entry.Strategy,
    events: (entry.Events ?? []).map((event) => ({ state: event.Name, date: event.Date })),
  }));
}
