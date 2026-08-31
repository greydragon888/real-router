---
"@real-router/core": patch
---

Refuse a path carrying `//` at registration (#2010)

`{ path: "/a//b" }` registered, `buildPath` printed `/a//b`, and the route's own
`matchPath("/a//b")` answered `undefined` — a route that builds the URL it was
declared for and then refuses to match it.

Refused by the matcher backstop, beside the non-ASCII static (#1154) and
duplicate-path (#1153) rules, which is where this router keeps its always-on
path rules: the route-tree gate is plugin-only and its reject recipes are kept
out of the main chunk deliberately (#1526).

The scan is over the path as DECLARED, query declaration included: a `//` in
`/a?x//y` is refused too, which is what the route-tree gate has always done.

A leading slash and one trailing slash are unaffected — only an empty segment
between two others is refused.
