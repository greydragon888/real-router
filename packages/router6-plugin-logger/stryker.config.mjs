/**
 * ✨ Конфигурация мутационного тестирования для Router6 Plugin Logger
 *
 * Основана на успешном опыте router-error:
 * ✅ Vitest runner + perTest coverage
 * ✅ Absolute paths для workspace dependencies (logger, router6, router6-types)
 * ✅ Incremental mode для кеширования
 * ✅ Без "tests slash-star-star" в ignorePatterns
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  checkers: ["typescript"],

  // Мутируем все исходники кроме barrel exports, types и constants
  mutate: [
    "modules/**/*.ts",
    "!modules/index.ts", // Barrel export - skip
    "!modules/types.ts", // Type definitions - skip
    "!modules/constants.ts", // Constants - skip
  ],

  // Vitest runner с оптимизированной конфигурацией
  vitest: {
    configFile: "vitest.stryker.config.mts",
    related: false, // Disable related test detection (barrel export issue)
  },

  // ✨ КРИТИЧНО: "perTest" для Vitest игнорируется, но оставляем для совместимости
  // Workspace dependencies работают через absolute paths в vitest.stryker.config.mts
  coverageAnalysis: "perTest",

  // Local tsconfig
  tsconfigFile: "tsconfig.json",

  // Mutation score thresholds
  thresholds: {
    high: 85, // Plugin сложнее - средняя планка
    low: 70,
    break: 60,
  },

  // Performance settings
  concurrency: 2, // 2 параллельных процесса
  timeoutMS: 10000, // 10s (тесты быстрые)
  timeoutFactor: 3, // 3x safety margin

  // Reporters
  reporters: ["progress", "clear-text", "html"],
  htmlReporter: {
    fileName: "reports/mutation-report.html",
  },

  // ⚠️ КРИТИЧНО: НЕ исключаем tests/ - они нужны в sandbox!
  ignorePatterns: [
    "dist",
    "coverage",
    "node_modules",
    ".turbo",
    ".vitest",
    ".bench",
    // ❌ НЕ ДОБАВЛЯТЬ "tests/**" - тесты ДОЛЖНЫ быть в sandbox!
  ],

  // Incremental mode (cache results)
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",

  // Clean temp dir between runs
  cleanTempDir: true,
};
