---
"@real-router/react": minor
---

Add `@real-router/react/ink` subpath export for Ink (terminal UI) (#493)

New third entry alongside `main` and `/legacy`, targeting React 19.2+ & Ink 7+. Ships all shared hooks plus two terminal-specific pieces:

- **`InkRouterProvider`** — wrapper around the shared `RouterProvider` that omits `announceNavigation` (no DOM, no aria-live).
- **`InkLink`** — focusable text link built on Ink's `useFocus` + `useInput`. Joins the focus ring (Tab to move, Enter to navigate). Props mirror `Link`: `routeName`, `routeParams`, `routeOptions`, `activeStrict`, `ignoreQueryParams`. DOM-only props (`className`, `target`, `onClick`) are replaced with terminal equivalents (`activeColor`, `focusColor`, `inverse`/`activeInverse`/`focusInverse`, `onSelect`).

```tsx
import { InkLink, InkRouterProvider, useRouteNode } from "@real-router/react/ink";

<InkRouterProvider router={router}>
  <InkLink routeName="home" focusColor="cyan" activeColor="green" autoFocus>
    Home
  </InkLink>
</InkRouterProvider>;
```

`ink` is added as an **optional** peer dependency (`peerDependenciesMeta.ink.optional = true`) — existing DOM consumers don't need to install it. The main and `/legacy` entries are unchanged.
