import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      <a routerLink="/" data-testid="link-home">Home</a>
      <a routerLink="/about" data-testid="link-about">About</a>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {}
