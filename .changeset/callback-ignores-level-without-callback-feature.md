---
"@real-router/validation-plugin": minor
---

Log error when `logger.callbackIgnoresLevel` is set without `logger.callback` (#471)

`callbackIgnoresLevel` only has meaning when a `callback` is provided; setting it alone was a silent no-op. `validateOptions` now emits `logger.error` in that case — the option is non-load-bearing, so throwing would be overreach, but a silent ignore left users debugging phantom log-filter behavior.

The check fires whenever `validateOptions` runs (router construction via retrospective pass, direct calls via `RouterValidator.options.validateOptions`).
