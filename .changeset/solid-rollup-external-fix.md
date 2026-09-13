---
"@real-router/solid": patch
---

Keep `@real-router/core/utils` an import instead of copying core's code into the bundle (#2300)

The published bundle carried a copy of core's `/utils` module — `putField`, plus whatever core's own bundler placed beside it — because the build's external list named `@real-router/core` and `/api` but not `/utils`. Every dependency and peer, with its subpaths, now stays an import, as in the other adapters. No API change.
