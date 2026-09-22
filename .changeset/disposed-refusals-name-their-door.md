---
"@real-router/core": patch
---

Every `ROUTER_DISPOSED` refusal names the door it came from (#1845)

These nine were the remainder of #1845's class: all of them carried no message at all, so `RouterError`'s `super(message ?? code)`
handed the caller the bare string `"DISPOSED"` — no door to look up, no reason.
Each now opens with the call the caller made:

```diff
- DISPOSED
+ [router.usePlugin] cannot install a plugin on a disposed router — dispose() is terminal
+ [router.subscribe] cannot subscribe on a disposed router — dispose() is terminal
+ [cloneRouter] cannot clone a disposed router — dispose() is terminal
```

Two doors keep the bare `[router]` form because several calls reach one raiser:
the post-dispose method swap, which stands in for six facade methods, and
`throwIfDisposed`, the shared guard that takes a predicate and no door name.

⚠ **An assertion that matched the CODE inside the message stops working.** Nine
cells across four test files did `toThrow(errorCodes.ROUTER_DISPOSED)` or
`toThrow(/DISPOSED/)` — a substring match that only passed because the message WAS
the code. They now assert the code itself, in the idiom the property tests already
use: `toThrow(expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }))`.
Consumers doing the same will need the same change; the code is unchanged.
