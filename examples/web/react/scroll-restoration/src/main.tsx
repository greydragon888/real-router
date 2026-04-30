import { createRouter } from "@real-router/core";
import { navigationPluginFactory } from "@real-router/navigation-plugin";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";
import "./styles.css";

// Mode + behavior persisted in localStorage. Switching them remounts the
// RouterProvider via React `key` — utility is destroyed and recreated.
const MODE_KEY = "scroll-restoration-mode";
const BEHAVIOR_KEY = "scroll-restoration-behavior";

type Mode = "restore" | "top" | "native";

function readMode(): Mode {
  const raw = globalThis.localStorage.getItem(MODE_KEY);

  return raw === "top" || raw === "native" ? raw : "restore";
}

function readBehavior(): ScrollBehavior {
  const raw = globalThis.localStorage.getItem(BEHAVIOR_KEY);

  return raw === "instant" || raw === "smooth" ? raw : "auto";
}

function decodeHashSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Initial scroll handling for cold load.
 *
 * `createScrollRestoration` subscribes to the router AFTER `router.start()`
 * has already fired its first TRANSITION_SUCCESS. The initial route's
 * `state.context.url.hash` (anchor) and `state.context.navigation.navigationType`
 * ("reload" after F5 via #531 priming) never reach the utility's rAF callback.
 * Runtime navigation (`<Link hash>`, back/forward, programmatic) still goes
 * through the utility normally.
 *
 * For cold load we add a userland scroll fixup that mirrors the utility's
 * decision tree:
 *  1. If hash present → scrollIntoView (anchor scroll on direct entry).
 *  2. Else if `navigation.activation.navigationType === "reload"` → read
 *     position from `sessionStorage["real-router:scroll"][keyOf(route)]` and
 *     scroll there (F5 restore).
 */
type RouterLike = ReturnType<typeof createRouter>;

function applyInitialAnchorScroll(): void {
  if (globalThis.location.hash.length <= 1) {
    return;
  }

  const id = decodeHashSafe(globalThis.location.hash.slice(1));

  // Poll for the element until it's mounted (React commit is async).
  // Give up after ~600ms; fragment may simply not exist on this page.
  // getElementById is preferred over querySelector — the id may contain
  // CSS-unsafe characters (Cyrillic etc. — see Scenario 3d).
  let attempts = 0;
  const tryScroll = (): void => {
    // eslint-disable-next-line unicorn/prefer-query-selector -- id may contain CSS-unsafe chars
    const element = document.getElementById(id);

    if (element) {
      element.scrollIntoView();

      return;
    }

    if (attempts < 20) {
      attempts += 1;
      setTimeout(tryScroll, 30);
    }
  };

  setTimeout(tryScroll, 30);
}

function applyInitialF5Restore(router: RouterLike, mode: Mode): void {
  if (mode !== "restore") {
    // top: utility always scrolls to anchor-or-top regardless of nav state
    // native: utility is fully disabled
    return;
  }

  const navApi = (
    globalThis as { navigation?: { activation?: { navigationType?: string } } }
  ).navigation;

  if (navApi?.activation?.navigationType !== "reload") {
    return;
  }

  const route = router.getState();

  if (!route) {
    return;
  }

  const key = `${route.name}:${JSON.stringify(route.params)}`;
  let store: Record<string, number | undefined>;

  try {
    const raw = globalThis.sessionStorage.getItem("real-router:scroll");

    store = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return;
  }

  const pos = store[key];

  if (typeof pos === "number" && pos > 0) {
    // After React commits the route, scroll to the saved position.
    setTimeout(() => {
      globalThis.scrollTo(0, pos);
    }, 50);
  }
}

if ("navigation" in globalThis) {
  const router = createRouter(routes, {
    defaultRoute: "home",
    allowNotFound: true,
  });

  router.usePlugin(navigationPluginFactory());

  await router.start();

  const mode = readMode();
  const rootElement = document.querySelector("#root");

  if (rootElement) {
    // RouterProvider is mounted INSIDE App so that mode toggle can swap
    // scrollRestoration options by remounting the provider (via React `key`).
    // navigation-plugin intercepts `location.reload()` and converts it to a
    // same-document SPA refresh — the React tree (and the already-mounted
    // utility) survives, so reload-based mode swap doesn't actually work.
    // Remounting the provider with a new `key` triggers utility destroy +
    // recreate with the new mode.
    const behavior = readBehavior();

    createRoot(rootElement).render(
      <App router={router} initialMode={mode} initialBehavior={behavior} />,
    );

    applyInitialAnchorScroll();
    applyInitialF5Restore(router, mode);
  }
} else {
  document.body.innerHTML = `
    <div class="fallback">
      <h1>Navigation API is required</h1>
      <p>This example uses navigation-plugin which requires the Navigation API
         (~88% global, Chrome 102+, Safari 26.2+, Firefox 147+).</p>
      <p><a href="https://caniuse.com/mdn-api_navigation">caniuse.com/mdn-api_navigation</a></p>
    </div>`;
}
