import type { Route, Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";
import { LevelComponent } from "./pages/level.component";

// deep-config: a nested chain /deep/l1/l2/.../l90. Each level is a LevelComponent
// rendering <router-outlet> for the next level; the deepest matched level renders
// page-item (data-n = depth). Leaf detection is via ActivatedRoute.firstChild.
// DEEP_TARGETS is exported as this app's SINGLE SOURCE (audit 07-18 K19):
// app.component imports it instead of keeping a free twin copy — the unlinked
// depth-here/targets-there pair was the drift class that twice broke search.
export const DEEP_TARGETS = [3, 30, 60, 90] as const;
const DEEP_DEPTH = Math.max(...DEEP_TARGETS);

function buildLevel(k: number): Route {
  return {
    path: `l${k}`,
    component: LevelComponent,
    data: { depth: String(k) },
    children: k < DEEP_DEPTH ? [buildLevel(k + 1)] : [],
  };
}

export const routes: Routes = [
  { path: "", component: HomeComponent },
  {
    path: "deep",
    component: LevelComponent,
    data: { depth: "0" },
    children: [buildLevel(1)],
  },
];
