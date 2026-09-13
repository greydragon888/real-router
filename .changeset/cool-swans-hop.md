---
"@real-router/navigation-plugin": minor
---

Declare `@real-router/core` as a peer, not a dependency (#2294)

Core identifies a router by object identity in a module-level `WeakMap`, so two
copies in one dependency tree mean two registries and a router built by one is
refused by the other. As a plain `dependency` the second copy is installable by
ordinary resolution: a caret range on a `0.x` version pins to the MINOR, and this
package bumps its minor whenever core does.

As a peer the installer keeps ONE copy. `@real-router/route-utils`,
`@real-router/ssr-data-plugin` and `@real-router/rsc-server-plugin` already
declared it this way; this finishes the migration for the rest.

Applications that already list `@real-router/core` explicitly are unaffected.
npm installs peers automatically since v7, and pnpm does when `auto-install-peers`
is on (its default since v8). **Yarn does not** — a Yarn project must add
`@real-router/core` to its own dependencies.
