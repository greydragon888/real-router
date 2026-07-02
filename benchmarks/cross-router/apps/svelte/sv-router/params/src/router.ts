// sv-router params variant — routes with 1/10/100 path params (/pN/:k1/.../:kN).
// sv-router extracts params while walking the matched route's segments; the leaf
// reports how many k-params it received (data-count) so the driver confirms arrival.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import { PARAM_COUNTS, paramPattern } from "../../../_shared/param-spec";
import ParamLeaf from "./ParamLeaf.svelte";

import type { Routes } from "sv-router";

const routes = {
  "/": Home,
  ...Object.fromEntries(
    PARAM_COUNTS.map((n) => [paramPattern(n, ":"), ParamLeaf]),
  ),
} as unknown as Routes;

export const { p, navigate, route } = createRouter(routes);
