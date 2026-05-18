---
"@real-router/vue": minor
---

Add `<HttpStatusCode :code="N"/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` (#611)

Render-time HTTP status declaration for SSR. Vue-native idioms (`provide` / `inject` via `InjectionKey`). Sink writer fires in `setup()`, component renders nothing.

```vue-html
<HttpStatusProvider :sink="sink">
  <RouterProvider :router="router">
    <App />
  </RouterProvider>
</HttpStatusProvider>

<!-- inside NotFound.vue -->
<HttpStatusCode :code="404" />
```

```ts
const sink = createHttpStatusSink();
const html = await renderToString(createSSRApp(App));
response.status(sink.code ?? 200).send(html);
```
