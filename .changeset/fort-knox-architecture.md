---
"@real-router/core": minor
---

Refactor internal architecture to namespace-based design (#34)

Internal refactoring from functional decorator composition to class-based namespace architecture:

- 11 namespace classes with true encapsulation via private fields (`#`)
- Clean separation of concerns (Options, Dependencies, State, Routes, Navigation, etc.)
- Improved maintainability and testability

**No breaking changes** — public API remains 100% backward compatible.
