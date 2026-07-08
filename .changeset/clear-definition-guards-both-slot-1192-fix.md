---
"@real-router/core": patch
---

`clearDefinitionGuards()` recompiles the surviving external guard for both-slot routes (#1192)

When a route held **both** a definition and an external guard, `replace()`'s `clearDefinitionGuards()` skipped the compiled-function slot on the false premise "external already won at registration." Registration is **last-add-wins**, so if the definition guard was registered AFTER the external one (`addActivateGuard()` then `update(name, { canActivate })`, or an `add()` batch landing after an external), the compiled function WAS the definition guard — and clearing the definition factory left it running: `navigate()` / `canNavigateTo()` executed a guard present in no factory store (a zombie), silently shadowing the surviving external guard, with introspection (`get(name).canActivate`) disagreeing with behavior. The slot is now recompiled from the surviving external factory. The two now-false comments (the class-level "external wins at compile time" and the `clearDefinitionGuards` premise) are corrected, and a property test locks arbitrary def-after-ext interleavings.
