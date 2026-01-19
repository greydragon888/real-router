# router6-plugin-persistent-params

[![npm version](https://badge.fury.io/js/router6-plugin-persistent-params.svg)](https://www.npmjs.com/package/router6-plugin-persistent-params)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A router6 plugin that automatically persists and applies specified query parameters across all navigation transitions.

## Problem

In SPA applications, certain query parameters should persist between routes:

```typescript
// Without plugin:
router.navigate("products", { id: "1", lang: "en", theme: "dark" });
// URL: /products/1?lang=en&theme=dark

router.navigate("cart", { id: "2" });
// URL: /cart/2  ← lang and theme are lost
```

## Solution

```typescript
router.usePlugin(persistentParamsPlugin(["lang", "theme"]));

router.navigate("products", { id: "1", lang: "en", theme: "dark" });
// URL: /products/1?lang=en&theme=dark

router.navigate("cart", { id: "2" });
// URL: /cart/2?lang=en&theme=dark  ← automatically added
```

## Installation

```bash
# npm
npm install real-router-plugin-persistent-params

# yarn
yarn add real-router-plugin-persistent-params

# pnpm
pnpm add real-router-plugin-persistent-params

# bun
bun add real-router-plugin-persistent-params
```

## Quick Start

```typescript
import { createRouter } from "real-router";
import persistentParamsPlugin from "real-router-plugin-persistent-params";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "products", path: "/products/:id" },
  { name: "cart", path: "/cart" },
]);

// Option 1: Specify parameter names
router.usePlugin(persistentParamsPlugin(["lang", "theme"]));

// Option 2: Specify default values
router.usePlugin(
  persistentParamsPlugin({
    lang: "en",
    theme: "light",
  }),
);

router.start();
```

## API

### `persistentParamsPlugin(config)`

#### Parameters

**`config`**: `string[] | Record<string, string | number | boolean>`

- **Array of strings**: parameter names to persist (initial values are `undefined`)
- **Object**: parameter names with default values

#### Returns

`PluginFactory` — plugin factory for `router.usePlugin()`

#### Throws

- `TypeError`: invalid configuration (not an array of strings or object with primitives)
- `Error`: plugin already initialized on this router

### Configuration

#### Array of Parameters

```typescript
persistentParamsPlugin(["mode", "debug", "apiUrl"]);
```

Parameters are saved after first use:

```typescript
router.navigate("route1", { mode: "dev" });
// Saved: mode=dev

router.navigate("route2", {});
// URL includes: ?mode=dev
```

#### Object with Defaults

```typescript
persistentParamsPlugin({
  mode: "prod",
  lang: "en",
  debug: false,
});
```

Default values are applied immediately:

```typescript
router.start();
router.navigate("route1", {});
// URL: /route1?mode=prod&lang=en&debug=false
```

#### Empty Configuration

```typescript
// Valid but does nothing
persistentParamsPlugin([]);
persistentParamsPlugin({});
```

## Behavior

### Parameter Persistence

Parameters are automatically added to all transitions:

```typescript
router.usePlugin(persistentParamsPlugin(["lang"]));

router.navigate("products", { id: "1", lang: "en" });
// Saved: lang=en

router.navigate("cart", { id: "2" });
// URL: /cart/2?lang=en

router.navigate("checkout", {});
// URL: /checkout?lang=en
```

### Updating Values

New value overwrites the saved one:

```typescript
router.navigate("route1", { mode: "dev" });
// Saved: mode=dev

router.navigate("route2", { mode: "prod" });
// Saved: mode=prod (updated)

router.navigate("route3", {});
// URL: /route3?mode=prod
```

### Removing Parameters

Explicitly passing `undefined` removes the parameter:

```typescript
router.navigate("route1", { mode: "dev", lang: "en" });
// Saved: mode=dev, lang=en

router.navigate("route2", { lang: undefined });
// Saved: mode=dev (lang removed)

router.navigate("route3", {});
// URL: /route3?mode=dev
```

### Value Priority

Explicitly passed value takes precedence:

```typescript
// Saved: mode=dev
router.navigate("route", { mode: "test" });
// URL: /route?mode=test (explicit value used)
```

### Non-Tracked Parameters

Parameters outside configuration are not saved:

```typescript
router.usePlugin(persistentParamsPlugin(["mode"]));

router.navigate("route1", { mode: "dev", temp: "value" });
// Saved: mode=dev
// temp is ignored

router.navigate("route2", {});
// URL: /route2?mode=dev (temp absent)
```

### Extraction from URL

Parameters are extracted from initial URL:

```typescript
router.usePlugin(persistentParamsPlugin(["lang", "theme"]));
router.start("/products/1?lang=fr&theme=dark");
// Saved: lang=fr, theme=dark

router.navigate("cart", {});
// URL: /cart?lang=fr&theme=dark
```

## Integration with Router API

The plugin intercepts three router methods:

### `router.buildPath()`

```typescript
router.usePlugin(persistentParamsPlugin({ mode: "dev" }));

router.buildPath("products", { id: "1" });
// Returns: '/products/1?mode=dev'

router.buildPath("products", { id: "1", mode: "test" });
// Returns: '/products/1?mode=test' (explicit value)
```

### `router.buildState()`

```typescript
router.usePlugin(persistentParamsPlugin({ mode: "dev" }));

router.buildState("products", { id: "1" });
// state.params: { id: '1', mode: 'dev' }
```

### `router.navigate()`

Supports all overloads:

```typescript
router.navigate("home");
router.navigate("home", callback);
router.navigate("home", { id: "1" });
router.navigate("home", { id: "1" }, callback);
router.navigate("home", { id: "1" }, { replace: true });
router.navigate("home", { id: "1" }, { replace: true }, callback);
```

In all cases, persistent parameters are applied automatically.

### URL Query String

Persistent parameters are automatically included in query strings:

```typescript
router.usePlugin(persistentParamsPlugin(["mode", "lang"]));

router.navigate("products", { id: "1", mode: "dev" });
// URL: /products/1?mode=dev

router.navigate("cart", { id: "2" });
// URL: /cart/2?mode=dev (persisted)
```

## Type Validation

### Allowed Types

Only primitives: `string`, `number`, `boolean`:

```typescript
// ✅ Valid
router.navigate("route", { mode: "dev" }); // string
router.navigate("route", { page: 42 }); // number
router.navigate("route", { debug: true }); // boolean
router.navigate("route", { mode: undefined }); // removal
```

### Forbidden Types

```typescript
// ❌ TypeError
router.navigate("route", { data: { nested: 1 } }); // object
router.navigate("route", { items: [1, 2, 3] }); // array
router.navigate("route", { fn: () => {} }); // function
router.navigate("route", { date: new Date() }); // Date
router.navigate("route", { mode: null }); // null
```

Reason: only primitives can be serialized in URL query string.

### Parameter Name Validation

Parameter names must not contain special characters that could cause URL confusion:

```typescript
// ✅ Valid parameter names
persistentParamsPlugin(["mode", "lang", "user_id", "api-key"]);

// ❌ Invalid parameter names (TypeError)
persistentParamsPlugin(["mode=dev"]); // contains =
persistentParamsPlugin(["param&other"]); // contains &
persistentParamsPlugin(["query?"]); // contains ?
persistentParamsPlugin(["hash#"]); // contains #
persistentParamsPlugin(["encoded%20"]); // contains %
persistentParamsPlugin(["path/to"]); // contains /
persistentParamsPlugin(["back\\slash"]); // contains \
persistentParamsPlugin(["with space"]); // contains whitespace
```

**Forbidden characters**: `=`, `&`, `?`, `#`, `%`, `/`, `\`, and whitespace (space, tab, newline, carriage return)

**Why**: These characters have special meaning in URLs and would cause parsing issues or confusion.

## Security

### Prototype Pollution Protection

```typescript
const malicious = Object.create({ __proto__: { isAdmin: true } });
malicious.mode = "dev";

router.navigate("route", malicious);
// Result: only mode=dev (inherited properties ignored)

// Global prototype not polluted
({}).isAdmin === undefined; // true
```

### Constructor Pollution Protection

```typescript
router.navigate("route", {
  constructor: { prototype: { polluted: true } },
});
// TypeError: Parameter "constructor" must be a primitive value
```

### Safe State Management

The plugin safely manages persistent parameters to prevent accidental mutations and ensure consistent behavior across navigation.

## Lifecycle

### Initialization

```typescript
const unsubscribe = router.usePlugin(persistentParamsPlugin(["mode"]));
```

### Double Initialization Protection

```typescript
router.usePlugin(persistentParamsPlugin(["mode"]));

router.usePlugin(persistentParamsPlugin(["mode"]));
// Error: Plugin already initialized on this router
```

### Teardown

Cleanly removes the plugin and restores original router behavior:

```typescript
const unsubscribe = router.usePlugin(persistentParamsPlugin(["mode"]));

// Work with plugin...

unsubscribe();
// Router methods restored to original behavior
// Plugin can be reinitialized with new configuration
```

### Reinitialization

```typescript
const unsub1 = router.usePlugin(persistentParamsPlugin(["mode"]));
unsub1();

// Now can add with new configuration
const unsub2 = router.usePlugin(persistentParamsPlugin(["theme"]));
```

## Usage Examples

### Multilingual Application

```typescript
router.usePlugin(persistentParamsPlugin({ lang: "en" }));

// User changes language
router.navigate("settings", { lang: "fr" });

// Language persists across all transitions
router.navigate("products", { id: "1" }); // ?lang=fr
router.navigate("cart"); // ?lang=fr
router.navigate("checkout"); // ?lang=fr
```

### Development Mode

```typescript
router.usePlugin(persistentParamsPlugin(["debug", "apiMock"]));

// Developer opens URL with flags
router.start("/?debug=true&apiMock=local");

// Flags persist in all routes
router.navigate("products"); // ?debug=true&apiMock=local
router.navigate("cart"); // ?debug=true&apiMock=local
```

### UTM Tracking

```typescript
router.usePlugin(
  persistentParamsPlugin(["utm_source", "utm_medium", "utm_campaign"]),
);

// User arrives from ad
router.start("/?utm_source=google&utm_medium=cpc&utm_campaign=spring2024");

// UTM tags persist across all transitions
router.navigate("products"); // includes utm_*
router.navigate("cart"); // includes utm_*
router.navigate("checkout"); // includes utm_*
```

### Filters and Sorting

```typescript
router.usePlugin(persistentParamsPlugin(["sortBy", "order", "view"]));

// User configures display
router.navigate("products", {
  category: "electronics",
  sortBy: "price",
  order: "asc",
  view: "grid",
});

// Settings persist when changing categories
router.navigate("products", { category: "books" });
// URL: /products?category=books&sortBy=price&order=asc&view=grid
```

### Combination with Other Plugins

```typescript
import browserPlugin from "real-router-plugin-browser";
import loggerPlugin from "real-router-plugin-logger";

router.usePlugin(browserPlugin());
router.usePlugin(loggerPlugin());
router.usePlugin(persistentParamsPlugin(["lang", "theme"]));

// All plugins work together
```

## Error Handling

The plugin validates input and throws meaningful errors for invalid usage:

```typescript
try {
  router.usePlugin(persistentParamsPlugin(["mode"]));
  router.usePlugin(persistentParamsPlugin(["mode"]));
} catch (error) {
  // Error: Plugin already initialized on this router
}

try {
  router.navigate("route", { mode: { nested: "value" } });
} catch (error) {
  // TypeError: Parameter "mode" must be a primitive value
}
```

## TypeScript

The plugin is fully typed:

```typescript
import persistentParamsPlugin, {
  type PersistentParamsConfig,
} from "real-router-plugin-persistent-params";

// Configuration types
const config1: PersistentParamsConfig = ["mode", "lang"];
const config2: PersistentParamsConfig = { mode: "dev", lang: "en" };

// Type inference
router.usePlugin(persistentParamsPlugin(["mode"]));
router.navigate("route", { mode: "dev" }); // type-safe
```

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [persistentParamsPlugin](https://github.com/greydragon888/router6/wiki/persistentParamsPlugin) — plugin usage and configuration
- [usePlugin](https://github.com/greydragon888/router6/wiki/usePlugin) — registering plugins with router
- [Plugins](https://github.com/greydragon888/router6/wiki/Plugins) — plugin architecture overview
- [navigate](https://github.com/greydragon888/router6/wiki/navigate) — navigation with parameters

## Related Packages

- [router6](https://www.npmjs.com/package/router6) — core router
- [react-router6](https://www.npmjs.com/package/react-router6) — React integration

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
