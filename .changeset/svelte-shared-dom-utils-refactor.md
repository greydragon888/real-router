---
"@real-router/svelte": patch
---

Replace `dom-utils` workspace package with symlinked shared sources (#437)

Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through the existing `src/dom-utils` symlink (now repointed to `../../../shared/dom-utils`). The `kit.alias` indirection in `svelte.config.js` has been removed in favor of direct relative imports (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.
