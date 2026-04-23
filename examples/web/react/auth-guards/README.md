# React Auth Guards Example

Demonstrates runtime route tree replacement for authentication, role-based access control via `canActivate`, and unsaved-changes protection via `canDeactivate`.

## What it covers

- `getRoutesApi(router).clear()` + `.add()` — atomic route tree swap on login/logout
- `getDependenciesApi(router).set("abilities", ...)` — injecting role-based abilities into DI
- `canActivate` guard reading abilities from DI via `getDep("abilities")`
- `canDeactivate` guard with `window.confirm` for unsaved changes (Settings page)
- `forwardTo: "dashboard"` — redirects `/` to `/dashboard` when logged in
- `allowNotFound: true` — shows 404 when navigating to a removed route after logout

## Structure

```
src/
  main.tsx        ← creates router with public routes, mounts app
  App.tsx         ← swaps route tree on login/logout, dynamic sidebar
  routes.ts       ← publicRoutes + privateRoutes with guards
  pages/
    Home.tsx / Services.tsx / Contacts.tsx ← public pages
    Login.tsx      ← auth form calling onLogin
    Dashboard.tsx  ← private page with logout
    Settings.tsx   ← canDeactivate demo (unsaved state via store)
    Admin.tsx      ← admin-only page (canActivate guard)
../../shared/
  abilities.ts   ← defineAbilities(), can()
  api.ts         ← api.login() mock
  store.ts       ← settings:unsaved flag
  styles.css
```

## Run

```bash
pnpm install
pnpm dev
```
