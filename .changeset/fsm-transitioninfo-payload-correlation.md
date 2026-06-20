---
"@real-router/fsm": minor
---

Correlate `TransitionInfo.payload` to the event (#886)

`onTransition` listeners can now narrow `info.payload` by `info.event`: `TransitionInfo` is a distributive (discriminated) union over the event instead of a flat interface, so under `if (info.event === "FETCH")` the payload narrows to that event's type — the same correlation `send`/`on` already provide (#753). This completes the payload-correlation contract across input (`send`), action (`on`), and output (`onTransition`).

**Breaking (type-level only — runtime is unchanged):** `TransitionInfo` is now a `type` (distributive union), not an `interface` — code that interface-merges it or manually constructs a flat `TransitionInfo` value may need adjustment. Listeners that destructure `{ from, to, event, payload }` are unaffected. Dormant for `@real-router/core` (`RouterPayloads` is empty, so every event's payload is `undefined`).
