import { Component } from "@angular/core";

import { TransitionHostComponent } from "./transition-host.component";
import { Layout } from "../../../shared/Layout";

const LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

@Component({
  selector: "app-root",
  imports: [Layout, TransitionHostComponent],
  template: `
    <app-layout title="Real-Router — Motion Animations" [links]="links">
      <transition-host />
    </app-layout>
  `,
})
export class AppComponent {
  readonly links = LINKS;
}
