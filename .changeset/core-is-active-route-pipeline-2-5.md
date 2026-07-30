---
"@real-router/core": minor
---

Route `isActiveRoute` through the nav pipeline and retire its single-bag query form (nav-pipeline Phase 2, step 2-5)

The last entry point that owned a channel-separation stage of its own. Both arms
now build their comparison target through `canonicalize` in the LITERAL form
(`{ resolveForward: false }`) and compare channel by channel. The `forwardTo` arm
keeps running through the NON-interceptable namespace primitive — the literal
form never touches the port, so a plugin's interceptor chain still does not run
once per `<Link>` per render — and the safe barrier around the whole predicate
(#1577) is untouched.

This is the one step of the phase that genuinely removes stage ② from a point:
`matchPath`, `canNavigateTo` and `buildNavigationState` reach ② through the seam
their port calls, and keep it until Phase 4. `isActiveRoute` had its own
`separateChannels` call, and it is gone.

**Three behaviour changes.**

1. A declared query key handed in the `params` bag is no longer re-routed to the
   query channel before comparison, so the v1 single-bag spelling stops matching:
   `isActiveRoute("x", { page: "2" }, undefined, false, false)` answers `false`
   where it answered `true`. Spell it in the query slot instead. (On the EXACT
   arm the default `ignoreQueryParams: true` is unaffected — it compares path
   slots only. The DESCENDANT arm is a different story; see 2 below.)
   `persistent-params` is unaffected: it injects into `search` itself.
2. The descendant arm now obeys `ignoreQueryParams`, the same flag the exact arm
   hands to `areStatesEqual`. It could not before: it folded query into the path
   bag before matching, so an ancestor link compared its query even when the
   caller asked to ignore it — the two arms disagreed about the flag. **This one
   lands on the DEFAULT flag**, and it is the visible half of the change: on an
   active `/kid?tab=1`, `isActiveRoute("p", {}, { tab: "9" })` answered `false`
   and now answers `true`, because the caller asked for query to be ignored.
   Monotonicity (INVARIANTS isActiveRoute #6) still holds — ignoring query can
   only make a route more active.
3. `undefined` in the params bag is ABSENCE, not a value to match against
   (#1550 / #1551). `isActiveRoute("users", { id: undefined })` now answers
   `true` for an active `users.view`, and an `undefined` no longer "overrides" a
   route default. This predicate was the last place in core where `undefined`
   meant something other than absence; sharing `canonicalize` with every other
   producer aligns it.

`paramsMatchExcluding` and the namespace's `makeState` dependency lost their last
callers and are gone — the canonical target already carries each default merged
under the caller's value, in the channel the route declares it in.
