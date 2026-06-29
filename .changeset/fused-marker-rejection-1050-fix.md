---
"@real-router/core": patch
---

Reject a `:`/`*` marker fused to a static prefix within a segment (#1050)

A marker glued to a static prefix inside one segment (`/a:b`, `/users/x:id`, `/a*b`) was parsed inconsistently: `buildPath`/`buildParamMeta` extracted it as a param (their marker regex is unanchored) while the trie honored a marker only at segment start and compiled the whole segment as a static literal. The two disagreed — `buildPath` emitted a URL its own `match` rejected, and the validation gate passed it through. `createRouter` / `addRoute` / `replaceRoutes` / `updateRoute` now reject such a path at registration (route-tree validation gate with a route-contextual error, path-matcher `registerTree` backstop), the sibling of the name-less marker rejection (#858/#863). Use a boundary marker (`/a/:b`) instead. A marker-led segment whose name itself contains `:`/`*` (`/:a:b` → param `a:b`) is unaffected.
