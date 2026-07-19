import { InjectionToken } from "@angular/core";

import type { RouteSignals } from "./types";
import type { Navigator, Router } from "@real-router/core";

/**
 * The three DI tokens live in their own leaf module (#1525): they used to be
 * declared in `providers.ts`, which also imports the install helpers — and
 * `internal/install.ts` injects `ROUTER` back, forming a real value-level
 * dependency cycle (`providers → install → providers`) that only worked
 * because the helpers run lazily inside environment initializers. The revived
 * `import-x/no-cycle` gate flags it; hoisting the tokens breaks the cycle
 * structurally. `providers.ts` re-exports them, so the public surface
 * (`@real-router/angular` barrel, `providersFactory`, `injectRouter`) is
 * unchanged.
 */
export const ROUTER = new InjectionToken<Router>("ROUTER");

export const NAVIGATOR = new InjectionToken<Navigator>("NAVIGATOR");

export const ROUTE = new InjectionToken<RouteSignals>("ROUTE");
