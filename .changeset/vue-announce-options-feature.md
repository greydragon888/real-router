---
"@real-router/vue": minor
---

Expose announcer options on `RouterProvider`'s `announceNavigation` prop (#1065)

`announceNavigation` now accepts `boolean | RouteAnnouncerOptions`. Pass an
object — `{ prefix?, getAnnouncementText? }` — to customize the screen-reader
announcement text; the callback falls back to the default `h1 → title →
route-name` chain when it returns an empty string or throws. `true` keeps the
previous default behavior, so the change is fully backward compatible. Mirrors
the same addition on `@real-router/react` and `@real-router/preact`.

```ts
h(
  RouterProvider,
  {
    router,
    announceNavigation: {
      getAnnouncementText: (route) => `Now on ${route.name}`,
    },
  },
  { default: () => h(App) },
);
```
