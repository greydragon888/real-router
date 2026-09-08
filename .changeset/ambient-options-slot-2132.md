---
"@real-router/core": minor
---

A navigation option the caller never supplied no longer reaches the navigation (#2132)

Every slot of `NavigationOptions` was read with a plain `[[Get]]`, so an ambient
`Object.prototype.signal` — or `.reload`, `.force`, `.replace`, `.redirected`,
`.forceDeactivate` — answered as if it had been passed. Measured on all six:

| ambient key | before | after |
| --- | --- | --- |
| `signal` (aborted) | `start()` rejects `CANCELLED` | starts |
| `reload` / `force` | a repeat navigation succeeds | still `SAME_STATES` |
| `forceDeactivate` | a route's `canDeactivate: false` is ignored | still `CANNOT_DEACTIVATE` |
| `replace` / `redirected` | recorded in `state.transition` | not recorded |

It reached core's OWN objects too: with no options at all the facade substitutes
the frozen `EMPTY_OPTS` singleton, so core cancelled its own boot with an option
nobody supplied.

The rule itself is not new — `NavigationOptions` on the wiki has stated "only own
enumerable keys are read … the prototype chain is not supported input" since
#1962 (2026-08-30), the change that introduced the entry-door copy. That copy DID
take own keys only; what defeated the rule was reading the flags back off it with
a plain `[[Get]]`, because the copy had `Object.prototype` on its chain. Taking
own keys is half of it, and the half that was implemented.

The fix is structural rather than a check: `EMPTY_OPTS` and the copy
`adoptNavigationOptions` builds are now `Object.create(null)`-based, so there is
no chain to answer from and a read added later inherits the guarantee. The one
flag read above that copy, `signal`, carries its own `Object.hasOwn` gate.

⚠ **BREAKING for plugin authors, which is why this is a `minor`.** The options
bag delivered to `onTransitionSuccess` has a `null` prototype:
`opts.hasOwnProperty("replace")` throws — use `Object.hasOwn` or `in` — and a
test asserting `toStrictEqual({ replace: true })` fails on the prototype alone;
spread it first. Measured across `browser-plugin`, `persistent-params-plugin`,
`search-schema-plugin`, `validation-plugin` and `react`: 2378 tests, none
affected. Six assertions in core's own suite were spelled `toStrictEqual` and
now spread.

⚑ The issue's second half is NOT a defect and no code changed for it. `aborted`
is asked four times per navigation, and three of those are legitimately
different moments — a signal is meant to change. The one pair that must agree,
`canSend`/`send` on the commit gate, has an empty window: instrumented with
seven listeners across every phase, no application code runs between the two
evaluations, so a real `AbortSignal` cannot split them. Only a signal whose
`aborted` getter answers differently per read can, and INVARIANTS puts that out
of scope by owner decision.
