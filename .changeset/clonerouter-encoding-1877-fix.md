---
"@real-router/core": patch
---

A clone inherits the base's encoding key instead of re-reading the option (#1877)

`cloneRouter` built the clone from the base's **raw** options, so a
`toString`-backed `urlParamsEncoding` was coerced a second time — with whatever
the caller's code answered on that later read. Measured before the fix: one
options object gave the base `/x/a%20b` and the clone `/x/a b`, decoders
included, and `createRequestScope` clones **per request**, so each request could
get its own encoding.

#1839 made the unit one read per router; this makes it one read per router
**tree**, so a clone is a copy of the router that exists rather than a
re-interpretation of the config that built it. A `toString` that throws on a
later read no longer surfaces from `cloneRouter()` either.

`queryParams` is deliberately left alone: its clone-time re-read is pinned as
intended behaviour ("a DRIFT is confined to the clone") and documented in the
wiki, so changing it is a policy decision rather than part of this fix.
