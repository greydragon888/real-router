import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  computed,
  contentChildren,
  effect,
  inject,
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
  private readonly cdr = inject(ChangeDetectorRef);
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
  // Template priority: Self → NotFound. Both use **first-wins** (`.at(0)`) for
  // parity with React / Preact / Solid / Vue (#1439): the first matching
  // `<ng-template routeSelf>` / `<ng-template routeNotFound>` token in
  // declaration order wins; later duplicates are ignored. `contentChildren`
  // resolves matched directives in DOM/source order, so `.at(0)` is the
  // first-declared marker.
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
        const first = this.notFounds().at(0);

        if (first) {
          return first.templateRef;
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

      // Initial snapshot — applied during the effect's first flush (inside
      // Angular's change detection), so set the signal ONLY. A re-entrant
      // detectChanges() here would throw.
      this.routeState.set(source.getSnapshot());

      const unsub = source.subscribe(() => {
        this.routeState.set(source.getSnapshot());
        // #1466: commit the `ngTemplateOutlet` swap SYNCHRONOUSLY. The route
        // source notifies in the click task, but the template
        // `@if (activeTemplate())` only re-renders on a change-detection pass,
        // which zoneless Angular schedules asynchronously — a ~0.85 ms idle
        // felt-wall gap where `@angular/router` activates its outlet in-task.
        // The source callback fires from `router.navigate()` (OUTSIDE Angular
        // CD), so a local `detectChanges()` is safe here and materialises the
        // route DOM now, collapsing the gap. Mirrors `RealLink`'s direct-DOM
        // write — both bypass the deferred scheduler flush for a same-task commit.
        this.cdr.detectChanges();
      });

      onCleanup(() => {
        unsub();
        source.destroy();
      });
    });
  }
}
