---
"@real-router/core": patch
---

Revert the transition meta's entry snapshot — it cost ≈15 % on the hottest navigation arc (#1722)

`0.89.9` shipped a change that read the meta's three flags (`reload` / `replace` /
`redirected`) off a snapshot taken at the navigation's entry, instead of off the
caller's `NavigationOptions` inside the commit. That is the better shape on its
own axis — it makes the window between the commit ask and the send empty
structurally rather than by an ordering rule — but it is not free:

| arc | before | after |
| --- | --- | --- |
| `navigate/sync-baseline` | 8.3 ms | 9.8 ms (**≈15 %**) |
| `navigate/pre-commit-listener` | 5.8 ms | 6.5 ms (≈12 %) |

Every other benchmark unchanged. This reverts that half, so both arcs return to
their previous figures. No public behaviour changes either way: the meta carries
the same flags, and the ordering rule that protects the commit window
(`buildTransitionMeta` built ABOVE the ask, so a getter that tears the router
down is still something the verdict can see) comes back with it, along with its
pin.

⚠ **The cause is isolated but NOT understood, and that is why this is a revert
rather than a fix.** Six runner configurations rule out the plan literal's width
(folding three slots into one packed number: unchanged), the call shape
(restoring five value arguments: unchanged), the entry reads themselves
(replaced by constants: unchanged), field count as such (the pre-change code plus
one unused field: unchanged) and the runner (the pre-change code re-measured an
hour later: 8.3 ms). The only line that splits them is where the flags are read
from — `opts` costs nothing, the plan costs ≈15 %. Tracked for research.

The sibling half of that release is untouched and stays: the commit gate asking
the navigation's captured signal rather than re-reading `opts.signal` measured 90
benchmarks unchanged.
