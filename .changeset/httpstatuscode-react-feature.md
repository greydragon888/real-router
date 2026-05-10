---
"@real-router/react": minor
---

Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` (#610)

Render-time HTTP status declaration for SSR. Mount inside a route component (typical use case: a glob `*` route's NotFound page) when the status is decided by the rendered tree rather than a loader. Server reads `sink.code` after `renderToString` / `renderToReadableStream` and applies it to the HTTP response.

Exports from `@real-router/react/ssr` (and `@real-router/react/legacy/ssr`):

- `<HttpStatusCode code={404}/>` — writes `code` to the nearest sink during render, returns `null`. Last write wins.
- `<HttpStatusProvider sink={...}>` — provides the sink via context.
- `createHttpStatusSink(): HttpStatusSink` — factory; sink is `{ code: number | undefined }`.
- Type-only exports under the `react-server` condition.

```tsx
// entry-server.tsx
import { renderToString } from "react-dom/server";
import { createHttpStatusSink, HttpStatusProvider } from "@real-router/react/ssr";

const sink = createHttpStatusSink();
const html = renderToString(
  <HttpStatusProvider sink={sink}>
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  </HttpStatusProvider>,
);
response.status(sink.code ?? 200).send(html);
```

No-op on the client when no provider is mounted — the same component tree hydrates without touching the DOM. Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep working as before; this component covers render-time decisions only.
