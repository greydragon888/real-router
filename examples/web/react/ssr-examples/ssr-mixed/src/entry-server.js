import { UNKNOWN_ROUTE } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { serializeRouterState } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { getSsrDataMode, ssrDataPluginFactory, } from "@real-router/ssr-data-plugin";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";
const baseRouter = createAppRouter();
function wrapInScript(json) {
    return `<script>window.__SSR_STATE__=${json}</script>`;
}
/**
 * Render the app for the given URL, branching on per-route SSR mode.
 *
 * - `"full"` — `renderToString(<App/>)`, ship HTML + JSON.
 * - `"data-only"` — ship a minimal shell + JSON. Application reads
 *   `state.context.data` post-hydration to render the real UI.
 * - `"client-only"` — ship a minimal shell + JSON without `data`.
 *   Application detects mode and runs its own client-side fetch.
 */
export async function render(url) {
    const router = cloneRouter(baseRouter);
    router.usePlugin(ssrDataPluginFactory(loaders));
    try {
        const state = await router.start(url);
        if (state.name === UNKNOWN_ROUTE) {
            return {
                html: '<div data-testid="not-found-shell">404</div>',
                serializedData: wrapInScript(serializeRouterState(state)),
                statusCode: 404,
            };
        }
        const mode = getSsrDataMode(state);
        const html = mode === "full"
            ? renderToString(<RouterProvider router={router}>
              <App />
            </RouterProvider>)
            : `<div data-ssr-shell data-ssr-mode="${mode}">SSR mode: ${mode}</div>`;
        return {
            html,
            serializedData: wrapInScript(serializeRouterState(state)),
            statusCode: 200,
        };
    }
    finally {
        router.dispose();
    }
}
