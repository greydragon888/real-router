import { RouteView } from "@real-router/react";
import { AnimatePresence, motion } from "motion/react";

import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { ProductsList } from "./pages/ProductsList";
import { QueryDemo } from "./pages/QueryDemo";
import { useRouteExitCoordination } from "./use-route-exit-coordination";
import { Layout } from "../../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

export function App(): JSX.Element {
  // The hook bridges router.subscribeLeave with AnimatePresence: it bumps
  // `exitToken` inside subscribeLeave (triggering AnimatePresence's exit
  // on the cached old subtree) and resolves the router-blocking Promise
  // when onExitComplete fires. URL and UI stay in lock-step. See
  // `use-route-exit-coordination.ts` for the full mechanism.
  const { exitToken, onExitComplete } = useRouteExitCoordination();

  return (
    <Layout title="Real-Router — Motion Animations" links={links}>
      <AnimatePresence
        mode="wait"
        initial={false}
        onExitComplete={onExitComplete}
      >
        {/*
          AnimatePresence requires motion-component children with `exit` prop
          (plain <div key={...}> would not animate exit). The page-level
          motion.div is keyed by `exitToken` (bumped in subscribeLeave),
          not by route name — at exit-render time the router state is still
          the "old" route, so RouteView naturally renders the old content
          for the exiting subtree. After exit completes and the Promise
          resolves, router commits → next render brings the new content
          for the entering subtree.
        */}
        <motion.div
          key={exitToken}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
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
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
