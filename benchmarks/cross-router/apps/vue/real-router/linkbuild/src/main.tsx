// real-router (Vue) link-build variant — mount 1000 <Link>s; each builds its
// href via the reverse-matcher (buildPath). Isolates href construction.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider } from "@real-router/vue";
import { createApp, defineComponent, h, ref } from "vue";

import type { Route } from "@real-router/core";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

const routes: Route[] = [
  { name: "home", path: "/" },
  ...Array.from({ length: COUNT }, (_, i) => ({ name: `r${i}`, path: `/r${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const App = defineComponent({
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
                routeName={`r${i}`}
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
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
