---
"@real-router/angular": minor
---

Expose announcer options on the `<navigation-announcer>` component (#1065)

`<navigation-announcer>` now accepts optional `prefix` and `getAnnouncementText`
signal inputs — `[prefix]="'Page: '"` and `[getAnnouncementText]="fn"` — to
customize the screen-reader announcement text, matching the `announceNavigation`
options on the react/preact/vue/solid/svelte adapters. `getAnnouncementText`
falls back to the default `h1 → title → route-name` chain when it returns an
empty string or throws. Without either input the announcer keeps speaking the
default `"Navigated to <route.name>"`, so the change is fully backward
compatible. Options are read once in `ngOnInit` (after the input bindings fire),
mirroring the SSR `<http-status-code>` component.

```html
<navigation-announcer [prefix]="'Page: '" [getAnnouncementText]="announce" />
```
