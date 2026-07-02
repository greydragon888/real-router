// @tanstack/vue-router nested variant — shared section layout (Outlet) with
// sibling leaves a/b. Switching a↔b reuses the parent layout.
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

const Leaf = defineComponent({
  props: { n: { type: String, required: true } },
  setup(props) {
    return () => (
      <main data-testid="page-item" data-n={props.n}>
        <h1>{props.n}</h1>
      </main>
    );
  },
});

const rootRoute = createRootRoute({
  component: defineComponent({ setup: () => () => h(Outlet) }),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({ setup: () => () => <main data-testid="page-home"><h1>Home</h1></main> }),
});

const secRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "sec",
  component: defineComponent({
    setup: () => () => (
      <div class="sec">
        <nav>
          <Link to="/sec/a" data-testid="link-sec-a">
            A
          </Link>
          <Link to="/sec/b" data-testid="link-sec-b">
            B
          </Link>
        </nav>
        <Outlet />
      </div>
    ),
  }),
});

const aRoute = createRoute({ getParentRoute: () => secRoute, path: "a", component: defineComponent({ setup: () => () => <Leaf n="a" /> }) });
const bRoute = createRoute({ getParentRoute: () => secRoute, path: "b", component: defineComponent({ setup: () => () => <Leaf n="b" /> }) });

const routeTree = rootRoute.addChildren([homeRoute, secRoute.addChildren([aRoute, bRoute])]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
