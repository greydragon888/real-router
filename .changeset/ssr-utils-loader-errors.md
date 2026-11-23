---
"@real-router/ssr-utils": minor
---

Export `withTimeout` and the loader errors `LoaderNotFound`, `LoaderRedirect` and `LoaderTimeout` (#2977)

A loader throws `LoaderNotFound` or `LoaderRedirect`, and `withTimeout` rejects with `LoaderTimeout` once its deadline passes; the server's handler maps each to a 404, a 30x or a 504. `@real-router/ssr-data-plugin/errors` and `@real-router/rsc-server-plugin/errors` re-export these four names.

- `instanceof` holds for an error made by another copy of `@real-router/ssr-utils` — the one a plugin keeps when the application's own `ssr-utils` leaves the plugin's range — and by its other build, ESM or CJS: each instance carries a mark under `Symbol.for("@real-router/ssr-utils/loader-error")`, and `instanceof` against one of these classes admits a value that carries its mark, besides what the prototype chain admits.
- An application's subclass reads its own prototype chain alone, so `instanceof ProductNotFound` admits no plain `LoaderNotFound`, and TypeScript narrows to the subclass.
- The `code` field (`"LOADER_NOT_FOUND"`, `"LOADER_REDIRECT"`, `"LOADER_TIMEOUT"`) tells the errors apart as well, without importing the classes.
