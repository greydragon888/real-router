---
"@real-router/validation-plugin": minor
---

refactor(validation-plugin): remove dead surface — `maxRoutes` phantom, `validateDependencyLimit` stub, orphaned `RouterValidator` wrappers (#1226)

Cleans up mirror-drift found in the wave-2 audit (item 4, the dup-name branch,
already landed in #1351):

- **`maxRoutes` phantom** — `checkRouteCountLimit` was unreachable (`LimitsConfig`
  has no `maxRoutes` key and `validateOptions` rejects it); removed the function
  and its white-box tests.
- **`validateDependencyLimit` dead stub** — the empty wrapper and its orphaned impl
  are removed; the dependency-count limit is enforced by `validateDependencyCount`
  per new key.
- **Orphaned `RouterValidator` wrappers** (post-#960) — the six interface methods
  core never called are dropped from the validator object; every underlying
  file-scope impl stays (each is still called by the retrospective pass or another
  live validator). No behavior change — all removed surface was dead.
