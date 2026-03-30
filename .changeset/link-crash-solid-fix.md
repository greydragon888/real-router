---
"@real-router/solid": patch
---

Fix Link component and `use:link` directive crash with invalid routeName (#372)

`<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

`use:link` directive also fixed — replaced direct `router.buildPath()` with `buildHref()`, which also adds `buildUrl` support (browser-plugin) previously missing from the directive.
