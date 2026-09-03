---
"@real-router/core": minor
---

The `forwardState` seam hands its chain a snapshot, not the caller's bag (#1849)

An interceptor is application code, and the bags it received were the CALLER's.
Read one and forward it — the documented pass-through shape — and the value the
interceptor acted on was not the value `canonicalize` read a moment later.
Measured on a getter-backed bag, on both doors:

```
interceptor saw   P1 S1
URL built         /s/P2?tab=S2
```

The seam now copies each present bag once, so the caller's accessor answers
once whatever is registered. `read-count-authority` carries the row that proves
it — with an interceptor installed, because the bare rows cannot see this: with
no interceptor the wrapper takes its fast path and the bag reaches
`canonicalize` untouched.

**Bare core pays nothing.** The copy sits on the non-empty branch of the
interceptable, past the `chain.length === 0` return, so a router with no plugin
on that seam executes exactly the code it did before.

⚠ **A spread, not `normalizeChannel`.** That one drops a key whose value is
`undefined`, and `undefined` is `persistent-params`' removal marker — the copy
would erase the signal before the plugin could read it. Absence passes through
on both spellings for the same reason: `{ ...null }` is `{}`, which would turn
"no bag" into "empty bag" above the code that tells them apart.

**For plugin authors.** A `forwardState` interceptor now receives core's object
rather than the caller's, on both channels. Every own enumerable key survives,
including one whose value is `undefined`. Writing through to the caller's bag
was never supported and no longer reaches it.
