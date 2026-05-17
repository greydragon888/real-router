---
"@real-router/solid": patch
---

Lock `buildHref` type-safety on `buildUrl` return via property tests (#S1)

The defensive `typeof url === "string" && url.length > 0` check in
`shared/dom-utils/link-utils.ts:78` guards against two `BuildUrlFn`
contract violations:

- `""` (empty string) — would render `<a href="">`, resolving to the
  current page URL and silently self-navigating on click.
- `null` (type-cast escape) — would render as `"null"` in stringifying
  renderers, or break a11y on focus.

Both must fall through to `router.buildPath()`. Added 3 explicit
property tests in `linkUtils.properties.ts` Invariant 12 to lock this
behaviour as a regression check. No production code changed — the
defensive check was already in place; this PR closes the test-coverage
gap (audit follow-up §S1).
