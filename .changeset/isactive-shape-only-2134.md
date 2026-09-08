---
"@real-router/validation-plugin": patch
---

`isActiveRoute` judges the path bag by shape, and stops walking its values (#2134)

This door returns a boolean and ships nothing out of the bag, so there is no
shipped value for a judged one to disagree with. What the value walk bought here
was a call into the application's accessors on a door where bare core makes
none: an inactive link — most links on a page — reads the bag zero times without
this plugin and once with it, on every render.

Measured across fourteen inputs on both arms of the predicate, the plugin now
answers exactly what bare core answers, with exactly as many reads: 0 on an
inactive link, 1 on an active one, 1 on a forwarding route.

⚠ A bag this plugin used to REFUSE at this door now gets an answer instead: a
`Symbol`, a function, a `BigInt` or a cyclic value in the bag. The answer is
bare core's own and is not weakened by the change — a declared param whose value
the active state cannot hold still answers `false`, and an undeclared key is
ignored whatever its value, exactly as a plain `{ junk: "x" }` always has been.

⚠ The diagnostic is not lost, it moves to the door that READS the bag. The same
object still throws from `canNavigateTo` and `buildPath`, which an adapter's
`<Link>` calls on the same render as this predicate.

⚠ The sibling predicate `canNavigateTo` keeps its value walk, and the two are
not required to agree. They already did not: a control character in a param
makes `canNavigateTo` throw while this door answers `false`, and a throwing
accessor does the reverse. What each door does with the bag is the difference —
one builds a path out of it, the other compares it.
