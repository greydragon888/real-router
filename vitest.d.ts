import "vitest";

declare module "vitest" {
  interface TestTags {
    tags: "slow" | "performance" | "flaky";
  }
}
