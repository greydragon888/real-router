---
"@real-router/angular": minor
---

Add `RouteSelf` directive (`<ng-template routeSelf>`) for the parent-as-list pattern (#538)

`RouteSelf` is a structural directive (mirrors `RouteMatch`/`RouteNotFound`)
that marks an `ng-template` as the "self" slot for `<route-view>`. The
template is rendered when the active route name equals the parent
`<route-view>`'s `routeNode` input and no descendant `RouteMatch` is active.

```html
<route-view [routeNode]="'users'">
  <ng-template routeSelf>
    <users-list />
  </ng-template>
  <ng-template routeMatch="profile">
    <user-profile />
  </ng-template>
</route-view>
```

Priority: `RouteMatch` (descendant) → `RouteSelf` (active equals `routeNode`)
→ `RouteNotFound` (`UNKNOWN_ROUTE`). Multiple `RouteSelf` instances follow
first-wins (declaration order from `contentChildren`). Exported as `RouteSelf`
from `@real-router/angular`.
