# router6-helpers

[![npm version](https://badge.fury.io/js/router6-helpers.svg)](https://www.npmjs.com/package/router6-helpers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> High-performance route segment testing utilities for Router6

## Overview

`router6-helpers` provides efficient utilities for testing route name segments in Router6 applications. These helpers are essential for:

- Conditional rendering based on route hierarchy
- Active navigation menu items
- Breadcrumb construction
- Route-based access guards
- UI component visibility logic

## Installation

```bash
npm install router6-helpers
# or
pnpm add router6-helpers
# or
yarn add router6-helpers
# or
bun add router6-helpers
```

## Quick Start

```typescript
import {
  startsWithSegment,
  endsWithSegment,
  includesSegment,
  areRoutesRelated,
} from "router6-helpers";

// Check if route starts with segment
startsWithSegment("users.profile.edit", "users"); // true
startsWithSegment("admin.dashboard", "users"); // false

// Check if route ends with segment
endsWithSegment("users.profile.edit", "edit"); // true
endsWithSegment("users.profile.edit", "view"); // false

// Check if route includes segment anywhere
includesSegment("users.profile.edit", "profile"); // true
includesSegment("users.profile.edit", "admin"); // false

// Check if routes are related (parent-child or same)
areRoutesRelated("users", "users.list"); // true
areRoutesRelated("users", "admin"); // false
```

## API Reference

### `startsWithSegment(route, segment?)`

Tests if a route name starts with the given segment.

**Parameters:**

- `route: State | string` - Route state object or route name string
- `segment?: string | null` - Segment to test (optional for curried form)

**Returns:**

- `boolean` - True if route starts with segment
- `(segment: string) => boolean` - Tester function if segment omitted
- `false` - If segment is null or empty string

**Examples:**

```typescript
// Direct usage
startsWithSegment("users.list", "users"); // true
startsWithSegment("users.list", "admin"); // false

// Multi-segment matching
startsWithSegment("users.profile.edit", "users.profile"); // true

// With State object
const state = { name: "users.list", params: {}, path: "/users" };
startsWithSegment(state, "users"); // true

// Curried form
const tester = startsWithSegment("users.profile.edit");
tester("users"); // true
tester("admin"); // false

// Edge cases
startsWithSegment("users", ""); // false
startsWithSegment("users", null); // false
```

**Use Cases:**

```typescript
// Active navigation menu
const isAdminSection = startsWithSegment(currentRoute, 'admin');

// Conditional rendering
{startsWithSegment(route, 'users') && <UsersToolbar />}

// Access guards
if (!startsWithSegment(route, 'admin')) {
  throw new UnauthorizedError();
}
```

---

### `endsWithSegment(route, segment?)`

Tests if a route name ends with the given segment.

**Parameters:**

- `route: State | string` - Route state object or route name string
- `segment?: string | null` - Segment to test (optional for curried form)

**Returns:**

- `boolean` - True if route ends with segment
- `(segment: string) => boolean` - Tester function if segment omitted
- `false` - If segment is null or empty string

**Examples:**

```typescript
// Direct usage
endsWithSegment("users.profile.edit", "edit"); // true
endsWithSegment("users.profile.edit", "view"); // false

// Multi-segment matching
endsWithSegment("a.b.c.d", "c.d"); // true

// Curried form
const tester = endsWithSegment("users.list");
tester("list"); // true
tester("edit"); // false
```

**Use Cases:**

```typescript
// Detect edit pages
const isEditPage = endsWithSegment(route, 'edit');

// Page type detection
const pageType = ['view', 'edit', 'create'].find(
  type => endsWithSegment(route, type)
);

// Conditional toolbar
{endsWithSegment(route, 'edit') && <EditToolbar />}
```

---

### `includesSegment(route, segment?)`

Tests if a route name includes the given segment anywhere in its path.

**Parameters:**

- `route: State | string` - Route state object or route name string
- `segment?: string | null` - Segment to test (optional for curried form)

**Returns:**

- `boolean` - True if route includes segment
- `(segment: string) => boolean` - Tester function if segment omitted
- `false` - If segment is null or empty string

**Examples:**

```typescript
// Direct usage
includesSegment("admin.users.profile", "users"); // true
includesSegment("admin.users.profile", "profile"); // true
includesSegment("admin.users.profile", "settings"); // false

// Multi-segment matching (contiguous)
includesSegment("a.b.c.d", "b.c"); // true
includesSegment("a.b.c.d", "a.c"); // false (not contiguous)

// Curried form
const tester = includesSegment("admin.users.profile");
tester("users"); // true
tester("settings"); // false
```

**Use Cases:**

```typescript
// Check if anywhere in users section
const inUsersSection = includesSegment(route, "users");

// Feature detection
const hasProfileFeature = includesSegment(route, "profile");

// Analytics tracking
if (includesSegment(route, "checkout")) {
  analytics.track("checkout_flow");
}
```

---

### `areRoutesRelated(route1, route2)`

Tests if two routes are related in the hierarchy (same, parent-child, or child-parent).

**Parameters:**

- `route1: string` - First route name
- `route2: string` - Second route name

**Returns:**

- `boolean` - True if routes are related

**Examples:**

```typescript
// Same route
areRoutesRelated("users", "users"); // true

// Parent-child relationship
areRoutesRelated("users", "users.list"); // true
areRoutesRelated("users", "users.profile.edit"); // true

// Child-parent relationship
areRoutesRelated("users.list", "users"); // true
areRoutesRelated("users.profile.edit", "users"); // true

// Different branches (not related)
areRoutesRelated("users", "admin"); // false
areRoutesRelated("users.list", "admin.dashboard"); // false

// Siblings (not related)
areRoutesRelated("users.list", "users.view"); // false
areRoutesRelated("users.profile", "users.settings"); // false
```

**Use Cases:**

```typescript
// Optimized re-rendering (only update when route is related)
const shouldUpdate = areRoutesRelated(newRoute, watchedRoute);

// Navigation menu highlighting
const isInSection = areRoutesRelated(currentRoute, "admin");

// Breadcrumb visibility
const showBreadcrumb = areRoutesRelated(currentRoute, basePath);
```

---

## Real-World Examples

### Active Navigation Menu

```typescript
import { startsWithSegment } from 'router6-helpers';

function NavigationMenu({ currentRoute }) {
  const menuItems = [
    { name: 'Dashboard', route: 'dashboard' },
    { name: 'Users', route: 'users' },
    { name: 'Settings', route: 'settings' },
  ];

  return (
    <nav>
      {menuItems.map(item => (
        <MenuItem
          key={item.route}
          active={startsWithSegment(currentRoute, item.route)}
        >
          {item.name}
        </MenuItem>
      ))}
    </nav>
  );
}
```

### Breadcrumbs

```typescript
import { startsWithSegment } from 'router6-helpers';

function Breadcrumbs({ currentRoute }) {
  const segments = currentRoute.split('.');
  const breadcrumbs = segments.reduce((acc, segment, index) => {
    const path = segments.slice(0, index + 1).join('.');
    return [...acc, {
      path,
      label: segment,
      isActive: path === currentRoute,
    }];
  }, []);

  return (
    <nav>
      {breadcrumbs.map(crumb => (
        <Breadcrumb
          key={crumb.path}
          active={crumb.isActive}
        >
          {crumb.label}
        </Breadcrumb>
      ))}
    </nav>
  );
}
```

### Route Guards

```typescript
import { startsWithSegment } from "router6-helpers";

const adminGuard = (router) => (toState, fromState, done) => {
  if (startsWithSegment(toState, "admin") && !userHasAdminRole()) {
    done({ redirect: { name: "unauthorized" } });
  } else {
    done();
  }
};

router.useMiddleware(adminGuard);
```

### Conditional Rendering

```typescript
import { includesSegment, endsWithSegment } from 'router6-helpers';

function PageLayout({ route, children }) {
  return (
    <div>
      {/* Show admin sidebar only in admin section */}
      {startsWithSegment(route, 'admin') && <AdminSidebar />}

      {/* Show edit toolbar on edit pages */}
      {endsWithSegment(route, 'edit') && <EditToolbar />}

      {/* Show user profile widget in user-related pages */}
      {includesSegment(route, 'users') && <UserProfileWidget />}

      <main>{children}</main>
    </div>
  );
}
```

### Analytics Tracking

```typescript
import { startsWithSegment, includesSegment } from "router6-helpers";

router.subscribe((state) => {
  const routeName = state.route.name;

  // Track section
  if (startsWithSegment(routeName, "admin")) {
    analytics.track("admin_section_view");
  }

  // Track feature usage
  if (includesSegment(routeName, "checkout")) {
    analytics.track("checkout_flow_step", {
      step: routeName.split(".").pop(),
    });
  }
});
```

---

## Validation & Security

### Automatic Validation

All segment inputs are automatically validated for security and correctness:

**Character Whitelist:**

- Allowed: `a-z`, `A-Z`, `0-9`, `.` (dot), `-` (dash), `_` (underscore)
- Disallowed: Special characters, spaces, slashes, etc.

**Length Limits:**

- Maximum segment length: 10,000 characters
- Empty segments are rejected

**Examples:**

```typescript
// ✅ Valid segments
startsWithSegment("route", "users"); // OK
startsWithSegment("route", "admin-panel"); // OK
startsWithSegment("route", "users_v2"); // OK
startsWithSegment("route", "app.settings"); // OK

// ❌ Invalid segments (throw TypeError)
startsWithSegment("route", "invalid!char"); // Throws
startsWithSegment("route", "has space"); // Throws
startsWithSegment("route", "path/segment"); // Throws
startsWithSegment("route", "ns:segment"); // Throws

// ❌ Too long (throw RangeError)
startsWithSegment("route", "a".repeat(10001)); // Throws

// ❌ Empty (returns false)
startsWithSegment("route", ""); // false
startsWithSegment("route", null); // false
```

### Error Handling

```typescript
try {
  startsWithSegment("route", "invalid!segment");
} catch (error) {
  if (error instanceof TypeError) {
    console.error("Invalid segment:", error.message);
    // "Segment contains invalid characters. Allowed: a-z, A-Z, 0-9, dot (.), dash (-), underscore (_)"
  }
}

try {
  startsWithSegment("route", "a".repeat(10001));
} catch (error) {
  if (error instanceof RangeError) {
    console.error("Segment too long:", error.message);
    // "Segment exceeds maximum length of 10000 characters"
  }
}
```

---

## TypeScript Support

Full TypeScript support with type definitions included.

```typescript
import type { State } from "router6";
import { startsWithSegment } from "router6-helpers";

// Type inference works correctly
const result: boolean = startsWithSegment("route", "segment");

// Curried form also typed
const tester: (segment: string) => boolean = startsWithSegment("route");

// Works with State objects
const state: State = { name: "route", params: {}, path: "/route" };
const matches: boolean = startsWithSegment(state, "segment");
```

### Type Definitions

```typescript
export type SegmentTestFunction = {
  (route: State | string): (segment: string) => boolean;
  (route: State | string, segment: string): boolean;
  (route: State | string, segment: null): false;
  (
    route: State | string,
    segment?: string | null,
  ): boolean | ((segment: string) => boolean);
};
```

---

## Documentation

Full documentation available on the [Router6 Wiki](https://github.com/greydragon888/router6/wiki):

- [startsWithSegment](https://github.com/greydragon888/router6/wiki/startsWithSegment)
- [endsWithSegment](https://github.com/greydragon888/router6/wiki/endsWithSegment)
- [includesSegment](https://github.com/greydragon888/router6/wiki/includesSegment)
- [areRoutesRelated](https://github.com/greydragon888/router6/wiki/areRoutesRelated)

---

## Related Packages

- [react-router6](https://www.npmjs.com/package/react-router6) — React integration

---

## Migration from router5-helpers

### Import Changes

```diff
- import { startsWithSegment, endsWithSegment, includesSegment } from 'router5-helpers';
+ import { startsWithSegment, endsWithSegment, includesSegment } from 'router6-helpers';
```

### Removed: `redirect`

The `redirect` helper has been removed. Use router guards instead:

```diff
- import { redirect } from 'router5-helpers';
-
- router.canActivate('protected', () => redirect('login'));
+ router.canActivate('protected', (toState, fromState, done) => {
+   done({ redirect: { name: 'login' } });
+ });
```

### New: `areRoutesRelated`

New helper function for checking route hierarchy:

```typescript
import { areRoutesRelated } from 'router6-helpers';

areRoutesRelated('users', 'users.profile');     // true (parent-child)
areRoutesRelated('users.profile', 'users');     // true (child-parent)
areRoutesRelated('users', 'admin');             // false (different branches)
```

### New: Input Validation

router6-helpers validates segment inputs for security:

```typescript
// ✅ Valid segments
startsWithSegment('route', 'users');
startsWithSegment('route', 'admin-panel');

// ❌ Throws TypeError (invalid characters)
startsWithSegment('route', 'invalid!char');
startsWithSegment('route', 'has space');
```

### Full Migration Example

```diff
- import { startsWithSegment, redirect } from 'router5-helpers';
+ import { startsWithSegment } from 'router6-helpers';

  // Segment testing - unchanged
  if (startsWithSegment(route, 'admin')) {
    // ...
  }

  // Redirects - use guards instead
- router.canActivate('old-page', () => redirect('new-page'));
+ router.canActivate('old-page', (toState, fromState, done) => {
+   done({ redirect: { name: 'new-page' } });
+ });
```

---

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
