# @real-router/helpers

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Route segment testing utilities for Real-Router. Useful for navigation menus, breadcrumbs, conditional rendering, and route guards.

## Installation

```bash
npm install @real-router/helpers
# or
pnpm add @real-router/helpers
# or
yarn add @real-router/helpers
# or
bun add @real-router/helpers
```

## Quick Start

```typescript
import {
  startsWithSegment,
  endsWithSegment,
  includesSegment,
  areRoutesRelated,
} from "@real-router/helpers";

startsWithSegment("users.profile.edit", "users");     // true
endsWithSegment("users.profile.edit", "edit");        // true
includesSegment("users.profile.edit", "profile");     // true
areRoutesRelated("users", "users.profile");           // true
```

---

## API

### `startsWithSegment(route: State | string, segment?: string | null): boolean | ((segment: string) => boolean)`

Tests if route name starts with segment.\
`route: State | string` — route state object or route name string\
`segment?: string | null` — segment to test (optional for curried form)\
Returns: `boolean` (true if starts with segment, false if segment is null/empty) or `(segment: string) => boolean` (tester function if segment omitted)

```typescript
// Direct usage
startsWithSegment("users.list", "users");           // true
startsWithSegment("users.profile", "users.profile"); // true (multi-segment)

// With State object
startsWithSegment({ name: "users.list", params: {}, path: "/" }, "users"); // true

// Curried form
const tester = startsWithSegment("users.profile.edit");
tester("users");  // true
tester("admin");  // false
```

### `endsWithSegment(route: State | string, segment?: string | null): boolean | ((segment: string) => boolean)`

Tests if route name ends with segment.\
`route: State | string` — route state object or route name string\
`segment?: string | null` — segment to test (optional for curried form)\
Returns: `boolean` (true if ends with segment, false if segment is null/empty) or `(segment: string) => boolean` (tester function if segment omitted)

```typescript
endsWithSegment("users.profile.edit", "edit");  // true
endsWithSegment("a.b.c.d", "c.d");               // true (multi-segment)

// Curried form
const tester = endsWithSegment("users.list");
tester("list");  // true
```

### `includesSegment(route: State | string, segment?: string | null): boolean | ((segment: string) => boolean)`

Tests if route name includes segment anywhere.\
`route: State | string` — route state object or route name string\
`segment?: string | null` — segment to test (optional for curried form)\
Returns: `boolean` (true if includes segment, false if segment is null/empty) or `(segment: string) => boolean` (tester function if segment omitted)

```typescript
includesSegment("admin.users.profile", "users");    // true
includesSegment("a.b.c.d", "b.c");                   // true (contiguous)
includesSegment("a.b.c.d", "a.c");                   // false (not contiguous)

// Curried form
const tester = includesSegment("admin.users.profile");
tester("users");     // true
tester("settings");  // false
```

### `areRoutesRelated(route1: string, route2: string): boolean`

Tests if routes are in same hierarchy (parent-child, child-parent, or same).\
`route1: string` — first route name\
`route2: string` — second route name\
Returns: `boolean` — true if routes are related (same, parent-child, or child-parent)

```typescript
// Parent-child relationship
areRoutesRelated("users", "users.list");       // true
areRoutesRelated("users", "users.profile.edit"); // true

// Child-parent relationship
areRoutesRelated("users.list", "users");       // true
areRoutesRelated("users.profile.edit", "users"); // true

// Same route
areRoutesRelated("users", "users");            // true

// Siblings (not related)
areRoutesRelated("users.list", "users.view");  // false

// Different branches (not related)
areRoutesRelated("users", "admin");            // false
```

---

## Usage Examples

### Navigation Menu

```tsx
function NavigationMenu({ currentRoute }) {
  const items = [
    { name: "Dashboard", route: "dashboard" },
    { name: "Users", route: "users" },
  ];

  return (
    <nav>
      {items.map((item) => (
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

### Route Guard

```typescript
const adminGuard = (router) => (toState, fromState, done) => {
  if (startsWithSegment(toState, "admin") && !isAdmin()) {
    done({ redirect: { name: "unauthorized" } });
  } else {
    done();
  }
};

router.useMiddleware(adminGuard);
```

### Conditional Rendering

```tsx
function Layout({ route, children }) {
  return (
    <div>
      {startsWithSegment(route, "admin") && <AdminSidebar />}
      {endsWithSegment(route, "edit") && <EditToolbar />}
      <main>{children}</main>
    </div>
  );
}
```

---

## Validation

Segments are validated for security:

- **Allowed:** `a-z`, `A-Z`, `0-9`, `.`, `-`, `_`
- **Max length:** 10,000 characters
- **Empty/null:** Returns `false`
- **Invalid chars:** Throws `TypeError`

```typescript
startsWithSegment("route", "valid-segment_v2");  // OK
startsWithSegment("route", "invalid!char");       // Throws TypeError
startsWithSegment("route", "");                   // false
```

---

## Migration from router5-helpers

```diff
- import { startsWithSegment, redirect } from 'router5-helpers';
+ import { startsWithSegment } from '@real-router/helpers';

// Segment testing — unchanged
startsWithSegment(route, 'admin');

// redirect removed — use guards:
- router.canActivate('old', () => redirect('new'));
+ router.canActivate('old', (to, from, done) => {
+   done({ redirect: { name: 'new' } });
+ });
```

**New:** `areRoutesRelated()` for hierarchy checks.

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/react](https://www.npmjs.com/package/@real-router/react) — React integration

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
