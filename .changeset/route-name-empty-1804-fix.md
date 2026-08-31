---
"@real-router/core": minor
---

Refuse a route named `""` at registration (#1804)

Bare core accepted `{ name: "" }` and the harm was not an unaddressable route
but a **different tree**: `{ name: "", children: [...] }` lost its parent and
re-parented the children to the root, where they answered to a name the author
never wrote. `has("")` was `false` while `has("kid")` was `true`.

`add`, `replace` and the constructor now refuse it, with the wording
`validateRoute` already used, so the message is the same with and without
`@real-router/validation-plugin`.

`remove("")` and `update("")` are unchanged — the empty name means the root
node at those doors.
