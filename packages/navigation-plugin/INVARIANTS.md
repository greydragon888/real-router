# Navigation Plugin Invariants

This document lists all invariants that must hold in `@real-router/navigation-plugin` for property-based testing. Each invariant is categorized by concern area and marked as either **PBT-testable** (property-based testing with random inputs) or **example-based** (requires specific scenarios).

## A. Bidirectional Sync Invariants

### A1. Router→Browser Sync Completeness
**Category:** Bidirectional Sync  
**Testable:** Example-based  
**Description:** After `onTransitionSuccess`, the browser URL must match the router state exactly.

**Precondition:**
- Router has completed a transition to state `S`
- `onTransitionSuccess(S, fromState, navOptions)` has been called

**Postcondition:**
- `browser.getLocation()` returns a path that matches `S.path`
- `browser.currentEntry.getState()` contains `{ name: S.name, params: S.params, path: S.path }`
- If `navOptions.replace === true`, history was replaced (not pushed)
- If `navOptions.replace === false`, history was pushed

**Why it matters:** Prevents URL/state desync where browser shows one URL but router thinks it's elsewhere.

---

### A2. Browser→Router Sync Completeness
**Category:** Bidirectional Sync  
**Testable:** Example-based  
**Description:** When a navigate event fires, the router must transition to the matching state.

**Precondition:**
- Browser fires a navigate event with `destination.url = "/users/123"`
- Router has a route that matches this path

**Postcondition:**
- `router.navigate()` is called with the matched route name and params
- Router transitions to the matched state
- `router.getState().path` equals the extracted path from the URL

**Why it matters:** Prevents browser-initiated navigations (back/forward, link clicks) from being ignored.

---

### A3. Roundtrip Invariant
**Category:** Bidirectional Sync  
**Testable:** PBT-testable  
**Description:** A roundtrip navigation must preserve state: `router.navigate(X) → onTransitionSuccess → browser state = X → navigate event → handler → router state = X`.

**Precondition:**
- Router is at state `S1`
- Call `router.navigate("users.view", { id: "123" })`

**Postcondition:**
- `onTransitionSuccess` fires with state `S2 = { name: "users.view", params: { id: "123" }, ... }`
- Browser URL is updated to match `S2`
- Browser history entry state is `{ name: "users.view", params: { id: "123" }, path: "/users/123" }`
- If we simulate a navigate event from this entry, router transitions back to `S2`

**Why it matters:** Ensures no information loss during sync cycles.

---

### A4. Hash Preservation on Same-Path Navigation
**Category:** Bidirectional Sync  
**Testable:** Example-based  
**Description:** When navigating to the same path, the hash fragment is preserved.

**Precondition:**
- Current URL is `/users#section`
- Call `router.navigate("users.list")` (same path)

**Postcondition:**
- Final URL is `/users#section` (hash preserved)
- If navigating to a different path, hash is cleared

**Why it matters:** Preserves user scroll position and anchor links.

---

## B. History Extensions Invariants

### B1. Entry-to-State Matching Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `entryToState()` must correctly match a history entry's URL to a router state.

**Precondition:**
- History entry has `url = "http://localhost/users/123?sort=name"`
- Router has route `{ name: "users.view", path: "/users/:id" }`

**Postcondition:**
- `entryToState(entry, api, base)` returns `{ name: "users.view", params: { id: "123" }, path: "/users/123", ... }`
- If entry URL doesn't match any route, returns `undefined`
- Base path is correctly stripped before matching
- Search params from entry URL are ignored — matching is by pathname only

**Why it matters:** History queries depend on accurate URL→state mapping.

---

### B2. peekBack Index Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `peekBack()` must return the state at `currentIndex - 1`.

**Precondition:**
- History has entries: `[home, users.list, users.view]`
- Current index is 2 (users.view)

**Postcondition:**
- `peekBack()` returns state for `users.list`
- If current index is 0, `peekBack()` returns `undefined`
- If `currentEntry` is null, `peekBack()` returns `undefined`

**Why it matters:** Enables "back button preview" UI.

---

### B3. peekForward Index Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `peekForward()` must return the state at `currentIndex + 1`.

**Precondition:**
- History has entries: `[home, users.list, users.view]`
- Current index is 1 (users.list)

**Postcondition:**
- `peekForward()` returns state for `users.view`
- If current index is at the end, `peekForward()` returns `undefined`
- If `currentEntry` is null, `peekForward()` returns `undefined`

**Why it matters:** Enables "forward button preview" UI.

---

### B4. hasVisited Monotonicity
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** Once `hasVisited(routeName)` returns true, it must always return true (monotonic).

