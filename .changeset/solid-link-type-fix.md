---
"@real-router/solid": patch
---

Fix Link rest props type compatibility with solid-js 1.9.12 (#418)

Added type assertion for `rest` spread on `<a>` element to satisfy `exactOptionalPropertyTypes` constraint introduced in solid-js 1.9.12.
