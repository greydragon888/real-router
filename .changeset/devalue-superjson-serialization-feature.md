---
"@real-router/core": minor
---

Add `serialize` / `deserialize` options to SSR helpers for non-JSON types (#606)

`serializeState`, `serializeRouterState`, and `hydrateRouter` now accept an
optional user-supplied serializer pair. The defaults remain `JSON.stringify`
and `JSON.parse` — pass `devalue.stringify` / `devalue.parse` (or
`superjson.stringify` / `superjson.parse`) to round-trip non-JSON types
(`Date` / `Map` / `Set` / `RegExp` / `BigInt`) through SSR transport.

The custom serializer's output is still XSS-escaped (`<` / `>` / `&` →
`<` / `>` / `&`) before embedding into the inline `<script>`
tag — XSS safety remains a property of `serializeState`, independent of
which serializer produced the JSON.

`devalue` and `superjson` are not bundled — install whichever you prefer as
a peer dependency.

```typescript
// Server
import * as devalue from "devalue";
import { serializeRouterState } from "@real-router/core/utils";

const json = serializeRouterState(state, { serialize: devalue.stringify });
const html = `<script>window.__SSR_STATE__=${json}</script>`;

// Client
import { hydrateRouter } from "@real-router/core/utils";

await hydrateRouter(router, window.__SSR_STATE__, {
  deserialize: devalue.parse,
});
```

New types exported from `@real-router/core/utils`:

- `Serialize` — `(data: unknown) => string`
- `Deserialize` — `(json: string) => unknown`
- `SerializeStateOptions` — `{ serialize?: Serialize }`
- `HydrateRouterOptions` — `{ deserialize?: Deserialize }`

`SerializeRouterStateOptions` gains an optional `serialize` field alongside
the existing `excludeContext`. Both are non-breaking — existing call sites
without options continue to use `JSON.stringify` / `JSON.parse` unchanged.
