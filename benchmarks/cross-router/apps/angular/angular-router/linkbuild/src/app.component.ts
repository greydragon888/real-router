import { Component, signal } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

// The mount-links button flips `show`, rendering 1000 <a routerLink>. Each link
// builds its href via the router (reverse-matching) — the measured cost.
@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <button data-testid="mount-links" (click)="show.set(true)">mount</button>
    <main data-testid="page-ready">{{ show() ? "shown" : "idle" }}</main>
    <router-outlet />
    @if (show()) {
      <nav>
        @for (i of items; track i) {
          <a
            [routerLink]="'/r' + i"
            [attr.data-testid]="i === last ? 'last-link' : null"
            >r{{ i }}</a
          >
        }
      </nav>
    }
  `,
})
export class AppComponent {
  readonly items = Array.from({ length: COUNT }, (_, i) => i);
  readonly last = COUNT - 1;
  readonly show = signal(false);
}
