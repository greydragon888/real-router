import type { Route } from "@real-router/core";

// link-build variant — 1000 target routes; the app mounts 1000 <a realLink> on
// demand and the harness measures the ScriptDuration of that mount (1000 href
// builds + Link renders). Mirrors apps/solid/real-router/linkbuild.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
export const COUNT = _n > 0 ? _n : 1000;
export const items: number[] = Array.from({ length: COUNT }, (_, i) => i);

export const routes: Route[] = [
  { name: "home", path: "/" },
  ...items.map((i) => ({ name: `r${i}`, path: `/r${i}` })),
];
