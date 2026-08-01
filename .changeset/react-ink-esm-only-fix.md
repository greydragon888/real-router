---
"@real-router/react": minor
---

Make `@real-router/react/ink` ESM-only — the published `require` condition could never load (#1628)

`exports["./ink"]` advertised `require` → `dist/cjs/ink.js` (and `types.require`), but that entry was impossible to load on any Node version: it statically requires `ink`, and `ink@7` is ESM-only with **top-level await** in its graph, so Node answers `require() cannot be used on an ESM graph with top-level await`. A CJS-targeting bundler fares no better — top-level await cannot be represented in CJS output.

`import("@real-router/react/ink")` is unchanged. `require("@real-router/react/ink")` now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which names the real situation instead of a confusing top-level-await error. **No working consumer can be affected** — the removed path never resolved; the bump is `minor` only because the published export map loses a condition.

Found by the package smoke test after it was extended to exercise `require()` alongside `import()`: `dist/cjs/**` had never been loaded by any gate, and neither `publint` (reads the manifest) nor `attw` (resolves types) executes a CJS entry.
