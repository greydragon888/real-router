---
"@real-router/core": patch
---

A released context claim is inert — it no longer writes over, or frees, the plugin that re-claimed the namespace (#2059, #1929)

The object `api.claimContextNamespace(ns)` returns closed over the namespace
**string**, so neither of its methods could tell whether it was still the
holder. Both halves of that were reachable with the records perfectly
consistent:

- `write()` wrote unconditionally, so a stale claim overwrote the value of the
  plugin that legitimately re-claimed the namespace after it (#2059).
- `release()` deleted whoever currently held the namespace, so a stale release
  freed somebody else's hold and let a third plugin claim it as well (#1929).

The record now stores the claim itself, and `write` and `release` each verify
they are the holder before acting. Both are silent no-ops otherwise — a claim
that does not hold a namespace has nothing to say about it, and a throw would
be eaten by the emitter's isolation on the `onTransitionSuccess` path where
`write` runs.

**Behaviour change:** `claim.write(state, value)` after `claim.release()` no
longer mutates `state.context`. Writing a namespace you do not hold is still
possible through the documented `state.context[ns] = value` escape hatch.
