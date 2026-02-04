---
"@real-router/core": minor
---

Add `getNavigator()` method (#37)

New `Router.getNavigator()` method returns a frozen, cached `Navigator` instance with safe subset of router methods for UI components.

```typescript
const navigator = router.getNavigator();
navigator.navigate("home");
navigator.getState();
navigator.isActiveRoute("home");
navigator.subscribe(listener);
```
