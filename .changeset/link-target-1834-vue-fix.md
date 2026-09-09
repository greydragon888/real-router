---
"@real-router/vue": minor
---

`v-link` honours the anchor's `target`, and `<Link target>` defers for every value but `_self` (#1834)

The `v-link` directive had **no** `target` check at all: on
`<a href="/report" target="_blank" v-link="...">` it called `preventDefault()`
and navigated in-app on every value, measured — the new tab never opened. The
directive form is where this matters most, because it attaches to an anchor the
consumer authored themselves. It now applies the same rule as `<Link>`, on
click **and** on <kbd>Enter</kbd>.

`<Link>` rendered `target` correctly but compared `=== "_blank"` exactly, so
`_top`, `_parent`, `_unfencedTop`, a named frame and even `_BLANK` were all
intercepted. That compare is replaced by a shared `targetsAnotherContext()`
predicate: unset, `""` and `_self` are the router's, every other value is the
browser's — the same line React Router's `shouldProcessLinkClick` and TanStack
Router's `handleClick` draw. An app in an iframe can now break out with
`<Link target="_top">`.

The `v-link` rule is anchor-only: a `<button v-link target="_blank">` or
`<div v-link target="_blank">` still navigates in-app, because the browser would
do nothing with the attribute there.

The `use:link` / `v-link` narrowing is by `tagName`, not `instanceof
HTMLAnchorElement`: the constructor belongs to the realm the bundle loaded in,
so an anchor built by an iframe's `contentDocument` or by a micro-frontend
failed the check and had its `target="_blank"` click intercepted anyway. Same
doctrine `applyLinkA11y` already followed for the same reason.

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
