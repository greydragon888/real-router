---
"@real-router/angular": minor
---

Migrate the Angular runtime from v21 to v22 (#1078)

The adapter now targets Angular 22. Runtime `@angular/*` devDependencies,
`ng-packagr`, and `@analogjs/vitest-angular` are bumped to the v22 line, and the
`peerDependencies` range widens to `@angular/core` / `@angular/common`
`>=22.0.0`.

Angular 22 requires **TypeScript 6.0** (already the repo baseline) and
**Node.js 22+**. The adapter's public API is unchanged — it depends only on
stable Angular APIs (signals, `inject`/`DestroyRef`, `afterNextRender`,
`makeEnvironmentProviders`, `TransferState`), none of which are affected by the
v22 breaking changes (which land in `@angular/router`, `@angular/forms`,
`HttpClient` — none of which the adapter uses).

Consumers on Angular 21 should stay on the previous `@real-router/angular`
release and upgrade Angular to 22 before taking this version.
