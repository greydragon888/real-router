---
"@real-router/core": minor
---

Reject a duplicate param name within one route at registration (#1151)

`/:id/:id` (the same name twice), a param+splat clash `/:x/*x`, or a parent's param reused by a child bound two trie positions under **one** name: at match time the later capture silently overwrote the earlier, and `rewritePathOnMatch` then rewrote the user's URL from the single survivor (`/1/2` → `/2/2`, with no error). The #736 conflict guard only fires on *differently*-named params at one position, so this same-name case slipped through. Registration now throws `Duplicate parameter name`. route-tree's gate catches the same-route case (`@real-router/validation-plugin`'s `addRoute` too) with a route-contextual message; path-matcher's `registerTree` backstop additionally catches the cross-level case.
