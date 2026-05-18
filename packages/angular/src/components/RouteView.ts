import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  contentChildren,
  effect,
  input,
  signal,
  type TemplateRef,
} from "@angular/core";
import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { createRouteNodeSource } from "@real-router/sources";

import { RouteMatch } from "../directives/RouteMatch";
import { RouteNotFound } from "../directives/RouteNotFound";
import { RouteSelf } from "../directives/RouteSelf";
import { injectRouter } from "../functions/injectRouter";
import { subscribeSourceToSignal } from "../internal/subscribeSourceToSignal";

import type { RouteSnapshot } from "@real-router/sources";

const EMPTY_SNAPSHOT: RouteSnapshot = {
  route: undefined,
  previousRoute: undefined,
};

@Component({
  selector: "route-view",
  template: `
    @if (activeTemplate()) {
      <ng-container [ngTemplateOutlet]="activeTemplate()!" />
    }
  `,
  imports: [NgTemplateOutlet],
})
export class RouteView {
  readonly nodeName = input<string>("", { alias: "routeNode" });

  readonly matches = contentChildren(RouteMatch, { descendants: true });
  readonly selfs = contentChildren(RouteSelf, { descendants: true });
  readonly notFounds = contentChildren(RouteNotFound, { descendants: true });

  readonly activeTemplate = computed<TemplateRef<unknown> | null>(
    () => this.matchedTemplate() ?? this.fallbackTemplate(),
  );

  private readonly router = injectRouter();
  private readonly routeState = signal<RouteSnapshot>(EMPTY_SNAPSHOT);

  private readonly matchEntries = computed(() => {
    const nodeName = this.nodeName();

    return this.matches().map((match) => {
      const segment = match.routeMatch();

      return {
        match,
        fullSegmentName: nodeName ? `${nodeName}.${segment}` : segment,
      };
    });
  });

  // The matched template (Match priority) is independent of the Self /
  // NotFound fallback chain. Splitting the two paths into separate computeds
  // localises re-runs: a change to `selfs()` / `notFounds()` no longer
  // re-evaluates the Match loop (review §8a LOW — RouteView activeTemplate
  // split).
  private readonly matchedTemplate = computed<TemplateRef<unknown> | null>(
    () => {
      const route = this.routeState().route;

      if (!route) {
        return null;
      }

      const routeName = route.name;

      for (const { match, fullSegmentName } of this.matchEntries()) {
        if (startsWithSegment(routeName, fullSegmentName)) {
          return match.templateRef;
        }
      }

      return null;
    },
  );

  // Fallback chain — only consulted when `matchedTemplate()` returned `null`.
  // Template priority: Self → NotFound. Selection rules differ on purpose:
  //   - **Self uses first-wins** (`.at(0)`) for parity with React / Preact /
  //     Solid / Vue, where the first matching `<Self>` token in declaration
  //     order wins.
  //   - **NotFound uses last-wins** (`.at(-1)`) intentionally — the fallback
  //     should be the most-recently-declared template so that consumers can
  //     override an inherited `<ng-template routeNotFound>` simply by
  //     re-declaring it lower in the projected content.
  private readonly fallbackTemplate = computed<TemplateRef<unknown> | null>(
    () => {
      const route = this.routeState().route;

      if (!route) {
        return null;
      }

      const routeName = route.name;

      if (routeName === this.nodeName()) {
        const first = this.selfs().at(0);

        if (first) {
          return first.templateRef;
        }
      }

      if (routeName === UNKNOWN_ROUTE) {
        const last = this.notFounds().at(-1);

        if (last) {
          return last.templateRef;
        }
      }

      return null;
    },
  );

  constructor() {
    // Reactive source-creation effect (#630 fix) — see
    // `packages/angular/CLAUDE.md` → "Directives use constructor + effect()".
    effect((onCleanup) => {
      const source = createRouteNodeSource(this.router, this.nodeName());

      onCleanup(
        subscribeSourceToSignal(source, (snap) => {
          this.routeState.set(snap);
        }),
      );
    });
  }
}
