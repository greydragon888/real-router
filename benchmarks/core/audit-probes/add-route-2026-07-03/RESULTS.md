# add-route audit probes — 2026-07-03

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx core/audit-probes/add-route-2026-07-03/probe-0N-*.ts`
(plain run = dist; forced conditions = src; both runs compared — **identical md5** except probe-01/Q9 where dist mangles the identifier in the TypeError message: `e.startsWith` vs `name.startsWith`, semantics identical).

Battery run (25%, discharging) — structural/behavioral probes only; the 10b latency probes
(add×N growth curve, batch-vs-sequential) are `[SKIPPED: battery]`.

## probe-01-add-contract-matrix.ts

| Q | Verdict |
|---|---|
| Q1 flat dotted name `add({name:'flat.leaf'})` | accepted; `has`=true, `matchPath('/flat-leaf')`='flat.leaf' — standalone dotted node |
| Q2 `add(kid, {parent:'flat.leaf'})` | **SILENT DROP** — no throw, `has('flat.leaf.kid')`=false (assertAddable checks the matcher, insertAddedDefinitions walks definitions by dot-segments) |
| Q3 control nested parent | works |
| Q4 dup path vs EXISTING route | **silent URL shadow**, `matchPath('/dup')`='second' (last-wins) — cross-batch case of #955, class filed as #1153 |
| Q5 `forwardTo:'ghost'` bare core | add() silent; deferred `ROUTE_NOT_FOUND` at navigate — wiki claims add-time Error (plugin-only) |
| Q6 `add([])` + listener | emits `{op:'add', added:[]}` for a no-op mutation |
| Q7 add mid-STARTING (async start interceptor) | benign & useful — start resolves to the lazily-added route |
| Q8 route named `__proto__` | safe (null-proto config containers hold) |
| Q9 non-string name, bare core | cryptic `TypeError: name.startsWith is not a function` (dist: `e.startsWith`) from assertNoInternalRouteName |
| Q10 parent = active route | benign, state untouched |
| Q11 add from subscribeLeave listener | allowed, nav completes, route added |
| Q12 TREE_CHANGED timing | synchronous inside add() |
| Q14 self-parent | clean throw (parent does not exist) |
| Q15 parent=`@@router/UNKNOWN_ROUTE` | clean throw (not a tree node) |

## probe-02-flat-dotted-seam.ts

| Q | Verdict |
|---|---|
| A0 verbatim wiki batch example (`users` + `users.view` + `users.edit`) | **broken URL space**: `buildPath('users.view',{id:'1'})`='/1' (wiki intent /users/1); `matchPath('/users/1')`=undefined |
| A0b explicit sibling `users` | unharmed (`/users` intact) — no clobbering |
| A1/A2 flat `a.c` with nested `a` present (constructor and add) | standalone node; URL space NOT nested |
| A2b navigate('a.c') | guard mounted on REAL `a` RAN — name-hierarchy transition semantics vs standalone URL semantics |
| B remove('a') | flat `a.c` **survives as a zombie** (definition kept) with **amputated config** (clearRouteConfigurations wiped `a.*` by prefix) |
| C silent-drop aftermath | TREE_CHANGED **lies** (`add:[flat.leaf.kid]` while `has()`=false); guard factory compiled 1× for the phantom route |
| D/D2 has/get consistency | negatives — get('flat.leaf') works, get('flat')/has('flat') consistently absent |

## Probe artifact caught (not a router defect)

Dynamic `await import("@real-router/core/api")` mixed with static imports under the
plain (dist) resolution loads a second module instance (CJS/ESM dual-package split)
whose `internals` WeakMap does not know the router → "Invalid router instance".
Keep ALL probe imports static.
