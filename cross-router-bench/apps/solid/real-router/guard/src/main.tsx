// FEATURE DEMO — blocking guard (real-router). Route `canDeactivate` returns
// false while `dirty`, so leaving /editor is blocked; Save clears the flag and
// navigation is allowed. wouter has no guard API (N/A).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import type { GuardFnFactory, Route } from "@real-router/core";
import type { JSX } from "solid-js";

let dirty = true;
const canLeaveEditor: GuardFnFactory = () => () => !dirty;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "editor", path: "/editor", canDeactivate: canLeaveEditor },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function Editor(): JSX.Element {
  return (
    <main data-testid="page-editor">
      <h1>Editor</h1>
      <button
        data-testid="btn-save"
        onClick={() => {
          dirty = false;
        }}
      >
        Save
      </button>
      <Link routeName="home" data-testid="link-home">
        Home
      </Link>
    </main>
  );
}

function App(): JSX.Element {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <main data-testid="page-home">Home</main>
      </RouteView.Match>
      <RouteView.Match segment="editor">
        <Editor />
      </RouteView.Match>
    </RouteView>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    rootElement,
  );
}
