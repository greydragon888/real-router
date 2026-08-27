---
"@real-router/core": minor
---

The logger's `level` is validated where it is stored (#1842)

#1162 made `configure` read each field once into a local. Reading once pins the
REFERENCE, not the checked value: the `typeof === "string"` gate lives in
`assertLoggerConfig`, in another file, and never reached the value `configure`
installed. `configure`'s own check was `Object.hasOwn(LEVEL_CONFIGS, level)`,
which coerces the value to a property key — and `LEVEL_CONFIGS[level]` coerces it
again.

Measured on bare core: a `level` answering `"none"` to the guard and, afterwards,
an object whose `toString` says `"none"` then `"bogus"` **constructed fine** and
let a warning through. `level: "none"` is the setting that suppresses everything,
so the threshold filter was silently off for the life of the router.

The same seam installed a non-function callback — the half #1814 recorded as
traced but not captured, now reproduced: flipping after the guard's reads left
`configure` storing a string, and the router's own error channel dead with
`TypeError: this[#config].callback is not a function`.

`assertLoggerConfig` now returns core's own validated record and `configure`
installs from it, so each field is read **once** (measured: three apiece before)
and the value that was checked is the value that is stored.

⚠ **One visible change.** `configure` used to throw its own wording for an
invalid level — `Invalid log level: "x". Valid levels are: …` — beside the
guard's `Invalid logger level: "x". Expected: "all" | …` for the same rejection.
It delegates now, so the guard's message is the only one.
