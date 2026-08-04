---
"@real-router/core": patch
---

The two reentrancy bans carry their remedy instead of a bare code (#1665)

`REENTRANT_NAVIGATION` and `REENTRANT_TREE_MUTATION` were constructed with no
message, so `error.message` was the code repeated back. Most of core's errors are
deliberately bare — `ROUTER_DISPOSED`, `SAME_STATES`, `TRANSITION_CANCELLED`
describe a SITUATION and the remedy follows from the name. These two are the
other kind: they name a **rule the caller broke**, and "defer it" follows from
nothing. While that remedy lived only in the docs it produced two issues (#1203,
#1219), both closed by patching prose, which left the error still saying nothing.

Nothing else changes: same codes, same throw sites, same timing. Only
`error.message` is new, and consumers branch on `error.code`.

The navigation ban now says which of its **two** windows you are in, because one
sentence cannot serve both:

- from a router event listener (`subscribe`, `subscribeLeave`, a plugin hook,
  a `ROUTER_START` listener) — "the nested navigation would commit a state the
  outer one overwrites";
- from the pre-start window (#1610) — a `forwardState` / `buildPath` interceptor,
  a route codec, or a `defaultRoute` / `defaultParams` / `defaultSearch` callback
  — "they run while a navigation is being prepared, before it is announced".

Telling an interceptor author they are "inside an event listener" would be false
— no emit is on the stack there at all — and reads as a spurious error.

The tree-mutation ban names the `subscribeChanges` handler and the atomicity it
protects. Both messages end with the remedy: defer with `queueMicrotask` or
`await`.

Locked by an AST scan over `src` (`reentrancy-ban-messages.test.ts`), so a third
ban added later cannot ship bare — the behavioural pins cannot catch that,
because a new site arrives without one.
