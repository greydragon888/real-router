import { raiser } from "@real-router/core/utils";

// A dynamic door: the caller hands it in, so no reader can spell it.
export function dynamicDoor(methodName: string): never {
  const at = raiser("router", methodName);

  throw at.type`a dynamic door arrives as an argument`;
}
