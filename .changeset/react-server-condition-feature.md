---
"@real-router/react": patch
---

Add `react-server` export condition for RSC bundler compatibility (#574)

Adds a thin type-only re-export entry resolved under the `react-server` export condition. RSC bundlers (`@vitejs/plugin-rsc`, `react-server-dom-{webpack,turbopack,parcel}`) now resolve `@real-router/react` imports to a server-safe subset when bundling Server Component code, preventing accidental inclusion of client-only hooks/components/`RouterProvider` in server bundles.

The exposed surface is intentionally type-only — all hooks, components, and `RouterProvider` remain client-exclusive. Future server-safe utilities (pure functions without React state) can be added without breaking the contract.

Per-request RSC data loading is handled by [`@real-router/rsc-server-plugin`](https://www.npmjs.com/package/@real-router/rsc-server-plugin), not this entry. Mirrors the thin re-export pattern from [TanStack Router PR #7183](https://github.com/TanStack/router/pull/7183) and `react-router@7.x`.

```tsx
// In a Server Component file (resolved under `react-server` condition):
import type { Navigator, LinkProps } from "@real-router/react";
// → resolves to server-safe types only, no runtime client code
```

Additive change, no breaking. See [RSC Integration wiki guide](https://github.com/greydragon888/real-router/wiki/RSC-Integration).
