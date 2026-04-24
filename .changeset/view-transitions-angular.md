---
"@real-router/angular": minor
---

Add `viewTransitions` option to `provideRealRouter()` for View Transitions API integration (#498)

Opt in with `provideRealRouter(router, { viewTransitions: true })` to animate route transitions via the browser's View Transitions API. The option is a boolean — utility is either enabled or no-op (SSR, Firefox without VT support).

```ts
import { provideRealRouter } from "@real-router/angular";

bootstrapApplication(AppComponent, {
  providers: [
    provideRealRouter(router, { viewTransitions: true }),
  ],
});
```

Customization is pure CSS via `::view-transition-*` pseudo-elements and `view-transition-name`. See the [View Transitions wiki page](https://github.com/greydragon888/real-router/wiki/View-Transitions) for patterns (hero morph, per-area transitions, direction-aware animations).

Teardown is wired through `DestroyRef` — same architectural pattern as the existing `scrollRestoration` option (#497).
