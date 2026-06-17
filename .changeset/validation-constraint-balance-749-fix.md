---
"@real-router/validation-plugin": patch
---

Reject unbalanced constraint delimiters in route paths (#749)

`validateRoute` now rejects route paths with an unbalanced `<` or `>` constraint
delimiter (e.g. `/u/:id<\d+` with no closing `>`, or a dangling `/u/:id<`).
Previously these passed validation but crashed later in `buildPath` with
`Missing required param` — the param name was truncated at the stray `<` while
the unclosed constraint survived as a literal in the trie node path.

Balanced constraints and hyphenated param names (`/a/:id<\d?>`, `/h/:my-param`)
continue to pass — those were fixed by #738 and are valid configs.
