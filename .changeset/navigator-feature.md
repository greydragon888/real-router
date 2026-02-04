---
"@real-router/core": minor
"@real-router/types": minor
"@real-router/react": minor
---

Add `getNavigator()` method for safe router subset (#37)

**New Features:**

- `Navigator` interface with minimal router methods: `navigate`, `getState`, `isActive`, `subscribe`
- `Router.getNavigator()` returns frozen, cached Navigator instance
- `useNavigator()` hook in React package

**Breaking Changes (@real-router/react):**

- `useRoute()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
- `useRouteNode()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
- `RouteContext` type changed: `router` property renamed to `navigator`

**Migration:**

```tsx
// Before
const { router, route } = useRoute();
router.navigate("home");

// After
const { navigator, route } = useRoute();
navigator.navigate("home");

// If you need full Router access:
const router = useRouter();
```
