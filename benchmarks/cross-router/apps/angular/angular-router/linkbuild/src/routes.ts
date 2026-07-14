import type { Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";

// link-build: 1000 routes r0..r999. The app mounts 1000 <a routerLink> on demand;
// the harness measures the ScriptDuration of building those hrefs + rendering.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

export const routes: Routes = [
  { path: "", component: HomeComponent },
  ...Array.from({ length: COUNT }, (_, i) => ({
    path: `r${i}`,
    component: HomeComponent,
  })),
];