**Precondition:**
- Navigate to route `"users.view"`
- Call `hasVisited("users.view")` → returns `true`

**Postcondition:**
- All subsequent calls to `hasVisited("users.view")` return `true`
- Navigating to other routes doesn't change this
- Only `router.stop()` or history clear can reset it

**Why it matters:** Prevents false negatives in "have you visited this page?" checks.

---

### B5. getVisitedRoutes Uniqueness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `getVisitedRoutes()` must return unique route names (no duplicates).

**Precondition:**
- Navigate: home → users.list → users.view → users.list → home

**Postcondition:**
- `getVisitedRoutes()` returns `["home", "users.list", "users.view"]` (or any permutation)
- No route name appears twice
- All returned names have at least one matching history entry

**Why it matters:** Prevents duplicate entries in visited routes list.

---

### B6. getRouteVisitCount Accuracy
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `getRouteVisitCount(routeName)` must equal the number of history entries matching the route.

**Precondition:**
- Navigate: home → users.list → users.view → users.list → home
- Count entries matching "users.list" = 2

**Postcondition:**
- `getRouteVisitCount("users.list")` returns `2`
- Count is consistent with `getVisitedRoutes()` (if route is in list, count > 0)
- Count is consistent with `hasVisited()` (if count > 0, hasVisited returns true)

**Why it matters:** Enables "visit count" analytics and UI features.

---

### B7. findLastEntryForRoute Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `findLastEntryForRoute()` must return the last entry matching the route, excluding the current entry.

**Precondition:**
- History: `[home, users.list, users.view, users.list]`
- Current entry is the last `users.list` (index 3)
- Call `findLastEntryForRoute(entries, "users.list", ...)`

**Postcondition:**
- Returns the entry at index 1 (the previous `users.list`)
- Does NOT return the current entry (index 3)
- If no other entry matches, returns `undefined`
- If only the current entry matches, returns `undefined`

**Why it matters:** Enables `traverseToLast()` to jump to the previous occurrence of a route.

---

### B8. canGoBack Boundary Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `canGoBack()` must return true iff `currentIndex > 0`.

**Precondition:**
- History has 3 entries (indices 0, 1, 2)

**Postcondition:**
- At index 0: `canGoBack()` returns `false`
- At index 1 or 2: `canGoBack()` returns `true`
- If `currentEntry` is null: `canGoBack()` returns `false`

**Why it matters:** Prevents back button from being enabled when there's nowhere to go.

---

### B9. canGoForward Boundary Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `canGoForward()` must return true iff `currentIndex < entries.length - 1`.

**Precondition:**
- History has 3 entries (indices 0, 1, 2)

**Postcondition:**
- At index 0 or 1: `canGoForward()` returns `true`
- At index 2: `canGoForward()` returns `false`
- If `currentEntry` is null: `canGoForward()` returns `false`

**Why it matters:** Prevents forward button from being enabled when there's nowhere to go.

---

### B10. canGoBackTo Correctness
**Category:** History Extensions  
**Testable:** PBT-testable  
**Description:** `canGoBackTo(routeName)` must return true iff there exists an entry before current index matching the route.

**Precondition:**
- History: `[home, users.list, users.view, users.list]`
- Current index is 3 (last users.list)

**Postcondition:**
- `canGoBackTo("users.list")` returns `true` (entry at index 1)
- `canGoBackTo("users.view")` returns `true` (entry at index 2)
- `canGoBackTo("checkout")` returns `false` (no entry before current)
- At index 0, all `canGoBackTo()` calls return `false`

**Why it matters:** Enables "back to X" buttons only when X is actually in the back history.

---

### B11. traverseToLast State Consistency
**Category:** History Extensions  
**Testable:** Example-based  
**Description:** After `traverseToLast(routeName)`, the router must be at the last entry matching the route.

**Precondition:**
- History: `[home, users.list, users.view, users.list]`
- Current state is `users.view`
- Call `await router.traverseToLast("users.list")`

**Postcondition:**
- Router transitions to the last `users.list` entry (index 3)
- `router.getState().name === "users.list"`
- `router.peekBack()` returns `users.view`
- `router.peekForward()` returns `undefined`
- `state.context.navigation` has `navigationType: "traverse"` and `direction: "back"`

**Why it matters:** Enables jumping directly to a previous occurrence without stepping through intermediate entries.

---

### B12. traverseToLast Error Handling
**Category:** History Extensions  
**Testable:** Example-based  
**Description:** `traverseToLast()` must throw if no matching entry exists.

