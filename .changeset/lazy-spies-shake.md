---
"@real-router/core": minor
---

`setRootPath` announces the move, and a root moved during the boot is reported (#1752)

**A root change now emits on the tree-change channel.** `setRootPath` rebuilds tree and matcher in place, so every path in the tree resolves somewhere new — and it did so silently, while its five route-CRUD siblings all announce themselves. Consumers see a sixth `op`:

```ts
getRoutesApi(router).subscribeChanges((event) => {
  if (event.op === "rootPath") {
    // event.previous, event.next
  }
});
```

Measured victim, reproduced end to end with an `add()` control: `@real-router/preload-plugin` keeps a `State` cache keyed by `href`, and its `default` branch drops those snapshots on "any structural mutation" (#805). The mutation that restales **every** href at once was the one that never reached the handler, so `getPreloadedState(href)` returned a state whose URL matched nothing. That plugin needed no change — its `default` absorbs the new `op`.

⚠ **This reverses a recorded decision, deliberately.** The tree-mutation RFC closed О-6 with "no emission", reasoning that `TREE_CHANGED` consumers want to know WHICH routes changed rather than where the base moved. That was true of every consumer on 2026-06-06 and false from 2026-06-28, when the href-keyed contract shipped. О-6 named the reopening condition ("if a real use case appears") and prescribed a separate `ROOT_PATH_CHANGED` channel; a union member was taken instead because the separate channel loses the free repair above and grows a public subscription door for a single consumer, while the union's own docblock already instructs consumers to tolerate future ops with an exhaustive `default`. It is the one member carrying no routes — a root move leaves every route in place.

Only a real move announces: re-declaring the same root emits nothing, and a change refused by the in-flight gate (#1755) emits nothing either.

**A root moved inside the boot window no longer commits a state that routes nowhere.** `start()` matches the path before `completeStart()` opens the window a plugin's `onStart` runs in, so a `setRootPath` there landed after the match and the boot committed the pre-move state — `home @ /home`, a state naming a real route whose `path` the router no longer routes anywhere, announced as a healthy `TRANSITION_SUCCESS`.

The move still applies — that is #1750's *degrade, not gate*, and this change keeps it. What was missing was the report. The boot re-derives what it is about to announce when, and only when, the window moved the root: under `allowNotFound` the consequence is the router's own not-found state, and without it the same `ROUTE_NOT_FOUND` the pre-window gate already raises for a path that routes nowhere. A boot that does not move the root pays one string comparison.

⚑ **Nothing shipped enters that window.** `@real-router/persistent-params-plugin`, the only `setRootPath` consumer, sets its root from the factory body at `usePlugin()` time — before `start()` — and is unaffected. Reordering the boot so a late root change could still be matched under was considered and rejected: it restructures the most timing-sensitive path in the library for a window with no caller, and the supported place to declare a root already works.
