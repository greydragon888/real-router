import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { injectRoute } from "@real-router/angular";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";

import type { OnDestroy, OnInit } from "@angular/core";

interface DocumentData {
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
export class DocumentComponent implements OnInit, OnDestroy {
  private readonly route = injectRoute();
  private readonly platformId = inject(PLATFORM_ID);
  private handle: ReturnType<typeof setTimeout> | undefined;

  readonly mode = computed(() => getSsrDataMode(this.route.routeState().route));
  readonly ssrData = computed<DocumentData | undefined>(
    () =>
      this.route.routeState().route.context.data as DocumentData | undefined,
  );
  readonly clientData = signal<DocumentData | null>(null);
  readonly data = computed<DocumentData | null | undefined>(
    () => this.ssrData() ?? this.clientData(),
  );

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.mode() !== "client-only" || this.ssrData() !== undefined) {
      return;
    }

    const { params, search } = this.route.routeState().route;

    this.handle = setTimeout(() => {
      this.clientData.set({
        id: params.id as string,
        format: search.format as string,
        body: `(client) PDF placeholder for ${params.id as string}`,
      });
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.handle !== undefined) {
      clearTimeout(this.handle);
    }
  }
}
