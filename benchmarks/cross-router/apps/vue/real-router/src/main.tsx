// real-router (Vue adapter) base app — home/about/user. Mirrors the React/Preact
// cohorts' base app with the same data-testid contract; Vue JSX + @real-router/vue.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const UserRoute = defineComponent({
  setup() {
    const { route } = useRoute<{ id: string }>();
    return () => {
      const id = route.value.params.id;
      const next = String(Number(id) + 1);
      return (
        <>
          <User id={id} />
          <Link routeName="user" routeParams={{ id: next }} data-testid="link-user-next">
            Next
          </Link>
        </>
      );
    };
  },
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {NAV.map((n) => (
            <Link key={n.name} routeName={n.name} data-testid={n.testid}>
              {n.label}
            </Link>
          ))}
        </nav>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="about">
            <About />
          </RouteView.Match>
          <RouteView.Match segment="user">
            <UserRoute />
          </RouteView.Match>
        </RouteView>
      </>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
