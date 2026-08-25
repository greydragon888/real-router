---
"@real-router/core": patch
---

A `__proto__` param gets a real entry in the param-type registry (#1825)

`buildParamMeta` and the segment-meta walk built their records with plain
assignment into a `{}` literal. Core accepts a param named `__proto__`
(`/x/:__proto__`, `/x?__proto__`) and a route named `__proto__`, so for that one
key the write reached `Object.prototype`'s inherited setter instead of creating
an entry — and the two sites failed differently, because their values differ:
one wrote a string, which the setter discarded silently, the other wrote an
object, which replaced the record's prototype.

The record is plugin-facing — it goes out through `getPluginApi(router).getTree()`
— so `paramMeta.queryParams` and `paramMeta.paramTypeMap` were two views of one
fact that disagreed:

| route               | declared               | registry own keys, before | after                  |
| ------------------- | ---------------------- | ------------------------- | ---------------------- |
| `/q?__proto__&keep` | `["__proto__","keep"]` | `["keep"]`                | `["__proto__","keep"]` |
| `/s/:__proto__`     | `["__proto__"]`        | `[]`                      | `["__proto__"]`        |

The empty registry had a second consequence: `hasAnyParam()` answered `false`,
so the segment was skipped entirely and `getMetaForState()` returned `{}` for a
parameterised route.

Both records are now built on a prototype-less target and handed out with the
ordinary prototype, so the published shape is unchanged — a
`Object.getPrototypeOf(paramTypeMap) === Object.prototype` cell pins that.
The same target discipline also closes the ambient-accessor half (#1852) at
these two sites: a getter-only `Object.prototype.id` no longer hijacks the write
for a param named `id`, and there the key comes from the ROUTE TABLE, so no
name-based skip could have closed it.

Part of #1901.
