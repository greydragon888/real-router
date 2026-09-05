---
"@real-router/react": patch
---

`useIsActiveRoute` said every adapter resolves active state identically — Solid does not (#2126)

The claim is now scoped to the adapters actually built on the shared `createActiveSource` builder, and names Solid as the exception. `@real-router/sources` carries the full statement of what differs.
