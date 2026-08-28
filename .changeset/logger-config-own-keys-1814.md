---
"@real-router/core": minor
---

The logger config is validated with own-key semantics, and the guard hands its result to the store (#1814)

`assertLoggerConfig` asked `"callback" in obj` while `RouterLogger.configure`
asked `Object.hasOwn` — so an **inherited** callback passed validation and was
never installed. The caller supplied a working sink, core accepted it, and every
log went to the console instead, with no error and no warning.

The guard also disagreed with itself: its unknown-property scan is `Object.keys`,
i.e. own-only. Measured, before:

| config | outcome |
| --- | --- |
| inherited `callback` = non-function | **refused** (`in` saw it) |
| inherited `level` = garbage | **refused** (`in` saw it) |
| inherited unknown property | **accepted** (the key scan is own-only) |

The first two are false rejections: a bag whose OWN keys are empty is a valid
empty config, refused for something on its prototype.

All three questions are `Object.hasOwn` now, matching the scan, the store, and
the "own enumerable properties only" rule in `packages/core/CLAUDE.md`. An
inherited key is invisible — not installed, and not grounds for refusal.

⚠ **`configure` is public, and it becomes stricter in two ways.** It used to read
the caller's object without the guard, so it accepted what the constructor
refused — a third instance of the same asymmetry, named by neither issue:

| `logger.configure(…)` | before | after |
| --- | --- | --- |
| `{ callbackIgnoresLevel: "yes" }` | **stored the string** — `getConfig()` returned it, and a non-empty string reads as `true` in the flag's own test | `TypeError` |
| `{ unknownKey: 1 }` | silently ignored | `TypeError: Unknown logger config property` |
| `null` | raw `TypeError: Cannot read properties of null` | `TypeError: Logger config must be an object` |

The old guard's own comment recorded the split — *"Validate callbackIgnoresLevel
if present (logger.configure does not type-check it)"* — compensating in the
constructor for a check the other door lacked. One door now, one rule.

⚠ `configure({ callback: undefined })` still CLEARS the sink. Presence and
definedness differ for that one field, and the normalised record carries the key
so it survives.
