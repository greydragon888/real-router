---
"@real-router/navigation-plugin": patch
---

A router path that starts with `//` is written as a URL on the page's own origin (#2758)

With an empty `base`, the URL the plugin wrote and `router.buildUrl` returned was the router path as is, and a URL that starts with `//` names a host: the Navigation API navigated to that host. Such a path — a splat value that begins with `/` under `urlParamsEncoding: "uri"` or `"none"` — now gets a `/.` prefix. The browser drops the dot segment, so the pathname is the router path and the host is the page's.
