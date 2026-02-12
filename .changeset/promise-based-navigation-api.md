---
"@real-router/core": minor
"@real-router/types": minor
"@real-router/browser-plugin": minor
"@real-router/react": minor
---

# Promise-based Navigation API (RFC-8)

## Breaking Changes

### Navigation Methods Return Promises

All navigation methods now return `Promise<State>` instead of `CancelFn`:

```typescript
// Before (callback-based)
router.navigate("users", { id: "123" }, {}, (err, state) => {
  if (err) console.error(err);
  else console.log(state);
});

// After (Promise-based)
try {
  const state = await router.navigate("users", { id: "123" });
  console.log(state);
} catch (err) {
  console.error(err);
}
```

**Affected methods**:
- `router.navigate()` → `Promise<State>`
- `router.navigateToDefault()` → `Promise<State>`
- `router.start()` → `Promise<State>` (was `this`)
- `router.navigateToState()` → `Promise<State>` (plugin API)

### Cancellation API Changed

```typescript
// Before
const cancel = router.navigate("users");
cancel(); // Cancel navigation

// After
router.navigate("users");
router.cancel(); // Cancel navigation
```

### Types Removed

- `DoneFn` type removed from `@real-router/types`
- `CancelFn` type removed from `@real-router/types`

### ActivationFn Simplified

Guards and middleware no longer receive a `done` callback:

```typescript
// Before
router.addActivateGuard("admin", () => (toState, fromState, done) => {
  if (isAuthenticated()) done();
  else done({ redirect: { name: "login" } });
});

// After
router.addActivateGuard("admin", () => (toState, fromState) => {
  if (isAuthenticated()) return true;
  else return router.makeState("login");
});
```

**Return values**:
- `true` / `undefined` / `void` → Allow navigation
- `false` → Block navigation
- `State` object → Redirect to that state
- `Promise<boolean | State | void>` → Async guard

### React: BaseLink Props Removed

```typescript
// Before
<Link
  routeName="users"
  successCallback={(state) => console.log("Success", state)}
  errorCallback={(err) => console.error("Error", err)}
/>

// After - use router events or try/catch
<Link routeName="users" />
```

Use `router.addEventListener(events.TRANSITION_SUCCESS, ...)` for global navigation tracking.

### Browser Plugin: start() Override

```typescript
// Before
router.start("/users", (err, state) => {
  if (err) console.error(err);
});

// After
try {
  await router.start("/users");
} catch (err) {
  console.error(err);
}
```

## Migration Guide

1. **Replace callbacks with async/await**:
   - Wrap navigation calls in `try/catch` for error handling
   - Use `await` when you need the result state

2. **Update guards and middleware**:
   - Remove `done` parameter
   - Return values directly instead of calling `done()`
   - Use `return router.makeState(...)` for redirects

3. **Update cancellation**:
   - Replace `const cancel = router.navigate(...)` with `router.navigate(...)`
   - Call `router.cancel()` to cancel pending navigation

4. **Remove BaseLink callbacks** (React):
   - Use router event listeners for navigation tracking
   - Or wrap navigation in custom onClick handlers

## Internal Changes

- Transition pipeline converted to async/await
- Removed `parseNavigateArgs`, `safeCallback`, `StrictDoneFn` utilities
- Added `router.cancel()` method to facade
- Unhandled rejection mitigation for fire-and-forget navigate() calls

## See Also

- [RFC-8: Promise-based Navigation](packages/core/.claude/rfc/1-dx-improve-rfc-list/rfc-8-promise-based-navigation.md)
- [GitHub Issue #45](https://github.com/greydragon888/real-router/issues/45)
