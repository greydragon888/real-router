# The door census

A **door** is a place where an application's value, code, or reference crosses
into the library's state, or where the library hands one back out. This folder
holds the tests that enumerate them.

## Why the census is a test suite and not a document

A written inventory has no oracle. The repository already carries the measured
case: a 216-door audit was published as a JSON artefact, and three days later two
of its findings were fixed — the mechanism its first row describes no longer
exists, and the numbers that row reports measure zero today. Nothing went red,
because nothing was watching. A census that cannot fail is a census nobody can
trust the age of.

Every file here is therefore **derived**, not listed: the door set is read out of
the source, the manifest, or the live object at run time. A set written by hand
would be a second copy going stale on its own schedule — and it did, twice, while
these were being written.

## What each file owns

| file                   | the question it answers                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface.test.ts`      | What does each handed-out surface CONTAIN? Composition from the live object, including symbols, accessors, the frozen/cached split, and the second level.                                                                  |
| `reachability.test.ts` | What can an application NAME? Every published entry point of every package, resolved through its manifest, against every symbol `shared/` exports. Separates a door from a site.                                           |
| `consumers.test.ts`    | Who actually REACHES for a member? Three call idioms, what a shipped consumer reads one level down, and — separately — which factories shipped code CALLS, so an empty member row reads as handed-on rather than unwanted. |
| `core-config.test.ts`  | What does an application FILL on core? Config fields keyed on the argument position of a known core door, so a plugin's augmentation of `Route` is visible.                                                                |
| `application.test.ts`  | The same question for everything that is not core: plugin factory signatures, the `Link` surface of six adapters, and the provider door in the five shapes they declare it.                                                |
| `returns.test.ts`      | What does core take BACK? The functions an application supplies, their declared returns, and where core distrusts one.                                                                                                     |
| `total.test.ts`        | HOW MANY doors there are — the one question the others cannot answer separately, since each pins a set and the number is their sum. It owns the count; nothing else restates it.                                           |

## Rules these tests follow

- **Membership, not volume.** What is pinned is a SET. A number appears only
  where it is itself the subject — how many returns declare `void`, how many
  calls core coalesces, and the total, whose whole subject is the count — so it
  moves when the thing it counts moves, and never because a test was added
  beside it.
- **A total is a union, never a sum.** Every name the count touches is
  qualified by its owner, and `total` asserts the union is exactly as large as
  its buckets before it asserts the number. A door drifting into two buckets
  reds that check first, so the headline can never be inflated quietly.
- **Every derivation has an anti-vacuum.** A walk that matches nothing must
  throw or fail a floor, because an empty result and a clean result look
  identical in a green suite.
- **Only the load-bearing side is pinned.** Where one side of a partition grows
  with ordinary work — a new `shared/` helper, a new test fixture — the other
  side carries the assertion, so the event that reddens is the one worth seeing.
- **Discriminating power is proven, not assumed.** Each cell here was validated
  by mutating the thing it claims to watch and confirming it reds.

## Five of these are repo-wide scans

`application`, `consumers`, `core-config`, `reachability` and `total` read
beyond their own workspace, so turbo's per-package cache cannot answer for them.
They are registered in `scripts/repo-wide-scans.json` and run by
`pnpm lint:repo-scans`; `repo-scan-authority-2241` derives that list from the
AST and reds when an entry is missing. `surface` and `returns` stay home —
`surface` reads the live objects, `returns` reads core's own types.

## Two axes this folder does NOT own

Both predate this census, both are owned, and a row here for anything they
already pin would be a second copy of a fact that has one owner.

**What core hands out, and whether it stays frozen, adopted or live.**
`state-freeze-authority`, `handed-out-containers-1957`,
`committed-state-authority`, `adopted-origins-handout-2195`,
`registry-handout-2137`, `factory-surface-freeze-authority-1805`,
`constants-freeze-authority-1959`, `adopt-channel-authority-2187` and
`guard-state-completeness-1976`.

**What GUARDS a door.** `seam-door-authority-2123`,
`seam-coverage-authority-1938`, `commit-door-authority-1753`,
`tree-mutator-guard-authority-1751`, `plugin-api-stub-seam-authority-1805`,
`route-name-rule-authority-2035` and `internals-parity-authority-2258` in
`@real-router/validation-plugin` — with `factory-surface-freeze-authority-1805`
answering on both axes.

⚑ Eight files rather than one is the measured shape, not an accident. Of the 28
pairs they form, none is equal and none is nested; most artefacts have a single
owner; the predicates fall into five groups and the oracles into five more, and
most disjoint pairs do not even share an oracle. Merging them was built and
priced: the verdicts merge, the controls do not, and one module-scope failure
takes every cell with it instead of one file's worth. The census indexes doors;
it does not index their guards.

Render plumbing is deliberately out: a `nodeName`, a snippet, a `fallback` or an
`onError` does not carry application data into routing state.
