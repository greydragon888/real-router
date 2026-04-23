# React Persistent Params Example

Demonstrates `persistentParamsPluginFactory` for multilingual apps with theme support.

## What it covers

- `persistentParamsPluginFactory({ lang: "en", theme: "light" })` — default values
- Params auto-injected into every navigation (no manual forwarding)
- Language switcher and theme toggle update params in URL
- Pages render content based on `route.params.lang`

## Run

```bash
pnpm install
pnpm dev
```
