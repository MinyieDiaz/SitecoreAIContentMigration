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

- Next.js App Router, full-stack (API routes do all Sitecore API calls — never call Sitecore APIs directly
  from client components).
- Source/destination environment credentials are **ephemeral**: exchanged for a JWT server-side and held only
  for the browser session, never persisted to disk or a database, and never sent back to the browser. A
  Sitecore client-credentials JWT can carry enough org/resource-access claims to be several KB on its own —
  sealing even one into an `iron-session` cookie can overflow the ~4KB browser cookie ceiling — so the JWTs
  themselves live in a single-process, in-memory map (same tradeoff as the job store below: cleared on
  restart, not multi-instance-safe, acceptable for an internal tool). The httpOnly session cookie holds only a
  small opaque session ID used to look up that map. See `src/lib/session.ts`.
- Content tree browsing uses the source's Authoring & Management **GraphQL** API directly (not the Marketplace
  SDK's `xmc` bridge, which only reaches the environment the app is installed into — our source/destination are
  arbitrary, user-supplied environments). See `src/lib/sitecore/graphql.ts`.
- Migration is orchestrated **one step per request** (`/api/transfer/[jobId]/step`) rather than one long-running
  call, so the client drives progress via polling and the server never needs a long-lived execution context.
- See the plan file this was built from for the full design: chunk relay (GET from source, PUT to destination),
  per-item scope/merge-strategy customization, and the Explorer surface over transfer history/blobs/item
  inspection.

## API schemas are confirmed against the live OpenAPI specs

Both `src/lib/sitecore/contentTransfer.ts` and `src/lib/sitecore/itemTransfer.ts` are written against the real
OpenAPI specs (`https://api-docs.sitecore.com/_bundle/sai/content-transfer/index.yaml` and
`.../sai/item-transfer/index.yaml`), not guessed shapes — re-fetch those if either API appears to have changed.
Key things that are easy to get wrong if re-deriving this from the prose docs alone:
- All request **and response** bodies are PascalCase (`TransferId`, `State`, `ChunkSetsMetadata`,
  `TransferState`, `SourceName`, ...) — camelCase assumptions will silently read `undefined` and crash on
  `.map()`/etc. rather than erroring loudly.
- `POST /transfers` (create) and `POST .../sources` (start consume) both return no JSON body (202 Accepted) —
  `startConsume`'s result comes from the `location` response header, not a parsed body.
- `ContentTransfer_CompleteChunkSetAsync` returns `{ ContentTransferFileName }` — the exact `.raif` blob name.
  Use it directly; don't guess which blob a transfer produced.
- The Item Transfer API's `ItemData` (`GET .../items`) has no path field, only `Name`/`ParentId`/`Id` — there is
  no supported way to get a full item path back from that endpoint.
- `GET /transfers/{transferId}`'s `transferId` path segment is actually the source/blob file name, not a
  separate opaque ID — it's the value returned in the `location` header from `startConsume`.

`Scope` is `SingleItem` | `ItemAndDescendants`; `MergeStrategy` is `OverrideExistingItem` | `KeepExistingItem` |
`LatestWin` | `OverrideExistingTree`. See `src/lib/types.ts` and `src/lib/labels.ts` for the enums and labels.

## One job, one chunk set per item, one blob per chunk set

A `TransferJob` (`src/lib/sitecore/orchestrator.ts`) creates exactly one Content Transfer operation whose
`DataTrees` array carries every selected item in a single `POST /transfers` call — but the API itself splits
that into **one chunk set per data tree**, and each completed chunk set becomes its own independent `.raif`
file that must be separately consumed by the Item Transfer API. There is no batched "consume everything at
once" endpoint. Concretely:
- `job.chunkSets` is index-aligned with `job.items` — `chunkSets[i]` is assumed to correspond to `items[i]`
  because the confirmed status response returns chunk sets in DataTrees submission order and doesn't otherwise
  say which chunk set came from which item.
- Each chunk set carries its own destination pipeline once its chunks are uploaded: `completeChunkSet` →
  `blobName`, then `startConsume` → `destinationSourceName`.
- Retry (`resetJob` / `POST /api/transfer/[jobId]/retry`) resets and reruns the whole job, not a single item —
  the Content Transfer side has no per-item retry, only Item Transfer's per-source retry (exposed separately in
  the Explorer's Transfers panel).

## The job reports "submitted," not "confirmed complete" — by design

`stepJob` does **not** poll the destination to confirm a consume actually finished. It was originally written
to poll `GET /transfers/{sourceName}` until `TransferState` was `Finished`/`Failed`, but in testing against a
real environment a small/fast transfer (single item, single chunk) returned a persistent 404 from that endpoint
— for over a minute — even though the item had already visibly landed in the destination. The transfer record
appears to age out of that single-lookup endpoint faster than it can be reliably confirmed there, despite
`GET /transfers` (the list endpoint) being documented to include completed transfers too.

Rather than chase that undocumented backend timing further, the job is considered `done` as soon as every chunk
set's consume request has been **accepted** (`destinationSourceName` set for all of them) — not once completion
is confirmed. The Review step's copy reflects this ("submitted", with a link to the Explorer) instead of
claiming success. Actual outcome is tracked asynchronously via the Explorer's Transfers and History panels,
which fetch on demand and have manual Refresh buttons for exactly this reason — give the destination a moment,
then refresh. If a more reliable way to confirm completion synchronously turns up (e.g. `GET /transfers` list
search instead of single-lookup), revisit this.
