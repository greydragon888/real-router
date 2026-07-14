// @tanstack/vue-router nested variant — shared layout chain of DEPTH D (from
// `?n=`, default 1) with sibling leaves a/b at the bottom; each Outlet swaps only
// its child, so the D-deep chain stays mounted across a↔b.
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

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

const BottomLayout = defineComponent({
  setup: () => () => (
    <div class="sec">
      <nav>
        <Link to={`${deepPrefix}/a`} data-testid="link-sec-a">
          A
        </Link>
        <Link to={`${deepPrefix}/b`} data-testid="link-sec-b">
          B
        </Link>
      </nav>
      <Outlet />
    </div>
  ),
});

const PassLayout = defineComponent({
  setup: () => () => (
    <div class="lvl">
      <Outlet />
    </div>
  ),
});

const rootRoute = createRootRoute({
  component: defineComponent({ setup: () => () => h(Outlet) }),
});
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({
    setup: () => () => (
      <main data-testid="page-home">
        <h1>Home</h1>
      </main>
    ),
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const levels: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let parent: any = rootRoute;
for (let k = 1; k <= DEPTH; k++) {
  const p = parent;
  const route = createRoute({
    getParentRoute: () => p,
    path: k === 1 ? "sec" : `l${k}`,
    component: k === DEPTH ? BottomLayout : PassLayout,
  });
  levels.push(route);
  parent = route;
}
const bottom = levels[levels.length - 1];
const aRoute = createRoute({
  getParentRoute: () => bottom,
  path: "a",
  component: defineComponent({ setup: () => () => <Leaf n="a" /> }),
});
const bRoute = createRoute({
  getParentRoute: () => bottom,
  path: "b",
  component: defineComponent({ setup: () => () => <Leaf n="b" /> }),
});
bottom.addChildren([aRoute, bRoute]);
for (let k = 0; k < levels.length - 1; k++) levels[k].addChildren([levels[k + 1]]);

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, levels[0]]),
});

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
