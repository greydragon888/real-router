---
"@real-router/angular": patch
---

Cover RouteView fallback resolution with real AOT unit tests, drop the `v8 ignore` (#1512)

No runtime changes (comment-only edit in `RouteView.ts`). The package's vitest config now runs two projects in one pass — the existing JIT suite plus a new `tests/aot/` project compiled by `@analogjs/vite-plugin-angular` — so the Self/NotFound fallback arms and the #1439 first-wins duplicate-marker semantics are executed and asserted for real (mutation-validated), instead of being excluded from coverage.
