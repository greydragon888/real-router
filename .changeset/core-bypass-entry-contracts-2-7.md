---
"@real-router/core": patch
---

Fix the contracts of the two bypass entry points (nav-pipeline Phase 2, step 2-7)

`navigateToState` was already under the channel guard's P3 position since 0b-2 —
re-verified: a hand-made state carrying a declared query key in `state.params` is
rejected with `WRONG_CHANNEL`, while the channel-correct one commits.

`navigateToNotFound` is declared an EXCEPTION to the pipeline, and recorded as an
INVARIANT rather than a "we skip it": `params` AND `search` are both `{}` for
every input — including a URL carrying a query string or a fragment — with the
whole URL living in `state.path` as a string, query included. Measured across
`/nope?a=1&b=2`, `/other?x=9#frag` and `/plain`.

It has no channels BY CONSTRUCTION, not by omission: it does not build a state
from an intent, it wraps a string. A `materialize` special form would either run
empty channels through machinery that exists to merge them, or require a
`Canonical` with no intent — at which point the brand stops meaning "canonical
intent". Two other systems already treat it the same way (no FSM transition, no
guard phase, only `TRANSITION_SUCCESS`), so a third is consistency rather than a
gap.

Pinned in `tests/functional/navigation/navigateToNotFound.test.ts` over all three
URL shapes, and stated in `INVARIANTS.md` → navigateToNotFound #2, so the next
audit does not reopen the question.
