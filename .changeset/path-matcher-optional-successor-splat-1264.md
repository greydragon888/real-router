---
"@real-router/core": minor
---

Support a constrained optional before a splat; reject the unconstrained form (#1264)

`/:v<c>?/*rest` — a constrained optional before a splat, e.g. a versioned-API (`/:v<v\d+>?/*rest`) or preview-mode (`/:mode<(preview|draft)>?/*path`) prefix — was unmatchable when the optional was omitted (`buildPath` emitted a dead deep-link). It now matches via try-take-if-valid: the segment is taken as the optional only if its **decoded** value satisfies the constraint (so `/%76%31/users` → `{ v: "v1" }`), otherwise the splat captures it.

An **unconstrained** optional before a splat (`/:v?/*rest`) is now rejected at registration with a hint to add a constraint. Without one there is no signal to disambiguate "take the optional" from "let the splat capture", so every multi-segment value has two readings and matching would silently reshape half the input space. Add a constraint (`:v<…>?`) or model it as two routes.
