---
"@real-router/browser-plugin": patch
---

An entry the plugin writes keeps the state it was written with where the host stores `history.state` by reference, as jsdom does (#2741)

The plugin reuses one object for the states it writes. A browser stores a structured clone of each write, so the reuse never showed there. jsdom keeps the object itself, and every entry the plugin wrote read back the state written last. Under Vitest or Jest with jsdom, Back from `/users/view/42` to `/home` popped an entry that carried `users.view`: the router answered `SAME_STATES`, a `canDeactivate` guard on `users.view` was never asked, and a refused Back could not return to the entry it started from.

The plugin now writes a copy of each state and stamps the entry's position on the copy. A browser behaves as before. In jsdom, Back and Forward reach the route of the entry they land on.
