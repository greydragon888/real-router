---
"@real-router/sources": patch
---

Harden `createActiveNameSelector` per-name recompute against a latent #767-analog (#1478)

The shared `router.subscribe` fan-out recomputes each name's active state (`areRoutesRelated` / `isActiveNonStrict`) outside the per-listener `try`. A throwing recompute for one name would unwind the whole callback, skipping every later name's diff/notify and leaving their active state stale — structurally the #767 failure mode one level up. Each name's processing is now isolated in its own `try` (re-throwing asynchronously, mirroring the per-listener guard), so the #767 invariant stays robust against a future param-aware / predicate recompute. No behavior change for valid routers — the recompute cannot throw today (`getState` is a frozen-field read; the rest is pure string ops).
