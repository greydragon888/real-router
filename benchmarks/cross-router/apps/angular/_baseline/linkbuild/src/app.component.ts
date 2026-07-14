import { Component, signal } from "@angular/core";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));

// _baseline linkbuild — 1000 plain <a>, NO router. The FLOOR for link-build:
// raw <a> render cost (href is a literal, no reverse-matcher).
@Component({
  selector: "app-root",
  template: `
    <button data-testid="mount-links" (click)="show.set(true)">mount</button>
    <main data-testid="page-ready">{{ show() ? "shown" : "idle" }}</main>
    @if (show()) {
      <nav>
        @for (i of items; track i) {
          <a
            [href]="'/r' + i"
            [attr.data-testid]="i === count - 1 ? 'last-link' : null"
            >r{{ i }}</a
          >
        }
      </nav>
    }
  `,
})
export class AppComponent {
  readonly count = _n > 0 ? _n : 1000;
  readonly items = Array.from({ length: this.count }, (_, i) => i);
  readonly show = signal(false);
}
