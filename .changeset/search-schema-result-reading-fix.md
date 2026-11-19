---
"@real-router/search-schema-plugin": minor
---

Read each `~standard.validate()` answer by `issues`, as Standard Schema does, and handle the rejection of a Promise answer (#2851)

**Breaking Change:** the success member of the exported `StandardSchemaV1Result` is now `{ readonly value: Output; readonly issues?: undefined }`, as the spec types it. Code that narrows a result with `"issues" in result` and then reads `result.issues` as an array no longer compiles, since `result.issues` may be `undefined`. Test `result.issues` itself: it is truthy on a failure. A hand-written schema whose success answer carries a truthy `issues` that is not an array, such as `{ value, issues: {} }`, read as a success; it now refuses the navigation with a `TypeError`, and the type refuses it too. Answer a success without a truthy `issues`.

**Migration:**

```diff
- const issues = "issues" in result ? result.issues : [];
+ const issues = result.issues ?? [];
```

- A failure that carries a `value` as well, as valibot's does, is now read as a rejection. The rejected keys are stripped and their `defaultSearch` values restored, mode `"development"` logs the rejection, and `onError` is called. Before, the failing value was written to the state and the URL.
- So a valibot `v.string()` field handed `?q=17` settles as `"17"`: the rejected number is tried as text, as it is for zod. Before, the number `17` the failure carried was written.
- `issues` decides. A truthy `issues`, an empty array included, is a failure. A success spelled `{ value, issues: undefined }` no longer draws a false warning from the dev `defaultSearch` check.
- An answer object with neither a truthy `issues` nor a `value` is refused with a `TypeError` that names the route; before, it failed with `issues is not iterable`. In mode `"development"`, such a schema on a route with a `defaultSearch` makes `usePlugin()` throw. On `add`, `replace` or `update` the change commits, and core logs the error.
- A Promise from `~standard.validate()` is still refused with a `TypeError`, and its rejection is now handled. zod answers a throw in a transform or a refinement with a rejected Promise, and that unhandled rejection ended a Node process. In mode `"development"`, the plugin logs the schema's error with `console.error` when `onError` is not set, and the dev `defaultSearch` check reports it with `console.warn` whatever `onError` is. On a navigation in mode `"production"`, or with `onError` set, the schema's error is dropped, and the refusal is all that remains. An async refinement or transform stays unsupported: when one throws, zod abandons a rejected Promise of its own in its synchronous attempt, which never reaches the plugin and stays unhandled.
