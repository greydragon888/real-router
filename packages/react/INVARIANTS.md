# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Link Props Equality (areLinkPropsEqual)

| #   | Invariant                                       | Description                                                                                                                                                                             |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reflexivity                                     | `areLinkPropsEqual(p, p) === true` for any `LinkProps`. A props object is always equal to itself regardless of the values it contains.                                                  |
| 2   | Symmetry                                        | `areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)`. The comparison order does not affect the result. JSON.stringify preserves this because both operands have the same key insertion order. |
| 3   | Single primitive prop change detects inequality | Changing any single primitive prop (`routeName`, `activeStrict`, `className`) while keeping others identical returns `false`. The comparator is sensitive to every individual field.      |
| 4   | Deep-equal routeParams with same key order      | Two distinct `routeParams` objects with identical keys and values (same insertion order) compare as equal via `JSON.stringify`. Confirms that inline objects don't break memoization.     |

## Segment Matching (isSegmentMatch)

| #   | Invariant                  | Description                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Exact match ↔ strict equality | `isSegmentMatch(r, s, true)` returns `true` if and only if `r === s`. The exact flag delegates to strict string equality with no prefix logic.                                 |
| 2   | Monotonicity               | If `isSegmentMatch(r, s, true)` then `isSegmentMatch(r, s, false)`. Exact match is a subset of non-exact match — relaxing the constraint never removes a previously valid match. |
| 3   | Self-match                 | `isSegmentMatch(name, name, false) === true` for any valid route name. Every name is a prefix of itself at a dot boundary.                                                     |
| 4   | Dot boundary               | `"users"` does not match `"users2"` non-exactly. Prefix matching respects dot separators and does not match partial segment names (e.g., `users` vs `users2`).                 |

## Test Files

| File                                        | Invariants | Category                                        |
| ------------------------------------------- | ---------- | ----------------------------------------------- |
| `tests/property/link.properties.ts`         | 4          | Reflexivity, symmetry, sensitivity, deep-equal  |
| `tests/property/routeView.properties.ts`    | 4          | Exact match, monotonicity, self-match, dot boundary |
