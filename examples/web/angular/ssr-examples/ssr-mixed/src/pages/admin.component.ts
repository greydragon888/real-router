import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

interface DashboardData {
  alerts: number;
  tickets: number;
}

@Component({
  selector: "admin-page",
  template: `
    <main data-testid="admin-dashboard">
      <h1>Admin dashboard (client-only)</h1>
      @if (data() === null) {
        <p data-testid="admin-loading">Loading…</p>
      } @else {
        <p data-testid="admin-data">
          {{ data()!.alerts }} alerts, {{ data()!.tickets }} open tickets
        </p>
      }
    </main>
  `,
})
export class AdminComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private handle: ReturnType<typeof setTimeout> | undefined;

  readonly data = signal<DashboardData | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Simulates a client-side fetch — server skipped the loader because of
    // `ssr: false`, so we fetch (or compute) the data here on hydration.
    this.handle = setTimeout(() => {
      this.data.set({ alerts: 3, tickets: 12 });
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.handle !== undefined) clearTimeout(this.handle);
  }
}
