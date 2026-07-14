import { Component, computed, input } from "@angular/core";
import { RealLink, RouteMatch, RouteView } from "@real-router/angular";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
export const DEPTH = _n > 0 ? _n : 1;

@Component({
  selector: "sec-leaf",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>{{ n() }}</h1>
  </main>`,
})
export class LeafComponent {
  readonly n = input<string>("");
}

// One layout level of the depth-D chain (recursive via self-import). Intermediate
// levels reuse via a single dynamic routeMatch to the next segment l{level+1}; the
// bottom level owns the a/b nav + switch.
@Component({
  selector: "chain-cmp",
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  imports: [RealLink, RouteMatch, RouteView, LeafComponent, ChainComponent],
  template: `
    @if (level() === depth()) {
      <div class="sec">
        <nav>
          <a realLink [routeName]="dotted() + '.a'" data-testid="link-sec-a">A</a>
          <a realLink [routeName]="dotted() + '.b'" data-testid="link-sec-b">B</a>
        </nav>
        <route-view [routeNode]="dotted()">
          <ng-template routeMatch="a"><sec-leaf n="a" /></ng-template>
          <ng-template routeMatch="b"><sec-leaf n="b" /></ng-template>
        </route-view>
      </div>
    } @else {
      <div class="lvl">
        <route-view [routeNode]="dotted()">
          <ng-template [routeMatch]="childSeg()">
            <chain-cmp
              [level]="level() + 1"
              [dotted]="dotted() + '.' + childSeg()"
              [depth]="depth()"
            />
          </ng-template>
        </route-view>
      </div>
    }
  `,
})
export class ChainComponent {
  readonly level = input.required<number>();
  readonly dotted = input.required<string>();
  readonly depth = input.required<number>();
  readonly childSeg = computed(() => `l${this.level() + 1}`);
}

@Component({
  selector: "app-root",
  imports: [RouteMatch, RouteView, ChainComponent],
  template: `
    <route-view [routeNode]="''">
      <ng-template routeMatch="home">
        <main data-testid="page-home"><h1>Home</h1></main>
      </ng-template>
      <ng-template routeMatch="sec">
        <chain-cmp [level]="1" [dotted]="'sec'" [depth]="depth" />
      </ng-template>
    </route-view>
  `,
})
export class AppComponent {
  readonly depth = DEPTH;
}
