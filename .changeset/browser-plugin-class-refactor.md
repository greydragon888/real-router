---
"@real-router/browser-plugin": patch
---

Refactor into class-based architecture with extracted URL utilities (#225)

Internal refactoring: replaced monolithic factory closure with `BrowserPlugin` class, extracted URL logic into dedicated `url-utils` module, removed IE/Trident dead code, and simplified popstate handling to use `router.navigate()` through the full core pipeline.
