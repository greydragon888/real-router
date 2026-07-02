import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

const TAB_COUNT = 100;

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav>
      @for (i of tabs; track i) {
        <a
          [routerLink]="['/tab', i]"
          routerLinkActive="active"
          [attr.data-testid]="'link-tab-' + i"
          >Tab {{ i }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly tabs = Array.from({ length: TAB_COUNT }, (_, i) => i + 1);
}
