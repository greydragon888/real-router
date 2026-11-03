---
"@real-router/core": minor
---

A navigation that changes only a query param now re-enters the segment that declares it (#2689)

The transition path compared the params a segment declares through `state.params` alone, while a declared query param lives in `state.search`. A navigation that changed only the query therefore re-entered nothing: the declaring segment's guards did not run, `state.transition.segments` came back empty, `canNavigateTo` asked no guard, and `shouldUpdateNode` answered `false` for a declaring segment above the leaf, so its `useRouteNode` kept the old snapshot in every adapter.

Every name a segment declares is now compared in both channels, by the rule `areParamValuesEqual` already applies: `2` and `"2"`, or `["a"]` and `"a"`, are one value. A value that appears or disappears, an array element change and an array length change are changes. The path channel compared only string, number and boolean values before, so a change inside an array that a path slot holds through a codec now counts too.

Two objects count as unchanged, bare or as elements of two arrays of the same length, because a codec or a search schema returns fresh objects — a `Date`, a `Date[]` — on every navigation. A change from one object to another therefore re-enters nothing, as before. A query key whose name no segment declares, such as a root `setRootPath("?lang")` key, re-enters nothing either.

Some shapes re-enter a segment whose own part of the URL did not change, for example `[]` against an absent key, an array or an object that a path slot prints as JSON against the string a URL hands back, and a name declared at two levels in different channels (`/cl/:id` with a child `/y?id`), where a change of the child's half re-enters the parent too. #2894 tracks these shapes.

**Breaking Change:**

- A query-only navigation runs the `canDeactivate` and `canActivate` guards of the segment that declares the changed key and of every segment below it — through `navigate`, through `navigateToState` (which URL plugins call on Back and Forward) and in `canNavigateTo`. A guard that refuses now refuses such a navigation, which used to succeed. A navigation that reaches an async guard this way settles asynchronously: `getState()` right after `navigate()` still shows the old query.
- `shouldUpdateNode` answers `true` for the declaring segment, every segment below it and its parent, so `useRouteNode` subscribed to any of them updates.
- When `getRoutesApi(router).replace()` hands the current URL to a different route, the state is re-matched from that URL, so a segment whose query param holds `[]`, or whose path slot holds an array or an object printed as JSON, re-enters there: its `canActivate` is consulted, and an async one sends the router to `UNKNOWN_ROUTE` instead of the new route.

**Migration:** a guard that must let an in-route query change through — an unsaved-changes `canDeactivate` on `/doc/:id?tab` whose `?tab` changes — compares what it guards:

```diff
 lifecycle.addDeactivateGuard("doc", () => (toState, fromState) =>
-  !hasUnsavedChanges(),
+  (toState.name === fromState?.name &&
+    toState.params.id === fromState?.params.id) ||
+  !hasUnsavedChanges(),
 );
```
