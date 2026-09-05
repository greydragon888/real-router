# pipeline (`core/src/pipeline`)

The **navigation delivery pipeline** of `@real-router/core` — three primitives over one opaque type (RFC nav-pipeline, all four phases closed). Not a package and not a published subpath (`exports` is `.` / `./types` / `./api` / `./validation`); its consumers are the router's own facade, namespaces and wiring.

## The three primitives

```
canonicalize(port, name, params, search?, opts?) → Canonical   — ① forwardTo + ③ route defaults, one pass
buildURL(canonical, port)                        → string      — ⑤a
materialize(canonical, path)                     → State       — ⑤b, frozen
materializePending(canonical, path)              → State       — ⑤b, writable shell
RouteResolver                                                  — the port the router implements at wiring time
```

`canonicalize` is the **sole producer** of `Canonical`, and `buildURL` / `materialize` physically accept nothing else.

**The brand is the guarantee.** `Canonical` carries a phantom field keyed by a `unique symbol` that is never exported — not even from this directory's barrel — so `materialize({ name, path, query }, "/x")` fails to compile with "Property '[CANON]' is missing". "Build a State out of un-defaulted channels" is unrepresentable rather than a bug someone must remember not to write. Honest boundary: the brand stops _accidental_ fabrication, not a deliberate `as` cast, and not spread-drift INSIDE this module (`{ ...c, path: … }` inherits the brand). Casts to the brand occur only inside `canonicalize`, at **two** sites — one per path, fast and slow. One function, two casts: a third appearing anywhere is what this paragraph exists to make noticeable, so the number is the load-bearing half of it, and `canonical-brand-authority-1968` is what enforces it.

**There is no stage ②.** Channel separation was deleted (`ba0f6b18b`); channels arrive correct by the producer's contract, and the port's `resolveForward` is wired to the seam that REFUSES a mis-channelled bag rather than repairing one. See [../channels/CLAUDE.md](../channels/CLAUDE.md).

## Two compositional forms

