---
"@real-router/lifecycle-plugin": minor
---

Add DI access to lifecycle hooks via factory pattern (#439)

**Breaking Change:** `onEnter`, `onStay`, `onLeave` in route config are now factory functions `(router, getDependency) => hook` instead of plain hooks `(toState, fromState) => void`.

**Migration:**
```diff
- onEnter: (toState) => { console.log(toState.name); }
+ onEnter: () => (toState) => { console.log(toState.name); }
```

With DI:
```typescript
onEnter: (_router, getDep) => (toState) => {
  getDep("analytics").track(toState.name);
}
```
