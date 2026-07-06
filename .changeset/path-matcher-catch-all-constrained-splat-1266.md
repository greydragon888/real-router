---
"@real-router/core": patch
---

Make a `/*rest` catch-all reachable next to a constrained `/:v<c>/*rest` sibling (#1266)

Two plain routes — a `/*rest` catch-all and a constrained `/:v<v\d+>/*rest` sibling — left the catch-all entirely unreachable: any URL whose first segment failed the constraint (`/users`, `/a/b`) entered the `:v` param branch and died there (the constraint is validated only after the full traverse, with no backtrack) instead of falling back to the splat sibling. `buildPath("all", …)` then emitted URLs its own `match` rejected — dead deep-links. No `optional` param anywhere.

`match` now applies the same _try-take-if-valid_ mechanism it already used for the constrained-optional→splat fork (#1264) to a constrained **required** param that shares its trie level with a splat sibling (`markConstrainedParamFork`): when the first segment fails the constraint on its decoded value, the splat sibling captures it. Registration-order independent; the versioned form (`/v1/users`) still resolves to the constrained param. This generalizes the #1263/#1264 root — "a param greedily commits before a splat sibling without a validity-driven fallback."
