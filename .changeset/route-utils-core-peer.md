---
"@real-router/route-utils": minor
---

Depend on `@real-router/core` as a peer and source types from it

`route-utils` previously took a direct dependency on the standalone `@real-router/types`
package. With types folded into `@real-router/core` (wave-2), it now declares
`@real-router/core` as a **peer** dependency (`workspace:>=0.1.0`) and imports its types from
`@real-router/core`. Consumers must have `@real-router/core` installed (they already do in
practice — `route-utils` is only useful alongside a router).
