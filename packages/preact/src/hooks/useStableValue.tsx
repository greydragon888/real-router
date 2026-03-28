import { useMemo } from "preact/hooks";

export function useStableValue<T>(value: T): T {
  const serialized = JSON.stringify(value);

  // eslint-disable-next-line @eslint-react/exhaustive-deps
  return useMemo(() => value, [serialized]);
}
