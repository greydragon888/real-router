// Shared navigation manifest. Each engine wires the field it needs:
// real-router keys off `name` (route name), react-router/wouter off `path`.
// `testid` is the stable hook the engine-agnostic Playwright drivers click.
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
