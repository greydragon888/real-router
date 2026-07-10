# @real-router/route-utils

> Pre-computed route tree queries + regex-based segment testing

## File Structure

```
src/
├── RouteUtils.ts       — Main class: eager pre-computation + static facade
├── getRouteUtils.ts    — WeakMap-cached factory function
├── segmentTesters.ts   — makeSegmentTester factory + startsWithSegment/endsWithSegment/includesSegment
├── routeRelation.ts    — areRoutesRelated (pure string comparison)
├── constants.ts        — MAX_SEGMENT_LENGTH, SAFE_SEGMENT_PATTERN, ROUTE_SEGMENT_SEPARATOR
├── types.ts            — RouteTreeNode interface, SegmentTestFunction interface
└── index.ts            — Public exports

tests/
└── functional/
    ├── RouteUtils.test.ts       — RouteUtils class + getRouteUtils factory
    └── segmentTesters.test.ts   — All segment testers + areRoutesRelated + static facade
```

## Two Concerns, One Package

The package serves two independent purposes unified under a single import:

### 1. Route Tree Queries (`RouteUtils` class)

Instance methods that query pre-computed route tree data. Accepts any object matching the `RouteTreeNode` interface (structurally compatible with `RouteTree` from `route-tree`).

- `getChain(name)` — ancestor chain lookup (Map read)
- `getSiblings(name)` — sibling lookup (Map read)
- `isDescendantOf(child, parent)` — string prefix comparison (no tree lookup)

### 2. Segment Testing (standalone functions)

Stateless regex-based functions for testing route name segments. Depends only on `@real-router/types` (for `State` type).

- `startsWithSegment`, `endsWithSegment`, `includesSegment` — regex testers
- `areRoutesRelated` — pure string comparison (`===` or `.startsWith` with dot boundary)

`RouteUtils` class bridges both via **static readonly facade** properties that delegate to standalone functions.

---

## Pre-Computation Model

All route tree data is eagerly computed during `new RouteUtils(root)`:

```
Constructor
  └── #buildAll(root, chain=[])          ← recursive DFS traversal
        ├── Build chain: push fullName, freeze cumulative array → #chainCache
        ├── Build siblings: filter nonAbsoluteChildren → #siblingsCache
        │     ├── Non-absolute children: siblings = other non-absolute children
        │     └── Absolute children: siblings = ALL non-absolute children
        ├── Recurse into all children
        └── Restore chain (pop) for sibling traversal
```

**Data structures:**

- `#chainCache: Map<string, readonly string[]>` — route name → frozen ancestor chain
- `#siblingsCache: Map<string, readonly string[]>` — route name → frozen sibling list

**Immutability:** All cached arrays are `Object.freeze()`-d during construction. No mutation possible after initialization.

**Root handling:** Root (`""`) gets chain `[""]`. Root has no siblings (`undefined`).

### Absolute Route Semantics

An absolute **path** (e.g., `~/modal`) overrides the parent path at the URL level only — the node keeps its position in the route tree (route-tree ARCHITECTURE.md: "Override parent path"). Its `fullName` keeps the parent prefix (e.g. `users.modal`) and `getChain` still routes through the parent — the node is **not** hoisted to root. Sibling semantics:

- Absolute routes are **excluded** from their parent's `nonAbsoluteChildren`
- An absolute route's siblings are **all** `nonAbsoluteChildren` of its **parent** (which equals the root's `nonAbsoluteChildren` only when the absolute route is top-level — the common case the functional tests cover)
- Non-absolute routes never see absolute routes as siblings

**Example** — `users.modal` (absolute) nested under `users`:

```
""                                nonAbsoluteChildren = ["users", "admin"]
  users   children=[list, modal, view]  nonAbsoluteChildren = ["users.list", "users.view"]
    users.modal   [absolute]
```

- `getSiblings("users.modal")` → `["users.list", "users.view"]` — the **parent's** `nonAbsoluteChildren`, **not** the root's (`["users", "admin"]`)
- `getChain("users.modal")` → `["users", "users.modal"]` — the chain goes through the parent

