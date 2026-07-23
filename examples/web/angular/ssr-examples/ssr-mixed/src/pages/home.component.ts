import { Component, computed } from "@angular/core";
import { injectRoute, injectRouter } from "@real-router/angular";
import { invalidate } from "@real-router/ssr-data-plugin";

interface HomeData {
  greeting: string;
  fetchedAt: number;
  aborts: number;
}

@Component({
  selector: "home-page",
  template: `
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{{ data()?.greeting ?? "(no data)" }}</p>
      @if (data()?.fetchedAt !== undefined) {
        <p data-testid="fetched-at">{{ data()?.fetchedAt }}</p>
      }
      @if (data()?.aborts !== undefined) {
        <p data-testid="aborts">{{ data()?.aborts }}</p>
      }
      <button
        type="button"
        data-testid="refresh-btn"
        (click)="onRefresh()"
      >
        Refresh data
      </button>
    </main>
  `,
})
export class HomeComponent {
  private readonly route = injectRoute();
  private readonly router = injectRouter();

  readonly data = computed<HomeData | undefined>(
    () => this.route.routeState().route.context.data as HomeData | undefined,
  );

  // Escape hatch: mark "data" stale, then trigger a same-route reload.
  // Reload bypasses stabilizeState dedupe (#605), so injectRoute() re-emits
  // the fresh snapshot written by the plugin's subscribeLeave handler.
  onRefresh(): void {
    const current = this.route.routeState().route;

    invalidate(this.router, "data");
    void this.router.navigate(
      current.name,
      current.params,
      undefined,
      { reload: true },
    );
  }
}
