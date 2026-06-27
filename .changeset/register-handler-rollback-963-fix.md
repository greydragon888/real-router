---
"@real-router/core": patch
---

Fix: guard registration rollback preserves the previously-valid guard on overwrite-then-throw (#963)

Registering a guard onto a slot that already held one, with a factory that throws on compile, used to leave the slot empty — the rollback ran `targetMap.delete(name)` + `functions.delete(name)`, silently dropping the still-valid previous guard. `#registerHandler` now captures the slot's prior factory before the overwrite and, on a compile throw, restores it (recompiling its function via `#recompileSlot`) instead of clearing the slot. A failed overwrite via `addActivateGuard` / `addDeactivateGuard` now leaves the previously-registered guard intact.
