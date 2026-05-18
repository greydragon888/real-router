---
"@real-router/angular": minor
---

Add `<http-status-code [code]="N"/>` + `provideHttpStatusSink()` + `createHttpStatusSink()` to `/ssr` (#611)

Render-time HTTP status declaration for SSR. Angular 21 idioms — DI token `HTTP_STATUS_SINK` provided via `provideHttpStatusSink(sink)` env-providers helper, optional `inject(HTTP_STATUS_SINK, { optional: true })` in the component. The sink write happens in `ngOnInit` (after the input binding is bound), template renders nothing.

```ts
// entry-server.ts
import { bootstrapApplication } from "@angular/platform-browser";
import {
  createHttpStatusSink,
  provideHttpStatusSink,
} from "@real-router/angular/ssr";

const sink = createHttpStatusSink();
await bootstrapApplication(AppRoot, {
  providers: [
    provideRealRouterFactory({ ... }),
    provideHttpStatusSink(sink),
  ],
});
response.status(sink.code ?? 200).send(html);
```

```html
<!-- inside not-found.component.ts template -->
<http-status-code [code]="404" />
```

`code` is declared as optional `input<number>()` rather than `input.required<number>()` to keep the JIT/TestBed test path safe (`NG0950` would fire otherwise) — the `ngOnInit` body skips the write when the value is `undefined`.
