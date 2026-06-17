# Invariants

> Property-based invariants verified via [fast-check](https://fast-check.dev/). See `tests/property/` for implementations.

## Full Roundtrip

| #   | Invariant                    | Description                                                                                                                                                                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | URL param roundtrip          | `match(buildPath("users.profile", {id}))` restores both the route name and the original `id` value. This is the core correctness property: if navigation builds a path and can't match it back, the router is broken.    |
| 2   | Query-only roundtrip         | For a route with only query params, `buildPath` then `match` preserves all query param values. Verifies the `search-params` integration via the `parseQueryString`/`buildQueryString` dependency injection.              |
| 3   | Array query params roundtrip | For all 4 array formats (`none`, `brackets`, `index`, `comma`), array values roundtrip correctly through the integration layer. Each format has distinct encoding behavior that must compose correctly with the matcher. |
| 4   | URL/query param isolation    | After matching a path on a route with both URL params and query params, each param appears in exactly one source. URL params are typed `"url"` and query params are typed `"query"` in the result meta.                  |

## createRouteTree Normalization

| #   | Invariant                             | Description                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tree build idempotency                | Over randomly-generated nested trees (`arbRouteForest`), `routeTreeToDefinitions(createRouteTree(routes))` reproduces the input **exactly** (names, paths incl. `~`/params/query/splat, nesting, child order) and a second roundtrip is a fixed point. Essential for `replace()` in the core router.                                                                                         |
| 2   | Route preservation                    | Over randomly-generated nested trees, `createRouteTree` drops nothing at **any** level: `tree.children.size === routes.length` AND the total node count equals the total definition count. No routes are silently lost during construction.                                                                                                                                      |
| 3   | Absolute path normalization           | After tree building, no node's `path` property anywhere in the tree starts with `~` (verified over `arbRouteForest`). The tilde prefix is consumed during normalization and replaced by the `absolute: true` flag.                                                                                                                        |
| 4   | Absolute path roundtrip               | For randomized trees with absolute path children, `~` is stripped from stored paths AND `routeTreeToDefinitions` → `createRouteTree` roundtrip preserves the `absolute` flag and path for every node.                                                                               |

## Computed Caches

| #   | Invariant                       | Description                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tree immutability               | Every node in the tree — plus its `children` Map, `paramTypeMap`, `nonAbsoluteChildren` array, nested `paramMeta` object, and its `urlParams`/`queryParams`/`spatParams` arrays — passes `Object.isFrozen` (#747). Verified over randomly-generated trees (`arbRouteForest`) spanning plain/URL/query/splat params and absolute flags. **Exception:** `paramMeta.constraintPatterns` is a `Map`, which `Object.freeze` cannot make read-only; it is protected at the type level via `ReadonlyMap` and intentionally not runtime-frozen.                                                               |
| 2   | Non-absolute children filtering | For every node (over `arbRouteForest`), `nonAbsoluteChildren` contains exactly those children from the `children` Map where `absolute === false`, preserving definition order. Absolute children appear in `children` but not in `nonAbsoluteChildren`.                                                                                                        |
| 3   | paramTypeMap classification     | For every node, each entry in `paramTypeMap` correctly classifies the parameter source: URL path parameters (`:param`) **and splat params** (`*param`) are typed `"url"` (splat also appears in `paramMeta.spatParams`), and query string parameters (`?param`) are typed `"query"`. No extra entries exist beyond the declared URL/splat/query params. Validated by building trees from randomized URL+query+splat param combinations. |
| 4   | fullName correctness            | For every node (over `arbRouteForest`), `fullName` equals the dot-joined chain of `name` fields from the root to that node, independently reconstructed by walking the `parent` chain. Validates `computeFullName` in `computeCaches` over arbitrary structures. |

## getSegmentsByName

| #   | Invariant             | Description                                                                                                                                                                                                    |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Correctness           | The last segment returned by `getSegmentsByName(tree, name)` has `fullName` equal to the queried name. The function must return the right node for the requested name.                                         |
| 2   | Length                | The number of segments returned equals the number of dot-separated parts in the name. No intermediate segments are missing from the chain.                                                                     |
| 3   | Prefix property       | Each segment's `fullName` is a prefix of the next segment's `fullName` (with a `.` separator). The parent-child relationship in the segment chain is structurally correct.                                     |
| 4   | Fast-path consistency | For names with 1 to 4 segments (the fast-path cases), the result is identical to the general algorithm. The single-segment optimization that skips `split(".")` must not diverge from the general case.        |
| 5   | Null on unknown name  | `getSegmentsByName(tree, name)` returns `null` for names that don't exist in the tree. Verifies the null-return branch in the Map lookup loop.                                                                 |
| 6   | Full name correctness | Every segment's `fullName` equals the dot-joined chain of `name` fields from the root to that node, independently reconstructed by walking the `parent` chain. Validates `computeFullName` in `computeCaches`. |

## Query Param Extraction

| #   | Invariant             | Description                                                                                                                                                                                     |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extraction            | Query params declared in a route path (`?param1&param2`) are correctly extracted into `paramMeta.queryParams`. All declared param names must be present and in order.                           |
| 2   | Path/query separation | The `pathPattern` in `paramMeta` contains only the URL path portion and never includes `?` or anything after it. Correct separation is critical for the Segment Trie to match paths accurately. |

## nodeToDefinition

| #   | Invariant                         | Description                                                                                                                                                                                                                                                                         |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | nodeToDefinition absolute restoration | `nodeToDefinition(node).path` starts with `~` if and only if `node.absolute` is `true`. For absolute nodes, removing the `~` prefix yields `node.path`. For non-absolute nodes, the output path equals `node.path` unchanged. Verified over every node of randomly-generated trees (`arbRouteForest`). |

## Route Name Validation

| #   | Invariant                 | Description                                                                                                                                                                                                       |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valid name acceptance     | Names matching the pattern `[a-zA-Z_][a-zA-Z0-9_-]*` pass `validateRoute` without throwing. The ROUTE_NAME_PATTERN regex accepts the full valid character set.                                                    |
| 2   | Invalid name rejection    | Names that are empty, whitespace-only, contain dots, start with a digit, or start with a hyphen cause `validateRoute` to throw `TypeError`. Covers all string-format rejection branches in `validateRouteName`.   |
| 3   | System route bypass       | Names prefixed with `@@` bypass the pattern check entirely — they can contain dots, slashes, and other characters that would normally be rejected. Used for internal system routes like `@@router/UNKNOWN_ROUTE`. |
| 4   | Non-string name rejection | Non-string values (`number`, `null`, `undefined`, `boolean`) cause `validateRoute` to throw `TypeError` at the `typeof` check, before any pattern validation runs.                                                |

## Route Path Validation

| #   | Invariant                           | Description                                                                                                                                                                                                 |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valid path acceptance               | Empty strings, absolute paths (`/path`), tilde paths (`~path`), query paths (`?param`), and relative segments all pass `validateRoutePath` without throwing.                                                |
| 2   | Non-string path rejection           | Non-string values (`number`, `null`, `undefined`, `boolean`, `array`) cause `validateRoutePath` to throw `TypeError` at the type check.                                                                     |
| 3   | Whitespace rejection                | Paths containing whitespace characters (space, tab, newline) cause `validateRoutePath` to throw `TypeError`. Whitespace is never valid in route paths.                                                      |
| 4   | Double-slash rejection              | Paths containing consecutive slashes (`//`) cause `validateRoutePath` to throw `TypeError`. Double slashes indicate a path construction error.                                                              |
| 5   | Absolute under parameterized parent | Tilde-prefixed paths (`~path`) under a parent node that has URL parameters in its `paramTypeMap` cause `validateRoutePath` to throw `TypeError`. Absolute paths cannot be used under parameterized parents. |
| 6   | Unbalanced constraint rejection     | Paths with a stray constraint delimiter — a `<` with no closing `>` (`/:id<\d+`, `/:id<`) or a `>` with no opening `<` — cause `validateRoutePath` to throw `TypeError`. A linear scan tracks open/close (a `<` opens a constraint, the first following `>` closes it, a `<` inside the body is allowed), so a `>` outside a constraint or a `<` left unclosed is unbalanced and would desync match vs build downstream (`buildPath` throws `Missing required param`). Balanced constraints (`/:id<\d+>`) and a `<` inside a constraint body (`/:id<[a<b]>`) are accepted (#749). |

## Route Duplicate Detection

> `validateRoute`'s cross-route guarantees (the reason `seenNames` / `seenPathsByParent` exist) — distinct from the single-route format checks above.

| #   | Invariant                          | Description                                                                                                                                                                                                                                  |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Batch name duplicate               | Validating a batch where any route name is repeated (even buried mid-list) throws `[…] Duplicate route "<name>" in batch`. Names are unique within a batch.                                                                                  |
| 2   | Batch path duplicate (same parent) | Two routes that share a `path` under the **same** parent level throw `[…] Path "<path>" is already defined`, even when their names differ.                                                                                                   |
| 3   | Path uniqueness is parent-scoped   | The same `path` under **different** parents is **allowed** (no false positive). Duplicate-path detection is keyed by parent, not global. Mutating the keying to ignore the parent breaks this invariant — it is the parent-scoping guard.    |
| 4   | Tree name duplicate                | Validating a route whose name already exists in the supplied existing tree throws `[…] Route "<name>" already exists` (the tree-relative check, used by `addRoute`).                                                                          |
| 5   | All-distinct acceptance            | A batch with all-unique names and all-unique paths passes validation without throwing — the duplicate checks produce no false positives on legitimate route sets.                                                                            |

## Test Files

| File                                       | Invariants          | Category                                           |
| ------------------------------------------ | ------------------- | -------------------------------------------------- |
| `tests/property/roundtrip.properties.ts`   | R1–R4               | buildPath/match integration roundtrips             |
| `tests/property/tree.properties.ts`        | N1–N4, CC1–CC4, ND1     | createRouteTree normalization + caches + nodeToDef (generative via `arbRouteForest`) |
| `tests/property/segments.properties.ts`    | S1–S6                   | getSegmentsByName correctness                      |
| `tests/property/queryParams.properties.ts` | Q1–Q2                   | Query param extraction and separation              |
| `tests/property/validation.properties.ts`  | VN1–VN4, VP1–VP6, VD1–VD5 | Route name/path validation + duplicate detection   |
