import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route } from "@real-router/core";

const routes: Route[] = [{ name: "home", path: "/" }];

const router = createRouter(routes, { defaultRoute: "home" });

async function main() {
  await router.start("/");

  render(
    () => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <div>hello world</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ),
    document.querySelector("#root")!,
  );
}

void main();
