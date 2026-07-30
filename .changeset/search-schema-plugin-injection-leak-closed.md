---
"@real-router/search-schema-plugin": patch
---

The LIFO injection leak is closed by core (#1548)

An interceptor registered after the schema could inject a declared query key
into the `params` bag; core's `forwardState` seam then moved it into `search`,
so an unvalidated value reached the channel this plugin owns. The suite
documented that as a `LEAKS` test rather than a fix, because the plugin could
not see the injection — it happened after its own interceptor ran.

Core now refuses the mis-channelled bag instead of moving it, so an interceptor
that wants to write the query channel has to write `search`, where the schema
can see it. The test is rewritten to pin the refusal.
