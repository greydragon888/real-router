---
"@real-router/logger-plugin": patch
---

Fix logger-plugin configuration options being ignored

- Replace `logger` singleton with direct `console` calls to make plugin logs independent of router configuration
- Enable `loggerPluginFactory(options)` to accept configuration parameter
- Implement `level` option filtering (`all`, `transitions`, `errors`, `none`)
- Implement `showParamsDiff` option to control parameter diff logging
- Implement `showTiming` option to control timing information display
