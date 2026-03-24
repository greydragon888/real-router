import {
  createRouteSource,
  createTransitionSource,
} from "@real-router/sources";
import {
  createSignalFromSource,
  createStoreFromSource,
  useRouter,
} from "@real-router/solid";
import { createEffect, createSignal, Show } from "solid-js";

import type { RouteSnapshot } from "@real-router/sources";
import type { JSX } from "solid-js";

export function NavigationMonitor(): JSX.Element {
  const router = useRouter();

  // Low-level: createSignalFromSource for transition state (Accessor-based)
  const transitionSource = createTransitionSource(router);
  const transition = createSignalFromSource(transitionSource);

  // Low-level: createStoreFromSource for route state (store-based, granular)
  const routeSource = createRouteSource(router);
  const routeStore: RouteSnapshot = createStoreFromSource(routeSource);

  // Custom navigation counter — skip initial effect run via prev tracking
  const [navCount, setNavCount] = createSignal(0);
  let initialized = false;

  createEffect(() => {
    // Track route name changes to count navigations
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    routeStore.route?.name;
    if (initialized) {
      setNavCount((c) => c + 1);
    }
    initialized = true;
  });

  return (
    <div class="card" style={{ "margin-bottom": "16px", "font-size": "13px" }}>
      <strong>Navigation Monitor (built with low-level primitives)</strong>
      <div
        style={{
          display: "grid",
          "grid-template-columns": "1fr 1fr 1fr",
          gap: "12px",
          "margin-top": "8px",
        }}
      >
        <div>
          <p style={{ color: "#888" }}>Current Route (store)</p>
          <p>
            <strong>{routeStore.route?.name ?? "—"}</strong>
          </p>
        </div>
        <div>
          <p style={{ color: "#888" }}>Previous Route (store)</p>
          <p>
            <strong>{routeStore.previousRoute?.name ?? "—"}</strong>
          </p>
        </div>
        <div>
          <p style={{ color: "#888" }}>Navigation Count</p>
          <p>
            <strong>{navCount()}</strong>
          </p>
        </div>
      </div>
      <Show when={transition().isTransitioning}>
        <p style={{ color: "#1565c0", "margin-top": "8px" }}>
          Transitioning to: {transition().toRoute?.name ?? "?"}
        </p>
      </Show>
      <p style={{ color: "#888", "margin-top": "8px" }}>
        Built with: <code>createSignalFromSource</code> (transition) +{" "}
        <code>createStoreFromSource</code> (route state)
      </p>
    </div>
  );
}
