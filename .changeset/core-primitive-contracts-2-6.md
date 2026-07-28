---
"@real-router/core": patch
---

Pin the contracts of `forwardState` and `makeState` (nav-pipeline Phase 2, step 2-6)

With every entry point now composing through the pipeline, the two primitives are
reached only from the plugin surface — so what they promise is worth stating
rather than inferring. Both contracts were measured, not assumed, and are now
pinned by tests and recorded as INVARIANTS forwardState #7 and #8.

- **`forwardState` is stage ① alone.** It resolves the `forwardTo` chain and
  layers each HOP's defaults, and stops there: the TERMINAL route's own defaults
  are not applied. On `src → dst` where `dst` declares `defaultSearch { tab: "new" }`,
  `forwardState("src", {})` returns `{ name: "dst", params: {}, search: {} }`,
  while `navigate("src")` — ① then ③ — commits `/dst?tab=new`. That split is what
  makes the primitive composable.
- **`makeState` is the literal form.** It never resolves `forwardTo`
  (`makeState("src")` stays on `"src"`, path `/src`), but it does apply ③ for the
  route it was NAMED (`defaultSearch { page: "5" }` → `?page=5`). Equivalent to
  `canonicalize(..., { resolveForward: false })`, the same form `buildPath` and
  `isActiveRoute` take — which is why a plugin can build a state for an alias
  without being teleported off it.

Also corrected: INVARIANTS isActiveRoute #9 still described the predicate's two
branches as "the exact branch splits them (`separateChannels`), the descendant
branch spreads them into one". Step 2-5 removed both of those; the totality
guarantee it documents is unchanged, only the mechanism it names.
