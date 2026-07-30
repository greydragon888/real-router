---
"@real-router/core": patch
---

refactor: name the owner of state immutability, and guard it per producer (#1599)

"States are deeply frozen" was true but owned by nobody. The depth is assembled
from four unrelated places — `canonicalize`'s fast path, `mergeWithDefault`,
`admittedSearch`'s drop branch, and a shell freeze — and two of them were guarded
by no test at all: deleting the `canonicalize` freeze left the entire suite green,
and the mode gate's freeze was reachable only under a non-`loose` mode with one
query key dropped and one admitted.

No behaviour change. What changed is that the policy is now stated and pinned:

- `INVARIANTS.md` gains **State immutability (who freezes what)** — every object
  is frozen once, at its origin, with the measured reason not to centralise into a
  recursive walk (re-freezing an already-frozen object costs ~8 ns, so a walk pays
  per node for work the producers already did).
- A black-box producer matrix in `tests/functional/error/helpers.test.ts` covers
  `navigate` (path params / query channel / route defaults), `makeState` with and
  without params, `navigateToNotFound`, `replace()` revalidation, and a non-`loose`
  mode with a dropped key. Mutationally validated against all four freeze sites.
- The `canonicalize` freeze property now crosses **both** paths — it used to pass a
  fresh query bag on every run, so it only ever exercised the slow one.
- `freezeStateInPlace` → `freezeStateShell`: the old name promised a depth it never
  delivered, and `CLAUDE.md` described a recursive traversal that had been gone for
  some time. Internal, never exported from the package.
