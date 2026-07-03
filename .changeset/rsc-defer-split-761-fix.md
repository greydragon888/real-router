---
"@real-router/rsc-server-plugin": patch
---

Keep the server-only defer wire-format out of the client `.` bundle (#761)

`rsc-server-plugin` shares `shared/ssr` with `ssr-data-plugin`. Splitting `deferRegistry.ts` into a client registry module and a server-only `deferWireFormat.ts` removes the dead defer wire-format — including its impure module-level `RegExp` initialiser — from the chunk behind `dist/esm/index.mjs`. RSC never calls `defer()`, so this code was pure dead weight in the client bundle. No API or runtime behavior change.
