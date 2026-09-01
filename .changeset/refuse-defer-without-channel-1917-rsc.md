---
"@real-router/rsc-server-plugin": patch
---

A `defer()` payload is refused, not written to the `rsc` slot (#1917)

A loader returning `defer({ critical, deferred })` had the whole payload written
to `state.context.rsc` as if it were a `ReactNode`. The deferred promises were
never awaited, and their rejections vanished without a trace — `defer()` attaches
a no-op `.catch()` to every promise it accepts, so the failure produced **zero**
diagnostics: no unhandled rejection, no warning, and a `ReactNode` slot holding a
plain object.

This plugin configures no deferred namespaces, so the guard that selects the
split branch was short-circuited and its else-branch meant "write it as data".
That is a configuration error the plugin can name, and it now does.

⚑ `isDeferred` is unchanged, deliberately. Requiring `critical` / `deferred`
fields from it would retire `INVARIANTS.md` #7 — a pinned contract whose property
test states that its own failure IS the contract-change signal — and would make
this very case SILENT again, by sending a branded-but-fieldless payload into the
plain-data branch. The refusal is keyed on the brand and on the absent channel,
which is what the configuration error actually is.
