import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

// Single source — sweep targets live in ./routes.ts (WIDE_COUNT derives from their max),
// so the nav links and the route table can't drift.
import { WIDE_TARGETS } from "./routes";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      @for (n of targets; track n) {
        <a
          [routerLink]="'/catalog/item-' + n"
          [attr.data-testid]="'link-item-' + n"
          >Item {{ n }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly targets = WIDE_TARGETS;
}
