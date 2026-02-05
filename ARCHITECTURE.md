# Architecture

> High-level system design for AI agents and contributors

## Package Structure

```
real-router/
├── packages/
│   ├── core/                 # Router implementation (facade + namespaces)
│   ├── core-types/           # @real-router/types — shared TypeScript types
│   ├── react/                # React integration (Provider, hooks, components)
│   ├── browser-plugin/       # Browser history synchronization
│   ├── logger-plugin/        # Development logging with timing
│   ├── persistent-params-plugin/  # Parameter persistence
│   ├── helpers/              # Route comparison utilities
│   ├── logger/               # @real-router/logger — isomorphic logging
│   ├── route-tree/           # URL parsing and path building (internal)
│   ├── search-params/        # Query string handling (internal)
│   └── type-guards/          # Runtime type validation (internal)
```

## Package Dependencies

```
                            ┌─────────────────┐
                            │  @real-router/  │
                            │     types       │
                            └────────┬────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  @real-router/  │    │   route-tree    │    │  type-guards    │
    │     logger      │    │   (internal)    │    │   (internal)    │
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                      │
             │         ┌────────────┴────────────┐         │
             │         │                         │         │
             ▼         ▼                         ▼         ▼
           ┌─────────────────────────────────────────────────┐
           │              @real-router/core                  │
           │  ┌─────────────────────────────────────────┐   │
           │  │  Bundles: route-tree, type-guards,      │   │
           │  │           search-params                 │   │
           │  └─────────────────────────────────────────┘   │
           └──────────────────────┬──────────────────────────┘
                                  │
        ┌─────────────┬───────────┼───────────┬─────────────┐
        │             │           │           │             │
        ▼             ▼           ▼           ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│browser-plugin│ │  react   │ │ helpers  │ │logger-   │ │persistent│
│              │ │          │ │          │ │plugin    │ │-params   │
└──────────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Public packages:** `@real-router/core`, `@real-router/types`, `@real-router/react`, `@real-router/browser-plugin`, `@real-router/logger-plugin`, `@real-router/persistent-params-plugin`, `@real-router/helpers`

**Internal packages (bundled):** `route-tree`, `search-params`, `type-guards`, `@real-router/logger`

## Core Architecture

The `@real-router/core` package uses a **facade + namespaces** pattern:

```
Router.ts (facade) ─────────────────────────────────────────────────
    │
    ├── RoutesNamespace        — route tree, path operations, forwarding
    ├── StateNamespace         — current/previous state storage
    ├── NavigationNamespace    — navigate(), cancel, transition logic
    ├── OptionsNamespace       — router configuration
    ├── DependenciesNamespace  — dependency injection container
    ├── ObservableNamespace    — events, subscribe, Symbol.observable
    ├── PluginsNamespace       — plugin lifecycle management
    ├── MiddlewareNamespace    — middleware chain execution
    ├── RouteLifecycleNamespace — canActivate/canDeactivate guards
    ├── RouterLifecycleNamespace — start/stop operations
    └── CloneNamespace         — SSR cloning support
```

**Key principle:** Router.ts is a thin facade. All business logic lives in namespaces.

**Detailed documentation:** [packages/core/CLAUDE.md](packages/core/CLAUDE.md)

## Data Flow

### Navigation Pipeline

```
router.navigate(name, params, options, done)
                    │
                    ▼
            ┌───────────────┐
            │ Build target  │  RoutesNamespace.buildState()
            │    state      │  + forwardState() resolution
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Deactivation │  canDeactivate guards
            │    guards     │  (innermost → outermost)
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Activation   │  canActivate guards
            │    guards     │  (outermost → innermost)
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Middleware   │  Transform/redirect/block
            │    chain      │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  setState()   │  Freeze & store state
            │  + events     │  Emit TRANSITION_SUCCESS
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │   Plugins     │  onTransitionSuccess()
            │               │
            └───────┬───────┘
                    │
                    ▼
              done(null, state)
