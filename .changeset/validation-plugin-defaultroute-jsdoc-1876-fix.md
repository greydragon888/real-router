---
"@real-router/validation-plugin": patch
---

docs: `validateResolvedDefaultRoute` runs on `navigateToDefault()` only (#1876)

The JSDoc on `validateResolvedDefaultRoute` said the resolver runs "on every
`navigateToDefault()` / `start()` fallback". There is no such fallback:
measured, `start()` consults `defaultRoute` **zero** times — for an empty path,
an unmatched path and `/` alike, in both `allowNotFound` modes. An unmatched
start raises `ROUTE_NOT_FOUND`, or commits `UNKNOWN_ROUTE` under
`allowNotFound: true`.

No behaviour change; the symbol is internal to the plugin. A `patch` changeset
because `.changeset/README.md` requires one for any change to a public
package's source, comment-only edits included.
