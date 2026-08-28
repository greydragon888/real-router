---
"@real-router/core": minor
---

Every `RouterError` core throws is frozen (#1960)

#1606 froze the cached rejections because they are handed to arbitrary consumer
code process-wide, so an in-place write rewrites the error every other consumer
sees. The freshly built ones were left mutable, and the two are
**indistinguishable at the catch site** — same class, same fields, same `name`:

```js
try { await router.navigate("x"); }
catch (err) { err.code = mapToAppCode(err.code); }   // worked on CANNOT_ACTIVATE
                                                     // threw on SAME_STATES
```

All 31 throw sites across 12 files now freeze at the throw.

⚠ **Four of those thirty-one throw a VARIABLE, not a literal**, and they were the
ones a `throw new RouterError(` sweep could not see. The sharpest is
`rethrowAsRouterError`, whose two exits disagreed: a guard throwing a plain
`Error` reached `throw new RouterError(...)` and came back frozen, while a guard
throwing a `RouterError` reached `throw copy` — the copy the function builds and
re-codes — and came back mutable. One function, two arms, opposite answers.

⚠ **A fifth cached error was unfrozen, and it is the worst case** — cached means
process-shared. `CACHED_ALREADY_STARTED_ERROR` lives in
`RouterLifecycleNamespace/constants.ts` while #1606's sweep was scoped to
`NavigationNamespace/constants.ts`, so a file-scoped list could not see it. All
five are frozen now, and the guard enumerates them **by shape** across the whole
package rather than by file.

⚠ **Frozen at the THROW, never in the constructor.** `RouterError` publishes three
mutators — `setCode`, `setErrorInstance`, `setAdditionalFields` — with worked
examples in the wiki, and `rethrowAsRouterError` copies an error and re-codes the
copy before throwing it. Freezing on construction was measured and rejected: 38
tests red, 28 of them the class's own, because it withdraws published API from
errors a **consumer** builds. Every wiki example mutates a self-constructed error;
none mutates a caught one.

⚠ **Breaking for one thing only: annotating an error core threw at you.** A sweep
of 1959 files carrying a `catch` (740 error bindings) found nobody doing it — in
core, in any plugin, in any adapter, in the example apps. A consumer who needs to
annotate should copy first, exactly as `rethrowAsRouterError` does internally.

A re-thrown FOREIGN error is untouched: freezing someone else's object on the way
through is the hazard, not the fix.

The rule is pinned by `thrown-error-freeze-authority-1960`, which keys on
**channels** — a rejected navigation, a rejected `start`, both arms of a throwing guard, a route
removed mid-transition, a plugin's `onTransitionError`, a door called after
`dispose` — rather than on throw sites, so a 32nd site inside any of them is
covered without editing the guard. Twelve channels, and every one of the four
variable-throw sites is pinned: removing any single freeze reds exactly one cell.
