---
"@real-router/angular": patch
---

Fix `<a [realLink]="signal()">` active state not reacting to signal input changes in AOT (#630)

`RealLink`, `RealLinkActive`, and `RouteView` previously captured signal-input values once in `ngOnInit` — `createActiveRouteSource` / `createRouteNodeSource` was bound to the initial `routeName` / `routeParams` / `hash` / `routeNode` values and never recreated when those inputs changed reactively. In AOT (where signal-input template bindings work), `href` updated correctly (it's a `computed`), but `.active` class kept tracking the original values — asymmetric reactivity, real bug.

**Fix**: source-creation setup moved from `ngOnInit` into `effect((onCleanup) => …)` from the constructor. Reading signal inputs inside the effect makes the setup reactive to Angular's signal graph — any input change re-runs the effect, `onCleanup` tears down the previous source (no-op for cached sources from `@real-router/sources`), and a new source is created with the current input values. Effect cleanup auto-registers with the injection-context `DestroyRef`.

**Behavioral parity with React/Preact**: `<Link>` in those adapters re-renders on every prop change and re-evaluates `useIsActiveRoute(routeName, params)` each time. Angular now matches that behavior in AOT.

**JIT note**: full reactive-input verification requires AOT compilation — JIT rejects signal-input template bindings with `NG0303`. The fix is structurally correct in JIT (existing JIT tests continue to pass) but the asymmetric-reactivity scenario itself can only be reproduced under AOT. CLAUDE.md gotcha updated with the new pattern and testing limitation.

**No public API change** — the `OnInit` interface and `ngOnInit` method were internal implementation details. Consumers' templates continue to work unchanged.
