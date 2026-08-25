---
"@real-router/validation-plugin": patch
---

Registering routes no longer throws because of a route name the application also defined (#1852)

`validateForwardTo` builds a combined forward map keyed by ROUTE NAME with
`dst[from] = to`, into a plain `{ ...existing }`. That is `[[Set]]`, so an
accessor on `Object.prototype` under a route's own name took the write and threw
out of the validator — measured, `getRoutesApi(router).add([...])` threw and the
routes were never registered at all. The validator becoming the failure it exists
to report.

The write goes through `putField` from `@real-router/core/utils`.

Part of #1901.
