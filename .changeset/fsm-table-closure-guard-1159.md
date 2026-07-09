---
"@real-router/fsm": patch
---

Guard transition-table closure against dangling targets (#1159)

The engine guarded three state-entry-points against undeclared states (`forceState` #754, constructor `initial` + `on()` `from` #885) but left a fourth unguarded: the transition-table **values** applied by `send()` (`this.#transitions[nextState]`). A table with a dangling target — a value that is not itself a declared state key — passed the constructor, then a `send()` into it entered an undeclared state (violating Validity #1) and bricked the next `canSend()` / `send()` with a cryptic `TypeError` (violating No-bricking #10). The property suite stayed green because `arbFSMConfig` encodes targets as state indices, so it structurally cannot generate a non-closed table.

The constructor now runs a one-pass O(states×events) closure check (cold path, reusing the shared `requireDeclared` guard and its message), so a dangling target fails loud with `[FSM.constructor] state "…" is not declared in config.transitions` instead of bricking. Explicit `undefined` values are the declared "no transition" no-op and are skipped; post-construction mutation of the shared table stays a documented GIGO boundary (Edge #5). Typed callers with a narrow state union are unaffected (the type forbids a dangling target); this hardens `string`-typed / JS / cast callers. Dormant for `@real-router/core` (`routerFSM`'s table is static and closed).

Shipped as `patch` for parity with #885 / #754 — the same guard class (a construction/entry-point rejection that previously bricked), same reachability profile, which shipped as patch.
