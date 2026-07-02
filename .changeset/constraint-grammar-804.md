---
"@real-router/core": minor
---

Reject unbalanced and empty `<>` constraint delimiters at route registration (#804)

`createRouter` / `addRoute` now throw for a route path whose `<...>` constraint
delimiters are unbalanced (`/x/:id<\d+`, a stray `>`, `/x/:id<`) or empty
(`/x/:id<>`). Previously bare core built such routes silently and `buildPath`
later emitted a garbage URL (`/x/1<\d+`), while an empty `<>` compiled to a
never-matching `^()$` param — the "silent at registration, cryptic later" flow.
The rejection now happens loudly at `registerTree`, mirroring the existing
name-less (#858) and fused-marker (#1050) guards, so it covers the
`createRouter`-first flow for every consumer, not only under
`@real-router/validation-plugin`.

Internally this lands the constraint-`<...>` grammar single source of truth: a
single `CONSTRAINT_BODY_PATTERN` atom now backs every match/strip/build regex
(reconciling a latent `+`/`*` desync), and a single `isConstraintBalanced`
predicate backs both the route-tree gate and the path-matcher backstop —
completing the #738 single-sourcing on the constraint axis.
