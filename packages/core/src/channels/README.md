# channels — channel correctness in `@real-router/core`

> One rule · three mechanisms · one directory

`params` is the **path** channel, `search` the **query** channel, and the router moves nothing
between them: the two meet in exactly one place, the printed URL. This directory owns every
mechanism that enforces or applies that — including core's fifth always-on invariant guard.

---

## ⚠️ Internal — not a public API

This directory is an **internal subsystem of core**, not a published package and not a public
import path.

- It has **no `package.json`** — it is bundled into `@real-router/core` at build time.
- **Do not import from a deep `src/channels/*` path.** There is no such public entry point;
  application code meets these mechanisms only through their effects (a `TypeError` naming the
  mis-channelled key, a `RouterError(WRONG_CHANNEL)`, a dropped undeclared query key).
- The only consumers are core's own facade, namespaces, wiring and pipeline.

Everything below documents this subsystem for **core contributors**.

---

## What it is

| Mechanism  | File          | Does                        | When                                       |
| ---------- | ------------- | --------------------------- | ------------------------------------------ |
| `guard`    | `guard.ts`    | **DETECTS** and refuses     | Navigation — on the caller's raw bag       |
| `defaults` | `defaults.ts` | Refuses **at config time**  | Registration — `createRouter` / route CRUD |
| `modeGate` | `modeGate.ts` | **FIXES** and never reports | The pipeline's single terminal             |

Only `guard` is a guard. `modeGate` is deliberately **not** one: it normalises rather than
detects, so a query key the active `queryParamsMode` will not print never enters `state.search`.

## The rule, in one line each

- **The slot IS the channel.** `defaultParams` is the path channel, `defaultSearch` the query
  channel, in every position. The router does not route a default by what the route declares.
- **Channel-correctness is the producer's contract.** Stage ② (channel separation) is deleted —
  a mis-channelled bag is refused, never repaired, because repairing it let the caller keep
  believing their bag was the one that shipped.
- **The caller beats the default**, within a channel. `undefined` is absence on both sides.

## Boundary

This directory imports **nothing** from the namespaces, the engine or the pipeline. Declared
query names arrive as DATA (`readonly string[]`, or a `queryNamesOf` accessor), never as a
matcher — so a second derivation of the one query registry ([#1556](https://github.com/greydragon888/real-router/issues/1556))
cannot grow here. Enforced by a `no-restricted-imports` block in
`packages/core/eslint.config.mjs`, not by convention.

## Directory map

```
guard.ts     — findMisChanneledKey · assertChannelCorrect · misChanneledKeyMessage
defaults.ts  — assertRouteDefaultChannels · withholdFilledSlots
modeGate.ts  — admittedSearch
index.ts     — the barrel core imports
```

## See Also

- [CLAUDE.md](CLAUDE.md) — the full canon: exports, the twelve call sites, gotchas
- [../../CLAUDE.md](../../CLAUDE.md) — the `@real-router/core` package architecture
- [../pipeline/CLAUDE.md](../pipeline/CLAUDE.md) — the navigation delivery pipeline
