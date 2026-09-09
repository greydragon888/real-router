---
"@real-router/navigation-plugin": patch
---

The shared browser sleeve reads the fragment slot once and snapshots nested bags (#2141)

**The fragment slot is gated and printed from ONE read.** `createPluginBuildUrl`
and `createReplaceHistoryState` each asked `opts.hash === undefined` and then
normalised `opts.hash` — two reads of an object the application owns, so a value
answering differently between them was admitted on one and used from the other.
Measured: the gate saw `FIRST` and the URL carried `SECOND`.

**A restored entry's NESTED bags are snapshotted too.** #1837 pinned the four
top-level members of `history.state`; the nested `params` / `search` went into
that snapshot BY REFERENCE, and `isStateStrict` screens both by VALUE — so the
guard walked the caller's object and `makeState` walked it again. A key inside
either could answer one thing to the verdict and another to the commit.

⚠ Reachability, because it decides the priority: a real browser runs
StructuredSerializeForStorage on `pushState`, so a genuine entry cannot drift.
This is the synthetic-`PopStateEvent` and jsdom path — the test environment. What
it buys is that a test cannot construct a committed state the guard never
approved.

⚠ The nested copy turns on the PROTOTYPE, not on `typeof`, and the first form of
it got that wrong: `{ id: "1", __proto__: {…} }` sets the prototype and creates
no own key, so a `typeof`-gated spread handed the guard a plain object and the
existing `security.test.ts` went from REFUSING that entry to committing it. One
term short and the copy laundered exactly the shape the guard exists to refuse.
