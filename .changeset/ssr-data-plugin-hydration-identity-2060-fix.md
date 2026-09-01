---
"@real-router/ssr-data-plugin": patch
---

The post-hydration loader skip is keyed by the committed state, not by its route name (#2060)

The scratchpad skip gated on `hydrationState.name === state.name` and nothing
else, so a payload built for one set of params was served for another and the
loader that would have fetched the right data was skipped. `hydrateRouter`
starts the router at `payload.path`, so a payload whose own `params` / `search`
disagree with the result of matching that path describes a different state; it
is no longer treated as this state's answer, and the loader runs. Silent, like
a missing `context` — a throw here would land POST-COMMIT, the shape #1835
removed one branch over.

⚠ **Half of the class stays open, by construction, and is now a written
contract.** The comparison catches a payload that gives itself away. It cannot
catch one whose envelope is self-consistent while its `context` was built for a
different state — a server caching payloads by route name, or an app that
rewrites `path`/`params` from the live URL and reuses cached data. The
disagreement is then entirely in opaque bytes. **Build the payload for the
state you hydrate**; the usual `serializeRouterState(state)` → `hydrateRouter`
round trip does so by construction. Stated in `CLAUDE.md`.

⚑ Cost is one comparison per `hydrateRouter`, not per navigation: the skip is a
`start` interceptor and the scratchpad is non-null only for that call.

⚠ One false mismatch measured, and it is a misconfiguration reporting itself: a
plugin contributing to a channel on the CLIENT only (e.g.
`persistent-params-plugin` registered in the browser bundle and not on the
server) makes the client commit `?lang=en` where the server shipped a bare
path, so the payload no longer describes the committed state and the loader
runs once at boot. Twenty-one server→client round trips were measured
unaffected — defaults, repeated keys, bare flags, `loose` mode, percent- and
unicode-encoding, `forwardTo`, trailing slash, and every coerced query value
type.
