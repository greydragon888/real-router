# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Segment Tester Consistency

| #   | Invariant                             | Description                                                                                                                                                                                                                                           |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | startsWithSegment consistency         | `startsWithSegment(name, lastSegment)` is `true` if and only if `name` contains no dot. A single-segment name is simultaneously its own first and last segment; a multi-segment name has a different first segment.                                   |
| 2   | endsWithSegment guarantee             | `endsWithSegment(name, getLastSegment(name))` is always `true` for any non-empty name. The last segment is by definition a suffix of the route name.                                                                                                  |
| 3   | Name reconstruction                   | For any multi-segment name, `getParentSegment(name) + "." + getLastSegment(name) === name`. Splitting a name into parent and last segment is the inverse of joining with a dot separator.                                                             |
| 4   | includesSegment detects full segments | `includesSegment(name, seg)` returns `true` for every actual segment in the name. It returns `false` for a string that is a prefix of a segment but not a complete segment itself. The function operates on dot boundaries, not arbitrary substrings. |
| 5   | Curried form equivalence              | `f(route)(segment) === f(route, segment)` for all three testers. The curried code path has its own validation and must produce identical results.                                                                                                     |
| 6   | Multi-segment includesSegment         | `includesSegment(name, subseq)` returns `true` for any contiguous multi-segment subsequence. Extends INV 4 from single segments to dot-joined runs.                                                                                                   |
| 7   | startsWithSegment for first segment   | `startsWithSegment(name, firstSegment)` is always `true` for multi-segment names. Complement of INV 1 — tests the first segment instead of the last.                                                                                                  |

## Boundary Cases

| #   | Invariant            | Description                                                                                                                                                                                            |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Single-segment names | For any single-segment name (no dot), all three testers return `true` when called with that same name as the segment. A single segment is simultaneously the start, end, and full content of the name. |
| 2   | Empty route name     | `startsWithSegment("", seg)`, `endsWithSegment("", seg)`, and `includesSegment("", seg)` all return `false` for any non-empty segment. An empty route name matches nothing.                            |
| 3   | Empty segment        | `startsWithSegment(name, "")`, `endsWithSegment(name, "")`, and `includesSegment(name, "")` all return `false` for any route name. An empty segment is not a valid match target.                       |
| 4   | Null segment guard   | `startsWithSegment(name, null)`, `endsWithSegment(name, null)`, and `includesSegment(name, null)` all return `false`. Null is handled as a separate code path from empty string.                       |

## areRoutesRelated

| #   | Invariant                | Description                                                                                                                                                                                     |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Symmetry                 | `areRoutesRelated(a, b) === areRoutesRelated(b, a)` for any two route names. Hierarchical relatedness has no direction: "A is an ancestor of B" and "B is a descendant of A" are the same fact. |
| 2   | Reflexivity              | `areRoutesRelated(name, name)` is always `true`. Every route is related to itself.                                                                                                              |
| 3   | Parent-child relatedness | For any multi-segment name, `areRoutesRelated(name, getParentSegment(name))` is always `true`. A route and its direct parent are always related.                                                |
| 4   | Non-relatedness          | If two route names have different first segments, `areRoutesRelated(a, b)` is always `false`. Tests the negative path of the relation check.                                                    |

## isDescendantOf

| #   | Invariant                    | Description                                                                                                                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Irreflexivity                | `isDescendantOf(name, name)` is always `false`. A route is never a descendant of itself.                                                                               |
| 2   | areRoutesRelated consistency | If `isDescendantOf(child, parent)` is `true`, then `areRoutesRelated(child, parent)` must also be `true`. Descendancy implies relatedness.                             |
| 3   | Antisymmetry                 | If `isDescendantOf(child, parent)` is `true`, then `isDescendantOf(parent, child)` is `false`. The descendant relation is a strict partial order — it has a direction. |
| 4   | Transitivity                 | If `isDescendantOf(a, b)` and `isDescendantOf(b, c)`, then `isDescendantOf(a, c)`. Ancestor chains compose: a grandchild is a descendant of its grandparent.           |

## Validation

| #   | Invariant                   | Description                                                                                                                                                                                       |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Character pattern partition | Segments matching `SAFE_SEGMENT_PATTERN` (`/^[\w.-]+$/`) are accepted without throwing. Segments containing any other character throw `TypeError`. All three testers enforce the same validation. |
| 2   | Length partition            | Segments with length ≤ `MAX_SEGMENT_LENGTH` (10,000) are accepted. Segments exceeding the limit throw `RangeError`. All three testers enforce the same length validation.                         |

## Test Files

| File                                      | Invariants | Category                                                    |
| ----------------------------------------- | ---------- | ----------------------------------------------------------- |
| `tests/property/routeUtils.properties.ts` | 23         | Segment testers, route relation, isDescendantOf, validation |
