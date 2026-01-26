# @real-router/types

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

TypeScript type definitions for Real-Router ecosystem. Provides shared types used by all `@real-router/*` packages.

## Installation

This package is automatically installed as a dependency of `@real-router/core`. Direct installation is only needed for advanced use cases.

```bash
npm install @real-router/types
```

## Usage

```typescript
// Most users should import types from @real-router/core
import type { Router, State, Params } from "@real-router/core";

// Direct import is available for type-only scenarios
import type { State, Params, NavigationOptions } from "@real-router/types";
```

## Why This Package?

This package solves TypeScript type compatibility issues between `@real-router/*` packages:

- **Single source of truth** — all packages share identical type definitions
- **No type duplication** — types are not inlined into each package's `.d.ts`
- **Module augmentation works** — plugins can extend Router interface correctly

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React bindings
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser History API

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
