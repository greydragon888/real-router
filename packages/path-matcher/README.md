# path-matcher

> Segment Trie URL matching and path building engine.

**Internal package** — consumed by `route-tree`. Not published to npm.

## Purpose

Low-level URL matching engine. Compiles route definitions into a Segment Trie for O(segments) URL matching with priority-based resolution (static > param > splat). Pre-compiles build templates for fast `buildPath()` without runtime regex.

## Consumer

- `route-tree` — wraps `SegmentMatcher` and provides higher-level API

## Public API

### `SegmentMatcher`

```typescript
const matcher = new SegmentMatcher({
  caseSensitive: true,        // default: true
  strictTrailingSlash: false, // default: false
  strictQueryParams: false,   // default: false
  urlParamsEncoding: "default",
});

matcher.registerTree(routeTreeRoot);

matcher.match("/users/123/edit");
// → { segments, params: { id: "123" }, meta }

matcher.buildPath("users.profile", { id: "123" });
// → "/users/123"

matcher.hasRoute("users.profile");  // true
matcher.getSegmentsByName("users"); // [usersNode]
```

### `buildParamMeta(path)`

Extracts parameter metadata from a raw route path string: URL params, query params, splat params, constraint patterns.

### `validateConstraints(params, constraintPatterns, path)`

Validates parameter values against constraint regex patterns. Throws on mismatch.

## Trie Structure

```typescript
interface SegmentNode {
  staticChildren: Record<string, SegmentNode>;  // exact segment match
  paramChild: SegmentNode | null;               // :param capture
  splatChild: SegmentNode | null;               // *splat capture
  route: CompiledRoute | null;                  // terminal route
  slashChildRoute: CompiledRoute | null;        // slash-child optimization
}
```

**Matching priority:** static children > param child > splat child.

## Key Design Decisions

- **Pre-compiled build templates** — `buildStaticParts` + `BuildParamSlot[]` avoid regex at call time
- **Static route cache** — `Map<normalizedPath, CompiledRoute>` for O(1) parameterless route lookup
- **`Object.create(null)` for trie nodes** — no prototype chain lookup
- **Fast encoding check** — regex test before encoding to skip no-op cases

## Dependencies

None (zero dependencies).

## License

[MIT](../../LICENSE)
