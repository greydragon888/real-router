---
"@real-router/core": minor
---

An unrecognised enum option degrades to its OWN default (#1831)

`trailingSlash`, `queryParamsMode` and `urlParamsEncoding` are read at their use
sites by asking "is it the default?" — `ts === "preserve"`,
`queryParamsMode === "loose"`. A value that is neither the default nor any other
member answers "no" there and travels on as a real mode, so a typo reached the
matcher as `"never"` where the default is `"preserve"`, and as `"default"` where
the default is `"loose"` — the second DROPPING an undeclared key out of
`state.search` and out of the printed URL.

`resolveTrailingSlash` / `resolveQueryParamsMode` now map anything outside the
declared set onto that option's own default, in both directions (match and
build). `urlParamsEncoding` already did this.

Only the sites that compare against the option's DEFAULT needed it: a site
comparing against a non-default member — `options.trailingSlash === "strict"` —
already answers for an unrecognised value exactly as it answers for the default,
so it was left alone.

Bare core still does not THROW on an invalid value: refusing it BY NAME belongs
to `@real-router/validation-plugin`, which owns that list and keeps reporting —
the resolution deliberately happens where the value is USED, not at option
adoption, so the plugin still reads what the caller wrote.

**Breaking for anyone relying on the old fallback**, which on both rows means
relying on a mode they did not ask for.
