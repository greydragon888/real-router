import type { Routes } from "@angular/router";

import { ReadyComponent } from "./pages/ready.component";

// table-heap: build N synthetic routes (?n=N) so the harness can measure the
// retained heap of holding the route table. We never navigate to them — the home
// route renders page-ready; the rest are pure route-table memory.
const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

export const routes: Routes = [
  { path: "", component: ReadyComponent, data: { n: String(n) } },
  ...Array.from({ length: n }, (_, i) => ({
    path: `r${i}`,
    component: ReadyComponent,
    data: { n: String(n) },
  })),
];
