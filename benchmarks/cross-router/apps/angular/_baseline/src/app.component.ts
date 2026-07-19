import { ChangeDetectorRef, Component, inject, signal } from "@angular/core";

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

  // #1466 mirror (audit 07-18 K11): zoneless Angular schedules signal-driven CD on a
  // ~1 ms macrotask race (scheduleCallbackWithRafRace) — without a sync flush the
  // floor's navMsWall measured the SCHEDULER's cadence (~13× the real render work,
  // wall 0.988 ms vs task 0.080 ms), inverting "router overhead vs bare" for the
  // cohort. Flush synchronously so the floor measures the render itself.
  private readonly cdr = inject(ChangeDetectorRef);

  go(e: Event, v: "home" | "about", path: string): void {
    e.preventDefault();
    history.pushState(null, "", path);
    this.view.set(v);
    this.cdr.detectChanges();
  }
}
