---
"@real-router/svelte": patch
---

Fix unpublished `dom-utils` leaking into npm dependencies (#413)

Moved `dom-utils` from `dependencies` to `devDependencies`. Previously, `npm install @real-router/svelte` failed with `ETARGET: No matching version found for dom-utils`.
