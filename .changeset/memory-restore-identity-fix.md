---
"@real-router/memory-plugin": minor
---

Keep the history stack in step with the router when `back()`, `forward()` or `go()` overlaps another navigation (#2796)

Each restore is recognised by its own navigation, and the stack position follows a restore only while that navigation runs: once a failed restore's rejection settles, the position is the entry the router shows. The same class of defect as #2796.

- Two `back()` calls while an async guard holds the first, the second onto the path the router still shows: the router lands on the second's entry, through a navigation. It stayed on the first's target while `canGoBack()`, `canGoForward()` and `state.context.memory` pointed at the second's.
- `navigate(..., { replace: true })` while an async guard holds a `back()`: the replace overwrites the entry the `back()` targets, and the entry it left stays ahead. The stack stayed one entry ahead of the router, and `canGoForward()` reported `false`.
- A second `back()` from a `TRANSITION_START` listener of the first, which the router refuses synchronously (`REENTRANT_NAVIGATION`): the first restore commits with `direction: "back"`. It was published as `"navigate"`.
- Two `back()` calls while an async guard holds the first, the second refused by a guard: the stack stays on the entry the router shows. It stayed on the first's target, and the next push deleted the entry the user was on.
- A `back()` refused before its navigation starts — an entry whose route was removed — no longer moves `canGoBack()`/`canGoForward()` until its rejection settles, so a second `back()` before then targets the same entry, not the one before it.

**Breaking Change:** the position moves when the router announces a restore's navigation, not before the call to it, and a `back()`/`forward()` onto the path the router shows moves the stack synchronously only while no other restore is in flight — with one in flight it starts a navigation, which emits `TRANSITION_START` and `TRANSITION_SUCCESS` and reaches `router.subscribe`.

**Migration:** nothing to change for code that reads `canGoBack()`/`canGoForward()` after `back()` returns: a restore the router accepts has moved the position by then. A `router.subscribe` listener now also hears a same-path `back()`/`forward()` made while another restore is in flight.
