---
"@real-router/core": minor
---

A trailing slash in a parent's path no longer breaks its children ([#2002](https://github.com/greydragon888/real-router/issues/2002))

`buildFullPath` concatenated a parent path and a child path without collapsing
the separator, so **every child of a parent whose path ends in `/` was
unreachable**:

```ts
createRouter([
  { name: "p", path: "/files/list/", children: [{ name: "c", path: "/detail" }] },
]);

r.buildPath("p.c", {});                            // "/files/list//detail"
getPluginApi(r).matchPath("/files/list//detail");  // undefined
getPluginApi(r).matchPath("/files/list/detail");   // undefined  ← the natural URL
```

The route registered at the doubled path, built a URL its own `matchPath`
refuses, and the URL a user would actually visit matched nothing. Ordinary
nesting — no splat, no index, no guard involved. The control is the same tree
written without the parent's trailing slash, which works.

⚑ **The repair is forced.** Repairing `isSlashChild` instead was measured and
leaves ordinary children broken — that predicate is not consulted for a non-index
child. Collapsing the separator is the only candidate that fixes both.

⚠ **Behaviour change, and it is why this is `minor`.** For a STATIC parent with a
trailing slash and an INDEX child (`path: "/"`), the index used to build
`"/files/list/"` and that URL matched the parent; both spellings of the parent
now produce the identical tree, so it builds `"/files/list"` and that URL matches
the index. **This is not separable** — today's behaviour there exists precisely
because the index was misclassified as a standard route, and both candidate fixes
converge it identically.

⚑ Consequence worth knowing: the `#1242` §5.4 refusal (an index under a SPLAT
parent is unreachable) is now reached through `createRouter`, `add()` and
`replace()`, where a trailing slash used to bypass it. Together with
[#1996](https://github.com/greydragon888/real-router/issues/1996) — the
`setRootPath` half — the guard now answers at every door.

Not in scope: a `//` inside a single route's OWN path (`/a//b`). Bare core still
accepts it and never matches it; `@real-router/validation-plugin` refuses it with
*"double slashes not allowed"*. That is the existing core-degrades /
plugin-diagnoses split, and this fix collapses the parent↔child **junction**, not
every `//`.

Measured radius: core 4840 tests, 463 property, 153 stress, and all 22 consumer
packages green (6109 tests) — `trailingSlash` behaviour is untouched in all three
modes, verified against the pre-fix build.
