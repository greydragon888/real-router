import { Component, signal } from "@angular/core";

// Bare Angular, NO router — manual signal view + history.pushState. The FLOOR:
// cold-start + one navigation with zero router overhead.
@Component({
  selector: "app-root",
  template: `
    <nav>
      <a href="/" data-testid="link-home" (click)="go($event, 'home', '/')">Home</a>
      <a
        href="/about"
        data-testid="link-about"
        (click)="go($event, 'about', '/about')"
        >About</a
      >
    </nav>
    @if (view() === "home") {
      <main data-testid="page-home"><h1>Home</h1></main>
    } @else {
      <main data-testid="page-about"><h1>About</h1></main>
    }
  `,
})
export class AppComponent {
  readonly view = signal(location.pathname === "/about" ? "about" : "home");

  go(e: Event, v: "home" | "about", path: string): void {
    e.preventDefault();
    history.pushState(null, "", path);
    this.view.set(v);
  }
}
