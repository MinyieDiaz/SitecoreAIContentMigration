# Plan: Global scope & merge strategy for selected items

**Status:** implemented
**Scope:** Migration Wizard, "Select content" step only

## Goal

Add a global **Scope** and **Merge strategy** control to the Select content step that:

1. seeds newly-checked items with the current global values, and
2. overwrites every already-selected item when either global value changes,

while leaving the per-row selects intact so individual items can still diverge.

## Behavior decision

Global controls act as **default + apply to all**, not as an inert pair of selects
behind an explicit "Apply to all" button, and not as a replacement for the per-item
selects:

- Changing a global select updates every currently-selected row *and* becomes the
  default for subsequently checked items.
- Changing a single row diverges only that row; the corresponding global select then
  renders as "Mixed".
- Picking an option from a "Mixed" global select re-applies it to everything.

## Where state lives

`globalScope` / `globalMergeStrategy` live in `src/components/wizard/MigrationWizard.tsx`,
not in `SelectContentStep`, because `handleToggle` there is what constructs new
`SelectedItem`s and needs the current defaults. It currently hardcodes
`scope: "SingleItem"` / `mergeStrategy: "OverrideExistingItem"` — those become the
`useState` initial values instead.

New handler alongside `handleUpdate`:

```ts
const handleApplyToAll = (patch: Partial<Pick<SelectedItem, "scope" | "mergeStrategy">>) => {
  if (patch.scope) setGlobalScope(patch.scope);
  if (patch.mergeStrategy) setGlobalMergeStrategy(patch.mergeStrategy);
  setSelections((previous) => previous.map((item) => ({ ...item, ...patch })));
};
```

One state update covers both jobs — the default for future picks and the bulk
overwrite — so they can't drift apart.

## "Mixed" without a fake enum value

In `SelectContentStep.tsx`, derive each global select's displayed value:

```ts
const uniform = <K extends "scope" | "mergeStrategy">(key: K) =>
  selections.length === 0
    ? globals[key]                                   // nothing selected yet -> show the default
    : selections.every((i) => i[key] === selections[0][key])
      ? selections[0][key]
      : undefined;                                   // diverged -> Radix falls back to placeholder
```

Passing `value={undefined}` makes Radix's `SelectValue` render its `placeholder`, so
`<SelectValue placeholder="Mixed" />` gives the mixed state for free — no sentinel
`SelectItem` that could be accidentally submitted as a real `TransferScope`.

## Layout

Reuse the existing right-hand card in the `md:grid-cols-[2fr_1fr]` grid rather than
adding a row:

```
+- Selected (3) --------------+
| Apply to all items          |
| Scope                       |
| [This item and all desc. v] |
| Merge strategy              |
| [Override existing item  v] |
+-----------------------------+
```

- Labels via the installed `field` / `label` Blok components.
- `SelectTrigger` is `w-fit` by default, so both global selects need `className="w-full"`.
- The `SCOPE_OPTIONS` and `LatestWin`-filtered `MERGE_STRATEGY_OPTIONS` constants already
  at the top of the file are reused verbatim — no second copy of the filter, so the
  confirmed Sitecore `LatestWin` bug stays excluded in exactly one place.
- Helper copy changes from "Configure each item's scope and merge strategy below" to note
  that the global controls apply to all items and that per-row selects override them.

## Not touched

`SelectedItem` keeps `scope` / `mergeStrategy` per item, so `ReviewTransferStep`,
`use-transfer-job.ts`, and the `dataTrees` payload need no changes. This is purely a
selection-UI addition.

## Files

| File | Change |
| --- | --- |
| `src/components/wizard/MigrationWizard.tsx` | two `useState`, `handleApplyToAll`, pass 3 new props |
| `src/components/wizard/SelectContentStep.tsx` | new props, `uniform` derivation, global controls in the card |
