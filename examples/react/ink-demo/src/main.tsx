import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import { InkRouterProvider } from "@real-router/react/ink";
import { render } from "ink";

import { App } from "./components/App";
import { routes } from "./routes";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(memoryPluginFactory());

await router.start("/");

render(
  <InkRouterProvider router={router}>
    <App />
  </InkRouterProvider>,
);
