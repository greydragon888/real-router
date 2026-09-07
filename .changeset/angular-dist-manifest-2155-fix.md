---
"@real-router/angular": patch
---

Published type declarations no longer masquerade as CommonJS (#2155)

ng-packagr copies this package's manifest into `dist/package.json`, and Node
reads a file's module format from the nearest manifest above it — so the shipped
`dist/types/*.d.ts` resolved as CommonJS while `dist/fesm2022/*.mjs` is ESM.
`attw` reported `Masquerading as CJS` on both node16 rows, for
`@real-router/angular` and `@real-router/angular/ssr` alike; both now report
`ESM`, matching `@angular/router`. The generated manifest declares
`"type": "module"` and drops the nested `exports` field that Node ignores in a
non-root manifest. Nothing in the package's source or public API changed.
