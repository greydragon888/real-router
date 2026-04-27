// Type-only shim that lets React-typed libraries (motion) type-check
// against Preact's compat layer. The vite preset already aliases
// `react` / `react-dom` → `preact/compat` at runtime via
// @preact/preset-vite, so this declaration only fixes the TypeScript
// view to match the actual module resolution.
//
// Without this, motion's `children: ReactNode` and our Preact JSX's
// `VNode` are treated as different types, even though they are
// runtime-compatible through preact/compat.

declare module "react" {
  export * from "preact/compat";
}

declare module "react-dom" {
  export * from "preact/compat";
}
