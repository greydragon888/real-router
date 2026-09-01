---
"@real-router/rsc-server-plugin": patch
---

The post-hydration loader skip is keyed by the committed state, not by its route name (#2060)

This plugin shares `createSsrLoaderPlugin` with
`@real-router/ssr-data-plugin` via `shared/ssr`, so it gains the same gate: the
payload's `name`, `params` and `search` must agree with what matching its
`path` produced, or the loader runs. Under this package's Variant-B in-memory
handoff the payload is the server's own `State`, so the agreement holds by
construction.

⚠ What the gate cannot check — a `context` built for a different state behind a
self-consistent envelope — is a written contract: build the payload for the
state you hydrate. See that package's changeset for the measurements.
