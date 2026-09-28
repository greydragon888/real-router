// sv-router active-links variant — a single /tab/:id route serves all 100 tabs.
// The 100 active-aware links live in App (each with the isActiveLink attachment),
// so every navigation re-runs all 100 active checks — the O(links) recompute cost
// active-links measures.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import TabLeaf from "./TabLeaf.svelte";

export const { p, navigate, route } = createRouter({
  "/": Home,
  "/tab/:id": TabLeaf,
});
