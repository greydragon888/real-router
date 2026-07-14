// _baseline (bare Angular, NO router) floor for the cold-start route-count sweep — one
// minimal view (page-ready) at every ?n: the flat bare-framework boot floor.
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app.component";

void bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
});
