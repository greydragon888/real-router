---
"@real-router/core": minor
---

Reject an index child under a MID-PATH optional parent (#1294)

The #1242 §5.4 gate rejected an index route (`path: "/"`) under a parent whose LAST segment is an optional param or splat, but checked only that last segment — so a parent with an optional param in a MID-path position (`/a/:b?/c`) registered silently while the index bound only the take form (`/a/x/c/` → index, `/a/c/` → parent). The gate now rejects an optional param in ANY position of the parent path, matching the form-consistency it already promised. A required-param parent (`/users/:id`, `/a/:b/c`) has a single form and stays allowed. Follow-up of #1242 §5.4.
