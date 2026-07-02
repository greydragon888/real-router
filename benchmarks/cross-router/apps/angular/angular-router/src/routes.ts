import type { Routes } from "@angular/router";

import { AboutComponent } from "./pages/about.component";
import { HomeComponent } from "./pages/home.component";
import { UserComponent } from "./pages/user.component";

export const routes: Routes = [
  { path: "", component: HomeComponent },
  { path: "about", component: AboutComponent },
  { path: "users/:id", component: UserComponent },
];