**Precondition:**
- History: `[home, users.list]`
- Call `await router.traverseToLast("checkout")`

**Postcondition:**
- Throws `Error` with message containing "No history entry for route"
- Router state is unchanged
- `pendingMeta` is cleared
- `pendingTraverseKey` is cleared

**Why it matters:** Prevents silent failures when trying to traverse to non-existent routes.

---

### B13. canGoBackTo Implies hasVisited
**Category:** History Extensions  
**Testable:** PBT-testable (model-based)  
**Description:** `canGoBackTo(routeName)` returning `true` implies `hasVisited(routeName)` is also `true`. The converse does not hold — a route may have been visited but only in forward history or as the current entry.

**Precondition:**
- Any navigation history sequence

**Postcondition:**
- For every route `r`: `canGoBackTo(r) === true` → `hasVisited(r) === true`

**Why it matters:** Ensures logical consistency between history query functions. A route cannot be reachable via back navigation if it was never visited.

---

### B14. getRouteVisitCount Monotonicity After Push
**Category:** History Extensions  
**Testable:** PBT-testable (model-based)  
**Description:** After a **push** navigation to route `r` (i.e., `navigationType === "push"` — no `replace`, not a no-op same-state), `getRouteVisitCount(r)` must grow by exactly 1. Replace and reload must not change the count.

**Precondition:**
- Current state: `getRouteVisitCount(r) === N`
- Model operation: `navigate(r, params)` producing a push entry

**Postcondition:**
- After the navigation: `getRouteVisitCount(r) === N + 1`
- After a `replace` navigation to `r`: count unchanged (replace overwrites the current entry, which may already match `r`)
- After a `reload` of `r` from state `r`: count unchanged (reload replaces the current entry)

**Why it matters:** Users treat `getRouteVisitCount` as an analytics counter. A push that failed to increment, or a replace that incremented, would skew all downstream metrics (session-length stats, "did the user visit X N-or-more times" guards).

---

### B15. Visit Count Sum Consistency
**Category:** History Extensions  
**Testable:** PBT-testable (model-based)  
**Description:** The sum of `getRouteVisitCount(r)` over all routes returned by `getVisitedRoutes()` must equal the number of matchable history entries — entries whose URL resolves to a route.

**Precondition:**
- Any navigation history sequence (possibly including entries with unmatchable URLs)

**Postcondition:**
- Let `M = |{ entry ∈ entries() : entryToState(entry) !== undefined }|` (matchable entries).
- Then: `∑ getRouteVisitCount(r) for r in getVisitedRoutes() === M`.

**Why it matters:** This glues the three history-query functions into one arithmetic identity. A bug in `getVisitedRoutes` (e.g., dropping routes at depth > 1) or in `getRouteVisitCount` (e.g., off-by-one on the current entry) surfaces here, not in isolated property tests. Unmatchable entries are excluded — foreign entries from other SPAs should not count.

---

## C. NavigationMeta Invariants

### C1. Meta Attachment on Success
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** Every successful transition must have meta attached to the resulting state via `state.context.navigation`.

**Precondition:**
- Call `router.navigate("users.list")`
- Transition succeeds

**Postcondition:**
- `state.context.navigation` is a frozen `NavigationMeta` object
- Meta has `navigationType`, `userInitiated`, `direction`, and `sourceElement` fields
- Meta is written via `claim.write(state, Object.freeze(meta))`

**Why it matters:** Enables tracking navigation type and origin for every state.

---

### C2. deriveNavigationType Correctness
**Category:** NavigationMeta  
**Testable:** PBT-testable  
**Description:** `deriveNavigationType()` must correctly classify navigation type.

**Precondition:**
- Current state: `{ name: "home", path: "/" }`
- Call `router.navigate("users.list", {}, { reload: true })`

**Postcondition:**
- If `reload: true` and `toState.path === fromState.path`: `navigationType = "reload"`
- If `shouldReplaceHistory()` returns true: `navigationType = "replace"`
- Otherwise: `navigationType = "push"`

**Why it matters:** Enables correct history management (push vs replace).

---

### C3. pendingMeta Lifecycle
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** `pendingMeta` must follow a strict lifecycle: set → written to `toState.context.navigation` in `onTransitionStart` → written again in `onTransitionSuccess` → cleared.

**Precondition:**
- Call `router.navigate("users.list")`

**Postcondition:**
- Before transition: `pendingMeta` is `undefined`
- During transition (in guards): `toState.context.navigation` contains the frozen pendingMeta (for browser-initiated navigation)
- After `onTransitionSuccess`: `pendingMeta` is cleared to `undefined`
- `toState.context.navigation` contains the frozen meta

