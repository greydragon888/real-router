---
"@real-router/core": patch
---

A guard's promise is honoured from any realm (#2251)

`canActivate` / `canDeactivate` recognised a pending answer with
`guardResult instanceof Promise`, which compares against the CURRENT realm's
`Promise.prototype`. A promise minted in a `vm` context, an iframe, a worker
bridge or a federated module is a genuine thenable and not an `instanceof`
match, so the guard walk took its SYNCHRONOUS branch — where a pending object
is truthy.

The failure was not that the `false` was discarded. **The guard was never
awaited**: measured, `navigate` resolved before the guard settled, so the
navigation raced its own authorisation and won, and whatever the guard answered
arrived after the commit. `GuardFn` declares `boolean | Promise<boolean>`, and
a cross-realm promise satisfies that declaration.

The walk now recognises a thenable. Three details are deliberate:

- **`then` is read ONCE** and the captured function is what gets called. Deciding
  on read #1 and letting `await` take read #2 is the defect #2136 measured on the
  emitter — a slot answering a non-function the second time is adopted as a plain
  value and its rejection reaches nobody.
- **The read sits in the guard's own error channel.** `then` may be an accessor
  or a `Proxy` trap, so reading it runs application code and this is the FIRST
  read. A hostile slot now fails the navigation the way a throwing guard does,
  instead of the object being taken as "allowed" (its previous outcome) or
  escaping as a bare `TypeError`.
- A synchronous `true` / `false` answer is untouched. `null` / `undefined` — which
  `GuardFn` does not declare but a JS caller can return — now throw on the
  property read and reach the SAME `RouterError` through that channel, so the
  outcome is unchanged and only the path differs.

⚠ `subscribeLeave` is NOT part of this. Its listeners go through
`Promise.allSettled`, which duck-types by specification, and its contract
consumes settle/reject rather than the resolved value — measured, a `LeaveFn`
resolving `false` navigates from either realm, so there is no divergence there.
The `start` interceptor seam already tested `typeof result.then === "function"`.
