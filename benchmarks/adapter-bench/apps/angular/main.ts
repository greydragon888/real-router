/**
 * Angular adapter-bench app — mirrors apps/react.tsx.
 * AOT-compiled by @analogjs/vite-plugin-angular (same as the cross-router
 * angular apps) — no JIT, no zone.js: zoneless change detection with an
 * explicit `appRef.tick()` as the synchronous commit after each navigation.
 */
import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import {
  injectRoute,
  injectRouteNode,
  provideRealRouter,
  RealLink,
  RouteMatch,
  RouteView,
} from "@real-router/angular";
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { MountedApp } from "../../shared/bench-utils.mjs";
import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
  { name: "about", path: "/about" },
];

@Component({
  selector: "root-subscriber",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [attr.data-i]="index" [attr.data-route]="name()">{{
    index
  }}</span>`,
})
class RootSubscriberComponent {
  readonly route = injectRoute();
  readonly name = () => this.route.routeState().route.name;
  index = 0;
}

@Component({
  selector: "items-subscriber",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [attr.data-i]="index" [attr.data-id]="id()">{{
    index
  }}</span>`,
})
class ItemsSubscriberComponent {
  readonly node = injectRouteNode("items");
  readonly id = () =>
    String(this.node.routeState().route?.params["id"] ?? "");
  index = 0;
}

@Component({
  selector: "items-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemsSubscriberComponent, RouteView, RouteMatch],
  template: `
    @for (i of indices; track i) {
      <items-subscriber />
    }
    <route-view routeNode="items">
      <ng-template routeMatch="details"><p>details</p></ng-template>
    </route-view>
  `,
})
class ItemsPageComponent {
  readonly indices = [0, 1, 2, 3, 4];
}

@Component({
  selector: "app-root",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RootSubscriberComponent, ItemsPageComponent, RealLink],
  template: `
    @for (i of indices; track i) {
      <root-subscriber />
    }
    <nav>
      @for (i of indices; track i) {
        <a
          realLink
          routeName="items"
          [routeParams]="{ id: itemId(i) }"
          activeClassName="active"
          >Items {{ i + 1 }}</a
        >
      }
      <a realLink routeName="home" activeClassName="active">Home</a>
      <a realLink routeName="about" activeClassName="active">About</a>
      <a
        realLink
        routeName="items.details"
        [routeParams]="{ id: '1' }"
        activeClassName="active"
        >Details 1</a
      >
    </nav>
    @if (isItems()) {
      <items-page />
    } @else {
      <p>{{ routeName() }}</p>
    }
  `,
})
class AppComponent {
  readonly indices = [0, 1, 2, 3, 4];
  readonly route = injectRoute();
  readonly routeName = () => this.route.routeState().route.name;
  readonly isItems = () => this.routeName().startsWith("items");
  itemId(i: number): string {
    return String(i + 1);
  }
}

export async function mountTestApp(
  container: HTMLElement,
  startPath: string,
): Promise<MountedApp> {
  const router = createRouter(routes);

  router.usePlugin(memoryPluginFactory());
  await router.start(startPath);

  const host = document.createElement("app-root");

  container.append(host);

  const appRef = await bootstrapApplication(AppComponent, {
    providers: [provideZonelessChangeDetection(), provideRealRouter(router)],
  });

  appRef.tick();

  return {
    commitNavigate: (name, params) => {
      void router.navigate(name, params);
      appRef.tick();
    },
    commitHistory: (dir) => {
      if (dir === "back") {
        router.back();
      } else {
        router.forward();
      }
      appRef.tick();
    },
    unmount: () => {
      appRef.destroy();
      host.remove();
    },
  };
}
