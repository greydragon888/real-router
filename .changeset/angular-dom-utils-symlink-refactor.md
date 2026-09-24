---
"@real-router/angular": patch
---

Build `src/dom-utils` through a symlink to the shared sources (#2552)

`src/dom-utils` links to `shared/dom-utils`, as in the other framework adapters, instead of holding a copy that a `prebundle` script regenerated before every build. The published package is byte-identical to the previous build.
