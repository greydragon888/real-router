---
"@real-router/core": patch
---

Reject an invalid `<...>` constraint body with a clear error instead of a raw RegExp crash

A route whose constraint body is not a valid regular expression — `/:id<*x>`, `/:id<(>`, `/:id<[>` — previously crashed with a raw V8 `SyntaxError` ("Invalid regular expression: /^(*x)$/: Nothing to repeat") thrown deep inside route-tree building or the validation gate (both compile the constraint through `buildParamMeta`). It now fails fast at the single compile site with a clear `[buildParamMeta] Invalid constraint '<*x>' on parameter 'id': the body between '<' and '>' must be a valid regular expression …` message. A valid body (`<\d+>`, `<[a-z]+>`) is unaffected. Pre-existing, independent of the parse-segment tokenizer work.
