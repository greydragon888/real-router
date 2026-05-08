# Electron + `@real-router/hash-plugin` (`file://` + `#!/`)

Demonstrates hash routing inside an Electron window loaded directly from `file://` — the fallback path when registering a custom protocol is not an option.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR + Electron window pointed at it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with file://…/dist/index.html#!/
pnpm app:build      # native installer under release/ (.dmg / .exe / .AppImage)
pnpm test:e2e       # Playwright via _electron.launch
```

`app:build` runs `pnpm build` and then `electron-builder` with the `build` config in `package.json`. Output target is the host OS (macOS → `.dmg`, Windows → `.exe`, Linux → `.AppImage`). macOS `dmg` is unsigned (`mac.identity: null`), so it shows the Gatekeeper warning on first launch — fine for local demos, not for distribution.

## What it covers

- `createRouter(routes)` + `hashPluginFactory({ hashPrefix: "!" })` + `router.start()`
- URLs of the form `file:///.../index.html#!/users/42/edit`
- Works on `file://` without custom-scheme registration — no changes to the Electron main process beyond `BrowserWindow.loadFile`
- Deep links via `#!/` hash work after restart (Electron restores the last URL)

## Why hash routing, not a custom protocol

The History API throws `SecurityError` on `pushState` when the document is served from `file://`. Hash routing sidesteps the problem entirely — changes to `location.hash` don't require `pushState` and don't trigger a security check. The trade-off is the visible `#!/` prefix in URLs.

Pick this example when:
- You're porting an existing Create-React-App project to Electron without restructuring the main process.
- You can't register a privileged scheme (policy restriction, Electron version, etc.).

Otherwise prefer [`examples/desktop/electron/react`](../react) — cleaner URLs without the `#!/` prefix.

## See also

- [`examples/desktop/electron/react`](../react) — browser-plugin + `app://` custom protocol
- [`examples/desktop/electron/react-navigation`](../react-navigation) — navigation-plugin + exclusive history methods
- [Desktop Integration guide (wiki)](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) — plugin × OS compatibility matrix
