# route-tree

Internal package that builds an immutable routing tree from route definitions, provides URL matching via `createMatcher`, and supports tree queries and validation. Not published to npm — consumed by `@real-router/core`.

## Exports

| Export | Description |
|--------|-------------|
| `createRouteTree(name, path, routes, options?)` | Builds immutable `RouteTree` from route definitions |
| `getSegmentsByName(tree, routeName)` | O(1)-per-level lookup of route nodes by dot-notation name |
| `routeTreeToDefinitions(tree)` | Converts `RouteTree` back to `RouteDefinition[]` (serialization/cloning) |
| `nodeToDefinition(node)` | Converts a single `RouteTree` node to `RouteDefinition` |
| `createMatcher(options?)` | Factory that creates a `SegmentMatcher` with search-params DI baked in |
| `DEFAULT_QUERY_PARAMS` | Default query string options (re-exported from `search-params`) |
| `validateRoute(route, method, ...)` | Batch route validation with cross-batch duplicate detection |

### Types

| Type | Description |
|------|-------------|
| `RouteTree` | Immutable tree node with `name`, `path`, `children`, `paramMeta` |
| `RouteDefinition` | Input format: `{ name, path, children? }` |
| `Matcher` | Opaque type (backed by `SegmentMatcher`) with `match()`, `buildPath()`, `hasRoute()` |
| `MatchResult` | Match output: `{ segments, params, meta }` |
| `RouteTreeState` / `RouteTreeStateMeta` | State types used by core |
| `BuildOptions` / `MatchOptions` | Options for path building and matching |
| `TrailingSlashMode` | `"default"` / `"always"` / `"never"` |
| `CreateMatcherOptions` / `QueryParamsConfig` | Matcher factory configuration |

## Gotchas

- **Immutable by default** -- `createRouteTree` calls `Object.freeze` on the tree; pass `{ skipFreeze: true }` only for mutation scenarios (e.g., `addRoute`)
- **`paramMeta` is frozen too (#747)** -- `processNode` freezes the nested `paramMeta` object and its `urlParams`/`queryParams`/`spatParams` arrays, not just the node. `constraintPatterns` is a `Map` — deliberately NOT frozen (`Object.freeze` can't lock Map entries; it's protected by the `ReadonlyMap` type). Don't "fix" that with a pointless `Object.freeze(map)` — it would imply a guarantee it can't provide (CC1 exception)
- **Dot-notation is internal** -- User-provided route names must NOT contain dots; dots are only used in computed `fullName` (e.g., `"users.profile"`)
- **`createMatcher` hides DI** -- It wires `search-params` parse/build into `SegmentMatcher` so consumers never import `search-params` directly
- **`validateRoute` is recursive** -- Validates children arrays; detects duplicates both in the existing tree AND within the current batch
- **`route-batch.ts` carries a `getTypeDescription` twin, hardened in lockstep (#903/#1052)** -- route-tree has no `type-guards` dependency, so `getTypeDescription` is duplicated here for `validateRoute`'s error messages. The `constructor`/`.name` read is wrapped in `try/catch` in both copies, so an adversarial throwing accessor — a `constructor`/`.name` getter that throws, an **inherited** throwing getter reached at the custom-prototype check (`:103`, *before* the own-key getter scan, which uses `Object.keys` and misses inherited getters), or a Proxy `[[Get]]` — yields the clean `must be a plain object` `TypeError`, not the getter's exception. Keep the two copies in sync
- **`validateRoutePath` rejects unbalanced constraint delimiters (#749)** -- a linear scan (`hasBalancedConstraints`) tracks open/close: a `<` opens a constraint, the first following `>` closes it, a `<` inside the body is allowed (`/:id<[a<b]>`). A stray `<` (`/:id<\d+`, `/:id<`) or `>` is rejected because it would otherwise pass validation but crash `buildPath` downstream with `Missing required param`. Deliberately a scan, not a `replaceAll(/<[^>]*>/, "")` strip — the strip is the classic incomplete-tag-sanitizer pattern (a CodeQL false positive here), and a scan makes "balance, not sanitization" explicit
- **`validateRoutePath` rejects fused mid-segment markers (#1050)** -- a second linear scan (`hasFusedMidSegmentMarker`) flags a `:`/`*` after a static prefix within a segment (`/a:b`, `/users/x:id`, `/a*b`): build/meta extract it as a param while the trie compiles the segment as a literal, so `buildPath` emits a URL its own `match` rejects. Runs after the name-less check (#863) on the query-stripped `pathPattern`; a marker that *starts* its segment — including a marker-led name containing `:`/`*` (`/:a:b` → param `a:b`) — is not flagged. Same scan-not-strip rationale as `hasBalancedConstraints`. path-matcher backstops it at `registerTree` (the sibling of #858/#863)
- **Dependencies** -- depends on `path-matcher` (segment trie) and `search-params` (query string serialization)

## File Map

```
src/builder/createRouteTree.ts  -- createRouteTree, createRouteTreeBuilder
src/builder/buildTree.ts        -- mutable tree construction from definitions
src/builder/computeCaches.ts    -- cache computation + Object.freeze
src/operations/query.ts         -- getSegmentsByName
src/operations/routeTreeToDefinitions.ts -- routeTreeToDefinitions, nodeToDefinition
src/createMatcher.ts            -- createMatcher factory (SegmentMatcher + search-params DI)
src/validation/route-batch.ts   -- validateRoute (batch validation with duplicate detection)
src/validation/routes.ts        -- validateRoutePath (path format validation)
src/types.ts                    -- central type re-export hub
src/index.ts                    -- public API re-exports
tests/functional/               -- unit tests
tests/property/                 -- property-based tests
tests/stress/                   -- scale/robustness guards (run via test:stress; NO heap tests — build/serialize discard trees → GC-masked. Targets: build/round-trip throughput, deep-nesting recursion cliff, validateRoute anti-quadratic dup detection. Thresholds mutationally calibrated; see file headers)
```
