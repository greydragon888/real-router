---
"@real-router/core": patch
---

Move the Options adoption out of the `Router` facade into `OptionsNamespace/` (#2297)

Internal refactor, no behaviour change. The functions that copy, snapshot and derive the router's options — `adoptOptionBags`, `weakOrigins`, `deriveMatcherOptions` and the helpers they call — sat at the bottom of `Router.ts`. They now live beside the options record, together with `createLimits` and the snapshot of the limit names a clone inherits.
