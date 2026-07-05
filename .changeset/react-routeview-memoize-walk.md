---
"@real-router/react": patch
---

Decouple `RouteView` keepAlive tracking to memoize the render walk (#1251)

- `<RouteView>`'s `buildRenderList` no longer re-walks its `<Match>` children on every render. Previously `processMatch` mutated the keepAlive `hasBeenActivated` Set inline, coupling the pure winner/`rendered` computation to a side effect — so a parent (or ancestor) re-render with no route change re-walked every Match and re-diffed the identical output (preact, whose `buildRenderList` is a 3-arg pure function, already memoized here). The walk is now a pure function memoized on `[elements, routeName, nodeName]`, and the activation is committed to the Set in a post-render effect. This also makes keepAlive tracking safe under concurrent rendering: a render React discards no longer records a phantom activation that would later render an un-committed match as a hidden keepAlive subtree. Existing precedence and keepAlive behavior is unchanged (covered by the RouteView functional + pipeline property tests).
