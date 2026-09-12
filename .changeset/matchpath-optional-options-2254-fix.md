---
"@real-router/core": patch
---

`RouterInternals.matchPath` honours its own optional options bag (#2254)

The signature declares `options?: AnyOptions`, and the matcher reads
`rewritePathOnMatch` off the bag — so omitting it, which the type permits,
crashed the door with `Cannot read properties of undefined` while its `PluginApi`
sibling answered the same call. The adapter now defaults to the router's own
options, which is exactly what that sibling has always passed.

⚠ The parity census reported this as `internal-stricter`, a verdict its own
taxonomy calls benign. Refusing MORE is safe; dereferencing an absent argument
the signature allows is not, and the census now says so.
