---
"@real-router/sources": patch
---

Correct the active-source docs for a non-string route name (#1881)

`createActiveSource`'s JSDoc claimed the Link fast path diverges from
`createActiveRouteSource` for a non-string name. It does not: core no longer
gates the name (see `packages/core/ARCHITECTURE.md`, "Route-Name Type Gates"),
so the selector, the fast path, the slow path and `router.isActiveRoute` all
coerce it and all answer the same thing. Measured, and `#1891` closes with it.

No behaviour change. `createActiveRouteSource` keeps its cache bypass for a
non-string name, whose reason is unchanged and independent of any gate: the
cache key is a template literal that coerces, while `isActiveRoute` compares the
active name by IDENTITY first — so a bag naming `"users"` answers `false` where
the string `"users"` answers `true`, and sharing one slot lets the bad call
decide for a correct `<Link to="users">`.
