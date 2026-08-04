---
"@real-router/core": patch
---

Re-align the records around the navigation epoch with the code they describe (#1672)

Four records drifted; a fifth was found while fixing them, and one retired itself along the way.

- **`NavigationContext.myId`** said it lives on that type "because `completeTransition` needs it". `completeTransition` does not mention `myId` at all — #1626 was closed by `when: mayCommit` on the COMPLETE edge, not by threading the token. Both readers are inside `executeNavigation`, i.e. the module that owns the plan.
- **`mayFail`** was right that it cannot refuse (206 asks, 0 refusals, reproduced). What it could not say, and now can: two-sided mutation gives it a **measured residual kill** — removing `asCancellation` alone fails 5 tests, removing it *and* `mayFail` fails 6, and the sixth is the silent-commit shape from #1609. So the division of labour is named rather than assumed: `asCancellation` holds the caller-facing half, `mayFail` the subscriber-facing one.
- **`mayFail`'s dead disjunct** is now dead by count as well as by argument: all 206 asks carry a live epoch equal to `ctx.epoch`. The same paragraph said "the only no-epoch sender" — there are two, and both take `STARTING --FAIL--> IDLE`.
- **The edge taxonomy** claimed `canSend` "is read exactly three times in core (NAVIGATE / START / CANCEL)". It is read **five** times: the ask-protocol added COMPLETE (with payload, #1641) and SYSTEM_COMMIT (#1644). The count was written before that protocol existed, and the #1648 analysis inherited the number from this comment rather than from the code — a claim that felt doubly confirmed while being one echo.
- **`hasInflight`'s docstring** described a tautology as if it carried meaning. It retired with the predicate itself in #1669; the *reason* — the band invariant — now lives beside `inflightToState` in `RouterFSMContext`, where the readers are.
- **`INVARIANTS.md`** still listed `hasInflight` among the things leaning on committed-state ownership. It now names it as retired, and says the invariant is why.
