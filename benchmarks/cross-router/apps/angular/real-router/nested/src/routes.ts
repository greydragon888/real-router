import type { Route } from "@real-router/core";

// rr (Angular) nested variant — shared layout chain of DEPTH D (from `?n=`, default
// 1): sec(/sec) → l2(/l2) → … → l{D} → { a, b }. Toggling a↔b keeps the whole chain
// mounted (route-view reuses every ancestor); only the deepest match swaps.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;

function buildRoutes(): Route[] {
  const ab: Route[] = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];
  let node: Route = { name: `l${DEPTH}`, path: `/l${DEPTH}`, children: ab };
  for (let k = DEPTH - 1; k >= 2; k--) {
    node = { name: `l${k}`, path: `/l${k}`, children: [node] };
  }
  const sec: Route =
    DEPTH === 1
      ? { name: "sec", path: "/sec", children: ab }
      : { name: "sec", path: "/sec", children: [node] };
  return [{ name: "home", path: "/" }, sec];
}

export const routes: Route[] = buildRoutes();
