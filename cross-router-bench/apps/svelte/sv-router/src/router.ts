import { createRouter } from "sv-router";

import About from "../../_shared/About.svelte";
import Home from "../../_shared/Home.svelte";
import UserRoute from "./UserRoute.svelte";

// createRouter maps path → component; params are read reactively from the
// module-level `route.params` (sv-router has no Link component — a global
// click handler intercepts <a href> whose target matches a route).
export const { p, navigate, route } = createRouter({
  "/": Home,
  "/about": About,
  "/users/:id": UserRoute,
});
