import { Component, input } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

import type { Routes } from "@angular/router";

// angular-router nested variant — shared layout chain of DEPTH D (from `?n=`,
// default 1) with sibling leaves a/b at the bottom. Toggling a↔b reuses every
// parent Section/Pass component (only the deepest outlet swaps) — the reuse axis.
const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

@Component({
  selector: "home-cmp",
  template: `<main data-testid="page-home"><h1>Home</h1></main>`,
})
export class HomeComponent {}

@Component({
  selector: "leaf-cmp",
  template: `<main data-testid="page-item" [attr.data-n]="n()"><h1>{{ n() }}</h1></main>`,
})
export class LeafComponent {
  readonly n = input<string>("");
}

@Component({
  selector: "pass-cmp",
  imports: [RouterOutlet],
  template: `<div class="lvl"><router-outlet /></div>`,
})
export class PassComponent {}

@Component({
  selector: "bottom-cmp",
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="sec">
      <nav>
        <a [routerLink]="aPath" data-testid="link-sec-a">A</a>
        <a [routerLink]="bPath" data-testid="link-sec-b">B</a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class BottomComponent {
  readonly aPath = `${deepPrefix}/a`;
  readonly bPath = `${deepPrefix}/b`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSec(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = {
    path: DEPTH === 1 ? "sec" : `l${DEPTH}`,
    component: BottomComponent,
    children: [
      { path: "a", component: LeafComponent, data: { n: "a" } },
      { path: "b", component: LeafComponent, data: { n: "b" } },
    ],
  };
  for (let k = DEPTH - 1; k >= 1; k--) {
    node = {
      path: k === 1 ? "sec" : `l${k}`,
      component: PassComponent,
      children: [node],
    };
  }
  return node;
}

export const routes: Routes = [
  { path: "", component: HomeComponent },
  buildSec(),
];
