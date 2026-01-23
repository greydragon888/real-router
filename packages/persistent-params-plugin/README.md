# @real-router/persistent-params-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Automatically persists query parameters across all navigation transitions.

## Problem & Solution

```typescript
// Without plugin:
router.navigate("products", { lang: "en", theme: "dark" });
router.navigate("cart");
// URL: /cart  ← lang and theme are lost

// With plugin:
router.usePlugin(persistentParamsPluginFactory(["lang", "theme"]));
router.navigate("products", { lang: "en", theme: "dark" });
router.navigate("cart");
// URL: /cart?lang=en&theme=dark  ← automatically preserved
```

## Installation

```bash
npm install @real-router/persistent-params-plugin
# or
pnpm add @real-router/persistent-params-plugin
# or
yarn add @real-router/persistent-params-plugin
# or
bun add @real-router/persistent-params-plugin
```

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

const router = createRouter(routes);

// Option 1: Parameter names (values set on first use)
router.usePlugin(persistentParamsPluginFactory(["lang", "theme"]));

// Option 2: With default values
router.usePlugin(
  persistentParamsPluginFactory({
    lang: "en",
    theme: "light",
  }),
);

router.start();
```

---

## Configuration

| Config Type                 | Description                                 | Example             |
| --------------------------- | ------------------------------------------- | ------------------- |
| `string[]`                  | Parameter names, initial values `undefined` | `["lang", "theme"]` |
| `Record<string, primitive>` | Parameter names with defaults               | `{ lang: "en" }`    |

**Allowed value types:** `string`, `number`, `boolean`, `undefined` (to remove)

See [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#3-configuration-options) for details.

---

## Behavior

### Persistence

```typescript
router.navigate("page1", { lang: "en" }); // Saved: lang=en
router.navigate("page2"); // URL: /page2?lang=en
```

### Update

```typescript
router.navigate("page", { lang: "fr" }); // Updates saved value
```

### Remove

```typescript
router.navigate("page", { lang: undefined }); // Removes from persistent params
```

### Priority

Explicit values override saved ones:

```typescript
// Saved: lang=en
router.navigate("page", { lang: "de" }); // URL: /page?lang=de
```

See [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#8-behavior) for edge cases and guarantees.

---

## Usage Examples

### Multilingual App

```typescript
router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));

router.navigate("settings", { lang: "fr" });
router.navigate("products"); // ?lang=fr
router.navigate("cart"); // ?lang=fr
```

### UTM Tracking

```typescript
router.usePlugin(
  persistentParamsPluginFactory(["utm_source", "utm_medium", "utm_campaign"]),
);

// User arrives: /?utm_source=google&utm_medium=cpc
router.navigate("products"); // UTM params preserved
router.navigate("checkout"); // UTM params preserved
```

---

## Lifecycle

```typescript
const unsubscribe = router.usePlugin(persistentParamsPluginFactory(["mode"]));

// Later: restore original router behavior
unsubscribe();
```

**Note:** Double initialization throws an error. Call `unsubscribe()` first.

---

## Documentation

Full documentation on [Wiki](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin):

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#3-configuration-options)
- [Lifecycle Hooks](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#4-lifecycle-hooks)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#8-behavior)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/real-router-persistent-params-plugin#11-migration-from-router5)

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) — Browser history

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
