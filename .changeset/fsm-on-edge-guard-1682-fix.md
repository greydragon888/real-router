---
"@real-router/core": patch
---

`FSM.on` refuses a pair with no edge — the axis #885's guard claimed but never checked (#1682)

The engine's state-entry-point guard validated the STATE and not the edge, so `on(declaredState, eventWithNoEdgeFromIt, …)` registered an action that could never fire. That is the exact shape the guard's own documentation said it prevented, which made the record false rather than merely incomplete.

`on` now throws `[FSM.on] event "…" has no edge from state "…"`. One check covers both dead shapes: `normalizeTable` drops an explicit `undefined` target (the declared "no transition" no-op), so an absent pair and a declared no-op are indistinguishable by the time `on` sees them.

**Radius measured, not estimated:** the guard was instrumented and all three tiers run — 4048 functional + 450 property + 153 stress — and exactly **one** registration was affected, a test that existed to pin the permissiveness itself. The property tier, where generated tables made this most likely, produced zero (positive control: it calls `on` twelve times).

The other direction — an edge that announces nothing — is not knowable to the engine, since muteness is legitimate. It is held one layer up: `fsm-edge-reachability.test.ts` now also reconciles the router's action map against its transition table, with a `MUTE` registry naming why each of the seven silent edges is silent.
