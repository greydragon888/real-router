# @real-router/persistent-params-plugin

[![npm](https://img.shields.io/npm/v/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin)
[![npm downloads](https://img.shields.io/npm/dm/@real-router/persistent-params-plugin.svg?style=flat-square)](https://www.npmjs.com/package/@real-router/persistent-params-plugin)
[![bundle size](https://deno.bundlejs.com/?q=@real-router/persistent-params-plugin&treeshake=[*]&badge=detailed)](https://bundlejs.com/?q=@real-router/persistent-params-plugin&treeshake=[*])
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](../../LICENSE)

> Automatically persist query parameters across all navigation transitions in [Real-Router](https://github.com/greydragon888/real-router).

```typescript
// Query values ride the THIRD argument — the query channel (RFC-4 M2).
// Passing a declared `?key` in the second (path) bag throws since #1572.

// Without plugin:
router.navigate("products", {}, { lang: "en", theme: "dark" });
router.navigate("cart");
// URL: /cart  — lang and theme are lost

// With plugin:
router.usePlugin(persistentParamsPluginFactory(["lang", "theme"]));
router.navigate("products", {}, { lang: "en", theme: "dark" });
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
router.navigate("page1", {}, { lang: "en" });     // saved: lang=en

// Carry — auto-injected into subsequent navigations
router.navigate("page2");                      // URL: /page2?lang=en

// Update — explicit values override saved ones
router.navigate("page3", {}, { lang: "fr" });      // URL: /page3?lang=fr, saved: lang=fr

// Remove — pass undefined to stop persisting
router.navigate("page4", {}, { lang: undefined }); // lang removed permanently
```

> **Note:** Removal is permanent for the plugin lifetime — but only once the removal navigation actually commits. Once `undefined` is passed and the navigation succeeds, the param is no longer tracked, even if passed again later. If that navigation is rejected by a guard or superseded by a concurrent navigate, the param stays persisted (the removal rolls back).
>
> Only an explicit `undefined` removes. Landing on a **not-found** route — a dead link, a `start()` on an unmatched URL, or a route swap that drops the active route — leaves persistence intact: the params come back on the next navigation that matches a route (#1676).

## Use Cases

### Multilingual App

```typescript
router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));

router.navigate("settings", {}, { lang: "fr" });
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

## State Context: `state.context.persistentParams`

The plugin publishes a snapshot of the current persistent params to `state.context.persistentParams` after each successful transition. This lets components read persistent (query) params independent of which channel they currently ride in.

```typescript
import { createRouter } from "@real-router/core";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

const router = createRouter(routes);
router.usePlugin(persistentParamsPluginFactory({ lang: "en", theme: "light" }));

router.subscribe(({ route, previousRoute }) => {
  const { params, search, context } = route;

  // params contains ONLY route-specific (path) params — RFC-4 M2 (#1548)
  console.log(params);                    // { id: "42" }

  // search contains ONLY query params — the channel persistent params are
  // injected into (#1563); a hand-built state committed via navigateToState is
  // the one case where they can ride in `params` instead
  console.log(search);                    // { lang: "en", theme: "light" }

  // context.persistentParams is a channel-independent view of ONLY the
  // persistent params, regardless of which channel currently carries them
  console.log(context.persistentParams);  // { lang: "en", theme: "light" }
});
```

**Timing:** Written in `onTransitionSuccess` (before subscriber callbacks fire). Always reflects the latest committed values.

**Type:** Importing `@real-router/persistent-params-plugin` augments `StateContext` with `persistentParams?: Params`, providing full type safety.

## Composition with `@real-router/search-schema-plugin`

This plugin **injects** persistent params via a `forwardState` interceptor; `search-schema-plugin` **validates** params via its own `forwardState` interceptor. Core composes interceptors **LIFO** (last-registered = outermost), so registration order decides whether persistent params are validated:

```typescript
// RECOMMENDED — register persistent-params FIRST, search-schema SECOND:
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
router.usePlugin(searchSchemaPlugin());
// search-schema is outermost → validates the injected persistent params (invalid ones stripped)

// ALTERNATIVE — persistent-params outermost → persistent params bypass the schema:
router.usePlugin(searchSchemaPlugin());
router.usePlugin(persistentParamsPluginFactory({ page: 1 }));
```

Register this plugin **before** `search-schema-plugin` to have persistent params validated (the safer default); after it only when they must deliberately skip validation.

> **Caveat:** the order decides validation, and it decides it everywhere. `search-schema-plugin` validates the injected values on **both** directions since #1564, and since core #2087 it reaches the rendered href as well — `router.buildPath` runs the `forwardState` seam both plugins register, and this plugin injects on that seam and nowhere else. What a route default cannot do is stand in for the schema: every route default merges *under* the injected value. (#1231, #1563, #1564, #2087)

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
