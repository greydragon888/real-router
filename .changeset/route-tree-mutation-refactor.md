---
"@real-router/core": patch
---

Harden the internal `route-tree` dependency via mutation testing (#928)

Test-only and runtime-no-op changes to `route-tree` (consumed by `@real-router/core`): kill surviving mutants with targeted tests, remove dead write-only `MutableRouteNode` fields, and document/disable proven-equivalent mutants — raising its mutation score from 94.62% to 98.90%. No observable behavior change in `@real-router/core`.
