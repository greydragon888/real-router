---
"@real-router/core": patch
---

Set `RouterError.name` to `"RouterError"`

`RouterError` previously inherited `error.name` as `"Error"` from the base
`Error` class (subclasses don't auto-set it). It now sets
`this.name = "RouterError"` in the constructor, so `error.name`-based checks —
logging, serialization, and cross-bundle `instanceof`-free detection
(`error.name === "RouterError"`) — work correctly. This mirrors the existing
`RecursionDepthError` pattern.

`toJSON()` output is unchanged: `name` is excluded as class metadata (like
`stack`), so serialized errors keep their existing shape.
