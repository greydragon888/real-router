---
"@real-router/core": minor
---

Reject a `<...>` constraint in a clean static segment (#1311). `/foo<bar>` / `/a<b>` — a constraint filling a STATIC segment (no `:`/`*` marker) — was silently stripped to `/foo` / `/a` at registration, reshaping the route with no signal (#1150 caught only a constraint fused with TRAILING text, e.g. `/:id<\d+>x`; one cleanly ending a static segment slipped through). Now rejected at the route-tree validation gate (route-contextual message) + the path-matcher `registerTree` backstop — the sibling of #1050 / #1150 on the static-segment axis. A constraint on a param (`/:id<\d+>`) is unaffected.
