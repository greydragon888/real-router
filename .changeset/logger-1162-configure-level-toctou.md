---
"@real-router/logger": patch
---

fix(logger): read config.level once in configure() — close the unstable-getter TOCTOU (#1162)

`configure()` read `config.level` as a value up to four times (validate `!== undefined`,
`Object.hasOwn(LEVEL_CONFIGS, ·)`, store, threshold lookup). A config with an unstable
`level` getter that returns different values across reads passed validation with a valid
level and then stored a later, unvalidated one — disabling the threshold filter. `level`
and `callbackIgnoresLevel` are now read once into a local before validation and storage,
so the getter fires once and the validated value is what gets stored. No change for a
normal value config.