**Why it matters:** Prevents meta from leaking between transitions.

---

### C4. pendingMeta Cleanup on Cancel
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** `pendingMeta` must be cleared when a transition is cancelled.

**Precondition:**
- Call `router.navigate("users.list")`
- Guard returns `false`, cancelling the transition

**Postcondition:**
- `onTransitionCancel` is called
- `pendingMeta` is set to `undefined`
- `pendingTraverseKey` is set to `undefined`

**Why it matters:** Prevents cancelled transitions from affecting subsequent navigations.

---

### C5. pendingMeta Cleanup on Error
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** `pendingMeta` must be cleared when a transition errors.

**Precondition:**
- Call `router.navigate("users.list")`
- Guard throws an error

**Postcondition:**
- `onTransitionError` is called
- `pendingMeta` is set to `undefined`
- `pendingTraverseKey` is set to `undefined`

**Why it matters:** Prevents errored transitions from affecting subsequent navigations.

---

### C6. userInitiated Accuracy
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** `userInitiated` must be `false` for programmatic navigation and `true` for browser-initiated navigation.

**Precondition:**
- Programmatic: `router.navigate("users.list")`
- Browser-initiated: user clicks back button

**Postcondition:**
- Programmatic: `meta.userInitiated === false`
- Browser-initiated: `meta.userInitiated === true` (from `event.userInitiated`)

**Why it matters:** Enables distinguishing user actions from programmatic navigation.

---

### C7. info Field Preservation
**Category:** NavigationMeta  
**Testable:** Example-based  
**Description:** The `info` field from navigate events must be preserved in meta.

**Precondition:**
- Browser fires navigate event with `info: { source: "link" }`

**Postcondition:**
- `meta.info === { source: "link" }`
- Info is available in guards via `toState.context.navigation`
- Info is available in subscribe callbacks via `state.context.navigation`

**Why it matters:** Enables passing context through navigate events.

---

### C8. deriveNavigationType on Initial Navigation with `reload`
**Category:** NavigationMeta  
**Testable:** PBT-testable  
**Description:** On the very first navigation (`fromState === undefined`), `deriveNavigationType` returns `"replace"` even when `navOptions.reload === true`. Reason: the `"reload"` branch requires `toState.path === fromState?.path`, which is false for `undefined?.path === undefined` vs a concrete `toState.path`. After the reload check fails, `shouldReplaceHistory` classifies the initial navigation as a replace (G4 — replace nullish + fromState undefined).

**Precondition:**
- `fromState === undefined` (first navigation)
- `navOptions.reload === true` (user requested reload semantics on start)

**Postcondition:**
- `deriveNavigationType({ reload: true }, toState, undefined) === "replace"`
- NOT `"reload"` — there is no previous state to reload

**Why it matters:** Documents a subtle asymmetry: requesting reload on the initial navigation silently downgrades to replace. Tooling that pattern-matches `navigationType === "reload"` for cache-busting logic must tolerate the start-time absence. Pinning this in PBT prevents a regression where someone "fixes" the initial-reload case by returning `"reload"` with an undefined `fromState`, which would then confuse plugins that treat reload as "same URL re-entered".

---

## D. Syncing Flag Invariants

### D1. isSyncingFromRouter Prevents Infinite Loops
**Category:** Syncing Flag  
**Testable:** Example-based  
**Description:** When `isSyncingFromRouter` is true, navigate events must be ignored.

**Precondition:**
- Router calls `onTransitionSuccess`
- Sets `isSyncingFromRouter = true`
- Calls `browser.navigate(url, ...)`
- Browser fires a navigate event

**Postcondition:**
- Navigate handler checks `isSyncingFromRouter()`
- If true, handler returns early without calling `router.navigate()`
- No recursive navigation occurs

**Why it matters:** Prevents infinite loops where router→browser sync triggers browser→router sync.

---

### D2. isSyncingFromRouter Scope in onTransitionSuccess
**Category:** Syncing Flag  
**Testable:** Example-based  
**Description:** `isSyncingFromRouter` must be true only during browser sync in `onTransitionSuccess`.

**Precondition:**
- Call `router.navigate("users.list")`

**Postcondition:**
- Before `onTransitionSuccess`: `isSyncingFromRouter === false`
- During `browser.navigate()` call: `isSyncingFromRouter === true`
- After `onTransitionSuccess`: `isSyncingFromRouter === false`

**Why it matters:** Ensures the flag is scoped correctly and doesn't leak.

---

