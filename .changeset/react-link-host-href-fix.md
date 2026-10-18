---
"@real-router/react": patch
---

`<Link>` without a URL plugin keeps an href that starts with `//` on the page's own origin (#2758)

Without a URL plugin the href is the router path, and an href that starts with `//` names a host — the one a modifier click, a middle click or "open in new tab" follows. Such a path, a splat value that begins with `/` under `urlParamsEncoding: "uri"` or `"none"`, now gets the `/.` prefix the URL plugins give it.
