// @solidjs/router table-heap variant — N flat routes (?n=N) to size the route
// table for a heap measurement. Every route renders the same Ready leaf
// (page-ready, data-n=N). Config-route array, no layout.
import { Router } from "@solidjs/router";
import { render } from "solid-js/web";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

const n = Number(new URLSearchParams(window.location.search).get("n") ?? "1");

function Ready(): JSX.Element {
  return (
    <main data-testid="page-ready" data-n={String(n)}>
      ready
    </main>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: Ready },
  ...Array.from({ length: n }, (_, i) => ({ path: `/r${i}`, component: Ready })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router>{routes}</Router>, root);
}
