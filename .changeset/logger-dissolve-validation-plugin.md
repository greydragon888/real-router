---
"@real-router/validation-plugin": patch
---

Drop the `@real-router/logger` dependency (#1520)

The standalone `@real-router/logger` package was dissolved into `@real-router/core`. The
plugin's threshold/overwrite validators now emit through the router's per-instance logger
(injected via `ctx.logger` in `buildValidatorObject`) instead of the former process-global
singleton, and `@real-router/logger` is removed from the plugin's dependencies. No public
API or behavior change — the `RouterValidator` surface core calls into is unchanged.
