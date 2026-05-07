import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

interface HomeData {
  greeting: string;
}

@Component({
  selector: "home-page",
  template: `
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{{ data()?.greeting ?? "(no data)" }}</p>
    </main>
  `,
})
export class HomeComponent {
  private readonly route = injectRoute();

  readonly data = computed<HomeData | undefined>(
    () => this.route.routeState().route.context.data as HomeData | undefined,
  );
}
