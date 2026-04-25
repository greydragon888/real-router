import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  contentChildren,
  inject,
  input,
  signal,
  DestroyRef,
  type OnInit,
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

const EMPTY_SNAPSHOT: RouteSnapshot = Object.freeze({
  route: undefined,
  previousRoute: undefined,
});

@Component({
  selector: "route-view",
  template: `
    @if (activeTemplate()) {
      <ng-container [ngTemplateOutlet]="activeTemplate()!" />
    }
  `,
  imports: [NgTemplateOutlet],
})
export class RouteView implements OnInit {
  readonly nodeName = input<string>("", { alias: "routeNode" });

  readonly matches = contentChildren(RouteMatch, { descendants: true });
  readonly selfs = contentChildren(RouteSelf, { descendants: true });
  readonly notFounds = contentChildren(RouteNotFound, { descendants: true });

  readonly activeTemplate = computed<TemplateRef<unknown> | null>(() => {
    const snapshot = this.routeState();
    const route = snapshot.route;

    if (!route) {
      return null;
    }

    const routeName = route.name;
    const entries = this.matchEntries();

    for (const { match, fullSegmentName } of entries) {
      if (startsWithSegment(routeName, fullSegmentName)) {
        return match.templateRef;
      }
    }

    // Self has priority over NotFound. First-wins to mirror NotFound's
    // last-wins inversion would be inconsistent with React/Preact/Solid/Vue
    // adapters where Self is "first wins"; Angular's contentChildren returns
    // declaration order, so picking [0] gives first-wins.
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
  });

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

  private readonly router = injectRouter();
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeState = signal<RouteSnapshot>(EMPTY_SNAPSHOT);

  ngOnInit(): void {
    const source = createRouteNodeSource(this.router, this.nodeName());

    this.routeState.set(source.getSnapshot());

    const unsub = source.subscribe(() => {
      this.routeState.set(source.getSnapshot());
    });

    this.destroyRef.onDestroy(() => {
      unsub();
      source.destroy();
    });
  }
}
