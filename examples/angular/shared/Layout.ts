import { Component, input } from "@angular/core";
import { RealLink } from "@real-router/angular";

interface NavLink {
  routeName: string;
  label: string;
}

@Component({
  selector: "app-layout",
  imports: [RealLink],
  template: `
    <div class="app">
      <header class="header">{{ title() }}</header>
      <aside class="sidebar">
        @for (link of links(); track link.routeName) {
          <a realLink [routeName]="link.routeName" activeClassName="active">
            {{ link.label }}
          </a>
        }
      </aside>
      <main class="content">
        <ng-content />
      </main>
      <footer class="footer">&#64;real-router/angular</footer>
    </div>
  `,
})
export class Layout {
  readonly title = input.required<string>();
  readonly links = input.required<NavLink[]>();
}
