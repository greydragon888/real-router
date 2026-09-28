import { Component, signal } from "@angular/core";
import { RealLink } from "@real-router/angular";

import { COUNT, items } from "./routes";

// Mount 1000 <a realLink>s on demand; the harness measures the ScriptDuration
// of that mount (= 1000 href builds via the reverse-matcher + Link renders).
@Component({
  selector: "app-root",
  imports: [RealLink],
  template: `
    <button data-testid="mount-links" (click)="show.set(true)">mount</button>
    <main data-testid="page-ready">{{ show() ? "shown" : "idle" }}</main>
    @if (show()) {
      <nav>
        @for (i of items; track i) {
          <a realLink [routeName]="'r' + i" [attr.data-testid]="testid(i)"
            >r{{ i }}</a
          >
        }
      </nav>
    }
  `,
})
export class AppComponent {
  readonly items = items;
  readonly show = signal(false);

  testid(i: number): string | null {
    return i === COUNT - 1 ? "last-link" : null;
  }
}
