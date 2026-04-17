---
"@real-router/preact": minor
---

Replace JSON-based deep equality with `shallowEqual` in Link memo comparator (#462)

`Link`'s `areLinkPropsEqual` previously called `JSON.stringify` on `routeParams` and `routeOptions` twice per comparator invocation. Replaced with `shallowEqual` (Object.is per key, order-insensitive) — ~20× speed-up on the comparator hot path.

- `shallowEqual` exported from `@real-router/preact` dom-utils barrel (via `shared/dom-utils/link-utils.ts`)
- `Link.tsx` additionally drops `useStableValue` for `routeParams`/`routeOptions` — the memo bail-out already catches stable references, so the extra serialization per render was redundant
- Correctness improvements:
  - `{id: 1n}` vs `{id: 1n}` now correctly treated as equal (`Object.is` handles BigInt)
  - `{a: undefined}` vs `{}` now correctly treated as NOT equal
  - Circular references and Symbol keys no longer trigger fallback paths
- Trade-off: nested objects/arrays in `routeParams` with equal content but different references now trigger a re-render. Stabilize via `useMemo` if needed — standard Preact pattern. In practice `routeParams` is almost always a flat `Record<string, primitive>`.

No public API change; gotcha documentation in `CLAUDE.md` updated.
