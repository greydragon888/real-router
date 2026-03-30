---
"@real-router/vue": patch
---

Fix Link component crash on render with invalid routeName (#372)

`<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.
