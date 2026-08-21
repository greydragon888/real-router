---
"@real-router/core": minor
---

An own `__proto__` key from an ordinary bag can no longer reach `state` (#1792)

`__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own members,
so `target[key] = value` for that one name reaches the inherited setter: no own
key appears, the value is gone with no error and no log, and an OBJECT value
replaces the target's prototype instead. `Object.keys` and `JSON.stringify` stay
innocent while `state.search.anything` answers from the attacker's object.

**What is guaranteed.** A bag that is ORDINARY — plain data that does not change
while the router reads it — cannot put this key into `state.params` or
`state.search`. That is the case the rule exists for: a bag from `JSON.parse`,
from `history.state`, from a query string an app parsed itself.

**What is not, deliberately.** Two shapes, both of which belong to whoever wrote
the code that creates them.

A bag that CHANGES while the router reads it — an accessor that rewrites its own
object, a Proxy answering differently per trap call. A router cannot defend an
application against its own code, and buying that case costs discipline at a
dozen sites for a shape only the caller can create.

And a PLUGIN that replaces a whole channel on the in-flight state. The bags core
hands to a pre-commit hook are frozen, so `toState.params.k = …` throws — but the
state object itself is not, so `toState.params = yourOwnBag` succeeds, and
whatever occupies the slot at the commit is what gets committed, unfrozen and
uncopied. No copy site can see it: the copy already ran and produced a clean
frozen bag that the assignment discards. Freezing the whole state is a v2 change
(it would close `state.context`, which six first-party plugins write twelve namespaces into); until then the
pending target is READ-ONLY by contract at every pre-commit surface —
`INVARIANTS.md` "State immutability" row 5 names them, and
`tests/functional/pending-target-authority.test.ts` measures what each hands
over.

**The guarantee is held by the COPY SITES** — the places where core copies a
foreign bag into an object it owns. Five guards name the key, across four functions:
`normalizeParams`, both loops of `mergeDefined`, `copyOwnStringKeys` (the copy
`stripUndefined` makes), and the loop `mergeWithDefault` freezes. Two further
sites copy without naming it, and each is listed here rather than left to be
found: `admittedSearch`, exempt by OWNERSHIP — its sole caller hands it a bag
core built; and `withholdFilledSlots`, which copies a route's own
`defaultSearch` and is contained only because the merge below it walks own keys.
That second one is a reachability argument, which is the argument this note says
is not sufficient — it is named, not defended. Each names it unconditionally,
with no reachability argument: "it cannot get here" is a claim about an object
the router does not own, and two such claims have already been wrong. Ownership
is a sound reason to omit a guard; reachability is not.

`stripUndefined` itself does NOT name it, and that is not an omission — it may
hand its input straight back, and its contract already says a caller who stores
or freezes the result must copy first. The key is named at that copy. The commit
doors (`navigateToState` and `systemCommit`) likewise do not name it themselves;
they route both channels through the copies above, which is how they stopped
committing the caller's objects.

⚑ **This is deliberately NOT a check at the entry points.** A door reads a bag
the router does not own and the copy happens later, so anything read twice can
differ in between. Three shapes defeat a door-side check and are pinned here: an
interceptor's bag that answers clean on one read and hostile on the next; a route
default the caller still holds a reference to and mutates after registration; and
a State handed to one of the two commit doors, which used to be committed by
reference and stayed writable through the caller's own handle.

⚠ **What a door still does NOT do.** The channel guard's own question — is a
declared query key riding in the path bag — is answered from a read that happens
before the copy, so a bag that changes between them can still pass the check and
commit the other value. That is the same "outside the guarantee" class above, and
it is not closed here.

⚠ **Observable changes for plugin authors.** `navigateToState` and
`systemCommit` no longer commit the exact object they were given. Both channels
are frozen copies, so an identity comparison against the argument stops
matching, a write into `getState().params` now throws in strict mode, and an
`undefined`-valued own key is stripped as it is by every other producer. The one
bag that still comes back identical is one that WAS a shared `EMPTY_PARAMS` /
`EMPTY_SEARCH` singleton on the way in — reuse keys on that identity, not on
emptiness, so a `{}` you minted yourself comes back as a fresh frozen `{}`. The distinction is what you passed IN, not
which channel: omit the bag (or pass `undefined`) and the singleton comes back
identical; pass a `{}` you made and you get a fresh frozen `{}`.

Two more consequences of copying rather than carrying, neither of them intended
and both worth knowing before you upgrade. Both doors now READ every value of
both bags, twice per key, where the copy previously read none — so a getter on a
caller-supplied bag fires at the commit, and a getter that THROWS now fails the
navigation: `navigateToState` rejects with the caller's own error and the router
stays where it was. And `routes.replace()`'s revalidation no longer preserves
`state.context`'s object identity (it carried the previous context by reference
for #1236). The contents survive; a plugin that cached the context object itself
across a `replace()`, rather than re-reading it from the state, writes into an
object the router no longer holds.

`systemCommit` now builds its state field by field where it used to commit the
one it was handed, by reference. Four consequences: `state.context` is copied (it used to
travel by reference, as did `transition`, which is now copied and frozen); any
own field of a foreign `State` beyond the six a `State` declares is dropped; a
missing `context` becomes `{}`; and the committed object's key order matches
every other producer's. `context` remains the mutable
carve-out it has always been; what changes is whose object it is, so a handle
kept from before the call no longer writes into committed state. A namespace
claimed under the name `__proto__` survives that copy — the `context` contract
requires it, and it is exactly what the state channels deliberately do not do.

⚠ **Symbol-keyed entries are dropped from both channels, unconditionally.** This
is the rule `normalizeParams` has always applied to the path channel; the query
channel now matches it, and matches what the docs already stated for both. Before this release they were KEPT on the query
channel unless the route carried a `defaultSearch` — the copies that could hand
the bag back spread it, and a spread carries symbol-keyed entries, while the
defaulted path already rebuilt key by key. Both build
key by key now, and a control cell pins all three bag shapes to one answer.
(A mid-development revision of this branch made the answer depend on whether an
unrelated key held `undefined`; that shape never shipped.)

⚠ **One measured cost.** Holding the guarantee means the query-channel copy is a
guarded loop rather than a spread — a spread cannot be kept, because it RE-CREATES
the key it is supposed to drop. Measured on the merge itself, paired runs
with an A/A floor near zero: **about +30 ns at two query keys and +60 ns at
four**. (A single-key bag measures somewhere between +8 and +17 ns depending on
who runs it; two independent measurements did not reconcile, so the smallest
case is stated as small rather than as a number.) The site
is the query merge every `navigate` / `buildPath` / `isActiveRoute` /
`canNavigateTo` passes through when the route has no `defaultSearch`, so it lands
on the `<Link>` render path; the end-to-end share depends on how many query keys
a route carries and stays under ten percent of a `buildPath` at four. A deliberate
trade, priced here rather than left to be discovered.

⚠ **A `__proto__` entry is dropped SILENTLY at this layer** — no throw, no
warning, nothing in the log. The diagnostics that would name the writer are a
separate change. Eight wiki pages document the behaviour for the
producers it reaches, so a reader is not left inferring it from an error that
never arrives. Several pages for affected producers stay silent —
`isActiveRoute`, `navigateToDefault`, `start`, `addRoute`, `replaceRoutes`,
`clone`, and the `defaultParams` / `defaultSearch` sections of `Route`,
and `RouterOptions`: affected and undocumented, rather than documented
wrongly.
