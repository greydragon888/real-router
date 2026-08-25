---
"@real-router/persistent-params-plugin": patch
---

A persistent param no longer vanishes when the application named something the same (#1852)

Every record this plugin builds was written with `dst[key] = value`, which is
`[[Set]]` and therefore consults the destination's prototype chain first. The
keys are the plugin's own configured param names and the caller's bag — exactly
the names an application routes under — so an accessor on `Object.prototype`
under one of them hijacked the write. Measured, three shapes:

- the factory itself threw at boot: `persistentParamsPluginFactory(["lang"])` →
  `TypeError: Cannot set property lang of #<Object> which has only a getter`;
- `extractOwnParams`, the guard that exists to sanitise a bag, dropped the
  caller's key from the URL — the sanitiser as the leak;
- with a getter+setter pair nothing threw at all: `buildPath("page")` printed
  `/page` instead of `/page?lang=fr`, and `state.context.persistentParams` went
  `undefined`.

All six sites in the package — five writes plus the factory's `Object.assign`,
which `copyFields` replaces — now go through the new `@real-router/core/utils`
subpath. ⚠ One of the six, in `onTransitionSuccess`, is measured INERT: its target
is a spread of the snapshot and already owns every tracked key, so the guard
takes the same branch a plain store would. It is written that way for
consistency, and the site says so. Verified against all
three hazard shapes: identical to the control in every one.

Part of #1901.
