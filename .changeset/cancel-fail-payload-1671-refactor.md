---
"@real-router/core": patch
---

CANCEL and FAIL stop carrying a target their own table already knows (#1671)

RFC-10a §16.6's remainder: `endNavigation` cleared `ctx.inflightToState` in the edge's `update`, which runs *before* the action — so the actions could not read the target and the payloads had to carry it. Option (г) removes the clearing instead of reordering the engine: the field's validity window is expressed by the machine's STATE, not by its lifetime, and both `CANCEL` edges are declared inside the transition band only.

The FAIL half needed more than that, and the difference was found by measurement rather than by reading. Its action is registered on **three** edges, and `STARTING --FAIL--> IDLE` is outside the band — a failed `start()` is not a navigation failure and has no target to name. Left to read the context there, it would have reported whatever a previously *cancelled* navigation left behind, through the public `onTransitionError` hook. So the action is now **split by edge**: the two in-band registrations read `ctx.inflightToState` — measured identical to what the payload carried on all 206 in-band FAILs across the functional tier — and the `STARTING` one names no route, which is what both of its senders pass today. The distinction moved from a value the caller must remember into the table.

Consequences worth knowing:

- `RouterPayloads["CANCEL"]` and `["FAIL"]` lose `toState`; `sendCancel` / `sendFail` / `sendTransitionFail` / `routeTransitionError` lose the parameter, and four call sites stop threading it.
- `sendCancelIfPossible` no longer reads the context at all, which retires the `|| toState === undefined` clause #1669 documented as a type narrowing awaiting this change.
- `ctx.inflightToState` is now deliberately allowed to be **stale outside the band** — one object, overwritten by the next navigation. The rule for who may read it, and under which gate, is recorded beside the field, including the one edit it cannot survive silently: declaring `CANCEL` or `FAIL` from a state outside the band.

No behaviour change: every event carries exactly the states it carried before.
