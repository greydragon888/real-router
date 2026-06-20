---
"@real-router/fsm": minor
---

Type-correlate `send()` payload to the specific event (#753)

`send()` now indexes the payload by the specific event instead of the full event union, making it symmetric with `on()`. Previously `send(event: TEvents, payload?: TPayloadMap[TEvents])` collapsed to `payload?: unknown`, so a payload typed for a different event — or no payload at all — compiled without error.

**Breaking (type-level only — runtime is unchanged):**

- A payload event now **requires** its correctly-typed payload: `send("FETCH", { wrongShape })` and `send("FETCH")` (missing payload) are type errors.
- A no-payload event rejects any payload: `send("START", {})` is a type error.

```diff
- send(event: TEvents, payload?: TPayloadMap[TEvents]): TStates
+ send<E extends TEvents>(
+   event: E,
+   ...args: E extends keyof TPayloadMap ? [TPayloadMap[E]] : [undefined?]
+ ): TStates
```

Dormant for `@real-router/core` (`RouterPayloads` is empty — all router events are payload-free).
