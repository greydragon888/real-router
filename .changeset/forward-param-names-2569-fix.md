---
"@real-router/validation-plugin": minor
---

A forward's param check reads a batch route's params as core does (#2569)

The check refuses a forward whose target needs a path param its source does
not hold. It read a route of the table through core, and a route of the batch
through a pattern of its own that reads a name as a letter or `_` followed by
word characters, anywhere in the path. So the two ends of a forward were read
by two grammars wherever a path held a param name that is not a word
(`:user-id`, `:ид`, `:1d`, `*rest-of`) or a marker in its query (`?:x`). A
batch route is now read with core's own reading, as the `update` door and the
check the plugin runs at `usePlugin` already read both ends. Measured with the
plugin installed:

| Batch                                                                                            | 0.29.0                                             | now                                                |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------- |
| `c /c/:user-id → "q"`, with `q /q/:user-id` in the table                                         | `forwardTo target "q" requires params [user-id] …` | accepted                                           |
| the same with `:ид`, `:1d` or `*rest-of`                                                         | refused the same way                               | accepted                                           |
| `p /p/:user-id` with a child `c /c → "q"`, and `q /q/:user-id` in the table                      | refused the same way                               | accepted                                           |
| under `{ parent: "users" }`, `legacy /legacy/:user-id → "users.profile"`, a child at `/:user-id` | refused the same way                               | accepted                                           |
| `c /c → "d"`, `d /d?:x`                                                                          | `… requires params [x] …`                          | accepted                                           |
| `c /c/:user → "d"`, `d /d/:user-id`                                                              | accepted                                           | `forwardTo target "d" requires params [user-id] …` |
| `c /c/:user-name → "d"`, `d /d/:user-id`                                                         | accepted                                           | `… requires params [user-id] …`                    |
| `c /c/:user-id → "q"`, with `q /q/:user` in the table                                            | accepted                                           | `… requires params [user] …`                       |
| `c /c → "d"`, `d /d/:ид`                                                                         | accepted                                           | `… requires params [ид] …`                         |
| `c /c/:rest → "d"`, `d /d/*rest-of`                                                              | accepted                                           | `… requires params [rest-of] …`                    |
| `c /c?:x → "d"` or `c /c?q&:r → "d"`, with `d` needing `:x` or `:r`                              | accepted                                           | `… requires params [x] …`, or `[r]`                |

Bare core accepts every row: it checks no params.

The new refusals are forwards whose target needs a path param the source's
path does not declare, which the pattern missed: it read a name the two ends
share only in part as one they share, could not read a name that does not
start with a letter or `_`, and read a marker in a query as a path param. A
`replace` batch refuses them too, under the `addRoute` head both batch doors
print. A refusal names params as core reads them: `[user-id]` where it said
`[user]`.

⚠ The check leaves a route's `defaultParams` out, on every door. A forward to
`d /d/:ид` whose `defaultParams` fill `ид` is now refused by `add` and
`replace` as well; the `update` door and the check at `usePlugin` refused it
in 0.29.0 already.

The plugin reads the batch side with `buildParamMeta`, which
`@real-router/core/validation` now exports.
