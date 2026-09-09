---
"@real-router/react": minor
---

`<Link target>` is rendered and honoured, and every target but `_self` defers to the browser (#1834)

`<Link>` destructured `target` out of its props and never put it back on the
rendered `<a>`, so the attribute never reached the DOM. The click handler read
the same prop, saw `"_blank"`, and correctly declined to intercept — leaving a
browser with no `target` to act on. The measured result was a same-tab
full-page reload: not SPA navigation, and not a new tab either. `target` is now
rendered on the anchor.

The click gate also compared `=== "_blank"` exactly, so `_top`, `_parent`,
`_unfencedTop`, a named frame and even `_BLANK` were all intercepted. That
compare is replaced by a shared `targetsAnotherContext()` predicate: unset,
`""` and `_self` are the router's, every other value is the browser's — the
same line React Router's `shouldProcessLinkClick` and TanStack Router's
`handleClick` draw. An app in an iframe can now break out with
`<Link target="_top">`.

⚠ Behaviour change beyond the reported bug, and it is wider than the reported
value. The split is by SPELLING, not by where the value resolves, so three
spellings that name the current context anyway are now handed to the browser:
`_parent` and `_top` fall back to `_self` in a document with no ancestor, and
`_SELF` matches `_self` ASCII-case-insensitively. On an ordinary top-level page
`<Link target="_top">` therefore reaches the same destination by a **full page
load** where it used to be an in-app transition. Resolving those properly means
reproducing frame ancestry and keyword folding in the router; both reference
routers decline, and the cost is a page load rather than a wrong destination.

⚠ `download` is unchanged and still not consulted; `<Link download>` performs a
route transition. That is a policy question rather than a parity gap (neither
router checks it either) and is tracked separately.
