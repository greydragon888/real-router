---
"@real-router/angular": patch
---

Keep the `/ssr` entry's sources in `src/ssr/` (#2627)

The seven source files of `@real-router/angular/ssr` move from `ssr/` to `src/ssr/`; `ssr/` keeps only the entry's `ng-package.json`, which points at them. Every tool that reads the package's `src/` — coverage, Sonar, CodeQL, jscpd, turbo's task keys — now reads the `/ssr` entry as well.

No API change: the built `.mjs` and `.d.ts` files are byte-identical. The `/ssr` source maps name `src/ssr/…` as their sources.
