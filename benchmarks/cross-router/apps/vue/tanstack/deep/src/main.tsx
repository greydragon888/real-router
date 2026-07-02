// @tanstack/vue-router deep variant — nested route tree to depth 90 (layout per
// level renders <Outlet>; an index "/" child per level = the leaf). Routes are
// created with parent thunks, then assembled bottom-up via addChildren.
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

const OutletComp = defineComponent({ setup: () => () => h(Outlet) });

const rootRoute = createRootRoute({ component: OutletComp });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({
    setup: () => () => (
      <nav>
        {DEEP_TARGETS.map((d) => (
          <Link key={d} to={deepPath(d)} data-testid={`link-deep-${d}`}>
            Depth {d}
          </Link>
        ))}
      </nav>
    ),
  }),
});

const deepRoute = createRoute({ getParentRoute: () => rootRoute, path: "deep", component: OutletComp });

// Create layout + leaf routes per level; parent chain via thunks. Typed `any`:
// a 90-deep programmatic route tree blows up tanstack's recursive Route generics
// under exactOptionalPropertyTypes (a type-inference limit, not a runtime issue).
/* eslint-disable @typescript-eslint/no-explicit-any */
const layoutRoutes: any[] = [];
const leafRoutes: any[] = [];
for (let k = 1; k <= DEEP_DEPTH; k++) {
  const layout = createRoute({
    getParentRoute: () => (k === 1 ? deepRoute : layoutRoutes[k - 2]),
    path: `l${k}`,
    component: OutletComp,
  });
  layoutRoutes.push(layout);
  leafRoutes.push(
    createRoute({
      getParentRoute: () => layoutRoutes[k - 1],
      path: "/",
      component: defineComponent({ setup: () => () => <CatalogItem n={String(k)} /> }),
    }),
  );
}

// Assemble bottom-up: each layout owns [leaf, deeper-layout].
let built: any = layoutRoutes[DEEP_DEPTH - 1].addChildren([leafRoutes[DEEP_DEPTH - 1]]);
for (let k = DEEP_DEPTH - 1; k >= 1; k--) {
  built = layoutRoutes[k - 1].addChildren([leafRoutes[k - 1], built]);
}

const routeTree = rootRoute.addChildren([homeRoute, deepRoute.addChildren([built])]);
/* eslint-enable @typescript-eslint/no-explicit-any */
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
