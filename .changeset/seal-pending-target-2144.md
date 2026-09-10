---
"@real-router/core": minor
---

The pending navigation target is sealed before application code sees it

Route guards, plugin hooks, the four transition events and `subscribeLeave`'s `nextRoute` are handed the state the router is navigating **to**, before the commit. The channels on it were frozen; the object carrying them was not. So a write into `toState.params` threw while a swap of the whole slot did not — and whatever occupied the slot at commit time is what got committed:

```js
canActivate: () => (toState) => {
  toState.name = "somewhere-else";   // accepted
  return true;
};
// committed: { name: "somewhere-else", path: "/the-original" }
```

⚠ **The harm is not that a guard could redirect.** It is that the committed pair could be one the router cannot build — `name` and `path` disagreeing, which no entry point produces. `INVARIANTS.md` has stated "the pending target is READ-ONLY by contract at every one of the twelve" since the pipeline grew a deferred shell; it is now enforced rather than asked for, at all twelve surfaces at once.

## What changes for an application

**A write to the pending target now throws** (`TypeError`, in the strict-mode module every ESM consumer is in) instead of silently taking effect. Code that relied on rewriting it was rewriting the published state.

**`nextRoute` and the later `getState()` are no longer the same object.** They agree on `name`, `params`, `search` and `path`. They differ on `transition`, and always did — the meta is built from the transition's *outcome*, which does not exist when the payload is handed over. Sharing one object hid that by retro-filling the very object the subscriber was holding, so a subscriber that stored `nextRoute` and read `.transition.segments` later will now read the pending value (`DEFAULT_TRANSITION`) rather than a meta that appeared under it. Read the committed meta from the `subscribe` payload or `getState()`.

## What is unchanged

Reads. Every field a guard could read before it can read now, including `transition` — since #1976 both terminals attach it. `state.context` stays extensible: it is the slot plugin claims write into, and only the shell closes.

One producer stays writable, deliberately: `RoutesNamespace.#matchesActiveStateUnsafe` builds a state that lives for the length of one `areStatesEqual` call and reaches no application code, so sealing it would buy a guarantee nobody can observe.

## Cost

The commit now builds a second object instead of attaching the meta to the shell in place. Measured on the alternating-process harness in `benchmarks/audit-probes/membrane-globality-2026-09-05/_reverify/` at 150 000 × 15 — the protocol that exists because the single-process figure for this same arm was wrong by 4×: deltas of **−0.8 %** and **+0.1 %** against an **A/A floor of +0.3 %**. The extra object is at the noise floor.

Closes #2144.
