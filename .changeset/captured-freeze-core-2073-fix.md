---
"@real-router/core": patch
---

`Object.freeze` is read from a module-load capture at every runtime site (#2073)

`Router.ts` bound `freeze` at module load and froze `snapshotQueryParams`' and
`deriveMatcherOptions`' results through the raw call fifteen hundred lines below
— the shape #1971 measured for `Object.entries` in `utils/ingest.ts`. Eleven
more files did the same without holding a capture at all.

Measured on the uncaptured form: `matcherOptions` came back writable, its
`queryParams` slot could be replaced, and the next matcher rebuild — an ordinary
`add()` — threw `Invalid "queryParams.arrayFormat"`, which is the defect that
freeze exists to convert into an error at the write site. The published route
tree came back unfrozen on the same shim.

Both are pinned by `captured-build-intrinsics-behaviour-2073.test.ts`.

⚠ Capture narrows the window from "any time after boot" to "before this module
loads"; a shim evaluated ahead of the router still wins (#1798). It is robustness
against polyfills, instrumentation, extensions and test doubles, not a security
boundary. Module-scope constants are out of scope by the same argument — they are
frozen before any application code can run.
