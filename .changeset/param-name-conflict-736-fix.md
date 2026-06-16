---
"@real-router/core": minor
---

Reject param-name aliasing at registration instead of corrupting matches (#736)

**Breaking Change (pre-1.0):** Two routes that share a parametric (`:name`) or splat (`*name`) **position** in the URL trie under **different** names are now rejected at registration with a clear error, instead of silently capturing the parameter under the first-registered route's name.

Previously a config like:

```js
createRouter([
  { name: "user",  path: "/user/:id" },
  { name: "userP", path: "/user/:slug", children: [{ name: "profile", path: "/profile" }] },
]);
```

would compile, then crash on `start("/user/joe/profile")` with a misleading `Missing required param 'slug'` — because the shared `/user/:…` position bound the value under `id` (first registration wins), and `rewritePathOnMatch` then rebuilt the path under `slug`.

Now this throws immediately at `createRouter()` / route registration:

```
[SegmentMatcher.registerTree] Parameter name conflict at the same path position:
':id' and ':slug'. A parametric URL segment binds to a single name across every
route that shares that position …
```

**Migration:** use one agreed name for the shared position (e.g. `:id` in both routes). A single route's own consecutive optional params (`/a/:b?/:c?/d`) are unaffected — only cross-route collisions are rejected.
