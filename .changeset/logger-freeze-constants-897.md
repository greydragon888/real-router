---
"@real-router/logger": patch
---

Freeze the exported `LEVEL_CONFIGS` and `LOG_LEVELS` constants (#897)

`LEVEL_CONFIGS` / `LOG_LEVELS` were exported as plain mutable objects despite backing the process-global threshold logic of the singleton `logger`. Mutating one (`LEVEL_CONFIGS["error-only"] = -100`, or `delete LEVEL_CONFIGS.none`) silently corrupted log filtering for the whole process, including core's own logs. Both are now `Object.freeze`d, so the runtime matches the `Record`/readonly intent — same own-property/immutability discipline already applied to the `callback` (#792) and `level` (#895) inputs.
