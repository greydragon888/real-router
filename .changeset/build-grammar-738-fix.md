---
"@real-router/core": patch
---

Unify build-path and match-path param grammars (#738)

The build-path param grammar was narrower than the match-path grammar, so
`matchPath` accepted patterns/names that `buildPath` then rejected with
`Missing required param` — crashing `router.start()` on valid configs via
`rewritePathOnMatch`. Two mechanisms, one root cause (no single source of truth
for "what a parameter is / how it is named"):

```js
// (a) lazy quantifier '?' inside a constraint
await createRouter([{ name: "a", path: "/a/:id<\\d?>" }]).start("/a/5");
// before: throws "Missing required param 'id'"  →  now: matches, id="5"

// (b) hyphen (or '.', '~', …) in a param name
await createRouter([{ name: "h", path: "/h/:my-param" }]).start("/h/v");
// before: throws "Missing required param 'my'"  →  now: matches, "my-param"="v"
```

- **(a)** `buildParamMeta` now detects the query separator on a length-preserving
  mask that neutralizes `?` inside `<...>` constraints (and the optional-param
  marker), so a constraint's lazy quantifier no longer truncates `pathPattern`
  or drops the constraint.
- **(b)** The build-path name class is derived from a single `PARAM_NAME_PATTERN`
  shared with the match-path grammar, so a name that matches always builds under
  the same key. The canonical param-name set is now any char except `/`, `?`,
  `<` (not just `\w`).

Non-breaking: existing `\w` names and constraints are unaffected; only
previously-crashing configs now work.
