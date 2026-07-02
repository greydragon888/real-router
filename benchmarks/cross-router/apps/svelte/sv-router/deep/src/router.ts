// sv-router deep variant — a 90-level nested route chain /deep/l1/.../l90 with a
// layout at every level. Built recursively: each level is a nested Routes object
// with its own `layout`, an index route ("/") that renders the leaf when the URL
// terminates there, and a child "/l{k+1}" for the next level down.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import { DEEP_DEPTH } from "../../../_shared/deep-spec";
import DeepLayout from "./DeepLayout.svelte";
import DeepLeaf from "./DeepLeaf.svelte";

import type { Routes } from "sv-router";

function buildLevel(k: number): Routes {
  const node: Routes = { layout: DeepLayout, "/": DeepLeaf };
  if (k < DEEP_DEPTH) {
    node[`/l${k + 1}`] = buildLevel(k + 1);
  }
  return node;
}

export const { p, navigate, route } = createRouter({
  "/": Home,
  "/deep": { "/l1": buildLevel(1) },
} as Routes);
