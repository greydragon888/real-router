---
"@real-router/core": minor
---

Gate the query channel on `queryParamsMode`: a key the mode does not print no longer becomes state (#1575)

One rule, all three modes, both directions: **a key the active
`queryParamsMode` does not PRINT does not enter the canonical query channel.**

The URL build has always printed declared names only under `default` / `strict`.
Both the parse side and the intent side kept an undeclared key in `state.search`
anyway, so those modes published states whose own `path` contradicted their own
`search` — measured:

| mode | `navigate("t", {}, { foo: "1" })` | before | after |
|---|---|---|---|
| `loose` | `search` / `path` | `{foo}` / `/t?foo=1` | unchanged |
| `default` | `search` / `path` | `{foo}` / **`/t`** | `{}` / `/t` |
| `strict` | `search` / `path` | `{foo}` / **`/t`** | `{}` / `/t` |

and on the URL side `matchPath("/d?dec=1&foo=2")` under `default` returned
`search {dec, foo}` beside `path "/d?dec=1"`.

The acquired invariant is `keys(state.search) ⊆ keys(matchPath(state.path).search)`
in every mode — operationalised by KEYS, since values stay a mixed domain by
decision (`{page: 2}` from a URL, `{page: "2"}` from an intent).

What does NOT change: `default` still MATCHES a URL carrying an undeclared key —
that is exactly what separates it from `strict` — it just does not keep it.
`strict`'s parse-side rejection is untouched. `loose` is untouched end to end,
and short-circuits, so the repo default pays nothing.

It is a DROP, not a move: the key does not fall back into `state.params`.
Re-channelling it there would re-create the per-entry-point ambiguity the step
exists to remove.

The gate runs AFTER the default merge, so a `defaultSearch` declared for a key
the route does not carry as `?name` is dead config under `default` / `strict` —
the side edge is deliberate, not an oversight.

Wired at the three terminals that produce a canonical query bag — the pipeline's
`canonicalize` (the navigate path), `makeState` (the other intent producers), and
the `matchPath` rebuild (the URL direction). The pipeline reads it through one
boolean port accessor, `admitsUndeclaredQuery()`, rather than learning the mode.
