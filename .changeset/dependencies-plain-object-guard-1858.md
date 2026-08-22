---
"@real-router/core": minor
---

fix(core): a dependency named `constructor` made the router permanently un-clonable (#1858)

`guardDependencies` decided "is this a plain object?" by reading `deps.constructor`
— a key the caller owns. `constructor` is an ordinary dependency name: `set` stores
it and `has`/`get` agree about it, and from that point the bag's own `constructor`
is the stored value rather than `Object`. Every door that rebuilds a dependency bag
and re-guards it then refused the router's own dependencies.

```
one dependency named …   cloneRouter(router)   createRouter(routes, {}, getAll())
  "constructor"          TypeError             TypeError
  "toString"             ok                    ok
  "valueOf"              ok                    ok
  "hasOwnProperty"       ok                    ok
```

`cloneRouter` is the documented SSR multi-tenancy path, so one ordinary name made a
router unusable for per-request scoping — and the message named the wrong thing: the
bag *is* a plain object; what failed was a heuristic about it.

The predicate now asks the PROTOTYPE's `constructor`, which an ordinary dependency
name cannot shadow.

**`Object.create(null)` is now accepted**, which the old spelling refused. That is a
deliberate widening rather than a side effect: a null-prototype bag is a plain bag
with nothing to inherit through, and the dependency store itself is built that way.

⚠ `proto === Object.prototype` was written first and rejected: it also refuses
`Object.create({ … })`, which #1799 and #1823 rely on reaching the copy loop,
where an inherited key is DROPPED rather than the whole bag rejected. That is
also the spelling `engine/validation/route-batch` uses for route objects, so the
two guards now deliberately disagree about what a plain object is — the
constraint to unify around, if they are ever unified.

⚠ **The two rows above are the intended differences, not the only ones.** An
earlier draft of this entry claimed "differs on exactly two rows"; that was
measured over ten hand-picked shapes and is false over the family. Also moved:
`Object.setPrototypeOf([1, 2], null)` from refused to accepted; an array, `Map`
or class instance whose OWN `constructor` is forged to `Object` from accepted to
refused; and a Proxy answering `get` and `getPrototypeOf` inconsistently moves in
both directions. The middle group is a tightening and the first is harmless, but
none was intended.

⚠ The forgery is not closed, only relocated — a prototype is something the caller
can write to as well, and a class instance whose `prototype.constructor` is set
to `Object` is accepted by the new predicate exactly as it was by the old. A cell
pins that as an open hole so closing it stays a decision rather than an accident.

`Object` itself joins this file's captured intrinsics. `Object.prototype` needs
no capture — it is non-writable and non-configurable — but `proto.constructor`
resolves through `Object.prototype.constructor`, which is writable and cannot be
closed without comparing prototype identity. Re-point it and every plain bag is
refused; that hole predates this change and is now stated rather than implied.
