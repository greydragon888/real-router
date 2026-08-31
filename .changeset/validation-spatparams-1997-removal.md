---
"@real-router/validation-plugin": minor
---

Drop the `spatParams` reads from route validation (#1997)

`ParamMeta.spatParams` is gone from core. The retrospective and `forwardTo`
validators each collected a route's required params into a `Set` from
`urlParams` and then from `spatParams`; a splat's name is already in
`urlParams`, so the second loop added nothing. No validation outcome changes.
