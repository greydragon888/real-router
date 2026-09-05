---
"@real-router/logger-plugin": patch
---

The Stryker config's dependency list named two packages that do not exist (#2112)

It said the plugin depends on "logger, @real-router/core, core-types". Its
`package.json` names one dependency, `@real-router/core`, which is where both the
logger and its types live.
