import { useRoute, useRouteStore } from "@real-router/solid";
import { createEffect, createSignal } from "solid-js";

import type { JSX } from "solid-js";

function HeaderStore(): JSX.Element {
  const state = useRouteStore();
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- subscribe to params.id changes
    state.route?.params.id;
    setCount((c) => c + 1);
    console.log(
      `[Header Store] effect ran — id=${state.route?.params.id as string | undefined}, count=${count()}`,
    );
  });

  return (
    <div class="card">
      <strong>Header (useRouteStore → params.id)</strong>
      <p>User ID: {state.route?.params.id as string | undefined}</p>
      <p style={{ "font-size": "13px", color: "#888" }}>
        Effect count: {count()}
      </p>
    </div>
  );
}

function SidebarStore(): JSX.Element {
  const state = useRouteStore();
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- subscribe to search.page changes
    state.route?.search.page;
    setCount((c) => c + 1);
    console.log(
      `[Sidebar Store] effect ran — page=${state.route?.search.page as string | undefined}, count=${count()}`,
    );
  });

  return (
    <div class="card">
      <strong>Sidebar (useRouteStore → search.page)</strong>
      <p>
        Page: {(state.route?.search.page as string | undefined) ?? "default"}
      </p>
      <p style={{ "font-size": "13px", color: "#888" }}>
        Effect count: {count()}
      </p>
    </div>
  );
}

function SignalComparison(): JSX.Element {
  const routeState = useRoute();
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- subscribe to params.id changes
    routeState().route.params.id;
    setCount((c) => c + 1);
    console.log(`[Signal] effect ran — count=${count()}`);
  });

  return (
    <div class="card">
      <strong>Signal comparison (useRoute → params.id)</strong>
      <p>User ID: {routeState().route.params.id as string}</p>
      <p style={{ "font-size": "13px", color: "#888" }}>
        Effect count: {count()} — re-runs on ANY param change
      </p>
    </div>
  );
}

export function UserPage(): JSX.Element {
  return (
    <div>
      <h1>User Profile</h1>
      <p>
        Change <code>page</code> param above — Header (store) stays still,
        Sidebar (store) updates, Signal always updates.
      </p>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "12px",
          "margin-top": "16px",
        }}
      >
        <HeaderStore />
        <SidebarStore />
        <SignalComparison />
      </div>
    </div>
  );
}
