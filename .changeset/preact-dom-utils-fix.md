---
"@real-router/preact": patch
---

Fix unpublished `dom-utils` leaking into npm dependencies (#413)

Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/preact` failed with `ETARGET: No matching version found for dom-utils`.
