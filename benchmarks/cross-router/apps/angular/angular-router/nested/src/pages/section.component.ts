import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

// Shared layout: the a/b nav lives here, plus a child <router-outlet> for the
// leaf. Reused across a↔b switches (the parent route node is unchanged).
@Component({
  selector: "section-page",
  imports: [RouterLink, RouterOutlet],
  template: `
    <div class="sec">
      <nav>
        <a routerLink="/sec/a" data-testid="link-sec-a">A</a>
        <a routerLink="/sec/b" data-testid="link-sec-b">B</a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class SectionComponent {}