### D3. isSyncingFromRouter Scope in replaceHistoryState
**Category:** Syncing Flag  
**Testable:** Example-based  
**Description:** `isSyncingFromRouter` must be true during `replaceHistoryState` browser sync.

**Precondition:**
- Call `router.replaceHistoryState("users.list")`

**Postcondition:**
- Before call: `isSyncingFromRouter === false`
- During `browser.replaceState()`: `isSyncingFromRouter === true`
- After call: `isSyncingFromRouter === false`

**Why it matters:** Prevents navigate events from `replaceState` from triggering navigation.

---

### D4. isSyncingFromRouter Error Recovery
**Category:** Syncing Flag  
**Testable:** Example-based  
**Description:** If an error occurs while syncing, `isSyncingFromRouter` must be reset to false.

**Precondition:**
- `onTransitionSuccess` throws an error during `browser.navigate()`

**Postcondition:**
- Error is caught
- `isSyncingFromRouter` is set back to `false`
- Router state is consistent

**Why it matters:** Prevents the flag from being stuck in true state.

---

## E. Lifecycle Invariants

### E1. onStart Listener Registration
**Category:** Lifecycle  
**Testable:** Example-based  
**Description:** `onStart` must register the navigate event listener.

**Precondition:**
- Plugin is created but not started
- No navigate listener is registered

**Postcondition:**
- `router.start()` is called
- `onStart` is invoked
- Navigate listener is registered with `browser.addNavigateListener()`
- `shared.removeNavigateListener` is set to the unsubscribe function

**Why it matters:** Ensures navigate events are handled after router starts.

---

### E2. onStop Listener Removal
**Category:** Lifecycle  
**Testable:** Example-based  
**Description:** `onStop` must remove the navigate event listener.

**Precondition:**
- Router is running with navigate listener registered

**Postcondition:**
- `router.stop()` is called
- `onStop` is invoked
- Navigate listener is removed
- `shared.removeNavigateListener` is set to `undefined`

**Why it matters:** Prevents memory leaks and stale event handlers.

---

### E3. teardown Cleanup Completeness
**Category:** Lifecycle  
**Testable:** Example-based  
**Description:** `teardown` must clean up all resources: listener, start interceptor, extensions, and context namespace claim.

**Precondition:**
- Plugin is fully initialized and running

**Postcondition:**
- `teardown()` is called
- Navigate listener is removed
- Start interceptor is removed
- Router extensions are removed
- Context namespace claim is released (`claim.release()`)
- All cleanup functions are called

**Why it matters:** Ensures complete cleanup when plugin is disposed.

---

### E4. Factory Reuse Listener Cleanup
**Category:** Lifecycle  
**Testable:** Example-based  
**Description:** When the same factory is reused, the previous listener must be cleaned up before registering a new one.

**Precondition:**
- Create router1 with plugin from factory
- Create router2 with plugin from same factory
- Both call `onStart`

**Postcondition:**
- Router1's navigate listener is removed
- Router2's navigate listener is registered
- Only router2 receives navigate events
- No memory leak from router1's listener

**Why it matters:** Enables safe factory reuse without listener accumulation.

---

## F. Error Recovery Invariants

### F1. Non-RouterError Recovery
**Category:** Error Recovery  
**Testable:** Example-based  
**Description:** Only non-RouterError exceptions trigger recovery; RouterError is allowed to propagate.

**Precondition:**
- Navigate handler catches an error in `router.navigate()`

**Postcondition:**
- If error is `RouterError`: error propagates, no recovery
- If error is not `RouterError`: `recoverFromNavigateError()` is called

**Why it matters:** Distinguishes expected routing errors from unexpected exceptions.

---

### F2. Error Recovery URL Restoration
**Category:** Error Recovery  
**Testable:** Example-based  
**Description:** On non-RouterError, the URL must be restored to the current router state.

**Precondition:**
- Navigate handler throws a non-RouterError
- Current router state is `{ name: "home", path: "/" }`

**Postcondition:**
- `recoverFromNavigateError()` is called
- `browser.navigate(url, { history: "replace" })` is called with URL matching current state
- Browser URL is restored to `/`

**Why it matters:** Prevents URL from being stuck in an inconsistent state.

---

### F3. Error Recovery No Recursive Navigation
**Category:** Error Recovery  
**Testable:** Example-based  
**Description:** Error recovery must not trigger recursive navigation.

**Precondition:**
- Navigate handler throws an error
- Recovery calls `browser.navigate()`

**Postcondition:**
- `isSyncingFromRouter` is set to `true` before recovery
- Navigate event from recovery is ignored
- `isSyncingFromRouter` is set to `false` after recovery

