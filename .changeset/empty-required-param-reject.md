---
"@real-router/core": minor
---

Reject an empty required param value at build time (#740)

`buildPath` treated `""` for a **required** param as a valid value and produced a
collapsed segment that silently matched the parent route:

```js
buildPath("users.profile", { id: "" }); // → "/users/" (matched parent "users", not "users.profile")
```

It now throws, the same way a missing (`undefined`/`null`) required param does:

```
[SegmentMatcher.buildPath] Missing required param 'id' (empty string)
```

**Breaking (pre-1.0 → minor):** code that relied on the previous silent
collapse must pass a non-empty value (or use a splat/optional param). Optional
params are unaffected. Part of the foundation-audit path-matcher hardening
cluster (#740).
