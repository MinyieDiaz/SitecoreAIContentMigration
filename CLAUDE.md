@AGENTS.md

# Content Migration — Sitecore Marketplace App

Migrates content between two SitecoreAI instances (source → destination) using the
Content Transfer API (source) and Item Transfer API (destination). Built as a
Sitecore Marketplace app.

## UI rule: everything is Blok

**Every UI element in this app must use Blok, Sitecore's design system.**

- Blok components already installed live in `src/components/ui/`. Use them as-is.
- To add a component that isn't installed yet: `npx shadcn@latest add https://blok.sitecore.com/r/<component>.json`
  (or `https://blok.sitecore.com/r/blok-components.json` for the full set). Do not hand-roll a component Blok
  already provides, and do not introduce a second UI kit.
- Use Blok's theme tokens exclusively — the CSS variables in `src/app/globals.css`
  (`--color-*`, `--font-*`, `--radius-*`, `--spacing-*`). Never hardcode hex colors, px spacing, or font sizes;
  use the Tailwind utilities those variables generate (`bg-primary`, `text-muted-foreground`, `rounded-md`, etc.).
- Blok has no tree component. The content tree in `src/components/tree/` is a deliberate composition of
  `collapsible` + `checkbox` + `button` — keep that pattern rather than pulling in a third-party tree library.
- Reference docs: [blok.sitecore.com](https://blok.sitecore.com), [github.com/Sitecore/blok](https://github.com/Sitecore/blok).
- Installed component inventory: accordion, action-bar, alert(-dialog), aspect-ratio, avatar, badge, breadcrumb,
  button, calendar, card, carousel, chart, checkbox, circular-progress, collapsible, command, context-menu,
  date-picker, dialog, draggable, dropdown-menu, editable, empty/error-states, field, filter, icon,
  input(-group/otp/search), kbd, label, navigation-menu, pagination, popover, progress, radio-group, resizable,
  scroll-area, select(-react), separator, sheet, sidebar, skeleton, slider, sonner (toasts), spinner,
  stack-navigation, stepper, switch, table, tabs, textarea, time-picker, timeline, toggle(-group), tooltip —
  install whichever of these aren't yet under `src/components/ui/` on demand.

## Architecture

Two independent authorization paths coexist — don't assume a change to one applies to the other:

- **Migration Wizard** (`src/components/wizard/*`) runs embedded in Sitecore Cloud Portal and talks to
  Sitecore straight from the browser through the Marketplace SDK's `xmc` module (`client.mutate`/`client.query`
  against `xmc.contentTransfer.*` and `xmc.authoring.graphql`). The Portal authorizes those calls using
  whichever environments this app installation was already granted access to (`application.context`'s
  `resourceAccess`, surfaced via `useMarketplaceClient`/`useMarketplaceContext`) — there's no host/client-ID/
  secret entry, and no server-side session, anywhere in this flow. Source and destination are therefore
  constrained to the app's granted environments, not arbitrary user-supplied hosts. See
  `src/lib/sitecore/clientTransfer.ts`, `src/lib/sitecore/xmcAuthoring.ts`, `src/hooks/use-transfer-job.ts`.
- **Explorer** (`src/app/explorer`) connects to a destination independently of the wizard, using automation
  client credentials (host/client ID/secret) entered directly into the app for an arbitrary environment. Those
  calls go through Next.js API routes (`src/app/api/environments/*`, `src/app/api/explorer/*`) that hit the raw
  Item Transfer REST API server-side — see `src/lib/sitecore/itemTransfer.ts`. The credentials are **ephemeral**:
  exchanged for a JWT server-side and held only for the browser session, never persisted to disk or a database,
  and never sent back to the browser. A Sitecore client-credentials JWT can carry enough org/resource-access
  claims to be several KB on its own — sealing even one into an `iron-session` cookie can overflow the ~4KB
  browser cookie ceiling — so the JWTs themselves live in a single-process, in-memory map (cleared on restart,
  not multi-instance-safe, acceptable for an internal tool). The httpOnly session cookie holds only a small
  opaque session ID used to look up that map. See `src/lib/session.ts`.
- Content tree browsing (wizard only) uses the source's Authoring & Management **GraphQL** API through the
  Marketplace SDK's `xmc.authoring.graphql` bridge, not a raw fetch — see `src/lib/sitecore/xmcAuthoring.ts`.
  Navigation starts at `/sitecore` (`DEFAULT_ROOT_PATH` in `src/lib/types.ts`), i.e. the full content tree —
  templates, layouts, media library, system items — not just `/sitecore/content`.
