import { Component, ElementRef, inject } from "@angular/core";
import {
  injectRouteEnter,
  injectRouteExit,
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { AboutComponent } from "./pages/about.component";
import { HomeComponent } from "./pages/home.component";
import { ProductDetailComponent } from "./pages/product-detail.component";
import { ProductsListComponent } from "./pages/products-list.component";
import { QueryDemoComponent } from "./pages/query-demo.component";

const LEAVING_CLASS = "leaving";
const ENTERING_CLASS = "entering";

@Component({
  selector: "transition-host",
  imports: [
    RouteMatch,
    RouteNotFound,
    RouteSelf,
    RouteView,
    HomeComponent,
    AboutComponent,
    ProductsListComponent,
    ProductDetailComponent,
    QueryDemoComponent,
  ],
  // Page-level wrapper. CSS class state ("leaving" / "entering")
  // triggers exit / entry keyframes; `Element.getAnimations() + .finished`
  // settles the router's leave Promise. The wrapper itself never
  // unmounts — only its inner RouteView re-renders when the router
  // commits.
  //
  // Why direct DOM `classList` manipulation instead of a signal-bound
  // `[class.leaving]`: signals commit asynchronously through Angular's
  // change-detection cycle, but `injectRouteExit`'s handler runs
  // synchronously inside the leave window. `getAnimations()` queried
  // immediately after a signal write would return `[]` because Angular
  // has not yet applied the class — the router would unblock with no
  // animation visible. `classList.add` is synchronous, so the keyframe
  // is registered in the same task and `getAnimations()` finds it.
  //
  // Reduced-motion fast path: when keyframes collapse to
  // `animation: none` via `@media (prefers-reduced-motion: reduce)`,
  // `getAnimations()` returns `[]`, so `Promise.allSettled([])`
  // resolves synchronously — the router never blocks.
  template: `
    <div class="page" (animationend)="onAnimationEnd($event)">
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="products">
          <route-view [routeNode]="'products'">
            <ng-template routeSelf><products-list /></ng-template>
            <ng-template routeMatch="detail"><product-detail /></ng-template>
          </route-view>
        </ng-template>
        <ng-template routeMatch="about"><about-page /></ng-template>
        <ng-template routeMatch="queryDemo"><query-demo-page /></ng-template>
        <ng-template routeNotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </ng-template>
      </route-view>
    </div>
  `,
})
export class TransitionHostComponent {
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  private getWrapper(): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector(".page");
  }

  constructor() {
    injectRouteExit(async ({ signal }) => {
      const wrapper = this.getWrapper();

      if (!wrapper) {
        return;
      }

      wrapper.classList.add(LEAVING_CLASS);

      const cleanup = (): void => {
        wrapper.classList.remove(LEAVING_CLASS);
        // Cancel keyframes explicitly — without this, the just-finished
        // forwards animation would still surface via getAnimations()
        // in the next entry frame.
        for (const animation of wrapper.getAnimations()) {
          animation.cancel();
        }
      };

      signal.addEventListener("abort", cleanup, { once: true });

      try {
        // Style flush — ensures the just-added class is visible to
        // getAnimations() in the same task.
        wrapper.getBoundingClientRect();
        await Promise.allSettled(
          wrapper
            .getAnimations()
            .map((animation: Animation) => animation.finished),
        );
      } finally {
        cleanup();
      }
    });

    injectRouteEnter(() => {
      const wrapper = this.getWrapper();

      if (!wrapper) {
        return;
      }

      wrapper.classList.add(ENTERING_CLASS);
    });
  }

  onAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    const wrapper = this.getWrapper();

    if (wrapper) {
      wrapper.classList.remove(ENTERING_CLASS);
    }
  }
}
