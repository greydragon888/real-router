import { InjectionToken } from "@angular/core";

import type { RouteSignals } from "./types";
import type { Navigator, Router } from "@real-router/core";

/**
 * The three DI tokens live in their own leaf module (#1525). Declaring them in
 * `providers.ts` forms a real value-level dependency cycle: that file also
 * imports the install helpers, and `internal/install.ts` injects `ROUTER` back
 * (`providers → install → providers`). It runs at all only because the helpers
 * are lazy inside environment initializers, and `import-x/no-cycle` flags it. A
 * leaf module breaks the cycle structurally. `providers.ts` re-exports them, so the public surface
 * (`@real-router/angular` barrel, `providersFactory`, `injectRouter`) is
 * unchanged.
 */
export const ROUTER = new InjectionToken<Router>("ROUTER");

export const NAVIGATOR = new InjectionToken<Navigator>("NAVIGATOR");

export const ROUTE = new InjectionToken<RouteSignals>("ROUTE");
