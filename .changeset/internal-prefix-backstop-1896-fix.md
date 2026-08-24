---
"@real-router/core": patch
---

Route-CRUD doors name the door when a route name is not a string (#1896)

`assertNoInternalRouteName` — the always-on backstop that keeps the reserved
`@@` prefix out of the public API (#1047) — implements its rule as
`name.startsWith(...)` on a value typed `string` and never checked. So the guard
that exists to police route names was the thing that crashed on a route name of
the wrong type, at every one of the five doors that reach it.

Measured before the fix, `{ toString: () => "kid" }` at each door:

| door                                | before                                         | now                                                            |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `createRouter([{ name, path }])`    | `TypeError: name.startsWith is not a function` | `[router.addRoute] Route name must be a string, got object`    |
| `getRoutesApi(r).add(...)`          | same                                           | same                                                           |
| `getRoutesApi(r).replace(...)`      | same                                           | same                                                           |
| `getRoutesApi(r).remove(name)`      | same                                           | `[router.removeRoute] Route name must be a string, got object` |
| `getRoutesApi(r).update(name, ...)` | same                                           | `[router.updateRoute] Route name must be a string, got object` |

`null` and `undefined` were worse still — `Cannot read properties of null
(reading 'startsWith')`, naming a private local to a consumer who never wrote it.

**No new refusal.** Every one of these doors already rejected a non-string name,
before any mutation, and still does: the tree is untouched by a rejected batch,
and the value is read **zero** times (`typeof` does not coerce). What changes is
the SHAPE of the refusal — the same transformation `start()` already had, where
a `codePointAt` crash became `[router.start] path must be a string`.

**Bare core now matches the validated build, message for message.** The wording
is `@real-router/validation-plugin`'s `validateRouteName`, byte for byte,
including its `typeof` quirks (`typeof null` is `"object"`, so it reports `got
object` for `null` too) — the same mirroring #1047 and #1763 used, so the
production posture (`__DEV__ && validationPlugin()`) does not change which error
a consumer reads. Pinned from the plugin side, where both layers are importable:
a one-character drift in either message fails the build.

**The constructor is the door that gains most.** The plugin installs through
`router.usePlugin()` — after the initial route array has already been built — so
it never sees that array. Measured: with the plugin installed, `createRouter`
still produced the raw `startsWith` crash. Bare core is the only layer there,
which matters exactly where non-string names come from: a route table assembled
at runtime from a CMS, a filesystem walk or JSON.

This is not a route-name **gate** in the sense of `ARCHITECTURE.md`
"Route-Name Type Gates": no door that previously ANSWERED starts refusing, and
no predicate is added to a door — an existing always-on predicate stops crashing.
