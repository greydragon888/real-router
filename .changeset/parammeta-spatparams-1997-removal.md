---
"@real-router/core": minor
---

Remove `ParamMeta.spatParams` (#1997)

**Breaking.** A splat's name is no longer listed in a separate array on
`paramMeta`. It lives in `paramMeta.urlParams` — where it always also lived —
and `paramTypeMap` types it `"url"`, exactly as it types a `:param`.

The field sat on the plugin-facing tree surface, reachable both through
`getPluginApi(router).getTree()` and through a matcher segment
(`getSegmentsByName(name)[i].paramMeta`, the door `@real-router/validation-plugin`
itself used). No code in this repository reads it any more.

Migration for a consumer that used it to tell a splat from a `:param`:
`paramMeta.pathPattern` keeps the raw spelling (`"/files/*deep"`). Measured,
`urlParams` and `paramTypeMap` report the two identically, so a consumer that
distinguished them by name alone has to read the pattern.