- Migration runs as a **client-side step loop**, not a server-orchestrated job: `stepJob` in
  `src/hooks/use-transfer-job.ts` advances exactly one unit of work (one source-readiness poll, one chunk, one
  chunk-set completion, one consume request, one consume-status poll) per call and is looped from a
  `useCallback` in the browser, so progress is observable between
  renders without a server-side job store, an HTTP endpoint to poll, or a long-lived execution context. There is
  no `/api/transfer/*` route — that orchestration used to live server-side (see git history for the old
  `orchestrator.ts` / `/api/transfer/[jobId]/step` design) before moving to this client-side model.

## API schemas are confirmed against the live OpenAPI specs

Both `src/lib/sitecore/clientTransfer.ts` (Content Transfer, called through the Marketplace SDK's `xmc` bridge)
and `src/lib/sitecore/itemTransfer.ts` (Item Transfer, called via raw REST from the Explorer's server routes) are
written against the real OpenAPI specs (`https://api-docs.sitecore.com/_bundle/sai/content-transfer/index.yaml`
and `.../sai/item-transfer/index.yaml`), not guessed shapes — re-fetch those if either API appears to have
changed. Key things that are easy to get wrong if re-deriving this from the prose docs alone:
- All request **and response** bodies are PascalCase (`TransferId`, `State`, `ChunkSetsMetadata`,
  `TransferState`, `SourceName`, ...) — camelCase assumptions will silently read `undefined` and crash on
  `.map()`/etc. rather than erroring loudly. This holds whether the body is unwrapped from a raw `fetch` (Item
  Transfer) or from the Marketplace SDK's hey-api-generated wrapper (Content Transfer) — the SDK doesn't
  camelCase anything for you.
- `ContentTransfer_CompleteChunkSetAsync` returns `{ ContentTransferFileName }` — the exact `.raif` blob name.
  Use it directly; don't guess which blob a transfer produced.
- The SDK's `xmc.contentTransfer.consumeFile` (used to start a consume from the wizard) exposes **no response
  body or headers at all** to app code — unlike the raw Item Transfer API's `POST .../sources`, which at least
  returns a `location` header carrying the resulting source name. There is therefore no way for the wizard to
  recover a `sourceName` from its own consume call; `ChunkSetProgress.consumeRequested` is a boolean ("was
  consume requested") rather than a resolved name — see `src/lib/types.ts`. The raw `location`-header behavior
  only still matters for the Explorer, which doesn't go through this SDK call at all. The wizard tracks the
  outcome by **blob name** instead, via `xmc.contentTransfer.getBlobState` — see the last section below.
- The Marketplace SDK's postMessage bridge rejects any request the host hasn't answered within **30s** by default
  (`[client SDK] Request timed out`, raised in the browser, not by Sitecore). The only override is
  `ClientSDK.init({ timeout })` — the per-call `timeoutMs` option is logged but never applied (SDK 0.3.x). Media
  `getChunk` calls were seen exceeding 30s while content chunks didn't, so the app sets a 5-minute timeout in
  `use-marketplace-client.ts`.
- `createContentTransfer` returns `202 Accepted` and the source builds the transfer **asynchronously**: poll
  `getContentTransferStatus` until `State` is `Completed` before trusting `ChunkSetsMetadata` (it's empty or
  partial before then). Reading it early is what made `ItemAndDescendants` transfers "finish" instantly with
  nothing in them — see `pollPreparedChunkSets` in `clientTransfer.ts`.
- The Item Transfer API's `ItemData` (`GET .../items`) has no path field, only `Name`/`ParentId`/`Id` — there is
  no supported way to get a full item path back from that endpoint.
- `GET /transfers/{transferId}`'s `transferId` path segment is actually the source/blob file name, not a
  separate opaque ID — it's the value the raw Item Transfer API's `startConsume` returns in its `location`
  header (Explorer path only; the wizard has no equivalent value to reuse here, per the point above).

`Scope` is `SingleItem` | `ItemAndDescendants`; `MergeStrategy` is `OverrideExistingItem` | `KeepExistingItem` |
`LatestWin` | `OverrideExistingTree`. See `src/lib/types.ts` and `src/lib/labels.ts` for the enums and labels.
`LatestWin` is deliberately filtered out of the wizard's merge-strategy picker (see `SelectContentStep.tsx`) —
Sitecore has a confirmed bug in that strategy — but stays in the type/labels so past jobs that used it still
render correctly in the Explorer's history.

## One job, one or more chunk sets, one blob per chunk set

A `TransferJob` (client-side state in `src/hooks/use-transfer-job.ts`) creates exactly one Content Transfer
operation whose `dataTrees` array carries every selected item in a single `createTransfer` call. The API splits
that into **one or more chunk sets**, and each completed chunk set becomes its own independent `.raif` file that
must be separately consumed by the Item Transfer API (via the SDK's `consumeFile`). There is no batched "consume
everything at once" endpoint. Concretely:
- Chunk sets are **not** one per selected item — a live two-item transfer came back as a single chunk set — and
  the status response doesn't say which items a chunk set holds. Never index `job.items` by chunk set position.
  Progress and outcomes are reported per chunk set ("part") on Review. `isMedia` is resolved once when the
  transfer is prepared (`resolveChunkSetIsMedia` in `clientTransfer.ts`): index-aligned when the counts happen
  to match, otherwise only when every selected item agrees on it — a mixed media/non-media selection whose
  counts don't match fails with a "transfer media library items separately" error.
- Each chunk set carries its own destination pipeline once its chunks are uploaded: `completeChunkSet` →
  `blobName`, then `consumeFile` → `consumeRequested: true` (not a resolved destination source name — see the
  OpenAPI notes above on why the SDK's `consumeFile` can't hand one back), then `getBlobState` polled until
  `consumeOutcome` is set. Chunk sets are consumed **one at a time, in the order the source returned them** —
  the next consume isn't requested until the previous one reaches a terminal state.
- Failures are handled at two levels. Calls that are safe to repeat (`getTransferStatus`, `getChunk`,
  `saveChunk`, `getBlobState`) retry transient network/gateway errors automatically via `withRetry`
  (`src/lib/retry.ts`). `createTransfer`, `completeChunkSet`, and `consumeFile` don't, since repeating them
  could have side effects. If a step still throws, the job records `failedAt`, and **Resume** (`resume()` in
  `use-transfer-job.ts`) continues from that phase with the same source transfer and chunk progress, while
  **Start over** (`startOver()`) creates a new source transfer. A job that failed because the destination
  reported an import error isn't resumable. Packages' install job (`use-install-package.ts`) has the same
  Resume/Start over pair (its chunks come from the in-memory package, so only while the page stays open). The Content Transfer side has no per-item retry. Item Transfer's
  per-source retry is exposed separately in the Explorer's Transfers panel, which still goes through the
  server-side `/api/explorer/transfers/[sourceName]/retry` route.

## The job confirms the destination import via GetBlobState

The wizard's consume goes through the SDK's `consumeFile`, which exposes no `sourceName` (see the OpenAPI notes
above), so `GET /transfers/{sourceName}` was never an option here. Instead, after each consume the job polls
`xmc.contentTransfer.getBlobState` — keyed by the `.raif` **blob name** the job already has — every 5 seconds
(`STATUS_POLL_INTERVAL_MS`, deliberately not faster) until it reports `Transferred`, `TransferredWithErrors`, or
`Error`. The job ends `done`, `done-with-errors` (partial success; `ValidationErrors` are in the Explorer), or
`failed`. See `pollConsumeOutcome` in `clientTransfer.ts` and the shared `stepConsume`/`consumeResult` in
`src/lib/consume.ts`, which the wizard and Packages' install job both use. An install destination without a
status check (the credentialed route, for now) marks each part `unconfirmed` once its consume is accepted.

Confirmed against a live environment:
- The SDK types the response as `{ status, details }` — **wrong**. The real body is PascalCase like the rest of
  this API: `{ BlobState, Error, ConsumedName, Actions: { Details } }`, where `Actions.Details` is a
  status-details URL string. Parsing the SDK's shape read nothing and left jobs stuck in "consuming".
  `BlobState` goes `Consumed` (items readable) → `Transferred` (background DB sync finished); only the latter
  is terminal — both observed live on the same blob.
- `ConsumedName` (`consumed.<timestamp>.<guid>`) is the Item Transfer **sourceName** — so the wizard *can*
  recover one after all, just from GetBlobState rather than from `consumeFile`. Nothing uses it yet.
- `GetBlobState` takes the **bare** blob name — unlike `consumeFile`, which requires `blob://`. Confirmed live:
  `blob://<name>` returned an error carrying Azure's `404 BlobNotFound` (an error, not a `status: NotFound`
  body), while the same `.raif` was listed by bare name in the destination's blob sources as `Transferred` — so
  the blob does persist after consume. `getBlobState` still normalizes a `BlobNotFound` error to `NotFound`;
  if that persists past a 2-minute grace period the chunk set ends `unconfirmed` (the pre-GetBlobState
  "submitted" behavior, and Review says so) rather than failing a job whose content may well have landed.

The Explorer's Transfers and History panels still track outcomes independently through the raw Item Transfer
API server-side (where a `sourceName` is available).
