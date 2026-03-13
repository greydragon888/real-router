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
├── functional/
│   ├── RouteUtils.test.ts       — RouteUtils class + getRouteUtils factory
│   └── segmentTesters.test.ts   — All segment testers + areRoutesRelated + static facade
└── benchmarks/
    ├── route-utils.bench.ts     — mitata benchmarks (construction, lookups, stress, scaling)
    └── index.ts                 — Benchmark runner entry point
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

Absolute routes (e.g., `~/modal`) are hoisted to root level in the route tree. Their sibling semantics:

- Absolute routes are **excluded** from their parent's `nonAbsoluteChildren`
- An absolute route's siblings are **all** `nonAbsoluteChildren` of the root
- Non-absolute routes never see absolute routes as siblings

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

### Validation Pipeline

```
Input → Type check (string?) → Empty check → Null check → Currying check
  → Length check (≤ 10,000) → Character check (SAFE_SEGMENT_PATTERN) → Regex build + cache
```

Validation is split: type/empty/null checks happen in the returned function, length/character checks happen in `buildRegex`. This avoids redundant checks in the curried path.

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
| `mitata`             | dev     | Benchmark engine                          |

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
- Benchmarks use mitata engine with `boxplot` + `summary` grouping and `.gc("inner")` for GC isolation

## See Also

- [INVARIANTS.md](INVARIANTS.md) — Property-based test invariants
