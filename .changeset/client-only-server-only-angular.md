---
"@real-router/angular": minor
---

Add `<client-only>` and `<server-only>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries.
Built on `signal()` + `afterNextRender` — `afterNextRender` is a no-op on
the server, so SSR emits the SSR-side branch (fallback for `<client-only>`,
projected children for `<server-only>`). After the first browser render the
signal flips and the `@if` branch swaps. `fallback` is a `TemplateRef`
input rendered through `<ng-container [ngTemplateOutlet]>`.

```html
<ng-template #loadingTpl>
  <span>Loading…</span>
</ng-template>

<client-only [fallback]="loadingTpl">
  <browser-api-widget />
</client-only>

<server-only>
  <seo-help-strip />
</server-only>
```
