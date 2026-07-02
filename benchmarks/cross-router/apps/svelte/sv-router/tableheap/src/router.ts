// sv-router table-heap variant — build N synthetic routes (?n=N) so the harness
// can measure the retained JS heap of holding the route table. sv-router keeps the
// routes object as plain path-keyed entries, so this is its table-memory footprint.
import { createRouter } from "sv-router";

import TableReady from "./TableReady.svelte";

import type { Routes } from "sv-router";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const routes = {
  "/": TableReady,
  ...Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`/r${i}`, TableReady]),
  ),
} as unknown as Routes;

export const { p, navigate, route } = createRouter(routes);
