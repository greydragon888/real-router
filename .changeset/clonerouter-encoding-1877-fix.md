---
"@real-router/core": patch
---

A clone inherits the base's encoding key instead of re-reading the option (#1877)

**Who is affected:** as with the sibling fix in this release, only a non-string
`urlParamsEncoding`. If yours is one of the four documented strings, nothing
changed.

`cloneRouter` built the clone from the base's raw options, so such a value was
coerced a second time — with whatever the caller's code answered on that later
read. Measured: one options object gave the base `/x/a%20b` and the clone
`/x/a b`, with the decoders diverging to match. `createRequestScope` clones per
request, so each request could get its own encoding; and a `toString` that threw
on a later read threw out of `cloneRouter()` on a base that was serving traffic.

The clone now takes the key the base already snapshotted, so the unit is one
read per router **tree**.

**A visible consequence:** the clone's own `getOptions().urlParamsEncoding` now
reports that key — a string — where the base still reports the value you passed.
For a `null` or explicitly-`undefined` option the clone reads `"default"`. Only
the clone honours the documented type; the base is unchanged.

**Not changed:** `queryParams` is still re-validated per clone, deliberately. A
drifting `queryParams` config fails on the clone while the long-lived base keeps
working, which is the documented behaviour (see `RouterOptions` › `queryParams`)
and a separate decision from this fix.
