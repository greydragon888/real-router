# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-01-18

### Announcement

**router6 1.0.0 is the final version of the router5 fork.**

This release marks the completion of the router6 project as a standalone fork of [router5](https://github.com/router5/router5). Further development will only include bug fixes if they arise.

### What's Next

I'm starting a new project: **real-router**.

router6 will become version 0.0.1 in this new project, serving as the foundation for continued development under a new name and direction.

### Summary of router6

router6 was a complete rewrite of router5, delivering:

- **1.8x to 22x faster** hot-path operations
- **O(1) route lookup** instead of O(n) linear search
- **TypeScript-first** design with full type safety
- **Immutable state** architecture
- **Modern ESM/CJS** builds with tree-shaking

### Packages in 1.0.0

| Package | Version | Description |
|---------|---------|-------------|
| router6 | 1.0.0 | Core router implementation |
| react-router6 | 1.0.0 | React integration |
| router6-plugin-browser | 1.0.0 | Browser history plugin |
| router6-plugin-logger | 1.0.0 | Debug logging plugin |
| router6-plugin-persistent-params | 1.0.0 | Persistent params plugin |
| router6-helpers | 1.0.0 | Utility functions |

---

## Pre-1.0.0

For changes prior to 1.0.0, see the [router5 changelog](https://github.com/router5/router5/blob/master/CHANGELOG.md).
