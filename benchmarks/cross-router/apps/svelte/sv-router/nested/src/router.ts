// sv-router nested variant — a shared SectionLayout (the "/sec" layout) wraps two
// sibling leaves /sec/a and /sec/b. Switching a↔b keeps SectionLayout mounted
// (sv-router reuses tree[0] while it stays the same component) — only the leaf swaps.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import SecA from "./SecA.svelte";
import SecB from "./SecB.svelte";
import SectionLayout from "./SectionLayout.svelte";

export const { p, navigate, route } = createRouter({
  "/": Home,
  "/sec": {
    layout: SectionLayout,
    "/a": SecA,
    "/b": SecB,
  },
});
