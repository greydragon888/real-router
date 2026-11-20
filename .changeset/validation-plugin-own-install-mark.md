---
"@real-router/validation-plugin": minor
---

The `RouterValidator` re-export is removed, and the refusal of a second installation reads the plugin's own mark (#2388)

**Breaking Change:** the package no longer re-exports the `RouterValidator`
type, which `@real-router/core` no longer publishes. It has declared no member
since 0.39.0; drop the import.

A second installation on a router the plugin is already installed on is still
refused with `VALIDATION_PLUGIN_ALREADY_INSTALLED`, and the router accepts an
installation again after `teardown` and after a retrospective pass that throws.
The mark is a module-level `WeakSet` of routers, so `getInternals(router)`
holds nothing for the plugin.

⚠ **Two copies of the package on one router are no longer refused.** Each copy
holds a mark of its own, so a bundle that carries the package twice and
installs both copies on one router runs every check twice and prints every
warning twice. That setup is unsupported: install one copy of the package.
