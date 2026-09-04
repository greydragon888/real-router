---
"@real-router/core": patch
---

Docblock claims across three files, re-measured and corrected

An audit pass probed every `⚠`/`⚑` in `executeNavigation.ts`, `guards.ts` and
`RoutesNamespace.ts` by execution rather than by reading. Most held — `C@138`'s
"both pins read 2" is exact, the ternary form really does fire
`sonarjs/no-selector-parameter`, an own `__proto__` really cannot reach a plugin
hook, and the caller's accessors really are entered once per key on every arc.
What did not hold falls into two kinds.

**Numbers that went stale.** `executeNavigation.ts` claimed that deleting the
second `openController` open "reds ZERO of 4097" and drops core "to 99.94 %
branches"; measured today it reds zero of 5134 and drops to 99.95 %
(2166/2167) — the mechanism is right and both figures had moved, so they are
gone and the mechanism is named instead. It claimed that moving the
external-signal check above `startTransition` "reds the same six tests as
deleting it": the set equality holds exactly — both mutations red an identical
set — and the count is twelve, so the count is dropped and the equality kept.
Its `+17 bytecode bytes … 548 → 565` could not be reproduced to the stated
figure (the pair measures 539 here, and `--no-lazy` is required or neither
function is compiled at all), so the trade is stated without the absolutes and
with the command that reproduces it.

**Two anchors that resolve to the wrong thing.** `bridgeLateIfOnlyGuardsCanAbort`
is five statements above the guard-phase `openController`, not "two statements
above" — a relative position rots on the first insert, so it is named without
one. And `INVARIANTS subscribeLeave 8/9` cited row 9 ("fires once, in order")
for a statement row 9 does not make; the `LEAVE_APPROVED` half is the section's
own. `ctx.inflight` is cleared on `COMPLETE` **and** at `dispose()`; the line
named one of the two.

**Historiography the repository bans outright.** `guards.ts` opened with "A
first draft of this comment claimed …" and `RoutesNamespace.ts` with "the first
revision of this fix omitted it" — the CLAUDE.md rule names that family
verbatim. `executeNavigation.ts` carried a sixteen-number before/after read-count
table and a past-tense account of two readers that no longer exist;
`entry-reads-opts-once.test.ts` derives what holds, so the docblock points at it.
The `guards.ts` header counted four things about the state before #1971, which
`captured-intrinsics-authority-1971.test.ts` now derives. And the stage-② rule
was written twice in `RoutesNamespace.ts`, both times with an absolute
("from every other", "by now from everywhere"); one site states it, the other
points there.

A second pass over the same files, scanning for that family with a positive
control, found five more in `guards.ts` and two in `RoutesNamespace.ts`: a
predicate's pre-#1858 behaviour, a pre-#1799 walk, "was written first", a
thirty-line account of what the logger guard read before #1814 — whose read
count `logger-config-read-once-1814.test.ts` now asserts as one per field, and
whose own-ness question `CLAUDE.md` settles — and the pre-#1847 double merge.
Each is rewritten to state what holds; the owners are named rather than quoted.

No behaviour changes: comments only.
