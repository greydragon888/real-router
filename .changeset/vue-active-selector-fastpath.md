---
"@real-router/vue": patch
---

Adopt the `createActiveNameSelector` fast path for `<Link>` active state (#1250)

- `useIsActiveRoute` resolves default-options active state (no custom params, non-strict, `ignoreQueryParams`, no `hash`) through the per-router shared `createActiveNameSelector` — one `router.subscribe` for any number of distinct-`routeName` links — instead of a per-instance `createActiveRouteSource` (a `BaseSource` + its own subscription each). Fewer subscriptions ⇒ lower mount cost and less retained heap, with per-nav active-state notifications unchanged (the selector keeps its `areRoutesRelated` pre-filter + only-changed diff). Direct port of the svelte (#1101) / angular (#1104) / react (#1248) / preact (#1249) fast paths. `useRefFromSource` is narrowed to the `subscribe` + `getSnapshot` methods it actually consumes, so the fast path can bridge a two-method selector wrapper without a dead `destroy`. The full argument surface (custom params, strict, `ignoreQueryParams: false`, hash) still uses `createActiveRouteSource`.
