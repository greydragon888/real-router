import { raiser } from "@real-router/core/utils";

// A static door: the binding names it, once, at module scope.
const atBuildPath = raiser("router", "buildPath");

export function staticDoor(): never {
  throw atBuildPath.type`a static door is written into the binding`;
}
