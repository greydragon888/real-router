---
"@real-router/vue": minor
---

Dev-only validation for `<HttpStatusCode>` invalid codes (#1441)

`<HttpStatusCode :code="N">` now logs a `console.error` in development when `code` is not an integer in `[100, 999]` — Node's `res.end()` rejects such values with "Invalid status code", so the warning surfaces the bad value at the source rather than at the response boundary. The value is still written to the sink (informational, not a block); the check is stripped from production via the `process.env.NODE_ENV` guard. Ports the validation that previously existed only in preact.
