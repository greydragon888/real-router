---
"@real-router/core": patch
---

The navigation pipeline is cut by cancellability, and driven by one phase program (#1588)

Internal refactor — no public behaviour changes, and the cancellation property
suite that pins them is green and untouched.

Two cuts. **By cancellability:** a navigation that nothing can cancel and nothing
in which can suspend — no guards, no `subscribeLeave` listener, no caller
`signal`, no pre-commit plugin listener — now runs through a path where the
cancellation machinery is not skipped but ABSENT. No `AbortController`, no
liveness closure, no commit-gate, and a plain `State` return. Being unable to
suspend became a property of the code rather than a fact to remember.

**By program and interpreter:** the guard pipeline was three orchestrators and
two copies of the guard loop, differing in one branch, each wired to its own
continuation. It is now one program of three fixed phases walked by a cursor of
two numbers, with a synchronous interpreter that stops when a step hands back a
Promise and an asynchronous one that settles it and hands the cursor straight
back. Switching between them is a single act rather than four bespoke tails.

The payoff is not speed or size — both came out at parity, as predicted. It is
that **eight cancellation checks became one, and that one is observable.** Five
of the eight were mutationally unkillable: neutralising them left the whole suite
green, which means their *breakage* was as invisible as their removal, because a
navigation reaching them was already covered by the liveness check one layer up.
The single check that replaces them sits where nothing else guards it — removing
it now fails four tests.
