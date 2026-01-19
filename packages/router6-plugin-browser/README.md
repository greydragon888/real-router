# router6-plugin-browser

[![npm version](https://badge.fury.io/js/router6-plugin-browser.svg)](https://www.npmjs.com/package/router6-plugin-browser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A router6 plugin that synchronizes router state with browser history, enabling browser navigation buttons (back/forward) and URL management for single-page applications.

## Problem

SPAs need bidirectional synchronization between router state and browser URL. 
Without this plugin, navigating through your application would change the internal router state but leave the browser URL unchanged. 
Additionally, browser navigation buttons (back/forward) wouldn't affect the router, breaking the expected browser behavior.

## Solution

The browser plugin automatically synchronizes router state with browser history. When you navigate programmatically, it updates the URL. 
When users interact with browser controls or manually change the URL, it updates the router state accordingly.

## Installation

```bash
# npm
npm install router6-plugin-browser

# yarn
yarn add router6-plugin-browser

# pnpm
pnpm add router6-plugin-browser

# bun
bun add router6-plugin-browser
```

## Quick Start

```typescript
import { createRouter } from "router6";
import browserPlugin from "router6-plugin-browser";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "products", path: "/products/:id" },
  { name: "cart", path: "/cart" },
]);

// Basic usage
router.usePlugin(browserPlugin());

// With options
router.usePlugin(
  browserPlugin({
    useHash: false,
    base: "/app",
  }),
);

router.start();
```

## API

### `browserPlugin(options?, browser?)`

#### Parameters

**`options`**: `BrowserPluginOptions` (optional)

- Configuration object for plugin behavior

**`browser`**: `Browser` (optional)

- Browser API abstraction for testing/SSR

#### Returns

`PluginFactory` — plugin factory for `router.usePlugin()`

### Configuration Options

```typescript
// Base options shared by both modes
interface BaseBrowserPluginOptions {
  forceDeactivate?: boolean; // Force navigation even if canDeactivate returns false
  base?: string; // Base path for all routes
  mergeState?: boolean; // Merge with existing history.state
}

// Hash-based routing
interface HashModeOptions extends BaseBrowserPluginOptions {
  useHash: true;
  hashPrefix?: string; // Prefix for hash routes (e.g., "!" for #!/path)
  preserveHash?: never; // Not available in hash mode
}

// HTML5 History routing
interface HistoryModeOptions extends BaseBrowserPluginOptions {
  useHash?: false;
  preserveHash?: boolean; // Preserve hash fragment on navigation
  hashPrefix?: never; // Not available in history mode
}

// Type-safe discriminated union prevents conflicting options
type BrowserPluginOptions = HashModeOptions | HistoryModeOptions;
```

**Type Safety:** The configuration uses a discriminated union to prevent invalid option combinations at compile-time (TypeScript) and runtime (JavaScript).

#### `forceDeactivate`

Controls whether `canDeactivate` guards can block browser-initiated navigation (back/forward buttons).

- `true` **(default)** - browser navigation always succeeds, bypassing canDeactivate guards
- `false` - canDeactivate guards can block browser navigation

**Example:**

```typescript
router.usePlugin(
  browserPlugin({
    forceDeactivate: false, // Allow guards to block back button
  }),
);

// Route with canDeactivate guard
router.canDeactivate("form", () => {
  return window.confirm("Unsaved changes. Leave anyway?");
});
```

When `forceDeactivate` is `false` and the user presses the browser back button, the confirmation dialog will appear. If the user cancels, the navigation is blocked and the URL is restored to match the current route. With the default `true` value, browser navigation would always proceed regardless of the guard's return value.

#### `useHash`

Enables hash-based routing for environments without HTML5 history support.

- `false` **(default)** - use HTML5 history (`/path`)
- `true` - use hash routing (`#/path`)

**Example:**

```typescript
router.usePlugin(
  browserPlugin({
    useHash: true,
  }),
);

router.navigate("products", { id: "123" });
// URL: http://example.com/#/products/123
```

**Browser Compatibility:**

- History mode requires HTML5 History API support
- Hash mode works in all browsers
- Plugin automatically uses `hashchange` events for old IE

#### `hashPrefix`

Adds prefix to hash routes. **Only works with `useHash: true`** (hash mode).

- `""` **(default)** - no prefix (`#/path`)
- Custom string - prefixed hash (`#!/path`)

**Example:**

```typescript
router.usePlugin(
  browserPlugin({
    useHash: true, // Required for hashPrefix
    hashPrefix: "!",
  }),
);

router.navigate("products", { id: "123" });
// URL: http://example.com/#!/products/123
```

**Common Prefixes:**

- `"!"` - Hashbang URLs for SEO (Google's deprecated AJAX crawling)
- `"/"` - Clear visual separation
- Custom app identifiers

**Note:** Using `hashPrefix` with `useHash: false` will log a warning and the option will be ignored.

#### `base`

Sets base path when app is hosted in subdirectory.

- `""` **(default)** - root hosting
- Path string - subdirectory hosting

**Example:**

```typescript
// App hosted at http://example.com/app/
router.usePlugin(
  browserPlugin({
    base: "/app",
  }),
);

router.navigate("products", { id: "123" });
// URL: http://example.com/app/products/123
```

**Automatic Normalization:**

The plugin automatically normalizes base paths to prevent common configuration errors:

```typescript
// Missing leading slash - automatically added
router.usePlugin(browserPlugin({ base: "app" }));
// Normalized to: '/app'

// Trailing slash - automatically removed
router.usePlugin(browserPlugin({ base: "/app/" }));
// Normalized to: '/app'
```

**Automatic Detection:**

```typescript
// Detect base from <base> tag
const base = document.querySelector("base")?.getAttribute("href") || "";
router.usePlugin(browserPlugin({ base }));
```

#### `mergeState`

Preserves external properties in `history.state`.

- `false` **(default)** - replace entire state
- `true` - merge router state with existing state

**Example:**

```typescript
// External code sets history state
history.pushState({ externalData: "value" }, "", "/current");

router.usePlugin(
  browserPlugin({
    mergeState: true,
  }),
);

router.navigate("products", { id: "123" });
// history.state contains both router state and externalData
```

**Use Cases:**

- Integration with analytics libraries
- Preserving scroll positions
- Third-party state management

#### `preserveHash`

Maintains URL hash fragment during navigation. **Only works with `useHash: false`** (history mode).

- `true` **(default)** - keep hash fragment
- `false` - remove hash fragment

**Example:**

```typescript
// Current URL: /page#section
router.usePlugin(
  browserPlugin({
    useHash: false, // Required for preserveHash (default)
    preserveHash: true,
  }),
);

router.navigate("other", {});
// URL: /other#section (hash preserved)

router.usePlugin(
  browserPlugin({
    useHash: false,
    preserveHash: false,
  }),
);

router.navigate("other", {});
// URL: /other (hash removed)
```

**Use Cases:**

- Anchor navigation within pages
- Deep linking to sections
- Progressive enhancement

**Note:** Using `preserveHash` with `useHash: true` will log a warning and the option will be ignored.

## Added Router Methods

The plugin extends the router instance with browser-specific methods:

### `router.buildUrl(name, params?)`

Builds full URL including base path and hash prefix.

```typescript
router.buildUrl("products", { id: "123" });
// Returns: "/products/123"

// With base="/app", useHash=true, hashPrefix="!"
// Returns: "/app#!/products/123"
```

**Security Note:**

The plugin automatically URL-encodes parameters to prevent injection attacks. When using the output in templates:

```typescript
// ✅ SAFE: Modern frameworks auto-escape
// React
<Link to={router.buildUrl('users', { id: userInput })} />

// Vue
<router-link :to="router.buildUrl('users', { id: userInput })" />

// Angular
<a [routerLink]="router.buildUrl('users', { id: userInput })">

// ❌ UNSAFE: Don't use innerHTML
element.innerHTML = `<a href="${router.buildUrl('users', params)}">Link</a>`; // DON'T
```

Special characters are automatically encoded:

```typescript
router.buildUrl("search", { q: '<script>alert("xss")</script>' });
// Returns: "/search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E"
// Safe for browser APIs
```

### `router.matchUrl(url)`

Parses URL and returns matching router state.

```typescript
const state = router.matchUrl("http://example.com/products/123?sort=name");
// Returns: {
//   name: 'products',
//   params: { id: '123', sort: 'name' },
//   path: '/products/123?sort=name',
//   meta: { ... }
// }

router.matchUrl("http://example.com/invalid");
// Returns: undefined
```

**Features:**

- Handles full URLs or paths
- Respects base path and hash settings
- Returns undefined for non-matching routes

### `router.replaceHistoryState(name, params?, title?)`

Updates browser URL without triggering navigation.

```typescript
// Change URL without side effects
router.replaceHistoryState("products", { id: "456", filter: "new" });
// URL changes but no middleware/guards execute
```

**Use Cases:**

- Update URL after async data load
- Reflect UI state changes
- Correct invalid URLs

### `router.lastKnownState`

Read-only reference to last successful navigation state.

```typescript
const state = router.lastKnownState;
// Returns frozen copy of state or undefined

if (state) {
  console.log("Last route:", state.name);
  console.log("Parameters:", state.params);
}
```

**Characteristics:**

- Immutable (frozen object)
- Updated on successful navigation only
- Undefined before first navigation
- Persists through errors/cancellations

## Browser Events

### Popstate Handling

The plugin synchronizes router state with browser navigation (back/forward buttons) through the `popstate` event.

**Behavior Guarantees:**

When users interact with browser controls, the plugin ensures:

- Router state stays synchronized with browser history
- URL bar always reflects the actual router state
- Rapid navigation (e.g., clicking back multiple times) is handled correctly
- No state corruption from concurrent transitions

**Example:**

```typescript
router.navigate("page1");
router.navigate("page2");
router.navigate("page3");

// User clicks back twice rapidly
// Plugin ensures router ends at page1
// URL and router state remain synchronized
```

**Error Recovery:**

If an error occurs during navigation, the plugin automatically synchronizes the URL with the current router state, ensuring the URL bar never displays incorrect information.

### History State Structure

The plugin stores router state in browser history:

```typescript
history.state = {
  name: "products",
  params: { id: "123" },
  path: "/products/123",
  meta: {
    id: 1,
    params: {},
    options: {},
    redirected: false,
    source: "popstate",
  },
};
```

## SSR Support

The plugin works in server environments with automatic fallback:

```typescript
// Server-side rendering
import browserPlugin from "router6-plugin-browser";

const router = createRouter(routes);
router.usePlugin(browserPlugin());

// Methods return safe defaults
router.buildUrl("home"); // Works normally
router.matchUrl("/path"); // Returns undefined
router.start(); // No errors thrown
```

**Fallback Behavior:**

- Browser methods become no-ops
- Single warning logged per session
- No errors thrown
- Router continues functioning

**Testing Support:**

```typescript
// Custom browser implementation for tests
const mockBrowser = {
  getBase: () => "/",
  pushState: jest.fn(),
  replaceState: jest.fn(),
  addPopstateListener: () => () => {},
  getLocation: () => "/test",
  getState: () => undefined,
  getHash: () => "",
};

router.usePlugin(browserPlugin({}, mockBrowser));
```

## Usage Examples

### Basic SPA Setup

```typescript
const router = createRouter(routes);

router.usePlugin(
  browserPlugin({
    useHash: false,
    preserveHash: true,
  }),
);

router.start((err, state) => {
  if (!err) {
    renderApp(state);
  }
});
```

### Multi-Domain Application

```typescript
// Different configs per environment
const config = {
  development: { base: "/dev" },
  staging: { base: "/staging" },
  production: { base: "" },
};

router.usePlugin(browserPlugin(config[environment]));
```

### Legacy Browser Support

```typescript
// Detect History API support
const supportsHistory = !!(window.history && window.history.pushState);

// Type-safe configuration based on browser support
router.usePlugin(
  browserPlugin(
    supportsHistory
      ? { useHash: false, preserveHash: true }
      : { useHash: true, hashPrefix: "!" },
  ),
);
```

### Dynamic Base Path

```typescript
// Read from meta tag
const base = document.querySelector('meta[name="app-base"]')?.content || "";

router.usePlugin(browserPlugin({ base }));
```

### Analytics Integration

```typescript
router.usePlugin(
  browserPlugin({
    mergeState: true,
  }),
);

// Analytics library can access its data
router.subscribe(({ route }) => {
  const analyticsData = history.state?.analytics;
  if (analyticsData) {
    trackPageView(analyticsData);
  }
});
```

### Form Protection

```typescript
router.usePlugin(
  browserPlugin({
    forceDeactivate: false,
  }),
);

router.canDeactivate("checkout", () => {
  if (hasUnsavedChanges()) {
    return window.confirm("Leave without saving?");
  }
  return true;
});
```

### Hash Fragment Navigation

```typescript
// Preserve anchors during navigation
router.usePlugin(
  browserPlugin({
    preserveHash: true,
  }),
);

// Navigate to section
window.location.hash = "#comments";

// Route change preserves hash
router.navigate("other-page");
// URL: /other-page#comments
```

## Advanced Features

### URL Encoding

The plugin handles special characters safely:

```typescript
router.navigate("search", { q: "hello world" });
// URL: /search?q=hello%20world

router.navigate("category", { name: "日本語" });
// URL: /category?name=%E6%97%A5%E6%9C%AC%E8%AA%9E
```

**Features:**

- Automatic encoding/decoding
- Unicode support
- IPv6 URL compatibility
- Safe error handling

## Security

The plugin implements multiple layers of security to protect against common web vulnerabilities:

### URL Parameter Encoding

All route parameters are automatically URL-encoded by the underlying `route-tree` library, preventing XSS attacks through URL injection:

```typescript
router.navigate("search", { q: '<script>alert("xss")</script>' });
// URL: /search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E
// Script tags are encoded and harmless
```

### Protocol Whitelist

The `matchUrl` method only accepts `http:` and `https:` protocols, blocking dangerous protocols:

```typescript
// ✅ Allowed
router.matchUrl("https://example.com/path"); // Works
router.matchUrl("http://example.com/path"); // Works

// ❌ Blocked
router.matchUrl("javascript:alert(1)"); // Returns undefined
router.matchUrl("data:text/html,..."); // Returns undefined
router.matchUrl("vbscript:msgbox(1)"); // Returns undefined
router.matchUrl("file:///etc/passwd"); // Returns undefined
```

### State Validation

Popstate events are validated using type guards before processing. Invalid or malicious state structures are rejected:

```typescript
// Browser history manipulated by malicious code
history.pushState({ malicious: "data" }, "", "/");

// Plugin validates structure
window.dispatchEvent(new PopStateEvent("popstate"));
// Invalid state is rejected, router remains in safe state
```

### Input Sanitization Limits

**What the plugin protects:**

- URL encoding for browser APIs (automatic)
- Protocol validation (whitelist)
- State structure validation (type guards)
- Prototype pollution prevention

**What the plugin does NOT protect:**

- XSS in template rendering (framework responsibility)
- SQL injection (backend responsibility)
- CSRF tokens (application responsibility)

**Best Practices:**

```typescript
// ✅ Safe: Let frameworks handle HTML escaping
<Link to={router.buildUrl('users', { id: userInput })} />

// ✅ Safe: DOM API automatically escapes
element.setAttribute('href', router.buildUrl('users', params));

// ❌ Unsafe: Manual HTML construction
element.innerHTML = `<a href="${router.buildUrl('users', params)}">...</a>`;
```

## Error Handling

### Navigation Errors

When navigation is blocked by a `canDeactivate` guard during browser-initiated navigation (and `forceDeactivate` is `false`), the plugin detects the `CANNOT_DEACTIVATE` error and automatically restores the browser URL to match the current router state. This ensures the URL bar stays synchronized even when navigation is prevented.

### Recovery Mechanism

The plugin includes a robust error recovery system for critical failures. If an unexpected error occurs during popstate event handling, the plugin first logs the error with full context for debugging. It then attempts to recover by synchronizing the browser's history state with the current router state. If this recovery also fails, a secondary error is logged, but the application continues running to prevent complete failure.

### Missing State

When the browser's history state is null, corrupted, or doesn't match the expected structure, the plugin handles it gracefully. It attempts to match the current URL against the router's routes to reconstruct the state. If a default route is configured and no match is found, it navigates to the default route. Invalid states are logged as warnings to aid debugging without interrupting the user experience.

## Browser Compatibility

### Modern Browsers (Full Support)

Chrome 5+, Firefox 4+, Safari 5+, Edge, Opera 11.5+

- HTML5 History API
- Popstate events
- Unicode URLs
- Performance optimizations

### Legacy Browsers (Hash Mode)

IE 9-11, Older mobile browsers

```typescript
// Automatic fallback for IE
router.usePlugin(
  browserPlugin({
    useHash: true, // Works everywhere
  }),
);
```

**IE-Specific Handling:**

- Detects Trident engine
- Uses hashchange events
- No popstate on hash changes

### Server-Side Rendering

Node.js 14+

- Automatic fallback
- No errors thrown
- Warning logged once
- Methods return safe defaults

## TypeScript

The plugin is fully typed with TypeScript:

```typescript
import browserPlugin, {
  type BrowserPluginOptions,
  type Browser,
  type HistoryState,
  isState,
  isHistoryState,
} from "router6-plugin-browser";

// Type-safe configuration
const options: BrowserPluginOptions = {
  useHash: false,
  base: "/app",
  mergeState: true,
};

// Router interface is augmented automatically
router.usePlugin(browserPlugin(options));
router.buildUrl("home"); // TypeScript knows this method exists
```

### Type Safety & Runtime Protection

The plugin uses multiple layers of protection to prevent configuration conflicts:

#### 1. Compile-Time Safety (TypeScript)

Discriminated union types make invalid configurations impossible:

```typescript
// ✅ Valid configurations
const config1: BrowserPluginOptions = {
  useHash: true,
  hashPrefix: "!",
};

const config2: BrowserPluginOptions = {
  useHash: false,
  preserveHash: true,
};

// ❌ TypeScript errors - conflicting options
const invalid1: BrowserPluginOptions = {
  useHash: true,
  preserveHash: true, // Error: Type 'true' is not assignable to type 'never'
};

const invalid2: BrowserPluginOptions = {
  useHash: false,
  hashPrefix: "!", // Error: Type 'string' is not assignable to type 'never'
};
```

#### 2. Runtime Validation (JavaScript)

For JavaScript users or dynamic configurations, the plugin validates options and warns about conflicts:

```javascript
// JavaScript - no compile-time checks
browserPlugin({
  useHash: true,
  preserveHash: true, // Conflict!
});

// Console warning:
// [router6-plugin-browser] preserveHash ignored in hash mode
```

```javascript
browserPlugin({
  useHash: false,
  hashPrefix: "!", // Conflict!
});

// Console warning:
// [router6-plugin-browser] hashPrefix ignored in history mode
```

#### 3. Physical Property Removal

After validation, conflicting properties are physically deleted from the options object, ensuring clean configuration:

```javascript
// User passes conflicting options
const options = { useHash: true, preserveHash: true, hashPrefix: "!" };
browserPlugin(options);

// Inside plugin:
// - preserveHash is DELETED (delete options.preserveHash)
// - hashPrefix is KEPT (needed for hash mode)
// → Impossible to accidentally use preserveHash in hash mode
```

**Result:**

- ✅ TypeScript users: compile-time errors prevent invalid configs
- ✅ JavaScript users: runtime warnings + automatic cleanup
- ✅ Internal code: guaranteed clean options without conflicts

## Common Issues

### URL Not Updating

```typescript
// Ensure plugin is registered before start
router.usePlugin(browserPlugin()); // First
router.start(); // Second
```

### Back Button Not Working

```typescript
// Ensure plugin is registered
router.usePlugin(browserPlugin());

// If you need guards to block navigation:
router.usePlugin(
  browserPlugin({
    forceDeactivate: false, // Allow guards to prevent back button
  }),
);

// Check browser console for errors
// Verify history.state is valid
console.log(history.state);
```

### Hash Fragment Lost

```typescript
// Enable preserveHash
router.usePlugin(
  browserPlugin({
    preserveHash: true,
    useHash: false, // Only works in history mode
  }),
);
```

### Conflicting Options Warning

If you see warnings about ignored options, check your configuration:

```typescript
// ❌ Wrong: preserveHash doesn't work with hash mode
router.usePlugin(
  browserPlugin({
    useHash: true,
    preserveHash: true, // Warning: preserveHash ignored in hash mode
  }),
);

// ✅ Correct: preserveHash only works in history mode
router.usePlugin(
  browserPlugin({
    useHash: false,
    preserveHash: true,
  }),
);

// ❌ Wrong: hashPrefix doesn't work with history mode
router.usePlugin(
  browserPlugin({
    useHash: false,
    hashPrefix: "!", // Warning: hashPrefix ignored in history mode
  }),
);

// ✅ Correct: hashPrefix only works in hash mode
router.usePlugin(
  browserPlugin({
    useHash: true,
    hashPrefix: "!",
  }),
);
```

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [browserPlugin](https://github.com/greydragon888/router6/wiki/browserPlugin) — plugin factory and options
- [usePlugin](https://github.com/greydragon888/router6/wiki/usePlugin) — registering plugins with router
- [buildUrl](https://github.com/greydragon888/router6/wiki/buildUrl) — URL building method
- [matchUrl](https://github.com/greydragon888/router6/wiki/matchUrl) — URL matching method

## Related Packages

- [router6](https://www.npmjs.com/package/router6) — core router
- [react-router6](https://www.npmjs.com/package/react-router6) — React integration

## Migration from router5-plugin-browser

### Import Changes

```diff
- import browserPlugin from 'router5-plugin-browser';
+ import { browserPluginFactory } from 'router6-plugin-browser';

- router.usePlugin(browserPlugin({ useHash: true }));
+ router.usePlugin(browserPluginFactory({ useHash: true }));
```

### Type-Safe Options

router6 uses discriminated union types to prevent invalid option combinations:

```typescript
// ✅ Valid: hash mode with prefix
browserPluginFactory({ useHash: true, hashPrefix: "!" });

// ✅ Valid: history mode with hash preservation
browserPluginFactory({ useHash: false, preserveHash: true });

// ❌ TypeScript error: hashPrefix only works with useHash: true
browserPluginFactory({ useHash: false, hashPrefix: "!" });

// ❌ TypeScript error: preserveHash only works with useHash: false
browserPluginFactory({ useHash: true, preserveHash: true });
```

### API Changes

| Method | router5 | router6 |
|--------|---------|---------|
| `matchUrl()` | returns `State \| null` | returns `State \| undefined` |

```diff
  const state = router.matchUrl('/users/123');
- if (state === null) {
+ if (state === undefined) {
    // not found
  }
```

### Full Migration Example

```diff
- import { createRouter } from 'router5';
- import browserPlugin from 'router5-plugin-browser';
+ import { createRouter } from 'router6';
+ import { browserPluginFactory } from 'router6-plugin-browser';

  const router = createRouter(routes);
- router.usePlugin(browserPlugin({ useHash: false, preserveHash: true }));
+ router.usePlugin(browserPluginFactory({ useHash: false, preserveHash: true }));
  router.start();
```

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
