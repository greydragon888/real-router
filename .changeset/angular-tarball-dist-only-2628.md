---
"@real-router/angular": patch
---

Ship `dist/` only: the tarball no longer carries the `ssr/` sources or a second copy of the README (#2628)

- `ssr/` held the TypeScript sources of the `/ssr` entry. `@real-router/angular/ssr` resolves to `dist/`, whose sourcemaps embed those sources, so no import, bundler or debugger read them. The one visible difference: "Go to Definition" on a `/ssr` symbol now opens its declaration file, as it already did for the main entry.
- `dist/README.md` was ng-packagr's copy of the package README, which already ships at the package root.

No API change: every export resolves to the same file as before.
