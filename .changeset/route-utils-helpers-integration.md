---
"@real-router/route-utils": minor
---

Integrate `@real-router/helpers` into `@real-router/route-utils` (#214)

`@real-router/helpers` is removed. All its functionality is now available in `@real-router/route-utils`.

**Standalone functions** (same API as the former `@real-router/helpers`):

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

**Migration:**

```diff
- import { startsWithSegment, areRoutesRelated } from "@real-router/helpers";
+ import { startsWithSegment, areRoutesRelated } from "@real-router/route-utils";
```