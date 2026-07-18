// Setup for the AOT project ONLY (#1512). Unlike `tests/setup.ts`, this file
// deliberately does NOT `import "@angular/compiler"`: templates here are
// compiled ahead-of-time by @analogjs/vite-plugin-angular, so the runtime JIT
// compiler is not needed — and its presence would mask a silent AOT-transform
// failure behind a partial JIT fallback. If the transform breaks, tests must
// fail loudly (the K0 canary), not quietly degrade.
import { setupTestBed } from "@analogjs/vitest-angular/setup-testbed";

setupTestBed();
