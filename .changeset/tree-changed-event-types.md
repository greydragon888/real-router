---
"@real-router/types": minor
---

Add `TreeChangedEvent` payload types + `RoutesApi.subscribeChanges` (#702)

New discriminated-union types describing structural route-tree mutations —
`TreeChangedEvent` (`add` / `remove` / `update` / `replace` / `clear`),
`TreeStructuralPatch`, and the per-op variants — plus a new
`subscribeChanges(handler)` method on the `RoutesApi` interface for observing
them. The `TREE_CHANGED` channel is intentionally internal-only: it is not added
to the public `EventName` union or `Plugin` interface.
