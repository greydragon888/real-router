# route-tree

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
