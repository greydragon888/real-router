---
"@real-router/validation-plugin": patch
---

a guard registered under a name the tree does not carry is reported at start() (#2049)

`addActivateGuard("admn", denyGuard)` — a typo'd route name — registered cleanly
and the guard never ran. Neither layer said anything: bare core stored it, and
this plugin checked the name's FORMAT and the handler's TYPE but never asked
whether the route exists.

⚠ **The door cannot answer this.** Registering a guard BEFORE its route exists is
a declared, working capability — register for `"later"`, add the route, navigate,
and the guard fires. At the door a typo and a not-yet-added route are therefore
indistinguishable, and a reject there would retire the capability. `start()` is
the first moment they come apart, because the tree is built by then.

⚠ **A warning, not a throw**, unlike `validateResolvedDefaultRoute` one door
over. A `defaultRoute` naming nothing is unusable; a guard for a route added
after `start()` is unusual but legitimate, so this reports and steps aside. A
cell pins that the capability still works.

Only EXTERNAL guards are reported — a definition guard arrives attached to a
route in the config, so its name cannot be a typo by construction.
