// Shared navigation manifest (Vue cohort). `testid` is the stable hook the
// engine-agnostic Playwright drivers click; each engine wires name/path.
export interface NavItem {
  name: string;
  path: string;
  testid: string;
  label: string;
}

export const NAV: NavItem[] = [
  { name: "home", path: "/", testid: "link-home", label: "Home" },
  { name: "about", path: "/about", testid: "link-about", label: "About" },
];
