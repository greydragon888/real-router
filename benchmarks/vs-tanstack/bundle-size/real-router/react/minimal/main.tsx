import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";

const routes: Route[] = [{ name: "home", path: "/" }];

const router = createRouter(routes, { defaultRoute: "home" });

async function main() {
  await router.start("/");

  createRoot(document.querySelector("#root")!).render(
    <StrictMode>
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <div>hello world</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    </StrictMode>,
  );
}

void main();
