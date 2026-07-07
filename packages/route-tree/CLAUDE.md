# route-tree

Internal package that builds an immutable routing tree from route definitions, provides URL matching via `createMatcher`, and supports tree queries and validation. Not published to npm — consumed **only** by `@real-router/core`, the sole consumer of the routing engine. `@real-router/validation-plugin` reaches `validateRoute` through core's `@real-router/core/validation` subpath (segment lookup / existence via the matcher), never importing this package directly (#1301, enforced by a plugin-level guard test).

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
| `CreateMatcherOptions` / `QueryParamsConfig` | Matcher factory configuration |

## Gotchas

- **Immutable, always** -- `createRouteTree` always `Object.freeze`s the tree (no opt-out; the former `skipFreeze` `TreeBuildOptions` — and the standalone `createRouteTreeBuilder` — were removed in #1302 as core-unreachable API). `addRoute` rebuilds the whole tree via `createRouteTree`.
- **`paramMeta` is frozen too (#747)** -- `processNode` freezes the nested `paramMeta` object and its `urlParams`/`queryParams`/`spatParams` arrays, not just the node. `constraintPatterns` is a `Map` — deliberately NOT frozen (`Object.freeze` can't lock Map entries; it's protected by the `ReadonlyMap` type). Don't "fix" that with a pointless `Object.freeze(map)` — it would imply a guarantee it can't provide (CC1 exception)
- **Dot-notation is internal** -- User-provided route names must NOT contain dots; dots are only used in computed `fullName` (e.g., `"users.profile"`)
- **`createMatcher` hides DI** -- It wires `search-params` parse/build into `SegmentMatcher` so consumers never import `search-params` directly
- **`validateRoute` is recursive** -- Validates children arrays; detects duplicates both in the existing tree AND within the current batch
- **`route-batch.ts` carries a `getTypeDescription` twin, hardened in lockstep (#903/#1052)** -- route-tree has no `type-guards` dependency, so `getTypeDescription` is duplicated here for `validateRoute`'s error messages. The `constructor`/`.name` read is wrapped in `try/catch` in both copies, so an adversarial throwing accessor — a `constructor`/`.name` getter that throws, an **inherited** throwing getter reached at the custom-prototype check (`:103`, *before* the own-key getter scan, which uses `Object.keys` and misses inherited getters), or a Proxy `[[Get]]` — yields the clean `must be a plain object` `TypeError`, not the getter's exception. Keep the two copies in sync
- **`validateRoutePath` rejects unbalanced and empty constraint delimiters (#749/#804)** -- `isConstraintBalanced` (imported from `path-matcher` — the single balance predicate, #804, replacing the former local `hasBalancedConstraints` scan) tracks open/close: a `<` opens a constraint, the first following `>` closes it, a `<` inside the body is allowed (`/:id<[a<b]>`). A stray `<` (`/:id<\d+`, `/:id<`) or `>` is rejected because it would otherwise pass validation but crash `buildPath` downstream with `Missing required param`. An empty `<>` — balanced, but compiles to a never-matching `^()$` — is rejected too (#804). Deliberately a scan, not a `replaceAll(new RegExp(...), "")` strip (the strip is the classic incomplete-tag-sanitizer pattern, a CodeQL false positive here). path-matcher backstops both at `registerTree`; this gate adds the route-contextual message
- **`validateRoutePath` rejects fused mid-segment markers (#1050)** -- a second linear scan (`hasFusedMidSegmentMarker`) flags a `:`/`*` after a static prefix within a segment (`/a:b`, `/users/x:id`, `/a*b`): build/meta extract it as a param while the trie compiles the segment as a literal, so `buildPath` emits a URL its own `match` rejects. Runs after the name-less check (#863) on the query-stripped `pathPattern`; a marker that *starts* its segment — including a marker-led name containing `:`/`*` (`/:a:b` → param `a:b`) — is not flagged. Same scan-not-strip rationale as `isConstraintBalanced`. path-matcher backstops it at `registerTree` (the sibling of #858/#863)
- **`validateRoutePath` rejects optional splats (#1149)** -- a third check (`OPTIONAL_SPLAT_RGX` = `/\*[^/?]*\?/`) on the query-stripped `pathPattern` flags `*name?`: build treats it as a multi-segment splat while the trie's optional fork compiles a single-segment plain param, so `buildPath` emits a URL its own `match` rejects. Tested on `pathPattern`, so a required splat followed by a query (`*path?download`) is NOT flagged — a splat name cannot contain `?` (`PARAM_NAME_PATTERN` excludes it), so the `?` after the name is unambiguously the optional marker. path-matcher backstops it at `registerTree`; this gate adds the route-contextual message. Product decision: reject (the shape only ever matched 0–1 segments). Sibling of the fused (#1050) rejection
- **`validateRoutePath` rejects an unconstrained optional before a splat (#1264)** -- a fourth scan (`hasUnconstrainedOptionalBeforeSplat`) on the query-stripped `pathPattern` flags an optional `?` whose preceding char is NOT `>` (unconstrained — a constrained optional ends `<…>?`) and which is immediately followed by `/*`. `/:v?/*rest` has no validity signal to disambiguate take-the-optional from let-the-splat-capture, so support would silently reshape every multi-segment value. A char-scan, not split/regex — constraints may contain `/` (`<[^/]+>`). A CONSTRAINED optional→splat (`/:v<c>?/*rest`) IS supported (path-matcher's try-take-if-valid, #1264 A1); an opt→param (`/:a?/:b`, A2) or opt→static is unaffected. path-matcher backstops it at `registerTree`; this gate adds the route-contextual message. Product decision: reject with a hint to add a constraint. Sibling of the optional-splat (#1149) rejection
- **`validateRoutePath` rejects static text fused to a constraint (#1150)** -- `hasFusedConstraintSuffix` (**imported from path-matcher — single-sourced in `constraint-grammar.ts`**, shared with the `registerTree` backstop, #1320; run after the balance check, so every `>` is a constraint closer) flags a `>` not followed by `/`, `?`, or end-of-input — `/:year<\d+>-archive`, `/:id<\d+>.html`. build re-extracts the name greedily and fuses the suffix (name `year-archive`) while meta ends at `<` (name `year`), compiling to a silent dead route. The mirror of the fused-marker (#1050) rejection on the OTHER side of the param; path-matcher backstops at `registerTree`. A char-scan (constraints may contain `/`)
- **`validateRoutePath` rejects a constraint in a static segment (#1311)** -- `hasConstraintInStaticSegment` (imported from path-matcher — single-sourced in `constraint-grammar.ts` alongside `isConstraintBalanced`, so the gate and the `registerTree` backstop can't drift) flags a `<...>` constraint filling a STATIC segment (no `:`/`*` marker) — `/foo<bar>`, `/a<b>` — which path-matcher's marker-agnostic `CONSTRAINT_PATTERN_RGX` silently strips to `/foo` / `/a`, reshaping the route. A char-scan (constraints may contain `/`), run after the fused-suffix check: #1150 catches only a constraint fused with TRAILING text; one cleanly ending a static segment slips through (the residual of #1242 §5.5). A PARAM constraint (`/:id<\d+>`) is unaffected; path-matcher backstops at `registerTree`. The sibling of #1050/#1150
- **`validateRoutePath` rejects a duplicate param name (#1151)** -- `validateUniqueParamNames` flags a name repeated within one route's own path (`/:id/:id`, a param+splat clash `/:x/*x`) — `buildParamMeta.urlParams` lists every path-binding name (params AND splats) in order, keeping duplicates, so a single pass catches both. The trie binds the duplicates at different positions under one name, so match's later capture overwrites the earlier and `rewritePathOnMatch` rewrites the user's URL. path-matcher's `registerTree` backstop additionally catches CROSS-level dups (a parent's param reused by a child), which this per-path gate cannot see
- **`validateRoutePath` rejects a non-ASCII static segment (#1154)** -- `hasNonAsciiStatic` flags a code point ≥ U+0080 in a STATIC segment (`/café`, `/меню`): match rejects non-ASCII input and compares static keys raw, so the route registers but never matches. A marker- and constraint-aware char-scan — a non-ASCII PARAM name (`:café`) or constraint body (`:id<[а-я]+>`, matched against the *decoded* value) is skipped, so only static text is flagged. The percent-encoded form (`/caf%C3%A9`) already works. path-matcher backstops at `registerTree`
- **`validateRoutePath` rejects a malformed query-param declaration (#1242 §5.1/§5.3)** -- `validateQueryParamDeclarations` (over `buildParamMeta`'s `urlParams` + `queryParams`) flags a query-param name containing `<`/`>` (a constraint leaked in via a reverse-order modifier typo, `/a/:b?<\d+>` — the `?` parses as the query start) or one colliding with a path-param name (`/a/:tab?tab`, where `buildPath` emits the value twice). A `=` in a declaration (`?name=value`, §5.2) is deliberately NOT flagged — bare core tolerates it. path-matcher backstops at `registerTree`. The `#1242` §5.4 slash-child reject (an index under a parent with an optional param in ANY position — extended from last-segment-only to mid-path in #1294 — or a splat) is matcher-level only (a trie-terminal-shape concern this per-path gate can't see, like #1153)
- **Dependencies** -- depends on `path-matcher` (segment trie) and `search-params` (query string serialization)

## File Map

```
src/builder/createRouteTree.ts  -- createRouteTree
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
