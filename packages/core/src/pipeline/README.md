# pipeline — navigation delivery in `@real-router/core`

> Three primitives · one opaque type · every URL and every State goes through it

Every entry point that builds a URL or a State does it here: `canonicalize` resolves the
`forwardTo` chain and merges each channel's route defaults, then `buildURL` prints the URL and
`materialize` produces the State. Those two accept **nothing but** a `Canonical`, and
`canonicalize` is its only producer.

---

## ⚠️ Internal — not a public API

This directory is an **internal subsystem of core**, not a published package and not a public
import path.

- It has **no `package.json`** — it is bundled into `@real-router/core` at build time.
- **Do not import from a deep `src/pipeline/*` path.** The module is not part of any published
  subpath (`exports` is `.` / `./types` / `./api` / `./utils` / `./validation`).
- The only consumers are the router's own facade, namespaces and wiring.

Everything below documents this subsystem for **core contributors**.

---

## What it is

| Primitive            | Stage | Produces    | Note                                                          |
| -------------------- | ----- | ----------- | ------------------------------------------------------------- |
| `canonicalize`       | ① + ③ | `Canonical` | The **sole** producer; one pass over forwarding + defaults    |
| `buildURL`           | ⑤a    | `string`    | Prints from the query channel alone, never `search ?? params` |
| `materialize`        | ⑤b    | `State`     | Also THE shape of a router State                              |
| `materializePending` | ⑤b    | `State`     | Same shape, shell left writable for the transition pipeline   |
| `RouteResolver`      | —     | (the port)  | The read-model the router implements at wiring time           |

There is **no stage ②**. Channel separation was deleted — channels arrive correct by the
producer's contract, and the seam behind `resolveForward` refuses a mis-channelled bag instead
of repairing one.

## The brand

`Canonical` carries a phantom field keyed by a `unique symbol` that is **never exported**, so

```ts
materialize({ name, path, query }, "/x"); // ✗ Property '[CANON]' is missing
```

does not compile. Building a State out of un-defaulted channels is unrepresentable, not merely
discouraged. Compile-time only — zero runtime cost.

## Two forms

- **class ①** — `canonicalize(...)` resolves `forwardTo` through the seam: `navigate`,
  `matchPath`, `canNavigateTo`, `buildNavigationState`.
- **LITERAL** — `canonicalize(..., { resolveForward: false })` answers about the route it was
  NAMED: `buildPath`, `isActiveRoute`'s first arm, `makeState`.

## Directory map

```
canonicalize.ts — stages ① + ③, the fast-path gate, the opt-in diagnostics
buildURL.ts     — ⑤a
materialize.ts  — ⑤b
port.ts         — RouteResolver
types.ts        — Canonical + the un-exported brand symbol
index.ts        — the barrel core imports
```

## See Also

- [CLAUDE.md](CLAUDE.md) — the full canon: the port's members, wiring facts, perf notes, gotchas
- [../channels/CLAUDE.md](../channels/CLAUDE.md) — the channel-correctness subsystem this pipeline applies
- [../../CLAUDE.md](../../CLAUDE.md) — the `@real-router/core` package architecture
