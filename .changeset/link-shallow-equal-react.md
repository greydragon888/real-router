---
"@real-router/react": minor
---

Replace JSON-based deep equality with `shallowEqual` in Link memo comparator (#462)

`Link`'s `areLinkPropsEqual` previously called `stableSerialize` (JSON.stringify with sorted keys) on `routeParams` and `routeOptions` twice per comparator invocation — ~850 ns per Link per parent re-render. Replaced with `shallowEqual` (Object.is per key, order-insensitive) — ~40 ns, a ~20× speed-up on the comparator hot path.

- `shallowEqual` exported from `@real-router/react` dom-utils barrel (via `shared/dom-utils/link-utils.ts`)
- Correctness improvements alongside the speed-up:
  - `{id: 1n}` vs `{id: 1n}` now correctly treated as equal (`Object.is` handles BigInt)
  - `{a: undefined}` vs `{}` now correctly treated as NOT equal (previous JSON-based path treated them as equal, masking structural differences)
  - Circular references and Symbol keys no longer trigger fallback paths
- Trade-off: nested objects/arrays in `routeParams` with equal content but different references now trigger a re-render. Stabilize via `useMemo` if needed — standard React pattern. In practice `routeParams` is almost always a flat `Record<string, primitive>`.

No public API change; gotcha documentation in `CLAUDE.md` updated.
