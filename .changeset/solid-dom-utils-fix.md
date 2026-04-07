---
"@real-router/solid": patch
---

Fix unpublished `dom-utils` leaking into npm dependencies (#413)

Moved `dom-utils` from `dependencies` to `devDependencies`. Rollup already inlines `dom-utils` via `nodeResolve`, but the dependency declaration caused `npm install @real-router/solid` to fail with `ETARGET: No matching version found for dom-utils`.
