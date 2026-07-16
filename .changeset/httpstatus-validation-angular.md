---
"@real-router/angular": minor
---

Dev-only validation for `<http-status-code>` invalid codes (#1441)

`<http-status-code [code]="N">` now logs a `console.error` in development when `code` is not an integer in `[100, 999]` — Node's `res.end()` rejects such values with "Invalid status code", so the warning surfaces the bad value at the source rather than at the response boundary. The value is still written to the sink (informational, not a block); the check is gated by `isDevMode()` rather than `process.env.NODE_ENV`, which ng-packagr does not replace (`process` is undefined in the browser). Ports the validation that previously existed only in preact.
