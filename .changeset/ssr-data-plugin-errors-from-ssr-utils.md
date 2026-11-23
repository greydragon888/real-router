---
"@real-router/ssr-data-plugin": patch
---

`@real-router/ssr-data-plugin/errors` re-exports the loader errors and `withTimeout` of `@real-router/ssr-utils` (#2977)

The import path and its four names stay. They are now the classes of `@real-router/ssr-utils`, which `@real-router/rsc-server-plugin/errors` re-exports as well, and `instanceof` holds across this plugin's ESM and CJS builds and across copies of `@real-router/ssr-utils`. Before, each build of each SSR plugin carried classes of its own, so `instanceof` against a class from the other build, or from `@real-router/rsc-server-plugin/errors`, answered `false`.
