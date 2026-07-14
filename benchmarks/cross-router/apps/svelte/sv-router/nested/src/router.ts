// sv-router nested variant — shared layout chain of DEPTH D (from `?n=`, default 1)
// with sibling leaves /sec/…/{a,b}. Switching a↔b keeps every ancestor layout
// mounted (sv-router reuses a tree node while its component stays the same) — only
// the leaf swaps. Config is nested D deep: /sec → /l2 → … → /l{D} → { /a, /b }.
import { createRouter } from "sv-router";

import Home from "../../../_shared/Home.svelte";
import PassLayout from "./PassLayout.svelte";
import SecA from "./SecA.svelte";
import SecB from "./SecB.svelte";
import SectionLayout from "./SectionLayout.svelte";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSec(): any {
  // deepest level owns the nav + a/b leaves
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = { layout: SectionLayout, "/a": SecA, "/b": SecB };
  for (let k = DEPTH - 1; k >= 1; k--) {
    node = { layout: PassLayout, [`/l${k + 1}`]: node };
  }
  return node;
}

export const { p, navigate, route } = createRouter({
  "/": Home,
  "/sec": buildSec(),
});
