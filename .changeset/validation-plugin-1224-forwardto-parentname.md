---
"@real-router/validation-plugin": minor
---

fix(validation-plugin): stop false-rejecting `add({ parent }) + forwardTo` to a param-carrying sibling (#1224)

`validateForwardToTargets` validated a parented batch "from the root": the forward
source's available params omitted the parent's path params, so a forward to a
target needing them (e.g. the parent's `:userId`) was rejected — while bare core
accepts the same add and runs the forward. The validator now threads `parentName`
(via the new `RouterValidator.routes.validateRoutes` argument), unions the
parent's inherited params into the source's available params, and prefixes batch
names with the parent for the batch-sibling exists-check. No tightening — only
removal of a false rejection.
