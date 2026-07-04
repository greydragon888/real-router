// sv-router search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). Query is NOT part of the route path in sv-router; the
// routes are plain `/sN` and the reactive query lives on `route.search` (a
// `Record<string, string | number | boolean>` parsed from location.search). The
// leaf reads EVERY value (readSearch → checksum) so the reactive query is actually
// materialized — apples-to-apples with real-router's eager params.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import { SEARCH_COUNTS } from "../../../_shared/search-param-spec";
import SearchLeaf from "./SearchLeaf.svelte";

import type { Routes } from "sv-router";

const routes = {
  "/": Home,
  ...Object.fromEntries(SEARCH_COUNTS.map((n) => [`/s${n}`, SearchLeaf])),
} as unknown as Routes;

export const { p, navigate, route } = createRouter(routes);
