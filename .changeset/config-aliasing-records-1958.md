---
"@real-router/core": patch
---

The read-side doors record how far core's copying goes (#1958)

`TreeChangedAdd.added` and `TreeChangedUpdate.patch` were documented as
*"deep-cloned + frozen; caller untouched"*. Neither is cloned, and the real model
is narrower than either that claim or its obvious opposite:

> Core copies exactly **one level** on the way out. A read-side door hands back a
> FRESH shell built by core; one level down are the very objects the caller
> registered. On that level "the store's object" and "the caller's object" are
> ONE object.

So a write through a payload corrupts router config **and** the application's own
literal in the same statement — measured, `route.defaultParams.id = "HACKED"`
prints `/users/HACKED` and leaves the caller's bag reading `{ id: "HACKED" }`.

**The aliasing is policy,** and `packages/core/CLAUDE.md` ("Immutability is
shallow") records why: no deep-freeze, because that would freeze the caller's own
input; no deep-clone, because config carries circular references and class
instances. No behaviour changes here — the `src` diff is comments only.

**Corrected, beyond the two fields that carried the false claim:**

- **All six payload fields** now describe the one-level model. `TreeChangedClear.removed`
  additionally said *"top-level routes (with nested children)"*; measured, it is a
  FLAT array with no `children` key — `["user", "user.kid"]` for a parent with one
  child.
- **`RoutesApi.get`** — the shell is rebuilt per call, its nested slots are not.
  ⚠ The earlier advice to "copy the nested bags" was not actionable: a **shallow**
  copy leaves the level below shared, and `update()` is not an escape hatch either
  (it replaces the slot, and its clone-on-write is one level deep).
- **`PluginApi.getRouteConfig`** — the live store record, shared with clones **in
  both directions**: a write on a per-request scope lands in the base and in every
  sibling scope, and it outlives `scope.dispose()`. The record is also replaced on
  `update()`, so a held reference goes stale.

**Two exceptions to the model, neither previously recorded:** `encodeParams` /
`decodeParams` are WRAPPED at registration, so every door reports core's closure
rather than the caller's function — except `update`'s `patch`, which is assembled
from the patch and hands back the raw one, giving
`patch.encodeParams !== get(name).encodeParams` for one route. And custom fields
are absent from `get()` entirely: `get(n).myField` is `undefined` while
`getRouteConfig(n)` returns it, so the two doors are complementary views rather
than a subset and a superset.

`config-aliasing-authority-1958` pins the model in 22 cells, derives the payload
set from the source **by shape** (so a seventh field cannot ship undocumented),
and requires each field's doc to reference the model rather than banning one
spelling of the old claim.
