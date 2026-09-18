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

Every DOOR SET here is therefore **derived** — read out of the source, the
manifest, or the live object at run time — because a set written by hand is a
second copy going stale on its own schedule, and it did, twice, while these were
being written.

⚠ The SEEDS are not derived, and saying otherwise would overstate the
construction. Which interface to open, which file a factory is declared in,
which nine `Link` props belong to the router: those are written by hand, in
constant tables at the top of each file. What protects them is the anti-vacuum
below — a seed that stops resolving empties its bucket, and an empty bucket
fails rather than shrinking a number quietly.

## What each file owns

| file                   | the question it answers                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface.test.ts`      | What does each handed-out surface CONTAIN? Composition from the live object, including symbols, accessors, the frozen/cached split, and the second level.                                                                                                                                                                                                                                                                                                                                           |
| `reachability.test.ts` | What can an application NAME? Every published entry point of every package, resolved through its manifest, against every symbol `shared/` exports. Separates a door from a site.                                                                                                                                                                                                                                                                                                                    |
| `consumers.test.ts`    | Who actually REACHES for a member? Three call idioms, what a shipped consumer reads one level down, and — separately — which factories shipped code CALLS, so an empty member row reads as handed-on rather than unwanted. A second, typed census asks the compiler what each receiver IS, so the idiom a surface arrives by stops deciding whether its reach is seen — clause (a) of the `PluginApi` membership rule — and the difference between the two walks is asserted rather than described. |
| `membership.test.ts`   | Could an application NAME the types a handed-out member's signature uses? Clause (b) of the rule that admits a member to `PluginApi`: every type a member references is published by a subpath, is a type parameter, or is TypeScript's own. `RouterInternals` is the counter-example it pins.                                                                                                                                                                                                      |
| `core-config.test.ts`  | What does an application FILL on core? Config fields keyed on the argument position of a known core door, so a plugin's augmentation of `Route` is visible.                                                                                                                                                                                                                                                                                                                                         |
| `application.test.ts`  | The same question for everything that is not core: plugin factory signatures, the `Link` surface of six adapters, and the provider door in the five shapes they declare it.                                                                                                                                                                                                                                                                                                                         |
| `returns.test.ts`      | What does core take BACK? The functions an application supplies, their declared returns, and where core distrusts one.                                                                                                                                                                                                                                                                                                                                                                              |
| `total.test.ts`        | HOW MANY doors there are — the one question the others cannot answer separately, since each pins a set and the number is their sum. It also holds the completeness ratchet: every exported interface in core's types and every plugin factory in the tree must be classified, so a seed that is missing reds instead of shrinking the count in silence.                                                                                                                                             |
| `readme.test.ts`       | Does THIS FILE still describe the folder? The table against the directory, the repo-wide claim against the registry, and every authority and artefact it points a reader to against the tree.                                                                                                                                                                                                                                                                                                       |

## Rules these tests follow

- **Membership, not volume.** What is pinned is a SET. A number appears only
  where it is itself the subject — how many returns declare `void`, how many
  calls core coalesces, and the total, whose whole subject is the count — so it
  moves when the thing it counts moves, and never because a test was added
  beside it.
- **A verdict is checkable, not only its presence.** Forcing every symbol to
  carry a classification does not make the classification right. `total` asks
  the checker which published signatures ACCEPT each name it called `output`,
  which published signatures ACCEPT each name it called NOT-a-door, and a name
  something accepts has to say why it still is not one — five answers are safe,
  and every other is a bag somebody fills. Checking one category out of eight
  would be the hand-kept list again, so it checks them all. It found one wrong
  verdict.
- **A seed is guilty until classified.** The count is only as complete as the
  tables that seed it, so `total` enumerates every symbol that could hold doors
  and fails on one it cannot place. The scope is the MANIFESTS — every object
  shape and plugin factory any package publishes — because a hand-written list
  of directories to look in is the same defect one level up, and it failed
  twice before this.
- **Ask the compiler what a shape is, not a parser.** A parser has to be taught
  every syntax a bag can be written in, and teaching it one form at a time is
  the directory list again, one level down: `total` builds a real program and
  asks each published name whether its TYPE has members of its own — with no
  filter on the KIND of declaration, since "interface, then also alias, then
  also function" is the same hand-kept list moved into an `if`. A union of
  object branches, a bag passed inline, an arrow-bound function and a frozen
  constant all answer the way an interface does. A dead classification, naming a symbol that
  no longer exists, fails the same cell: it would keep a real omission looking
  accounted for.
- **A list inside the census is the census failing at its own job.** Where a
  set could be written out, it is derived instead: the router-owned `Link`
  props come from Angular's directive inputs, and the fields plugins merge into
  core's bags come from their `declare module` blocks — not from a copy of what
  a sibling test already pins.
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
- **Discriminating power is proven where it was claimed.** Every cell added
  here was validated by mutating the thing it watches and confirming it reds,
  and the commit that added it records the mutations. That is not the same as
  a sweep over all of them at once, which nobody has run.

## Six of these are repo-wide scans

`application`, `consumers`, `core-config`, `reachability`, `readme` and
`total` read beyond their own workspace, so turbo's per-package cache cannot answer for them.
They are registered in `scripts/repo-wide-scans.json` and run by
`pnpm lint:repo-scans`; `repo-scan-authority-2241` derives that list from the
AST and reds when an entry is missing. `surface`, `returns` and `membership`
stay home — `surface` reads the live objects, `returns` reads core's own types,
and `membership` asks the compiler about core's own published entries.

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

⚑ Eight files rather than one is the measured shape, not an accident: no pair
of them is equal or nested, they do not share a predicate, and most do not even
share an oracle. Merging them was built and priced rather than argued — the
verdicts merge, the controls do not, and one module-scope failure takes every
cell with it instead of one file's worth. The census indexes doors; it does not
index their guards.

Render plumbing is deliberately out: a `nodeName`, a snippet, a `fallback` or an
`onError` does not carry application data into routing state.
