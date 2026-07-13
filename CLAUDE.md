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
  `src/hooks/use-transfer-job.ts` advances exactly one unit of work (one chunk, one chunk-set completion, one
  consume request) per call and is looped from a `useCallback` in the browser, so progress is observable between
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
  only still matters for the Explorer, which doesn't go through this SDK call at all.
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

## One job, one chunk set per item, one blob per chunk set

A `TransferJob` (client-side state in `src/hooks/use-transfer-job.ts`) creates exactly one Content Transfer
operation whose `dataTrees` array carries every selected item in a single `createTransfer` call — but the API
itself splits that into **one chunk set per data tree**, and each completed chunk set becomes its own
independent `.raif` file that must be separately consumed by the Item Transfer API (via the SDK's `consumeFile`).
There is no batched "consume everything at once" endpoint. Concretely:
- `job.chunkSets` is index-aligned with `job.items` — `chunkSets[i]` is assumed to correspond to `items[i]`
  because the confirmed status response returns chunk sets in DataTrees submission order and doesn't otherwise
  say which chunk set came from which item.
- Each chunk set carries its own destination pipeline once its chunks are uploaded: `completeChunkSet` →
  `blobName`, then `consumeFile` → `consumeRequested: true` (not a resolved destination source name — see the
  OpenAPI notes above on why the SDK's `consumeFile` can't hand one back).
- Retry (the `retry()` callback in `use-transfer-job.ts`) resets and reruns the whole job client-side, not a
  single item — the Content Transfer side has no per-item retry, only Item Transfer's per-source retry (exposed
  separately in the Explorer's Transfers panel, which still goes through the server-side
  `/api/explorer/transfers/[sourceName]/retry` route).

## The job reports "submitted," not "confirmed complete" — by design

`stepJob` does **not** poll the destination to confirm a consume actually finished. It was originally written
(in an earlier, server-side-orchestrated version of this app) to poll `GET /transfers/{sourceName}` until
`TransferState` was `Finished`/`Failed`, but in testing against a real environment a small/fast transfer (single
item, single chunk) returned a persistent 404 from that endpoint — for over a minute — even though the item had
already visibly landed in the destination. The transfer record appears to age out of that single-lookup endpoint
faster than it can be reliably confirmed there, despite `GET /transfers` (the list endpoint) being documented to
include completed transfers too.

That timing problem is now moot but the conclusion still holds, for a stronger reason: the wizard's consume call
goes through the Marketplace SDK's `xmc.contentTransfer.consumeFile`, which — unlike the raw Item Transfer API —
exposes no `sourceName` to poll with at all (see the OpenAPI notes above). So the job is considered `done` as
soon as every chunk set's consume request has been **accepted** (`consumeRequested: true` for all of them), not
once completion is confirmed — there's currently no wizard-side identifier to confirm it with even if the flaky
lookup above were fixed. The Review step's copy reflects this ("submitted", with a link to the Explorer) instead
of claiming success. Actual outcome is tracked asynchronously via the Explorer's Transfers and History panels
(which still go through the raw Item Transfer API server-side and do have a `sourceName` to work with), fetched
on demand with manual Refresh buttons for exactly this reason — give the destination a moment, then refresh.
