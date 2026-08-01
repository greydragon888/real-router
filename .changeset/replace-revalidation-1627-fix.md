---
"@real-router/core": patch
---

Do not commit `replace()`'s revalidation on a router torn down mid-call (#1627)

`replace()` calls `clearDefinitionGuards()`, which recompiles the compiled guard
slot from a surviving **external** factory (#1192) — application code, running
after `replace()`'s entry `throwIfDisposed()`. A `dispose()` or `stop()` from
there did not stop the swap: it finished, revalidated the URL and committed on a
dead router, emitting nothing at all (dispose had already cleared the listeners),
so no subscriber, plugin or adapter ever learned of the state it was left with.

The revalidation commit now re-asks liveness on the same side of that user code
as the commit itself, and throws `ROUTER_DISPOSED`. This also removes an
asymmetry: the third revalidation arm (URL no longer matches) was never exposed,
because it routes through `navigateToNotFound`, whose own liveness gate already
throws — all three arms now refuse the same way with the same code.
