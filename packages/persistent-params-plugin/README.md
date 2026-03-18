# @real-router/persistent-params-plugin

[![npm](https://img.shields.io/npm/v/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/persistent-params-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/persistent-params-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Automatically persist query parameters across all navigation transitions in [Real-Router](https://github.com/greydragon888/real-router).

```typescript
// Without plugin:
router.navigate("products", { lang: "en", theme: "dark" });
router.navigate("cart");
// URL: /cart  — lang and theme are lost

// With plugin:
router.usePlugin(persistentParamsPluginFactory(["lang", "theme"]));
router.navigate("products", { lang: "en", theme: "dark" });
router.navigate("cart");
// URL: /cart?lang=en&theme=dark  — automatically preserved
```

## Installation

```bash
npm install @real-router/persistent-params-plugin
```

**Peer dependency:** `@real-router/core`

## Quick Start

```typescript
import { createRouter } from "@real-router/core";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

const router = createRouter(routes);

// Array — values set on first navigation
router.usePlugin(persistentParamsPluginFactory(["lang", "theme"]));

// Object — with default values
router.usePlugin(persistentParamsPluginFactory({ lang: "en", theme: "light" }));
```

## Configuration

| Config Type | Description | Example |
|-------------|-------------|---------|
| `string[]` | Parameter names, initial values `undefined` | `["lang", "theme"]` |
| `Record<string, primitive>` | Parameter names with defaults | `{ lang: "en" }` |

**Allowed value types:** `string`, `number`, `boolean`, `undefined` (to remove a param).

## Behavior

```typescript
// Persist — saved on first navigation
router.navigate("page1", { lang: "en" });     // saved: lang=en

// Carry — auto-injected into subsequent navigations
router.navigate("page2");                      // URL: /page2?lang=en

// Update — explicit values override saved ones
router.navigate("page3", { lang: "fr" });      // URL: /page3?lang=fr, saved: lang=fr

// Remove — pass undefined to stop persisting
router.navigate("page4", { lang: undefined }); // lang removed permanently
```

> **Note:** Removal is permanent for the plugin lifetime. Once `undefined` is passed, the param is no longer tracked — even if passed again in a later navigation.

## Use Cases

### Multilingual App

```typescript
router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));

router.navigate("settings", { lang: "fr" });
router.navigate("products");   // ?lang=fr
router.navigate("cart");        // ?lang=fr
```

### UTM Tracking

```typescript
router.usePlugin(
  persistentParamsPluginFactory(["utm_source", "utm_medium", "utm_campaign"]),
);

// User arrives: /?utm_source=google&utm_medium=cpc
router.navigate("products");    // UTM params preserved
router.navigate("checkout");    // UTM params preserved
```

### Cleanup

```typescript
const unsubscribe = router.usePlugin(persistentParamsPluginFactory(["mode"]));

// Later — restore original router behavior
unsubscribe();
```

## Documentation

Full documentation: [Wiki — persistent-params-plugin](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin)

- [Configuration Options](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin#3-configuration-options)
- [Behavior & Edge Cases](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin#8-behavior)
- [Migration from router5](https://github.com/greydragon888/real-router/wiki/persistent-params-plugin#11-migration-from-router5)

## Related Packages

| Package | Description |
|---------|-------------|
| [@real-router/core](https://www.npmjs.com/package/@real-router/core) | Core router (required peer dependency) |
| [@real-router/browser-plugin](https://www.npmjs.com/package/@real-router/browser-plugin) | Browser History API integration |

## Contributing

See [contributing guidelines](../../CONTRIBUTING.md) for development setup and PR process.

## License

[MIT](../../LICENSE) © [Oleg Ivanov](https://github.com/greydragon888)