The code (`RouteUtils.ts:133-141`: absolute children inherit the **parent** node's `nonAbsoluteChildren`) is correct; only this doc over-generalized the top-level special case (parent = root).

---

## Segment Tester Architecture

### Factory Pattern

`makeSegmentTester(start, end)` produces all three testers with different regex anchors:

```
startsWithSegment  →  start: ^            end: (?:\.|$)
endsWithSegment    →  start: (?:^|\.)    end: $
includesSegment    →  start: (?:^|\.)    end: (?:\.|$)
```

Input segments are escaped via `escapeRegExp()` before regex construction — prevents regex injection through user-provided segment strings.

Each tester produced by the factory has its own `regexCache: Map<string, RegExp>` — compiled regexes are cached per segment string.

### Calling Patterns

Each tester supports three overloads (+ implementation signature) via conditional return type:

```
(route, segment)     → boolean                              // direct
(route)              → (segment) → boolean                  // curried
(route, null)        → false                                // null guard
(route, segment?)    → boolean | ((segment) → boolean)      // implementation signature
```

The curried form is useful for creating reusable predicates (e.g., in `filter()` callbacks).

> **`null` is a direct-form-only overload.** `f(route, null) → false` applies to the **direct** call. The **curried** form's parameter is typed `(segment: string) => boolean` and has **no null branch**, so `f(route)(null)` throws `TypeError` (curried/direct equivalence holds for string segments only — see INVARIANTS Inv 5).

### Validation Pipeline

The two entry forms (direct vs. curried) run the same checks in **different order** — the route-name check (`invalidName`) is deferred so the single-arg form always returns a tester function per its overload contract (#769):

```
Direct form   f(route, segment):
  segment === null → false
    → invalidName → false            (BEFORE the segment-type guard)
    → segment type check → segment empty → false
    → buildRegex: length (≤ 10,000) → character (SAFE_SEGMENT_PATTERN) → compile + cache

Curried form  f(route)(segment):
  segment type check → segment empty → false
    → invalidName → false            (AFTER the segment-type guard)
    → buildRegex: length (≤ 10,000) → character (SAFE_SEGMENT_PATTERN) → compile + cache
```

Validation is split: name/segment type-empty-null checks happen in the returned function, length/character checks happen in `buildRegex`. The route-name check is computed once as `invalidName` but is **deferred** — it never short-circuits before the currying branch, so the single-arg form always returns a tester function (#769). The two forms check `invalidName` at **different points**: the **direct** form checks it *before* the segment-type guard (so `f("", 42)` returns `false`, never a `TypeError`), while the **curried** form checks it *after* (so `f("")(42)` throws `TypeError`). Deliberate consequence: with an invalid route name, **both** forms skip the length/character validation of a string segment, so direct/curried equivalence for **string** segments holds exactly (INVARIANTS Inv 5).

---

## Caching Strategy

### WeakMap Factory (`getRouteUtils`)

```typescript
const cache = new WeakMap<RouteTreeNode, RouteUtils>();
```

- **Key:** `RouteTreeNode` object reference (not value equality)
- **Lifecycle:** RouteUtils is GC'd when the RouteTree is GC'd
- **Use case:** Avoids redundant O(n) construction when the same tree is queried multiple times

### Pre-Computed Maps (`RouteUtils`)

- **`#chainCache`:** `Map<string, readonly string[]>` — populated once in constructor
- **`#siblingsCache`:** `Map<string, readonly string[]>` — populated once in constructor
- **Lookup cost:** Single `Map.get()` — O(1) amortized

### Regex Cache (segment testers)

- **Per-tester:** Each of the three testers has its own `Map<string, RegExp>`
- **Key:** segment string
- **Lifecycle:** Module-level — lives for the entire application lifetime
- **No eviction:** Segment strings are finite in practice (route names), so unbounded cache is acceptable

---

## Dependencies

| Dependency           | Type    | Purpose                                   |
| -------------------- | ------- | ----------------------------------------- |
| `@real-router/types` | runtime | `State` type for segment tester overloads |

`RouteTreeNode` interface is defined locally — no runtime dependency on the internal `route-tree` package. TypeScript structural typing ensures compatibility when passing the real `RouteTree` object.

---

## Performance Characteristics

| Operation                     | Complexity | Notes                                      |
| ----------------------------- | ---------- | ------------------------------------------ |
| Construction                  | O(n)       | Single DFS traversal, n = number of routes |
| `getChain`                    | O(1)       | Map.get()                                  |
| `getSiblings`                 | O(1)       | Map.get()                                  |
| `isDescendantOf`              | O(k)       | String prefix check, k = name length       |
| `getRouteUtils` (cache hit)   | O(1)       | WeakMap.get()                              |
| `getRouteUtils` (cache miss)  | O(n)       | Construction + WeakMap.set()               |
| Segment tester (cached regex) | O(k)       | Regex test, k = name length                |
| Segment tester (cold regex)   | O(k)       | Regex compile + test                       |

---

## Code Conventions

- 100% test coverage required
- All cached data is `Object.freeze()`-d — no mutation after construction
- Private fields use `#` syntax (true encapsulation)
- Segment testers use factory pattern to avoid code duplication across three functions
- `eslint-disable sonarjs/function-return-type` on the curried tester — intentional union return type

## See Also

- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
