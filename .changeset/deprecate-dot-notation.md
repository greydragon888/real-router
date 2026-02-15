---
"@real-router/core": minor
"route-tree": minor
---

**BREAKING CHANGE**: Remove dot-notation support from route names

Dots are now banned in the route `name` field. Use children syntax or the new `{ parent }` option in `addRoute()` instead.

**Before:**

```typescript
const routes = [
  { name: "users", path: "/users" },
  { name: "users.profile", path: "/:id" }, // ❌ No longer allowed
];
```

**After (children syntax):**

```typescript
const routes = [
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];
```

**After ({ parent } option):**

```typescript
router.addRoute({ name: "users", path: "/users" });
router.addRoute({ name: "profile", path: "/:id" }, { parent: "users" });
```

**Note:** Dots in fullName references (e.g., `navigate("users.profile")`) remain valid and unchanged.

**Changes:**

- Ban dots in route `name` field (throws TypeError with clear message)
- Add `addRoute(route, { parent: "users" })` option for lazy loading
- Remove ~170 lines of complex recursive dot-notation parsing code
- Simplify route tree building from two-pass to single-pass algorithm
