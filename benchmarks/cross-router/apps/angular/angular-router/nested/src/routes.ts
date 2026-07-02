import type { Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";
import { LeafComponent } from "./pages/leaf.component";
import { SectionComponent } from "./pages/section.component";

// nested-switch: sibling leaves a/b under a shared SectionComponent. Toggling
// /sec/a ↔ /sec/b reuses the parent SectionComponent (only the child outlet
// swaps) — the "reuse axis".
export const routes: Routes = [
  { path: "", component: HomeComponent },
  {
    path: "sec",
    component: SectionComponent,
    children: [
      { path: "a", component: LeafComponent, data: { n: "a" } },
      { path: "b", component: LeafComponent, data: { n: "b" } },
    ],
  },
];
