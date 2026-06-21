---
"@real-router/logger": patch
---

Reject `Object.prototype` keys as the configured level in `logger.configure()` (#895)

`configure()` validated the level with `config.level in LEVEL_CONFIGS`, which walks the prototype chain — so inherited keys like `"toString"` or `"valueOf"` passed validation and were stored as the active level, corrupting the cached threshold (it became an inherited function, so every message bypassed the filter). It now uses `Object.hasOwn(LEVEL_CONFIGS, config.level)`, so only own, known levels are accepted; every other string throws `Invalid log level` as before. Mirrors the own-property fix applied to the `callback` key in #792.
