---
"@real-router/core": minor
---

Compare param values independently of provenance (#1554)

`areStatesEqual` and `isActiveRoute` no longer depend on **where** a value came from. The URL direction parses query values (`?page=2` → `2`, `?a=1&a=2` → `[1, 2]`, a path slot is always a string) while the intent direction keeps whatever the caller supplied (`{ page: "2" }` stays a string) — so two states describing the SAME location (byte-identical `state.path`) compared as **unequal**, and an active link rendered inactive.

**Behavior change** (pre-1.0, hence `minor`): values that print into the same URL now compare equal.

```diff
  await router.start("/x?page=2");            // state.search = { page: 2 }
- router.isActiveRoute("x", {}, { page: "2" }, false, false);   // false
+ router.isActiveRoute("x", {}, { page: "2" }, false, false);   // true

  await router.navigate("users.view", { id: "123" });
- router.isActiveRoute("users.view", { id: 123 });              // false
+ router.isActiveRoute("users.view", { id: 123 });              // true
```

Scope of the tolerance: `string` / `number` / `boolean` compare by printed form, arrays element-wise under the same rule, and a singleton array against a bare scalar (`["1"]` and `1` both print `?a=1`). `null`, `undefined` and objects keep strict semantics — they print differently (`?a` vs `?a=` vs nothing), so tolerating them would equate genuinely different URLs. Value **storage** is unchanged: `state.search` keeps the mixed domain; comparison is the single place that knows the two domains describe one location.

Both `isActiveRoute` branches are covered — the exact branch (via `areStatesEqual`) and the hierarchical one, whose raw `!==` loop now shares the same predicate.
