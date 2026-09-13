---
"@real-router/validation-plugin": patch
---

Stop re-judging `queryParams` formats core already refuses, and bind the sub-option names it does own

`validateOptions` carried its own list of valid values for `queryParams.arrayFormat`, `booleanFormat`, `nullFormat` and `numberFormat`. Those lists could never fire: core refuses an unknown format by name at `createRouter` — before this plugin is installed — and prints the same message, with the same prefix and the same field path. There is no second door, because `setOption` was removed in #63. Nothing changes for anyone using the plugin: the same input produced core's error before this change and produces it after.

What replaces them is the half this plugin really does decide, and the half nothing was watching: which `queryParams` sub-options exist. That registry is now keyed by core's own `QueryParamsOptions`, so a sub-option core adds and this plugin does not know about fails to compile here instead of being rejected at runtime as an unknown option.
