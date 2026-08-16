---
"@real-router/validation-plugin": patch
---

fix(validation-plugin): retire the retrospective dotted-name check — bare core owns the rule now ([#1763](https://github.com/greydragon888/real-router/issues/1763))

`validateExistingRoutes` rejected a flat dotted route name on the constructor's initial routes. #1194 added it for a real hole: `add()` and `replace()` rejected the spelling while the constructor did not, so `createRouter([{ name: "a.c" }])` plus this plugin slipped one past validation into a name-vs-URL split-brain.

#1763 moved that rule to where it belongs — bare core refuses the spelling at registration, with this exact message — so `createRouter` throws before a plugin exists and nothing dotted can reach the retrospective pass. The check was measurably **unreachable**, not defence in depth: `store.definitions` is derived from the tree, whose nested children carry bare names by construction, and its line was the only one in the package without coverage once core began refusing.

No behaviour change for any caller: the same input still throws, with the same message, one step earlier.
