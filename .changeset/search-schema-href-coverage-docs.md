---
"@real-router/search-schema-plugin": patch
---

Documented: the schema now governs what other plugins inject, too (#1938)

`CLAUDE.md`, `ARCHITECTURE.md` and `README.md` carried a caveat naming
`persistent-params-plugin`'s SECOND interceptor — one this plugin could not
reach, registered on `buildPath` below the route-default merge. That plugin has
stood down from it, so the caveat named something that no longer exists.

No code change here: the seam this plugin already registers is the one both doors
run (core #2087), and the guarantee is pinned from the other side by
`schema-governs-the-href-1938` in `persistent-params-plugin`, whose CONTROL cell
shows an ACCEPTED value still reaching the href.
