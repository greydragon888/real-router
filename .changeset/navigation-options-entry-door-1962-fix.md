---
"@real-router/core": minor
---

Every plugin hook receives the same frozen options object, copied once at the entry door ([#1962](https://github.com/greydragon888/real-router/issues/1962))

`onTransitionSuccess(toState, fromState, opts)` used to receive **the
application's own `NavigationOptions` literal** on some navigations and a copy on
others, and the discriminator was whether the caller happened to pass a `signal`
— which the plugin never sees. Measured across the five arcs:

| arc                        | hook received the caller's object |
| -------------------------- | --------------------------------- |
| `navigate(name, …, opts)`  | **yes** — and a write reached the app |
| the same call with `signal` | no                               |
| `navigate(target, opts)`   | **yes** — and a write reached the app |
| `navigateToDefault(opts)`  | **yes** — and a write reached the app |
| forced replace out of a 404 | no                               |

So a plugin annotating its hook argument — `opts.handled = true`, the cheapest
way to pass a flag to the next plugin — wrote into the application's literal on
three arcs and into a private copy on the other two, with no way to tell which.
An app reusing one options constant carried the annotation forward across
navigations.

Core now copies the bag **once**, where it first receives it, and reads its own
copy everywhere below. Every hook on every arc receives that copy, frozen.

**Why the copy could not simply be made at the announcement**, which is where the
`signal`-dependent one lived: copying there reads the caller's object a second
time, below the read that already decided the navigation, and
`opts-read-once-1817` pins that count at one. Above the reads there is no second
read to make — the six flags now come off core's record, so the caller's
accessors are entered **once per key** and the announcement no longer touches the
bag at all.

### Breaking changes

⚠ **The object handed to a hook is frozen.** A plugin that writes to `opts` now
throws. No shipped plugin does (measured: 18 hooks bind the parameter, 0 write to
it); `state.context` and `claimContextNamespace()` are the sanctioned channel for
plugin-to-plugin data.

⚠ **Only OWN ENUMERABLE keys of the bag are read.** An option supplied through
the prototype chain, defined non-enumerable, or answered by a `Proxy` whose
target does not hold it, is ignored rather than honoured. This applies the owner
decision of 2026-08-18 (`CLAUDE.md`, "Supported Input Shapes") to the navigation
options, and it is the narrowing
[#1813](https://github.com/greydragon888/real-router/issues/1813) named when it
was closed. ⚠ It is **not** the last read-by-name channel: `snapshotQueryParams`
still reads the four `queryParams` fields by name, so an inherited or
non-enumerable format is still honoured there. That is the other half #1813
named, and it is out of scope here. Vue `reactive()` and Svelte `$state` are
pass-through proxies over real objects and are unaffected.

⚠ **Symbol-keyed entries no longer reach the hook.** The same rule the path and
query channels have always applied.

⚠ **A throwing getter on ANY key now fails the navigation, and the outcome is
better than what it replaces.** Measured on the previous release with
`{ reload: true, get boom() { throw } }`: without a signal the navigation
RESOLVED (the key was never read); with one it **committed the state, announced
success to every plugin, and rejected the caller with `CANCELLED`** — naming
neither the real cause nor the actual outcome. Both arcs now reject with the
caller's own error and commit nothing.

### Not a change

`hash`, `hashChange`, `source` and any other key an application or plugin
attaches still ride to the hook: the copy preserves every own enumerable key
(owner decision, 2026-08-30). `opts.signal` is still absent from what a hook
receives, as before.
