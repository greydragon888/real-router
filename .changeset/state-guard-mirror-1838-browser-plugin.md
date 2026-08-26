---
"@real-router/browser-plugin": minor
---

`isState` promises what it actually validates (#1838)

The guard declared `value is State` while checking THREE of `State`'s six
members — `name`, `path`, `params`. The other three (`search`, `transition`,
`context`) were unvalidated, and the gap was reachable: `popstate-utils` reads
`state.search` on the line after the guard passes and hands it to `makeState`.

Measured end to end, restoring a hand-crafted `history.state`:

```
search: {}                 → state.search keys []            ← correct
search: "NOT-AN-OBJECT"    → state.search keys ["0" … "12"]  ← one per character
search: ["x", "y"]         → state.search keys ["0", "1"]
```

`state.path` was unchanged and nothing downstream complained, so a corrupted or
tampered entry committed a state whose query channel was character-indexed
garbage.

**What changes.** The guard now also rejects `search` / `transition` / `context`
when they are PRESENT with a non-object value (arrays included — `typeof [] ===
"object"`, and an array `search` produces the same numeric-key shape one step
less obviously). Absence is still accepted: entries written before RFC-4 M2
(#1548) carry no query channel at all, and requiring one would break every
pre-M2 Back.

⚠ **Type change, hence `minor`.** `isState` narrows from `value is State` to
`value is RestorableEntry` — the subset it validates. Code that read
`transition` or `context` off a guarded value was relying on an unchecked
promise and now gets a compile error; that is the point. `name`, `params`,
`path` and `search` are unaffected.

⚠ `isRequiredFields` is deliberately untouched: it is a byte-identical twin of
`@real-router/validation-plugin`'s copy, locked by `scripts/twin-lockstep.test.mjs`.
The added checks live outside it, so the pair stays in step and
`validation-plugin`'s own `isState` — a different function — is unchanged.

Part of #1901.
