---
"@real-router/react": minor
---

Expose announcer options on `RouterProvider`'s `announceNavigation` prop (#1065)

`announceNavigation` now accepts `boolean | RouteAnnouncerOptions`. Pass an
object — `{ prefix?, getAnnouncementText? }` — to customize the screen-reader
announcement text; the callback falls back to the default `h1 → title →
route-name` chain when it returns an empty string or throws. `true` keeps the
previous default behavior, so the change is fully backward compatible.

```tsx
<RouterProvider
  router={router}
  announceNavigation={{ getAnnouncementText: (route) => `Now on ${route.name}` }}
>
  <App />
</RouterProvider>
```
