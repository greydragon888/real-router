---
"@real-router/core": patch
---

Skip empty per-route meta records — one shared frozen `EMPTY_ROUTE_META` sentinel (#1414)

`buildMeta` no longer allocates a fresh `{ [routeName]: {} }` record per fully-static route — route-unique keys degrade into per-object hidden classes (first ~1k) and dictionary-mode objects (the rest) at scale. Browser CDP A/B on the 10k-route table: **−1.106 MB (−14.3 %) retained heap**. Observable shape note: empty entries no longer appear in the meta reachable via `PluginApi.buildState()` — a missing entry is equivalent to an empty one for every consumer.
