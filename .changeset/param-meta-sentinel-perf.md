---
"@real-router/core": patch
---

Retain one shared frozen `EMPTY_PARAM_META` for fully-static route nodes (#1415)

The route tree no longer keeps a fresh 6-field `ParamMeta` wrapper per fully-static node (all collections were already shared #1009 sentinels; the wrapper carried no information). Browser CDP A/B on the 10k-route table: **−0.340 MB retained heap** on top of #1414 — combined **−18.7 %** (7.725 → 6.279 MB @10k). Observable shape note: on fully-static nodes of the public `RouteTree`, `paramMeta` is identity-shared and its `pathPattern` is `""` (the node's own `path` is the pattern).
