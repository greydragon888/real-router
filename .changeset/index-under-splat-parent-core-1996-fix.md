---
"@real-router/core": minor
---

The index-under-splat guard is no longer defeated by a trailing slash ([#1996](https://github.com/greydragon888/real-router/issues/1996))

An index route (`path: "/"`) under a parent whose path ends in a SPLAT is
unreachable — `slashChildRoute` sits on the splat node and the wildcard match
never reads it — so registration refuses it (#1242 §5.4). A **trailing slash**
in the parent's path walked straight past that refusal:
`setRootPath("/app/*rest/")` registered where `setRootPath("/app/*rest")` throws.

What the silent registration produced, all measured on the same tree:

```
buildPath("h", {})            -> throws Missing required param 'rest'
buildPath("h", { rest:"a/b" }) -> "/app/a/b"
matchPath("/app/a/b")          -> undefined
```

An index whose own path is empty demanding a param it never declared, and no
correct value to supply — every value builds a URL the router itself refuses.

⚑ **The guard read a different string from the walk beside it.** It sliced the
last segment off the RAW parent path, while `walkTrieFrom` normalises the
trailing slash first and the caller normalises again one line later for the
cache key — one consumer of three that did not. For `"/app/*rest/"` the raw
slice yields `""`, which is not a splat, so the guard fell silent. It now reads
the normalised form; the error message still quotes the caller's own spelling.

⚠ **Behaviour change, deliberately loud, and `minor` for that reason:** a tree
that used to register now throws at registration. It never worked — the route
was unmatchable in both directions — so the throw replaces a silent dead route
with the message that names the fix (give the index a distinct path, or make the
parent static). Bumped to match [#1763](https://github.com/greydragon888/real-router/issues/1763),
the precedent of this exact class: bare core beginning to refuse a spelling it
used to accept shipped as a minor, not a patch.

⚠ **A SIBLING DOOR stays open, and it is named rather than left implicit.** The
same tree written as ordinary route config — `{ path: "/files/*rest/", children:
[{ path: "/" }] }` — never reaches this guard: `buildFullPath` concatenates, so
the child's full path is `"/files/*rest//"`, and stripping one slash leaves
`isSlashChild` comparing two different strings. Measured identical through
`createRouter`, `add()` and `replace()`, with a different symptom — the splat is
silently dropped from what the index builds (`"/files/"`), which then does not
match back. That root is in `buildFullPath` / `isSlashChild`, whose blast radius
is every nested route; it is filed separately and pinned as a boundary here.
