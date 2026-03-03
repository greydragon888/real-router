---
"@real-router/route-utils": minor
---

Integrate `@real-router/helpers` into `@real-router/route-utils` (#214)

Segment testing functions and route relation check are now available as both standalone exports
and static methods on `RouteUtils`:

**Standalone functions** (same API as `@real-router/helpers`):

- `startsWithSegment(route, segment?)` — prefix match with currying support
- `endsWithSegment(route, segment?)` — suffix match with currying support
- `includesSegment(route, segment?)` — anywhere match with currying support
- `areRoutesRelated(route1, route2)` — hierarchy check (same, parent-child, or child-parent)

**Static facade on `RouteUtils`**:

- `RouteUtils.startsWithSegment`
- `RouteUtils.endsWithSegment`
- `RouteUtils.includesSegment`
- `RouteUtils.areRoutesRelated`

Also exports `SegmentTestFunction` type.
