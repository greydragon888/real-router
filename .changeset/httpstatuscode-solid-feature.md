---
"@real-router/solid": minor
---

Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` (#611)

Render-time HTTP status declaration for SSR. Mirror of `@real-router/react/ssr`, Solid-native idioms (`createContext` + `useContext`).

```tsx
import { renderToString } from "solid-js/web";
import { createHttpStatusSink, HttpStatusProvider } from "@real-router/solid/ssr";

const sink = createHttpStatusSink();
const html = renderToString(() => (
  <HttpStatusProvider sink={sink}>
    <App />
  </HttpStatusProvider>
));
response.status(sink.code ?? 200).send(html);
```
