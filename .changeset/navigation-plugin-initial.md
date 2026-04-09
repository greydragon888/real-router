---
"@real-router/navigation-plugin": minor
---

feat(navigation-plugin): Navigation API browser plugin

Drop-in replacement for `@real-router/browser-plugin` that uses the Navigation API instead of History API. Same compatible extensions (buildUrl, matchUrl, replaceHistoryState, start) plus exclusive route-level history extensions: peekBack, peekForward, hasVisited, getVisitedRoutes, getRouteVisitCount, traverseToLast, getNavigationMeta, canGoBack, canGoForward, canGoBackTo.

Ref: #293
