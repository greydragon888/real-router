---
"@real-router/rsc-server-plugin": minor
---

Clear the `invalidate(router, "rsc")` flag when the refreshing navigation commits, not when its loader resolves (#2796)

The loader runs while the navigation leaves its route, before activation guards. A navigation an activation guard then refuses — or a newer navigation cancels while an async guard holds it — never shows the node its loader wrote, yet it consumed the flag, so the next navigation did not refresh. The flag now stays set until a navigation that carries the refresh commits, and an `invalidate()` made after that navigation's loader ran stays for the next one. The same class of defect as #2796.

Nothing to change in application code: the navigation after a refused or cancelled one runs the loader again.
