---
"@real-router/validation-plugin": patch
---

Follow core's dependency validators onto facts (#2382)

The two wrappers take the numbers and the value core already holds, so the plugin
unpacks no store for them. `validateDependencyCount` judges the count and the
limit it is given; the resolved limit comes from `createLimits`, so the plugin
carries no default of its own on this path — `limits.test.ts` › _"should enforce
default maxDependencies limit (100)"_ owns that number through the public door.

Behaviour is identical: same refusals, same messages, same thresholds.
