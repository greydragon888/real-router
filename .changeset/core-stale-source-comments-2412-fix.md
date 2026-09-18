---
"@real-router/core": patch
---

Three comments in core's source stated what the code no longer does (#2412)

No behaviour change; one of the three ships, which is why this is a release
rather than a docs commit — `PluginApi.getUrlParams`' JSDoc travels in the
`.d.ts` an application reads.

- `internals.ts` explained the `logger` member with "`PluginApi` carries no
  `logger` member". It carries one since #2339's second slice; the comment now
  says what the member is still there for.
- `PluginApi.getUrlParams` called itself "the registry `buildPath` prints from".
  Measured: under `setRootPath("/app/:tenant")` a route declaring `:id` answers
  `["id"]` while `buildPath` refuses without `tenant`, so the member answers the
  route's own chain and the root's slots are not in it.
- `routesStore.ts` counted "fifteen slots" where the store has sixteen. The count
  is dropped rather than corrected: it was unenumerated, so it rots again on the
  next slot, while the enumerated "EIGHT destructive" beside it is checkable and
  stays.
