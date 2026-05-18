import { RenderMode, type ServerRoute } from "@angular/ssr";

// All routes that reach the Angular renderer use `RenderMode.Server`.
// The mode-branching middleware in `server.ts` short-circuits requests
// for routes whose ssr-data-plugin entry resolves to `"client-only"` or
// `"data-only"` — those return shell HTML directly without bootstrapping
// Angular. Only routes resolved as `"full"` arrive here.
export const serverRoutes: ServerRoute[] = [
  {
    path: "**",
    renderMode: RenderMode.Server,
  },
];
