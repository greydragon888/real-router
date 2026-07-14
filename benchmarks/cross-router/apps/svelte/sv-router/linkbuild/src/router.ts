// sv-router link-build variant — register 1000 routes (/r0../r999) so the route
// table is built once at startup (like the other engines), then App mounts 1000
// <a> links on demand. Each href is built via p() — sv-router's path builder — so
// the harness measures that build + the link render (route construction done once).
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";

import type { Routes } from "sv-router";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

const routes = {
  "/": Home,
  ...Object.fromEntries(
    Array.from({ length: COUNT }, (_, i) => [`/r${i}`, Home]),
  ),
} as unknown as Routes;

export const { p, navigate, route } = createRouter(routes);
