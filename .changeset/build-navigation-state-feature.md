---
"@real-router/core": minor
---

Add `buildNavigationState()` and remove `skipTransition` option (#44)

**Breaking Change:** The `skipTransition` option has been removed from `NavigationOptions`.

**New API:**

```typescript
// Pure function — returns State without navigating
const state = router.buildNavigationState("users.view", { id: 123 });
if (state) {
  console.log(state.path); // '/users/view/123'
}
// Returns undefined if route not found
```

**Migration from `skipTransition`:**

```typescript
// Before
router.navigate('route', params, { skipTransition: true }, (err, state) => { ... });

// After
const state = router.buildNavigationState('route', params);
```
