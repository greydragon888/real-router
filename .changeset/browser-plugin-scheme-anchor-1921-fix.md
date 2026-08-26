---
"@real-router/browser-plugin": patch
---

Read the scheme only where a scheme can be (#1921, #1836)

`safeParseUrl` located the scheme with an unanchored `indexOf("://")`, which asks
whether the string contains `://` anywhere rather than whether it BEGINS with a
scheme. For an absolute URL the first `://` is the real one, so that arc was
correct; for a relative URL it was whatever the query or fragment happened to
carry, and everything before it was discarded — path and entire query alike.

`router.matchUrl("/login?returnTo=https://app.io/dashboard")` therefore resolved
`dashboard`: the route came from a path the caller had put in a query parameter.
`?returnTo=` / `?redirect_uri=` / `?next=` is the most common query value on the
web, so every login redirect and OAuth callback was affected.

The scheme is now matched against RFC 3986's shape in first position only.
Absolute URLs, `file://`, `app://`, `tauri://` (#496) and opaque forms such as
`data:` are unchanged.
