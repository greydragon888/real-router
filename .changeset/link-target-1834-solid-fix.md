---
"@real-router/solid": minor
---

`<Link target>` is rendered and honoured, and every target but `_self` defers to the browser (#1834)

`<Link>` kept `target` in its `splitProps` locals, so `{...rest}` could not
carry it to the rendered `<a>` and the attribute never reached the DOM. The
click handler read the same prop, saw `"_blank"`, and correctly declined to
intercept — leaving a browser with no `target` to act on. The measured result
was a same-tab full-page reload: not SPA navigation, and not a new tab either.
`target` is now rendered on the anchor.

Both `<Link>` and the `use:link` directive also compared `=== "_blank"`
exactly, so `_top`, `_parent`, `_unfencedTop`, a named frame and even
`_BLANK` were all intercepted. Those compares are replaced by a shared
`targetsAnotherContext()` predicate: unset, `""` and `_self` are the router's,
every other value is the browser's — the same line React Router's
`shouldProcessLinkClick` and TanStack Router's `handleClick` draw. An app in an
iframe can now break out with `<Link target="_top">`.

The `use:link` rule stays anchor-only: a `<button use:link target="_blank">` or
`<div use:link target="_blank">` still navigates in-app, because the browser
would do nothing with the attribute there. `use:link` registers a click
listener only, so unlike svelte's and vue's directive forms it has no keyboard
path to gate.

The `use:link` narrowing is by `tagName`, not `instanceof HTMLAnchorElement`:
the constructor belongs to the realm the bundle loaded in, so an anchor built by
an iframe's `contentDocument` or by a micro-frontend failed the check. Two
things rode on that answer, and both were wrong for such an anchor — its
`target="_blank"` click was intercepted anyway, and **its `href` was never
written at all**, measured as `getAttribute("href") === null` where a same-realm
anchor got `/test`. So a `use:link` anchor in an iframe or a micro-frontend
rendered with no href: no middle-click, no open-in-new-tab, no status-bar URL.
Same doctrine `applyLinkA11y` already followed for the same reason.

⚠ Rendering `target` makes `local.target` a **render-phase** read. It was
previously read only inside the click handler, so a `target` prop backed by a
throwing getter now fails the mount instead of one click, and the attribute
becomes a tracked dependency that updates the DOM when the prop changes.

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
