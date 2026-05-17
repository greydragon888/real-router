---
"@real-router/react": minor
---

`/ssr` and `/legacy/ssr` subpath split for SSR-feature exports (#609)

All SSR-aware components and hooks have moved out of the main entry into a
dedicated `/ssr` subpath:

| Was | Now |
|---|---|
| `import { ClientOnly } from "@real-router/react"` | `import { ClientOnly } from "@real-router/react/ssr"` |
| `import { ServerOnly } from "@real-router/react"` | `import { ServerOnly } from "@real-router/react/ssr"` |
| `import { Await } from "@real-router/react"` | `import { Await } from "@real-router/react/ssr"` |
| `import { Streamed } from "@real-router/react"` | `import { Streamed } from "@real-router/react/ssr"` |
| `import { useDeferred } from "@real-router/react"` | `import { useDeferred } from "@real-router/react/ssr"` |

For React 18 (`/legacy`) consumers, the corresponding subset lives at
`@real-router/react/legacy/ssr` (omits `<Await>` since it depends on React
19's `use(promise)`).

**Why split now**: the `<ClientOnly>`/`<ServerOnly>` pair (#604) plus the
`defer()` consumer trio (`<Await>`, `<Streamed>`, `useDeferred`) reaches the
≥3 SSR-feature-component threshold defined in `.claude/SSR_FEATURE_GAPS_RU.md`
§8. Splitting in this PR avoids a future double migration when the same
work lands across the remaining 5 adapters (#611, Stage 2).

**Why this matters**:

- **Type isolation** — server-only prop types (`AwaitProps`, `StreamedProps`,
  etc.) no longer leak into the client TypeScript context for app code that
  doesn't touch SSR.
- **DX clarity** — `import {…} from '@real-router/react/ssr'` self-documents
  the SSR-pipeline intent.
- **`react-server` condition** — the `/ssr` subpath has its own type-only
  RSC entry, so Server Components can import the prop types without pulling
  client-only runtime into their bundle.
- **Future-proofing** — server-render utilities (`<HttpStatusCode>`, etc.)
  slot into `/ssr` without re-shaping the main entry.

**Breaking change** (pre-1.0, allowed in `minor` per `.changeset/README.md`):
re-import the five exports from `/ssr` (or `/legacy/ssr` for React 18).
Bundle cost is ≈ 0 thanks to `"sideEffects": false` + tree-shaking — the
split is about API surface design, not bytes.
