---
"@real-router/preact": minor
---

Audit-driven hardening of @real-router/preact (#462)

- **Hot path:** `useSyncExternalStore` now bails out on referentially-stable snapshots via `Object.is` inside the setter — prevents redundant re-renders when the upstream source emits the same snapshot (idempotent navigations, out-of-node updates)
- **`<RouteView>`:** memoize the flattened `Match`/`NotFound` element list on `children` identity. Steady-state navigations skip the `collectElements` traversal; only re-traverse when the parent re-renders with a new `children` node
- **`<RouteView>`:** `isSegmentMatch` now early-returns `false` for empty-string `fullSegmentName` — prevents a literal route named `""` from matching against `activeStrict=false` prefix logic
- **`useStableValue`:** rewritten as a pure `useRef` pattern with order-insensitive recursive JSON serialization via `stableSerialize`. Gracefully falls back to identity (`Object.is`) comparison when serialization throws (BigInt, circular refs, Symbol, function). Previously threw on BigInt and treated key-order permutations as different values
- **Stress coverage:** new suites for factory reuse across router instances, `replaceHistoryState` during active transitions, route deletion mid-session, mount/unmount lifecycle, subscription fan-out, and transition-hook stress
- **Property tests:** shared `routeView.properties.ts` updated to exercise the real helpers; `link.properties.ts` uses the production `shouldNavigate`/`buildHref`/`buildActiveClassName` exports instead of inline replicas
- **Docs:** README / ARCHITECTURE / CLAUDE brought back in sync with source

No public API change.
