---
"@real-router/core": patch
---

Choose a build slot's encoder from the token's kind, not from a set of splat names (#1975)

`buildPath` picked a slot's encoder by testing the slot's NAME against the splat
names gathered across the whole ancestor chain, while the caller had already
narrowed the token's own `kind` one frame above. The two spellings answer
different questions and disagreed: #1568's finality rule drops a NON-final splat
before it can become a slot, but the name set — built from `paramMeta.spatParams`,
which finality never filters — still carried it.

So a `:param` whose name a splat elsewhere in its chain also used took the SPLAT
encoder and printed its `/` unescaped. Measured, under the default encoding:

- `/p/*x` with a child `/:x/edit` and `{ x: "a/b" }` built `/p/a/b/edit`, which
  the same router's `matchPath` resolved to the PARENT `p` with
  `{ x: "a/b/edit" }` — a link that silently goes somewhere else. It now builds
  `/p/a%2Fb/edit` and round-trips to `p.c`.
- The single-path form `/p/*x/:x` built `/p/a/b`, which the same router matched
  to NOTHING — a dead link. It now builds `/p/a%2Fb` and round-trips. (Only
  reachable on bare core: `@real-router/validation-plugin` rejects this shape,
  since a per-path gate does see `["x","x"]`.)
- An `absolute` descendant (`/p/*x` with a child `~/:x/edit`) built `/a/b/edit`,
  which matched nothing — the ancestor is not even in the printed path there,
  only in the name set. It now builds `/a%2Fb/edit`.
- The ROOT's own slot was affected too: `setRootPath("/app/:tenant")` with a
  route `/files/*tenant/x` built `/app/a/b/files/x`, which matched nothing —
  breaking the round-trip INVARIANTS #4 states for a root `:`-declaration. It now
  builds `/app/a%2Fb/files/x` and matches.

Only slots in that exact position change: a param whose own name is also a splat
name somewhere in its chain. A final splat still keeps its separators, a plain
param still percent-encodes, and a chain whose splat and param carry DIFFERENT
names was never affected.

⚠ Observable in two of the four `urlParamsEncoding` modes. Under `uri` and
`none` the param and splat encoders are IDENTICAL — `encodeURI` never escapes
`/`, and `none` is identity — so nothing changes there and the mis-built URL
persists. That is a property of those modes rather than of this fix: under them a
plain `:param` carrying a `/` does not round-trip either.
