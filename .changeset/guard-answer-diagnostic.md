---
"@real-router/validation-plugin": minor
---

A guard's non-boolean answer is reported as such (#2823)

Core refuses a guard answer that is neither `true` nor `false` — returned, or the value a thenable settles on — on every reader. The plugin names the guard and the type of that answer:

```
Guard for "admin" must answer true or false, got string — read as a refusal.
```

- During a transition, under `router`. A transition reported nothing before.
- On the synchronous ask — `canNavigateTo`, the leave check of `navigateToNotFound`, the revalidation of `replace()` — under the channel its async-guard report takes. The ask cannot wait for a thenable, so a thenable keeps its own report, `Guard for "…" returned a Promise. Sync check cannot resolve async guards — returning false.` Before, every non-boolean answer of the synchronous ask was reported with it.

The two reports go through `RouterValidator.lifecycle.warnNonBooleanGuard` and `warnNonBooleanGuardSync`, which `@real-router/core` gains in the same release: update the two packages together.

The description a message gives of a value is a string for every value and never throws. An object whose constructor's `name` is not a string is described as `object`: a Symbol or a number `name` was printed — `got Symbol(n)`, `got 42` — and a null-prototype one replaced the refusal with a bare `TypeError: Cannot convert object to primitive value`. A revoked proxy, or an array proxy whose `length` read throws, replaced the refusal with the error its read threw; it is described by its type, `object` or, for a function proxy, `function`.
