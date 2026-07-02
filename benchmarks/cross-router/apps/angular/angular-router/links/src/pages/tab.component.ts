import { Component, input } from "@angular/core";

// `n` (the tab index) is bound from the route's static `data.n`.
@Component({
  selector: "tab-page",
  template: `<main data-testid="page-tab" [attr.data-n]="n()">
    <h1>Tab {{ n() }}</h1>
  </main>`,
})
export class TabComponent {
  readonly n = input<string>("");
}