**Why it matters:** Prevents infinite error loops.

---

### F4. Error Recovery Double-Error Handling
**Category:** Error Recovery  
**Testable:** Example-based  
**Description:** If recovery itself throws an error, it must be caught and logged.

**Precondition:**
- Navigate handler throws an error
- Recovery throws another error (e.g., `router.buildUrl()` fails)

**Postcondition:**
- First error is logged
- Second error is caught and logged
- Router doesn't crash

**Why it matters:** Prevents cascading failures.

---

## G. URL Handling Invariants

### G1. Base Path Stripping Correctness
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `extractPath()` must correctly strip the base path from a pathname.

**Precondition:**
- Base: `/app`
- Pathname: `/app/users/123`

**Postcondition:**
- `extractPath(pathname, base)` returns `/users/123`
- If pathname doesn't start with base, returns pathname unchanged
- If base is empty, returns pathname unchanged

**Why it matters:** Enables correct URL matching when app is hosted at a subpath.

---

### G2. Base Path Building Correctness
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `buildUrl()` must correctly prepend the base path to a path.

**Precondition:**
- Base: `/app`
- Path: `/users/123`

**Postcondition:**
- `buildUrl(path, base)` returns `/app/users/123`
- If base is empty, returns path unchanged

**Why it matters:** Ensures URLs are built with correct base path.

---

### G3. URL Parsing Robustness
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `urlToPath()` must be total — never throws, always returns a
`string` starting with `/`, for any input (including scheme-less paths, opaque
URIs, and custom schemes like `app://`, `tauri://`, `file://`).

**Precondition:**
- Absolute HTTP URL: `http://localhost/app/users/123?sort=name`
- Custom-scheme URL: `tauri://localhost/users/123`
- Path-only input: `/users/123?sort=name`
- Opaque / garbage input: `not a url`

**Postcondition:**
- Absolute HTTP URL: returns `/users/123?sort=name` (with base `/app`)
- Custom-scheme URL: returns `/users/123` (scheme and authority ignored)
- Path-only input: returns `/users/123?sort=name`
- Opaque / garbage input: returns a string — the router rejects unmatched
  paths at the matcher layer, not the parser layer.
- No exceptions thrown.

