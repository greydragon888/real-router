---
"@real-router/core": patch
---

Parse an optional param immediately followed by a query string (#741)

`buildParamMeta` mis-parsed a route whose optional param marker is directly
followed by a query — e.g. `/users/:id??tab` (`:id?` optional + `?tab` query).
The optional `?` was taken as the query separator, yielding `queryParams: ["?tab"]`
(a spurious `?`) and a `pathPattern` that lost the optional marker, so the route
registered and matched incorrectly.

The optional-marker regex now treats a following query `?` as a valid marker
boundary, so `/users/:id??tab` parses as optional param `id` + query param `tab`.
Same class as #738 (marker-vs-query-separator); surfaced by a new model-based
property suite for `buildParamMeta`.
