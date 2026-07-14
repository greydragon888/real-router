// @tanstack/vue-router link-build variant — mount 1000 <Link>s; each builds its
// href via the router (1000 target routes registered so the build is real).
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h, ref } from "vue";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

const rootRoute = createRootRoute({
  component: defineComponent({ setup: () => () => h(Outlet) }),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({
    setup() {
      const show = ref(false);
      return () => (
        <>
          <button data-testid="mount-links" onClick={() => { show.value = true; }}>
            mount
          </button>
          <main data-testid="page-ready">{show.value ? "shown" : "idle"}</main>
          {show.value && (
            <nav>
              {Array.from({ length: COUNT }, (_, i) => (
                <Link
                  key={i}
                  to={`/r${i}`}
                  data-testid={i === COUNT - 1 ? "last-link" : undefined}
                >
                  r{i}
                </Link>
              ))}
            </nav>
          )}
        </>
      );
    },
  }),
});

const rRoutes = Array.from({ length: COUNT }, (_, i) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/r${i}`,
    component: defineComponent({ setup: () => () => null }),
  }),
);

const routeTree = rootRoute.addChildren([homeRoute, ...rRoutes]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
