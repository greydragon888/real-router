---
"@real-router/core": patch
---

Error messages name the call you made, not the class that raised them (#1845)

`router.buildPath("route", {})` with a missing parameter printed `[SegmentMatcher.buildPath] Missing required param 'id'`. The caller wrote `buildPath`; `SegmentMatcher` is on neither the exports map nor `src/index.ts`, so it cannot be grepped in their own code, found in the published API or looked up in the wiki. #1819 retired `[search-params]` on that reasoning, and this is the remainder of the same class.

Eighteen prefixes are renamed to what a caller can look up:

| before | after | count |
| --- | --- | --- |
| `[SegmentMatcher.registerTree]` | `[router]` | 12 |
| `[SegmentMatcher.buildPath]` | `[router.buildPath]` | 3 |
| `[Logger]` | `[router]` | 2 |
| `[claimContextNamespace]` | `[router.claimContextNamespace]` | 1 |

`[router]` bare rather than a call name for the registration errors, because those are reachable from `createRouter`, `routes.add`, `routes.replace` and `setRootPath` — a single name would be false at the others, and the nine error factories are pure leaves with no door threaded to them. It is the established spelling for exactly that case — eleven other messages in core already used it before this change.

⚠ **The inventory the issue carried was short by two, and by one more that had been added since.** `[Logger]` was missed because it names a class without a dot, and `[claimContextNamespace]` because it names a real public call with the prefix simply left off. The full radius is 24 sites, not 20 — found by an AST walk rather than by re-reading the list.

**The six `[FSM.*]` messages keep their prefix, and that is now a statement rather than an accident of where the code lives** — which is the half #1845 asked for over a rename. `FSM` is not exported, its sole construction passes core's own module-level `routerTransitions` literal, and nothing from options or routes reaches it: arriving at one of these means CORE's transition table is malformed, so the class name is the useful one for the only reader who can hit it. Renaming would also have cost a discriminator — `fsm.test.ts` pins one message body under BOTH `[FSM.constructor]` and `[FSM.on]`, and the prefix is the only thing separating those cells.

What keeps the convention is a walk, not a list. The new authority reads every message in `packages/core/src` and fails on a prefix naming anything but the facade, a root export, or a registered core-internal raiser. Two things it rests on are pinned by a synthetic-source cell because the tree exercises neither: it descends into `+` chains, without which twelve of the twenty-four sites — every registration error — are invisible, and it walks ARGUMENTS rather than every bracketed literal, without which a computed key (`[routerStates.STARTING]:`) and an ordinary value (`"[dynamic]"`) are counted as messages.

⚠ **Breaking for anyone matching on message strings**, the same way #1819's rename is — done in one pass so consumers absorb it once. One test cell pinned a full message including the prefix and now matches the substring its fifty-five siblings use, so the convention and the defect it guards stop being the same assertion.
