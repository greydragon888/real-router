import { RouteView } from "@real-router/solid";
import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";

import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { ProductsList } from "./pages/ProductsList";
import { QueryDemo } from "./pages/QueryDemo";
import { useRouteExitCoordination } from "./use-route-exit-coordination";
import { Layout } from "../../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

export function App(): JSX.Element {
  // The hook bridges router.subscribeLeave with Presence: it bumps
  // `exitToken` inside subscribeLeave (driving Presence's exit on the
  // cached old subtree) and resolves the router-blocking Promise when
  // onMotionComplete fires on the exiting Motion.div. URL and UI stay
  // in lock-step. See `use-route-exit-coordination.ts` for the full
  // mechanism.
  const { exitToken, onMotionComplete } = useRouteExitCoordination();

  return (
    <Layout title="Real-Router — Motion Animations" links={links}>
      <Presence exitBeforeEnter initial={false}>
        {/*
          `<Show keyed>` re-instantiates its child every time the value
          changes. Presence watches its children and runs the previous
          child's `exit` animation before mounting the new one. We add
          1 so the initial render satisfies the truthy `when` check
          (exitToken starts at 0).

          During the exit phase, RouteView still renders the old route's
          content because router state hasn't moved yet — the cached
          old subtree exits with the leaving page visible. After exit
          completes and the router commits, the new Motion.div mounts
          with the new content and the entry animation plays.
        */}
        <Show when={exitToken() + 1} keyed>
          <Motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.9, easing: [0.4, 0, 0.2, 1] }}
            onMotionComplete={onMotionComplete}
          >
            <RouteView nodeName="">
              <RouteView.Match segment="home">
                <Home />
              </RouteView.Match>
              <RouteView.Match segment="products">
                <RouteView nodeName="products">
                  <RouteView.Self>
                    <ProductsList />
                  </RouteView.Self>
                  <RouteView.Match segment="detail">
                    <ProductDetail />
                  </RouteView.Match>
                </RouteView>
              </RouteView.Match>
              <RouteView.Match segment="about">
                <About />
              </RouteView.Match>
              <RouteView.Match segment="queryDemo">
                <QueryDemo />
              </RouteView.Match>
              <RouteView.NotFound>
                <h1>404 — Page Not Found</h1>
                <p>The page you are looking for does not exist.</p>
              </RouteView.NotFound>
            </RouteView>
          </Motion.div>
        </Show>
      </Presence>
    </Layout>
  );
}
