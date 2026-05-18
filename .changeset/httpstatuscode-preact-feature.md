---
"@real-router/preact": minor
---

Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` (#611)

Render-time HTTP status declaration for SSR. Mirror of `@real-router/react/ssr`. Mount inside a route component (typical use case: a glob `*` route's NotFound page) when the status is decided by the rendered tree rather than a loader.

```tsx
import { renderToString } from "preact-render-to-string";
import { createHttpStatusSink, HttpStatusProvider } from "@real-router/preact/ssr";

const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <App />
  </HttpStatusProvider>,
);
response.status(sink.code ?? 200).send(html);
```
