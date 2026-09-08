---
"@real-router/core": patch
---

The logger config neither writes nor reads through the prototype (#2138)

`assertLoggerConfig` built its normalised record as a plain object literal, wrote
three slots into it, and `RouterLogger.configure` read those three back out. With
an ordinary prototype an ambient member sat on BOTH sides of one record — and the
trigger is a polyfill or a dependency that extended `Object.prototype`, not a
hostile caller. The supplied config is perfectly ordinary; the write simply lands
somewhere else, or the read invents a value nobody supplied.

⚠ The READ pole is the worse one and the report does not name it: with a plain
`Object.prototype.level = "none"` DATA property — no accessor at all —
`configure({})` silenced every log for a caller who asked for nothing.

⚑ The record is built with `emptyRecord()` now: a null prototype answers neither
side, where `putField` would have closed the write and left the read open. It is
never published — `logger` is stripped from the router options and consumers get
`getConfig()`'s own fresh literal — so the `publishRecord` half of "build
private, publish plain" has no call site here.

⚠ A SECOND site, one file over and found by probing: `RouterLogger`'s internal
config declared `level` and `callbackIgnoresLevel` but not `callback`, so the
assignment and the read-back for that one slot both walked the chain. It is an
own key now. Measured on the old form: an ambient setter swallowed the sink so
`configure({ callback: undefined })` never cleared it and the old callback kept
receiving, and a getter-only accessor made an ordinary `configure` call THROW.
