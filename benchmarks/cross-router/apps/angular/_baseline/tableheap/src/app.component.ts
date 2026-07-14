import { Component } from "@angular/core";

// _baseline (bare Angular, NO router) floor for the cold-start route-count sweep —
// one minimal view (page-ready) at every ?n: the flat bare-framework boot floor.
@Component({
  selector: "app-root",
  template: `<main data-testid="page-ready">home</main>`,
})
export class AppComponent {}
