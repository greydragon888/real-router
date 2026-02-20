# route-tree

## 0.3.1

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/types@0.13.0

## 0.3.0

### Minor Changes

- Remove dot-notation support from route names (#93)
  - Ban dots in route `name` field (throws TypeError)
  - Remove `resolveParent()` from `buildTree.ts`
  - Remove `resolveByDotNotation()` and `checkParentExists()` from `route-batch.ts`
  - Simplify `buildTree()` from two-pass to single-pass algorithm
  - Update `FULL_ROUTE_PATTERN` regex to reject dots

## 0.2.0

### Minor Changes

- Remove dead code after rou3 migration:
  - Removed `parentSegments` field (now computed via parent chain traversal)
  - Removed `absoluteDescendants` field (unused after rou3 handles absolute routes)
  - Removed `staticChildrenByFirstSegment` index (rou3 radix tree handles matching)
  - Removed related compute functions: `computeParentSegments`, `collectAbsoluteDescendants`, `computeAbsoluteDescendants`, `extractFirstStaticSegment`, `computeStaticChildrenIndex`
  - Updated documentation to reflect rou3-based architecture

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - search-params@0.1.0
