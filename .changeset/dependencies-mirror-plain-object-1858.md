---
"@real-router/validation-plugin": patch
---

fix(validation-plugin): the dependency validators refused two shapes core accepts (#1858, #1799)

`validateDependenciesObject` and `validateCloneArgs` judged "is this a plain
object?" by reading `deps.constructor` — the spelling core replaced in #1858
because it reads a key the caller owns. While these two copies lagged, an
application running this plugin got a **false reject** on exactly the shapes core
had just widened: `setDependencies` and `cloneRouter`'s override bag both threw
on a bag carrying a `constructor` key, which is the #1858 defect itself, on a
different door. A null-prototype bag was refused here and accepted by core.

This plugin's contract is `plugin ⊇ core` — diagnose more, never refuse what core
accepts — so a stale mirror is a defect even when the newer half is the one that
moved. Both now ask the prototype, through a shared `isPlainBag`.

Their key walks move from `for…in` + `getOwnPropertyDescriptor` to `Object.keys`
for the same reason core's did (#1799): the two answer about different property
sets, so the loop iterated exactly the names it could not judge, and on a Proxy
they disagree about ownership outright.

The four intrinsics these validators depend on are captured at module load,
matching `core/src/guards.ts`.
