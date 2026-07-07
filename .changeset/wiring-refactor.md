---
"@real-router/core": patch
---

Collapse `RouterWiringBuilder` into plain wiring functions (#1334)

Internal refactor, no behavior change. The single-call-site `RouterWiringBuilder` class + `wireRouter` director collapse into module-level `wire*` functions over a shared `NamespaceBag`, removing the namespace field list that was repeated three times. `createCompileFactory` is deduped into one shared factory for both guard and plugin compilation, and its `getDependency` accessor is now allocated once per router instead of once per compile call.
