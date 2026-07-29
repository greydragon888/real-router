---
"@real-router/core": patch
---

Correct the `reload` JSDoc examples to the four-slot `navigate` signature (#1586)

`NavigationOptions.reload`'s examples still taught the pre-M2 spelling
`router.navigate(name, params, { reload: true })`. Slot 3 has been the query
channel since RFC-4 M2 (#1548), so that form lands `{ reload: true }` in
`search`: no reload happens, and the page's own query is rebuilt from an object
that does not contain it. Measured on `/search?term=react`:

```
default mode:  → /search              search {}
loose mode:    → /search?reload=true  search { reload: true }
```

Both examples now pass the query at slot 3 and the options at slot 4.