**Why it matters:** A total parser composes cleanly without null-case branches.
Desktop runtimes (Electron `app://`, Tauri `tauri://`, `file://`) need scheme-
agnostic parsing; validation is the matcher's job, not the parser's. See
[IMPLEMENTATION_NOTES#safeParseUrl](../../../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496).

---

### G4. shouldReplaceHistory Domain Completeness
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `shouldReplaceHistory(navOptions, toState, fromState)` must return a boolean for any valid input combination without throwing.

**Precondition:**
- `navOptions.replace` can be `true`, `false`, or `undefined`
- `navOptions.reload` can be `true`, `false`, or `undefined`
- `fromState` can be `State` or `undefined`

**Postcondition:**
- Always returns `boolean` (never throws)
- `replace: true` → always `true`
- `fromState === undefined` + `replace` nullish (undefined) → `true` (initial navigation replaces by default)
- `fromState === undefined` + `replace: false` (explicit override) → `false` (user asks for push on first nav)
- `reload && same path` → `true`

**Why it matters:** Guard must be total over the entire `(replace, reload, fromState)` domain. Regression #447 made `replace: false` + `fromState: undefined` throw; the `??` fix made it return `false`, which is the explicit user choice.

---

### G5. normalizeBase Canonical Form
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `normalizeBase(base)` returns a canonical string: either empty, or starts with `/`, does not end with `/`, and contains no run of two or more consecutive `/` characters.

**Precondition:**
- `base` is any string

**Postcondition:**
- `normalizeBase(base)` is either `""` or starts with `/`
- `normalizeBase(base)` does not end with `/` (unless result is `""`)
- `normalizeBase(base)` does not match `/{2,}` anywhere in the string
- `normalizeBase(normalizeBase(base)) === normalizeBase(base)` (idempotency)

**Why it matters:** Downstream functions (`extractPath`, `buildUrl`) assume canonical base. Violation causes double-slash URLs (e.g. `buildUrl("/x", "//") → "///x"`) that can redirect `pushState` to a different origin.

---

### G6. computeDirection Reflexivity
**Category:** URL Handling  
**Testable:** PBT-testable  
**Description:** `computeDirection("traverse", i, i)` must return `"unknown"` when destination and current indices are equal.

**Precondition:**
- `navigationType` is `"traverse"`
- `destinationIndex === currentIndex`

**Postcondition:**
- Returns `"unknown"` (not `"forward"` or `"back"`)

**Why it matters:** Traversing to the current entry has no direction. Returning `"back"` is semantically incorrect and misleads subscribers relying on `direction` for UI transitions (#448).

---

## H. State Consistency Invariants

### H1. NavigationHistoryState Completeness
**Category:** State Consistency  
**Testable:** Example-based  
**Description:** Every history entry must have complete state: `name`, `params`, and `path`.

**Precondition:**
- Router navigates to `{ name: "users.view", params: { id: "123" }, path: "/users/123" }`

**Postcondition:**
- `entry.getState()` returns `{ name: "users.view", params: { id: "123" }, path: "/users/123" }`
- All three fields are present and correct
- No field is missing or null

**Why it matters:** Ensures history entries can be reconstructed to router states.

---

### H2. Meta Lifecycle on State Context
**Category:** State Consistency  
**Testable:** Example-based  
**Description:** Navigation meta lives on `state.context.navigation` and is garbage collected with the state.

**Precondition:**
- Navigate to state S1
- `S1.context.navigation` contains frozen NavigationMeta
- Navigate to state S2
- Delete reference to S1

**Postcondition:**
- S1 and its context (including navigation meta) are garbage collected together
- No separate storage to leak (meta is on the state object itself)
- `claim.release()` in teardown frees the namespace for reuse

**Why it matters:** Prevents memory leaks from accumulated meta objects.

---

## I. Integration Invariants

### I1. Plugin Initialization Order
**Category:** Integration  
**Testable:** Example-based  
**Description:** Extensions must be registered before `onStart` is called.

**Precondition:**
- Create plugin instance

**Postcondition:**
- `api.extendRouter()` is called in constructor
- Extensions are available before `onStart`
- `router.buildUrl()`, `router.peekBack()`, etc. are callable

**Why it matters:** Ensures extensions are available to other plugins and user code.

---

### I2. Plugin Disposal Order
**Category:** Integration  
**Testable:** Example-based  
**Description:** Cleanup must happen in correct order: listener → interceptor → extensions → claim release.

**Precondition:**
- Plugin is fully initialized

**Postcondition:**
- `teardown()` removes listener first
- Then removes start interceptor
- Then removes extensions
- Then releases context namespace claim
- All cleanup functions are called

**Why it matters:** Prevents use-after-free errors.

---

### I3. Compatibility with Other Plugins
**Category:** Integration  
**Testable:** Example-based  
**Description:** Navigation plugin must not interfere with other plugins.

**Precondition:**
- Use navigation-plugin with logger-plugin

**Postcondition:**
- Both plugins' hooks are called
- No conflicts in event handling
- Both plugins can read/write router state

**Why it matters:** Enables plugin composition.

---

## J. Edge Case Invariants

### J1. Empty History Handling
**Category:** Edge Cases  
**Testable:** Example-based  
**Description:** All history functions must handle empty history gracefully.

**Precondition:**
- Router just started, no navigation yet
- History has only the initial entry

**Postcondition:**
- `peekBack()` returns `undefined`
- `peekForward()` returns `undefined`
- `canGoBack()` returns `false`
- `canGoForward()` returns `false`
- `getVisitedRoutes()` returns array with initial route

**Why it matters:** Prevents crashes on fresh sessions.

---

### J2. Null currentEntry Handling
**Category:** Edge Cases  
**Testable:** Example-based  
**Description:** All history functions must handle null `currentEntry` (SSR fallback).

**Precondition:**
- `browser.currentEntry` is `null`

**Postcondition:**
- `peekBack()` returns `undefined`
- `peekForward()` returns `undefined`
- `canGoBack()` returns `false`
- `canGoForward()` returns `false`
- No exceptions thrown

**Why it matters:** Ensures SSR safety.

---

### J3. Unmatchable Entry Handling
**Category:** Edge Cases  
**Testable:** Example-based  
**Description:** History entries that don't match any route must be handled gracefully.

**Precondition:**
- History entry has URL `/unknown-route`
- No route matches this path

**Postcondition:**
- `entryToState()` returns `undefined`
- `hasVisited("unknown-route")` returns `false`
- `getVisitedRoutes()` doesn't include unmatchable entries

**Why it matters:** Handles entries from other SPAs or deleted routes.

---

### J4. Inactive Router Handling
**Category:** Edge Cases  
**Testable:** Example-based  
**Description:** Navigate handler must ignore events when router is inactive.

**Precondition:**
- Router is stopped
- Browser fires a navigate event

**Postcondition:**
- Navigate handler checks `router.isActive()`
- If false, handler returns early
- No navigation is triggered

**Why it matters:** Prevents navigation after router is stopped.

---

## Summary Table

| Invariant | Category | Testable | Priority |
|-----------|----------|----------|----------|
| A1. Router→Browser Sync | Bidirectional | Example | Critical |
| A2. Browser→Router Sync | Bidirectional | Example | Critical |
| A3. Roundtrip | Bidirectional | PBT | Critical |
| A4. Hash Preservation | Bidirectional | Example | High |
| B1. Entry-to-State Matching | History | PBT | Critical |
| B2. peekBack Index | History | PBT | High |
| B3. peekForward Index | History | PBT | High |
| B4. hasVisited Monotonicity | History | PBT | High |
| B5. getVisitedRoutes Uniqueness | History | PBT | High |
| B6. getRouteVisitCount Accuracy | History | PBT | High |
| B7. findLastEntryForRoute | History | PBT | High |
| B8. canGoBack Boundary | History | PBT | High |
| B9. canGoForward Boundary | History | PBT | High |
| B10. canGoBackTo | History | PBT | High |
| B11. traverseToLast State | History | Example | High |
| B12. traverseToLast Error | History | Example | High |
| B13. canGoBackTo Implies hasVisited | History | PBT | Medium |
| B14. getRouteVisitCount Monotonicity After Push | History | PBT | High |
| B15. Visit Count Sum Consistency | History | PBT | High |
| C1. Meta Attachment | NavigationMeta | Example | Critical |
| C2. deriveNavigationType | NavigationMeta | PBT | High |
| C3. pendingMeta Lifecycle | NavigationMeta | Example | Critical |
| C4. pendingMeta Cancel | NavigationMeta | Example | High |
| C5. pendingMeta Error | NavigationMeta | Example | High |
| C6. userInitiated Accuracy | NavigationMeta | Example | High |
| C7. info Preservation | NavigationMeta | Example | Medium |
| C8. deriveNavigationType on Initial with reload | NavigationMeta | PBT | Medium |
| D1. isSyncingFromRouter Loop Prevention | Syncing | Example | Critical |
| D2. isSyncingFromRouter Scope (onTransitionSuccess) | Syncing | Example | Critical |
| D3. isSyncingFromRouter Scope (replaceHistoryState) | Syncing | Example | Critical |
| D4. isSyncingFromRouter Error Recovery | Syncing | Example | High |
| E1. onStart Listener | Lifecycle | Example | High |
| E2. onStop Listener | Lifecycle | Example | High |
| E3. teardown Cleanup | Lifecycle | Example | High |
| E4. Factory Reuse | Lifecycle | Example | Medium |
| F1. Non-RouterError Recovery | Error | Example | High |
| F2. URL Restoration | Error | Example | High |
| F3. No Recursive Navigation | Error | Example | Critical |
| F4. Double-Error Handling | Error | Example | Medium |
| G1. Base Path Stripping | URL | PBT | High |
| G2. Base Path Building | URL | PBT | High |
| G3. URL Parsing Robustness | URL | PBT | High |
| G4. shouldReplaceHistory Domain Completeness | URL | PBT | Critical |
| H1. NavigationHistoryState Completeness | State | Example | High |
| H2. Meta Lifecycle on State Context | State | Example | Medium |
| I1. Plugin Initialization Order | Integration | Example | High |
| I2. Plugin Disposal Order | Integration | Example | High |
| I3. Compatibility | Integration | Example | Medium |
| J1. Empty History | Edge Cases | Example | High |
| J2. Null currentEntry | Edge Cases | Example | High |
| J3. Unmatchable Entry | Edge Cases | Example | Medium |
| J4. Inactive Router | Edge Cases | Example | High |

---

## Testing Strategy

### Property-Based Tests (fast-check)
Focus on invariants marked **PBT-testable**:
- Generate random route names, params, and navigation sequences
- Verify index-based invariants (peekBack, peekForward, canGoBack, canGoForward)
- Verify URL handling (base path stripping/building)
- Verify count/uniqueness invariants (getVisitedRoutes, getRouteVisitCount)
- Verify state matching (entryToState)

### Example-Based Tests
Focus on invariants marked **example-based**:
- Specific navigation sequences (roundtrip, traverseToLast)
- Lifecycle hooks (onStart, onStop, teardown)
- Error scenarios (recovery, double-error)
- Edge cases (empty history, null currentEntry)
- Integration scenarios (plugin composition)

### Stress Tests
- Rapid navigation sequences
- Concurrent navigations with guards
- Factory reuse with multiple routers
- Memory leak detection (WeakMap cleanup)
