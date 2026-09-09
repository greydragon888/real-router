---
"@real-router/svelte": minor
---

`<Link>` and `use:link` defer to the browser for every anchor `target` but `_self` (#1834)

Both compared `=== "_blank"` exactly, so `_top`, `_parent`, `_unfencedTop`, a
named frame and even `_BLANK` were intercepted — an app in an iframe could not
break out with `<Link target="_top">`. Both compares are replaced by a shared
`targetsAnotherContext()` predicate: unset, `""` and `_self` are the router's,
every other value is the browser's — the same line React Router's
`shouldProcessLinkClick` and TanStack Router's `handleClick` draw.

`use:link` now applies the rule on <kbd>Enter</kbd> as well as on click. Its
keydown handler navigated in-app regardless of `target`, so activating
`<a use:link target="_blank">` from the keyboard opened the new tab **and**
moved the SPA out from under it. `<Link>` has no keydown handler and needs
none — the browser synthesises a click from <kbd>Enter</kbd> on an anchor, and
that click goes through the same gate.

The rule stays anchor-only: a `<button use:link target="_blank">` or
`<div use:link target="_blank">` still navigates in-app, because the browser
would do nothing with the attribute there.

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
