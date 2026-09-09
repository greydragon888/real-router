---
"@real-router/angular": minor
---

`realLink` defers to the browser for every anchor `target` but `_self` (#1834)

The directive compared `anchor.target === "_blank"` exactly, so `_top`,
`_parent`, `_unfencedTop`, a named frame and even `_BLANK` were intercepted — an
app in an iframe could not break out with `<a realLink target="_top">`. That
compare is replaced by a shared `targetsAnotherContext()` predicate: unset, `""`
and `_self` are the router's, every other value is the browser's — the same line
React Router's `shouldProcessLinkClick` and TanStack Router's `handleClick`
draw.

⚠ Behaviour change beyond the reported bug, and it is wider than the reported
value. The split is by SPELLING, not by where the value resolves, so three
spellings that name the current context anyway are now handed to the browser:
`_parent` and `_top` fall back to `_self` in a document with no ancestor, and
`_SELF` matches `_self` ASCII-case-insensitively. On an ordinary top-level page
`<Link target="_top">` therefore reaches the same destination by a **full page
load** where it used to be an in-app transition. Resolving those properly means
reproducing frame ancestry and keyword folding in the router; both reference
routers decline, and the cost is a page load rather than a wrong destination.

⚠ `download` is unchanged and still not consulted; `<a realLink download>`
performs a route transition. That is a policy question rather than a parity gap
(neither router checks it either) and is tracked separately.
