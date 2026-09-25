---
"@real-router/validation-plugin": patch
---

`add(batch, { parent })` judges the batch in the table's name space (#2566)

Under `{ parent: "p" }`, a batch route `c` is the table's `p.c`, and a
`forwardTo` names routes by that full name. The plugin checked a forward
target's existence by full name, but walked the batch for its params and keyed
its forwards by the short name. Measured with the plugin installed:

| `add(batch, { parent: "p" })`                                                           | 0.29.0                                                                                         | now                                                         |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| forwards to a batch sibling, a route nested in the batch, or through one into the table | `Internal error (please report): collectPathsToRoute: route "…" not found`, naming the target  | accepted                                                    |
| forwards in a cycle inside the batch                                                    | the same internal error                                                                        | `[router] Circular forwardTo: p.c → p.d → p.c`              |
| forwards to a batch sibling that needs a param the source lacks                         | the same internal error                                                                        | `forwardTo target "p.d" requires params [id] … route "p.c"` |
| holds a short name a top-level route holds, when that route closes a forward chain      | `[router] Circular forwardTo: d → c → d`, a cycle the table does not have                      | accepted                                                    |
| holds a short name a top-level route holds, when that route ends a long forward chain   | `[router] forwardTo chain exceeds maximum depth (100): …`, for a chain the table does not have | accepted                                                    |

Bare core accepts every row except the cycle, which is its own refusal.

Refusals of a batch route under `{ parent }` now name it `"p.c"` where they
named `"c"`: a `forwardTo` target that does not exist, or that needs a param
the route lacks; a forward chain past the depth limit that starts at the
route; a `defaultParams` or `defaultSearch` that is not an object; a
`forwardTo` that is neither a string nor a function; and an async
`decodeParams`, `encodeParams` or `forwardTo` callback.

In any `add` or `replace` batch, an async callback on a nested route now names
it in full (`"parent.child"` where it named `"child"`), as the plugin's
`defaultParams`, `defaultSearch` and `forwardTo` refusals of that route already
did.

A nested route whose `name` is a `Symbol`, or an object with no way to become
a string, got a raw `TypeError` from the plugin (`Cannot convert a Symbol value
to a string`, `Cannot convert object to primitive value`), in `add` with or
without `{ parent }` and in `replace`. It now gets core's `[router.addRoute]
Route name must be a string, got …`. A name that is not a string is no longer
joined into a route's name at all: a refusal that printed `"a.5"` now prints
`"5"`.
