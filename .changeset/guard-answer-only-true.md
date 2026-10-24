---
"@real-router/core": minor
---

A guard allows a navigation only when it answers `true` (#2823)

A transition read a guard's answer by truthiness, while `canNavigateTo` took a boolean only. A guard answering a truthy non-boolean — a route name meant as a redirect, a `State`, an object, a filtered array, `1` — or a promise settling on one let `navigate`, `start`, `navigateToDefault` and `navigateToState` through, and `canNavigateTo` refused the same guard: the guard failed open, and the predicate disagreed with the navigation it predicts.

Every reader now holds the answer to `=== true` — the answer a guard returns, the value a thenable settles on, and the synchronous ask behind `canNavigateTo`, the leave check of `navigateToNotFound` and the revalidation of `replace()`. Any other answer is a refusal, read exactly as `false` is: a transition rejects with `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE`. Core does not throw on it; `@real-router/validation-plugin` names it.

**Breaking Change:**

- A guard answering a truthy non-boolean, directly or through a promise, now blocks the navigation it used to let through.
- A guard answering `null` or `undefined` still blocks it, and the rejection now carries the error `false` gives — its `message` is the code — instead of the `TypeError` text of reading `then` from that value.
- `RouterValidator.lifecycle` gains two required members, `warnNonBooleanGuard(name, answer)` and `warnNonBooleanGuardSync(name, answer, methodName)`, so an implementation of that interface outside this repository stops compiling until it adds them. `@real-router/validation-plugin` implements both: update it together with core. With an older plugin, a guard answering a non-boolean makes `navigate` reject with a `TypeError` that has no `code`, instead of `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE`, and `canNavigateTo` logs that guard as throwing.

**Migration:** answer a boolean. A guard that relied on truthiness on purpose keeps its reading with `Boolean(...)`:

```diff
 lifecycle.addActivateGuard("account", () => () =>
-  store.user,
+  Boolean(store.user),
 );
```

`Boolean([])` is `true`, so a guard that answered a filtered array let everyone in; the boolean it meant is `.some(...)`:

```diff
-  user.roles.filter((role) => role === "admin"),
+  user.roles.some((role) => role === "admin"),
```

A refusal of a route definition describes a value whose constructor's `name` is not a string as `object`: `Route must be a plain object, got object`. It printed that `name` before — `got Symbol(n)`, `got 42` — and a null-prototype `name` replaced the refusal with a bare `TypeError: Cannot convert object to primitive value`.
