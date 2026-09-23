// Raw REST counterparts of the three destination-side Content/Item Transfer
// operations, called directly against an environment's own host with an
// automation-client JWT -- the credentialed install path described in
// docs/plans/credentialed-install.md. Unlike the Marketplace SDK's
// `xmc.contentTransfer.*` bridge (see clientTransfer.ts), these expose the
// `location` response header the consume step needs to recover a sourceName.

export class ContentTransferRestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ContentTransferRestError";
  }
}

// Content Transfer's chunk/complete steps live under this prefix -- distinct
// from Item Transfer's `/sitecore/shell/api/v3/ItemsTransfer` prefix used by
// consume below and by itemTransfer.ts. Do not fold the two under one base.
function contentTransferBaseUrl(host: string): string {
  return `https://${host}/sitecore/api/content/transfer/v1/transfers`;
}

function itemTransferBaseUrl(host: string): string {
  return `https://${host}/sitecore/shell/api/v3/ItemsTransfer`;
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function assertOk(response: Response, action: string) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ContentTransferRestError(`${action} failed (${response.status}): ${text}`, response.status);
  }
}

// PUT .../transfers/{transferId}/chunksets/{chunksetId}/chunks/{chunkId} -- the
// body is raw chunk bytes, not JSON or multipart. `isMedia` must match the
// value baked into the manifest at generate time. `body` accepts a
// ReadableStream so the server route can forward the incoming request body
// without buffering it -- see docs/plans/credentialed-install.md risk #2.
export async function saveChunk(
  host: string,
  token: string,
  transferId: string,
  chunksetId: string,
  chunkId: number,
  body: BodyInit,
  isMedia: boolean
): Promise<void> {
  const url = `${contentTransferBaseUrl(host)}/${encodeURIComponent(transferId)}/chunksets/${encodeURIComponent(
    chunksetId
  )}/chunks/${chunkId}?isMedia=${isMedia}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: authHeaders(token, { "Content-Type": "application/octet-stream" }),
    body,
    cache: "no-store",
    // Required by Node's fetch when the body is a stream (forwarding the
    // incoming request body here rather than buffering it first).
    duplex: "half",
  } as RequestInit);
  await assertOk(response, "Save chunk");
}

// POST .../transfers/{transferId}/chunksets/{chunksetId}/complete -- returns
// the exact .raif blob name to hand to startConsume below.
export async function completeChunkSet(
  host: string,
  token: string,
  transferId: string,
  chunksetId: string
): Promise<{ blobName: string }> {
  const url = `${contentTransferBaseUrl(host)}/${encodeURIComponent(transferId)}/chunksets/${encodeURIComponent(
    chunksetId
  )}/complete`;
  const response = await fetch(url, { method: "POST", headers: authHeaders(token), cache: "no-store" });
  await assertOk(response, "Complete chunk set");
  const body: { ContentTransferFileName: string } = await response.json();
  return { blobName: body.ContentTransferFileName };
}

// POST .../transfers/databases/{databaseName}/sources?blobName={blobName} --
// takes a bare blobName with no `blob://` scheme prefix, unlike the SDK's
// consumeFile. Returns 202 with a `location` header carrying the resulting
// sourceName; a missing header means consume still succeeded (the request
// was accepted), so this returns null rather than throwing.
export async function startConsume(
  host: string,
  token: string,
  databaseName: string,
  blobName: string
): Promise<{ sourceName: string | null }> {
  const url = `${itemTransferBaseUrl(host)}/transfers/databases/${encodeURIComponent(
    databaseName
  )}/sources?blobName=${encodeURIComponent(blobName)}`;
  const response = await fetch(url, { method: "POST", headers: authHeaders(token), cache: "no-store" });
  await assertOk(response, "Consume");
  const location = response.headers.get("location");
  if (!location) return { sourceName: null };
  const sourceName = location.split("/").filter(Boolean).pop();
  return { sourceName: sourceName ?? null };
}
