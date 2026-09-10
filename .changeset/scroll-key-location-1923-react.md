---
"@real-router/react": minor
---

Scroll restoration keys a LOCATION, not a state's contents

`scrollRestoration` built its storage key from the two param bags —
`${state.name}:${canonicalJson({ ...state.params, ...state.search })}`. Two
defects followed from that, and both are fixed by keying on `state.path`, the
form core prints a location in.

**One location had two keys.** `canonicalJson` is `JSON.stringify`, so the key
depended on the TYPE of every value. The URL direction parses `?page=2` into the
number `2` under the default `numberFormat: "auto"`, while an intent keeps the
`"2"` the caller wrote. A user who reached `/docs?page=2` by clicking a
`<Link>`, scrolled, and pressed F5 had the position saved under one key and read
back under the other, so it restored to 0 — silently, because
`loadStore()[key] ?? 0` cannot tell "nothing saved" from "saved under the other
spelling".

**A query twin erased its path slot.** `{ ...params, ...search }` let `search`
win the spread, so `/items/1?id=9` and `/items/7?id=9` shared one bucket —
core supports that shape deliberately (the `/items/:id?id` carve-out).

⚠ **The key format changes: positions already in `sessionStorage` are keyed
under a form this release does not read.** There is no migration, and the key
they sit under is the broken one — positions are already lost silently there.
The first back-navigation after the upgrade lands at the top of the page, and
the orphaned entries are overwritten as the user browses.

⚠ **Two states that share a URL now share a bucket.** A value that never reaches
the URL — an undeclared param, a function, a `BigInt` — no longer separates
them. For scroll restoration that is the definition of the same page, and it is
the axis `history.scrollRestoration` keys on.

**An unserializable param can no longer take scroll restoration offline.** The
key is a string read, so `BigInt` and cyclic params cannot reach a serializer;
the wrapper that caught them, skipped the capture and warned once is gone with
the failure mode. The memoisation `WeakMap` is gone too — a property read is
cheaper than the lookup that would guard it.

Closes #1923.
