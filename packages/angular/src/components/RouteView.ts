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
export class RouteView {
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

    // Template priority: Self → NotFound (after Match has already been
    // resolved above). Selection rules differ on purpose:
    //   - **Self uses first-wins** (`.at(0)`) for parity with React /
    //     Preact / Solid / Vue, where the first matching `<Self>` token
    //     in declaration order wins. Angular's `contentChildren` returns
    //     declaration order, so `[0]` reproduces that semantic.
    //   - **NotFound uses last-wins** (`.at(-1)`) intentionally — the
    //     fallback should be the most-recently-declared template so that
    //     consumers can override an inherited `<ng-template routeNotFound>`
    //     simply by re-declaring it lower in the projected content.
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
  private readonly routeState = signal<RouteSnapshot>(EMPTY_SNAPSHOT);

  constructor() {
    // Reactive source-creation effect (#630 fix). Previously this setup
    // lived in `ngOnInit` with a one-time `this.nodeName()` read — meaning
    // `createRouteNodeSource` captured nodeName at mount and never
    // recreated on input change. If `<route-view [routeNode]="signal()">`
    // is bound to a signal in AOT, the original bug surface: source stays
    // bound to the original nodeName even after the input updates.
    //
    // Moving setup into `effect()` makes the source creation reactive to
    // `nodeName()` changes; previous source is torn down via `onCleanup`,
    // new one wired up. `matchEntries` (a separate `computed`) already
    // tracks `nodeName()` reactively, so the template-priority logic stays
    // consistent with the (possibly-changed) nodeName.
    //
    // Effect cleanup is bound to the injection-context's DestroyRef
    // automatically (no need for explicit `inject(DestroyRef)` plumbing).
    effect((onCleanup) => {
      const source = createRouteNodeSource(this.router, this.nodeName());

      this.routeState.set(source.getSnapshot());

      const unsub = source.subscribe(() => {
        this.routeState.set(source.getSnapshot());
      });

      onCleanup(() => {
        unsub();
        source.destroy();
      });
    });
  }
}
