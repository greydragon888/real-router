---
"@real-router/core": minor
---

Treat `undefined` as absence on both sides of the default merge (#1550, #1551)

A route default is merged UNDER the caller's value; `undefined` on either side now means "this key was not given", so it can never reach the committed state.

**#1550 — the caller side.** An explicitly-`undefined` query value used to outrank `defaultSearch` and survive as an `undefined`-valued own key in the frozen `state.search`. It now behaves like the path channel always did:

```diff
  // route: { name: "x", path: "/x?page", defaultSearch: { page: "1" } }
  const state = await router.navigate("x", {}, { page: undefined });
- state.search; // { page: undefined }   → own key, default killed
- state.path;   // "/x"
+ state.search; // { page: "1" }         → default keeps the slot
+ state.path;   // "/x?page=1"
```

**#1551 — the default side.** A default that itself carries `undefined` (`defaultSearch: { q: undefined }`, `defaultParams: { extra: undefined }`) leaked that own key into every produced state — through `navigate`, `matchPath`, `makeState`, a route codec's input, and `forwardState`'s source-layering. Such an entry now behaves exactly like no entry; a genuinely missing required path param still fails with the same `Missing required param` error, for the right reason.

**Behavior change** (pre-1.0, hence `minor`): code that passed `{ key: undefined }` to clear a route default must omit the key — or wait for an explicit reset semantics, which is deliberately not `undefined` (RFC-4 M2 §10.12).

Implementation: one `mergeDefined` helper in `src/helpers.ts` replaces four spread-based merges (`makeState`'s channel merge, `buildPath`'s `defaultParams`, `forwardState`'s source `defaultParams`, `buildPath`'s `defaultSearch`), so the rule is a property of the merge rather than of the order in which a normalize step happens to run.
