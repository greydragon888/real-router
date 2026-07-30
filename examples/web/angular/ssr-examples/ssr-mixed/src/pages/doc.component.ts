import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { injectRoute } from "@real-router/angular";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";

interface DocData {
  id: string;
  format: string;
  body: string;
}

@Component({
  selector: "doc-page",
  template: `
    <main data-testid="doc">
      <h1>Doc (mode: {{ mode() }})</h1>
      @if (data(); as d) {
        <div>
          <p data-testid="doc-id">id: {{ d.id }}</p>
          <p data-testid="doc-format">format: {{ d.format }}</p>
          <p data-testid="doc-body">{{ d.body }}</p>
        </div>
      } @else {
        <p data-testid="doc-loading">Loading…</p>
      }
    </main>
  `,
})
export class DocComponent implements OnInit, OnDestroy {
  private readonly route = injectRoute();
  private readonly platformId = inject(PLATFORM_ID);
  private handle: ReturnType<typeof setTimeout> | undefined;

  readonly mode = computed(() => getSsrDataMode(this.route.routeState().route));
  readonly ssrData = computed<DocData | undefined>(
    () => this.route.routeState().route.context.data as DocData | undefined,
  );
  readonly clientData = signal<DocData | null>(null);
  readonly data = computed<DocData | null | undefined>(
    () => this.ssrData() ?? this.clientData(),
  );

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.mode() !== "client-only" || this.ssrData() !== undefined) return;

    const { params, search } = this.route.routeState().route;
    this.handle = setTimeout(() => {
      this.clientData.set({
        id: String(params.id),
        format: String(search.format),
        body: `(client) PDF placeholder for ${String(params.id)}`,
      });
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.handle !== undefined) clearTimeout(this.handle);
  }
}
