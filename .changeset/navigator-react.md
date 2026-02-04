---
"@real-router/react": minor
---

Add `useNavigator()` hook and update React bindings (#37)

**New:**
- `useNavigator()` hook for direct Navigator access
- `NavigatorContext` for providing Navigator to components

**BREAKING CHANGE:**
- `useRoute()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
- `useRouteNode()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`

**Migration:**
```tsx
// Before
const { router, route } = useRoute();
router.navigate("home");

// After
const { navigator, route } = useRoute();
navigator.navigate("home");

// For full Router access:
const router = useRouter();
```
