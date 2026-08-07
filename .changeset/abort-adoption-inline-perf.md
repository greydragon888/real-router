---
"@real-router/core": patch
---

Inline the already-aborted signal adoption on the navigate path (#1704)

The #1704 check reads `plan.externalSignal` immediately after the announce, so
every arc pays for it — разрез А included. Written as a function it cost
`navigate/sync-baseline` **13.4 %** on the runner (8.2720 ms base → 9.5540 ms);
the identical statements inlined measure 8.2728 ms, with 90 benchmarks unchanged
and 0 regressions.

Behaviour is untouched — same statements, same position, same four-cell matrix.
The comment beside the check records the suspects eliminated to get there, so
the shape is not tidied back into a helper by a later reader.