```

### Plugin Interception

Plugins can override facade methods to intercept operations:

```typescript
// Example: persistent-params-plugin intercepts forwardState
const originalForwardState = router.forwardState;
router.forwardState = (name, params) => {
  const result = originalForwardState(name, params);
  return { ...result, params: withPersistentParams(result.params) };
};
```

**Important:** Only facade methods can be intercepted, not namespace methods.

## State Management

### Immutability

All states are **deeply frozen** via `Object.freeze()`:

```typescript
const state = router.getState();
state.params.id = "new"; // ❌ TypeError: Cannot assign to read only property
```

### State Structure

```typescript
interface State {
  name: string;           // "users.profile"
  path: string;           // "/users/123"
  params: Params;         // { id: "123" }
  meta?: {
    id?: number;          // Unique transition ID
    params?: Params;      // Original params before forwarding
    options?: object;     // Navigation options
    redirected?: boolean; // Was this a redirect?
    source?: string;      // "popstate" | "navigate" | etc.
  };
}
```

## Extension Points

| Extension | Purpose | Scope | Can Block |
|-----------|---------|-------|-----------|
| **Guards** | Route access control | Per-route | Yes |
| **Middleware** | Transform/redirect navigation | Global | Yes |
| **Plugins** | React to events, extend router | Global | No |

### Guard vs Middleware Decision

- Need to **block** a specific route? → Guard (`canActivate`/`canDeactivate`)
- Need to **redirect** or **transform** state? → Middleware
- Need to **observe** without modifying? → Plugin

## Resource Limits

Router enforces configurable limits to prevent resource exhaustion:

```typescript
createRouter(routes, {
  limits: {
    maxPlugins: 100,      // Default: 50
    maxMiddleware: 100,   // Default: 50
    maxDependencies: 200, // Default: 100
  },
});
```

| Limit                  | Default | Protects Against                    |
| ---------------------- | ------- | ----------------------------------- |
| `maxPlugins`           | 50      | Plugin stack overflow               |
| `maxMiddleware`        | 50      | Middleware chain overflow           |
| `maxDependencies`      | 100     | Circular/excessive dependencies     |
| `maxListeners`         | 10,000  | Event listener memory leaks         |
| `maxEventDepth`        | 5       | Recursive event infinite loops      |
| `maxLifecycleHandlers` | 200     | Guard function accumulation         |

**Design:**
- **Centralized** — All limits defined in `core/constants.ts` (`DEFAULT_LIMITS`, `LIMIT_BOUNDS`)
- **Immutable** — Set at creation, cannot change at runtime
- **Injected** — Router calls `namespace.setLimits()` during initialization
- **0 = unlimited** — Any limit set to 0 disables the check

## Route Tree

Routes form a hierarchical tree structure:

```
Routes:
  { name: "users", path: "/users" }
  { name: "users.list", path: "/" }
  { name: "users.profile", path: "/:id" }
  { name: "users.profile.settings", path: "/settings" }

Tree:
  @@router-root@@
  └── users (/users)
      ├── list (/)
      └── profile (/:id)
          └── settings (/settings)

Full paths:
  users                  → /users
  users.list             → /users/
  users.profile          → /users/:id
  users.profile.settings → /users/:id/settings
```

**Path matching:** O(segments) trie traversal
**Route lookup:** O(1) Map-based

## SSR Support

```typescript
// Server: clone router per request
const serverRouter = router.clone({ request: req });
serverRouter.start(req.url);

// Client: hydrate with same state
router.start(window.location.pathname);
```

`clone()` shares immutable route tree (O(1)), copies mutable state.

## See Also

- [packages/core/CLAUDE.md](packages/core/CLAUDE.md) — Detailed core architecture
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) — Infrastructure decisions
- [Wiki](https://github.com/greydragon888/real-router/wiki) — Full documentation
