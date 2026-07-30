---
"@real-router/core": minor
---

Promote the channel guard's P1 from warn to throw (#1572)

The warn-first step announced the contract so every call site could identify
itself in the logs. This is the promotion it announced.

`navigate` / `makeState` / `buildNavigationState` now throw a **`TypeError`,
synchronously**, when a key the route declares with `?name` arrives in the
`params` bag:

```ts
navigate("products", { lang: "en" })       // ✗ TypeError
navigate("products", {}, { lang: "en" })   // ✓
```

Synchronous even on `navigate`, which otherwise reports failure through a
rejected promise: this is an ARGUMENT-SHAPE defect at the API boundary, caught
before any interceptor or transition exists — the same class as the `subscribe`
/ `start` guards. Rejecting instead would let a `.catch()` written for
navigation failures swallow a programming error.

**Unchanged, deliberately:**

- **P3 (`navigateToState`) keeps REJECTING** with `WRONG_CHANNEL`. It takes a
  ready-made `State` from a popstate handler, where a new synchronous throw
  would change an existing method's failure shape.
- **The predicates (`buildPath` / `isActiveRoute` / `canNavigateTo`) are NOT
  guarded.** They run on every `<Link>` render, their answer is read immediately
  and corrupts nothing, and throwing inside a render across six adapters is not
  a trade this guard is worth. The single-bag form still works there, and an
  explicit `search` still beats a params-bag twin.
- An UNDECLARED key is not a mis-channel — the guard only fires on names the
  route declares with `?`. `undefined` stays the documented removal marker.

**INVARIANTS #2a reworded.** It used to state the precedence between an explicit
`search` and a params-bag twin "in every one" of the six entry points. A
producer can no longer SPELL that collision, so the precedence is now stated for
the predicates only — the rule did not change, its domain did.

The `navigate/search-single-bag` benchmark measured a form that now throws (and
would have taken the whole perf harness down with it). Replaced by
`navigate/channel-guard-clean`, which measures what every caller actually pays:
the guard's scan on a healthy call, against the widest declaration list in the
file.
