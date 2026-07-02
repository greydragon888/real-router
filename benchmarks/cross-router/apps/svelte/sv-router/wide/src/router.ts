// sv-router wide variant — 1000 flat sibling routes (/catalog/item-1..1000).
// sv-router matches by sorting + linear-scanning the top-level route keys on
// every navigation, so this reveals its matcher scaling across a wide table.
// The 1000 static routes all map to one ItemRoute wrapper that recovers the item
// number from route.pathname (idiomatic for generated tables — no 1000 components).
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import { wideItems } from "../../../_shared/wide-spec";
import ItemRoute from "./ItemRoute.svelte";

import type { Routes } from "sv-router";

const routes = {
  "/": Home,
  ...Object.fromEntries(wideItems.map((n) => [`/catalog/item-${n}`, ItemRoute])),
} as unknown as Routes;

export const { p, navigate, route } = createRouter(routes);
