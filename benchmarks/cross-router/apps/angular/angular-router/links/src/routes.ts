import type { Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";
import { TabComponent } from "./pages/tab.component";

// active-links: 100 sibling routes /tab/1..100. The page mounts 100 active-aware
// links (routerLinkActive); each navigation recomputes active across all of them.
const TAB_COUNT = 100;

export const routes: Routes = [
  { path: "", component: HomeComponent },
  ...Array.from({ length: TAB_COUNT }, (_, i) => {
    const n = i + 1;
    return { path: `tab/${n}`, component: TabComponent, data: { n: String(n) } };
  }),
];
