import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

const PARAM_COUNTS = [1, 10, 100] as const;

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      @for (n of counts; track n) {
        <a [routerLink]="link(n)" [attr.data-testid]="'link-param-' + n">{{
          n
        }}</a>
      }
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {
  readonly counts = PARAM_COUNTS;
  // /pN/v1/.../vN as a routerLink commands array.
  link(n: number): string[] {
    return [`/p${n}`, ...Array.from({ length: n }, (_, i) => `v${i + 1}`)];
  }
}