Every entry point takes one of them; Phase 2 (#1548) migrated the remaining seven, one per commit.

| Form        | Call                                           | Entry points                                                     | Resolves `forwardTo`?                     |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| **class ①** | `canonicalize(...)`                            | `navigate`, `matchPath`, `canNavigateTo`, `buildNavigationState` | Yes — through the seam                    |
| **LITERAL** | `canonicalize(..., { resolveForward: false })` | `buildPath`, `isActiveRoute`'s first arm, `makeState`            | No — answers about the route it was NAMED |

ONE entry point prints stage ⑤a **locally** rather than through `buildURL`, and the reason is structural: the `matchPath` rebuild carries options `buildURL` does not (`rewritePathOnMatch`, `trailingSlash`, the #1157 try/catch).

`buildPath` is not the second one. It reaches ⑤a through `buildURL` like every other producer — `RoutesNamespace.buildPathFromIntent` canonicalises and prints, and the port's printer sits one layer BELOW that. The facade calling the printer directly is what made it merge on its own (#1847).

The FACADE runs one seam of its own, above all of this: `router.buildPath` puts the caller's intent through the `forwardState` chain before canonicalising (#2087), with a terminal that resolves no `forwardTo`. That is what puts a plugin's injection on the same side of the route-default merge on both doors — the href a `<Link>` renders and the URL a click commits are then one string, which is INVARIANTS row 7.

`navigateToNotFound` is the one deliberate exception to the whole pipeline: it wraps a URL string rather than building a state from an intent, so it has no channels to canonicalise (INVARIANTS navigateToNotFound #2).

⚠ The LITERAL form also skips the seam's channel CHECK — the resolving form REFUSES a mis-channelled bag, the literal form simply does not look. Either way nothing is moved.

## Stage ③ has exactly ONE implementation

`canonicalize` — since Phase 4 folded `StateNamespace.makeState` onto its LITERAL form. `makeState` used to carry a parallel copy of ③ **and** of the mode gate, which is how #1584's existence precondition came to land on one terminal and not the other. The fold was verified byte-identical across a 71-cell snapshot: the only door to `makeState` is `PluginApi.makeState`. ⚠ This line used to finish "and its P1 guard refuses exactly the bag the literal form's `withholdFilledSlots` would act on" — it does not, and could not: P1 reads the caller's object and the producer reads it again, so a bag that answers differently between the two slips past (#1927). What makes the shape unreachable is the check on the SHIPPED bag, which every State-publishing door now runs.

Ordering is forced by the data, not by discipline: ③ needs the RESOLVED name (target defaults cannot be read before `forwardTo` resolves), so ① always precedes it.

## The port (`RouteResolver`)

A **read-model over the routes layer — a narrow port, not a new layer.** The module stays pure and mock-testable; the router implements the port at wiring time (`wiring/wireNamespaces.ts`).

| Member                                                 | Stage / role       | Note                                                                      |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------- |
| `resolveForward`                                       | ①                  | Wired to the `forwardState` **seam** — see wiring facts below             |
| `defaultParams` / `defaultSearch`                      | ③ input            | Split by field, never inferred. Also the ROUTE half of the fast-path gate |
| `buildPath`                                            | ⑤a printer         | Raw-channel form, so the port never knows about the brand. Not interceptable — see below |
| `queryNames`                                           | channel classifier | The ONE registry that classifies **and** prints (#1556)                   |
| `admitsUndeclaredQuery`                                | mode gate          | A boolean, not the mode — the pipeline never learns which mode it is in   |
| `pathNames`                                            | diagnostics        | `undefined` means NO SUCH ROUTE — the arm is load-bearing (#1584)         |
| `reportDroppedQueryKey?` / `reportUndeclaredParamKey?` | opt-in sinks       | Absent unless `validation-plugin` is installed                            |

**Two wiring facts are load-bearing and were measured, not assumed** — changing either is a behaviour change, not a refactor. One end is interceptable and the other deliberately is not:

- **`port.resolveForward` IS the `forwardState` seam** (`Router.ts`) — the interceptable chain _plus_ the centralized channel ASSERTION. The check lives in the port implementation and never inside this module.
- **`port.buildPath` is NOT interceptable** (#1938). It goes straight to `RoutesNamespace.buildPath`, so nothing stands between the port and the engine. A seam there would sit BELOW the route-default merge, where an injection reaches the URL and not `state.search`; the one seam sits above it and every door runs it. `seam-coverage-authority-1938` owns the door × seam table.

**Members arrive with their consumers, never before.** `queryNames` came with the channel guard, `admitsUndeclaredQuery` with the mode gate (#1575), `pathNames` and the two sinks with the diagnostics (#1579 / #1584). One member RFC §4.5 listed never arrived at all: `encode` — the route codecs stayed with the entry points that own their direction (`buildPath` calls `config.encoders`, `matchPath` calls `config.decoders`). A member added early is dead weight nothing detects: **knip has no issue type for unused members of an interface.**

⚠ **The two optional sinks must be absent for REAL.** The router implements them as GETTERS returning `undefined` while `validator === null`, not as closures forwarding into an optional-chained validator — a closure is always truthy, so the pipeline's `?.` reads as taken and bare core pays the lookup with nothing to feed. The `| undefined` in the type is what lets the getter say so under `exactOptionalPropertyTypes`.

## Why the stage-② removal took this shape

The seam used to run `separateChannels` over whatever left the interceptor chain, moving a declared `?key` out of the params bag behind the producer's back. Three shapes the repair actually hit:

- **The producer kept believing its own bag shipped.** A `decodeParams` returning `{ params: { ...params, tag } }` published a state it never wrote.
- **It laundered values past validation.** `search-schema-plugin` documented the hole with a test named `LEAKS`: an interceptor registered AFTER the schema injected into `params`, the seam moved it into `search`, and an unvalidated value landed in the channel the schema owns.
- **It inverted caller precedence.** A caller's mis-channelled key and a chain default's query half sat in different bags, where no merge ranks them, and the repair (spreading `search` last) handed the win to the DEFAULT — the #1570 defect.

Measured cost of the removal across 13 packages: 7 tests, all in core + `search-schema-plugin`; every other package was already channel-correct. Two things fell out as dead once nothing was split: the cross-channel withholding loop in the chain fold, and `search-schema-plugin`'s own copy of the split.

## Performance notes

- **The fast-path gate is TWO facts, one per side (#1589)** — the CALLER brought no query bag, and the ROUTE carries no default on either slot. Between them stage ③ and the mode gate are provably identity. A third term ("the route declares no `?name`") was redundant against the first and cost ~12 ns per call: the mode gate filters the MERGED bag, whose only sources are `defaultSearch` and the caller's bag, so an empty bag has nothing to drop however many names are declared. ⚠ The two defaults are read ABOVE the gate deliberately — they are its route half AND the slow path's first input, so the fast path pays two hops and the slow path pays nothing extra. A single `mergesNothing()` predicate was built and measured, and the figures live in `canonicalize.ts` beside the code they describe: the alternative BUYS the fast arm a hop (`isActiveRoute-exact` 101 vs 111 ns) and costs **+6.5 %** on the defaults path. The symmetric form wins because it regresses nothing.
- **`defaultParams` / `defaultSearch` are two accessors, not one returning `{ params, search }`** — the combined form allocated one throwaway object per navigation on the hot path.
- **`materialize` freezes `params` only, and the asymmetry is measured** — `canonical.query` is already frozen on every path (the fast path hands over the `EMPTY_SEARCH` singleton, the slow one gets it back frozen from `admittedSearch`), and re-freezing a frozen object costs ~8 ns. Freezing both regressed `isActiveRoute-exact` by 9.8 %; freezing one wins 5–12 % on every producer that never publishes.
- **`buildNavigateState` costs ONE object literal per navigation** over the pre-pipeline form — the `Canonical`. It cost two until #1976 removed `MaterializeOptions`: with the deferral expressed as a second entry point rather than a flag, the one required field travels positionally and the bag has nothing left to hold. The merge itself allocates nothing when the route has no defaults.

## Gotchas

- **`materializePending` defers the state SHELL, never the channels and never `transition`.** The navigate path takes that terminal so `completeTransition` can overwrite `transition` and freeze in one step; `params` is frozen inside the shared builder (#1598), so guards see frozen bags either way. ⚠ It was a `skipFreeze: boolean` on `materialize` until #1976, and the flag governed TWO guarantees rather than the one it named — the freeze, and whether `transition` was attached at all — so the only way to ask for a writable shell was to be handed an object missing a field its own return type declares required, laundered by an `as State`. Both terminals now build the SAME shape; only the freeze differs.
- **`context` is a fresh empty object, intentionally NOT frozen** — plugins publish into it via `claim.write(state, value)` after creation.
- **`materialize` deliberately does not call `makeState`** — that would re-run stage ③ and rebuild the path, defeating ⑤a. Since Phase 4 it could not anyway: `makeState` IS `canonicalize`'s literal form and would recurse.
- **`Canonical` is deliberately NOT generic; the FUNCTIONS are.** `matchPath<P>` → `materialize<P>` → `State<P>` has to carry the caller's type (without it the chain collapses to `State<Params>` and a consumer's `State<MyParams>` assignment fails TS2322). Parameters on the interface would be unreachable with non-generic primitives and unnecessary with generic ones — both verified with tsc.
- **`diagnoseUndeclared` is read as a ROLE, not inferred from `resolveForward`.** `canNavigateTo` resolves `forwardTo` (sharing the form with `navigate`) yet is a PREDICATE running on every `<Link>` render; keying the diagnostic on the form warned from it — measured, not reasoned.

## File map

```
canonicalize.ts — THE single producer of Canonical (stages ① + ③, the fast-path gate, the diagnostics)
buildURL.ts     — ⑤a, straight through the port to the engine
materialize.ts  — ⑤b, and THE shape of a router State
port.ts         — RouteResolver, the read-model the router implements at wiring time
types.ts        — Canonical + the un-exported brand symbol
index.ts        — the barrel core imports
```

## The two compositional forms, and the channel split

`canonicalize` is the **sole producer** of `Canonical`; `buildURL` / `materialize`
physically accept nothing else, because the brand is a `unique symbol` that is
never exported. Two compositional forms:

- **class ①** resolves `forwardTo` through the seam — `navigate`, `matchPath`,
  `canNavigateTo`, `buildNavigationState`;
- **class LITERAL** (`{ resolveForward: false }`) answers about the route it was
  NAMED — `buildPath`, `isActiveRoute`'s first arm, `makeState`.

`navigateToNotFound` is the one deliberate exception: it wraps a URL string rather
than building a state from an intent, so it has no channels to canonicalise.


**The slot IS the channel.** `defaultParams` is the path channel, `defaultSearch`
the query channel, in every position; the router moves nothing between them.
`params` and `search` meet in exactly one place — the printed URL. Two checks,
split by what is knowable when:

- **Registration** — `assertRouteDefaultChannels`, an always-on core guard: a
  route's own `defaultParams` naming a key the route declares with `?`. Both sides
  are known at every registration door, so it fails at config time with the slot
  to move to, and every door runs it prepare-then-commit.
- **Resolution** — the `forwardState` seam: a hop's `defaultParams` naming a key
  the TARGET declares, which registration cannot see through a dynamic
  `forwardTo`. The error names the key, the route, and the route the caller
  actually named.

Stage ③ (route default UNDER the caller's value) has exactly ONE implementation,
`canonicalize`. The two channels are frozen by DIFFERENT owners — `query` at the
merge, `path` at the publication boundary — and `INVARIANTS.md` canonicalize #4
owns that statement. Neither owner is the `materialize` / `materializePending`
split, which defers only the state SHELL.

## See Also

- [README.md](README.md) — what this subsystem is, in short
- [../channels/CLAUDE.md](../channels/CLAUDE.md) — the channel-correctness subsystem this pipeline applies (`withholdFilledSlots`, `admittedSearch`)
- [../../CLAUDE.md](../../CLAUDE.md) — the `@real-router/core` package architecture, incl. the registration/resolution checks that replaced stage ②
- [../../INVARIANTS.md](../../INVARIANTS.md) — property-based invariants per entry point
