---
"@real-router/core": patch
---

Honor `trailingSlash: "preserve"` when `rewritePathOnMatch` is active (#471)

Previously `trailingSlash: "preserve"` was silently overridden by `rewritePathOnMatch: true` (the default): the matcher built the canonical path with the trailing slash stripped, ignoring whether the source URL had one. Since both options are default-on, every user hitting a URL like `/users/` ended up with `state.path === "/users"` even though `"preserve"` promised the opposite.

`matchPath()` now re-attaches a trailing slash to the rewritten path when the source had one and `trailingSlash: "preserve"` is set. Rewrite semantics (forwardTo, encoders, defaultParams merging) are unchanged — only trailing-slash handling is respected per the option's documented meaning.
