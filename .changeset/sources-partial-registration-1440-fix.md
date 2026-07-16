---
"@real-router/sources": patch
---

Unwind partially-registered listeners in createTransitionSource / createErrorSource (#1440)

Both factories registered their event listeners in a single array literal. If `api.addEventListener` threw mid-registration (the emitter rejects a duplicate listener or hits its maxListeners cap), the already-registered listeners leaked and pinned the router, and the never-assigned `unsubs` binding left the half-wired source undestroyable (TDZ on the onDestroy closure). Registration now happens one-by-one inside a try/catch that unwinds the already-registered listeners and rethrows — mirroring `@real-router/rx`'s `events$` partial-registration safety — with `unsubs` declared before the source so its onDestroy closure never hits the TDZ. Normal (non-throwing) construction is unchanged.
