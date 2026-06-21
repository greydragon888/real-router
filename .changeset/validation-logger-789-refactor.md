---
"@real-router/validation-plugin": patch
---

Remove dead `validateLoggerOption` (#789)

The Router constructor consumes `options.logger` and strips the key before options are stored, so the retrospective pass always saw `logger: undefined` and `validateLoggerOption` never ran on the live path. Logger config is validated solely by core's `isLoggerConfig` guard at construction — the only place the input exists. Removes the unreachable validator, its `VALID_LOGGER_LEVELS` constant, and the now-unreachable `callbackIgnoresLevel`-without-`callback` diagnostic. Behavior-neutral on any reachable path.
