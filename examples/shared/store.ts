const data = new Map<string, unknown>();
const listeners = new Set<() => void>();

export const store = {
  get: (key: string): unknown => data.get(key),
  set: (key: string, value: unknown): void => {
    data.set(key, value);
    listeners.forEach((listener) => {
      listener();
    });
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);

    return (): void => {
      listeners.delete(listener);
    };
  },
  clear: (): void => {
    data.clear();
    listeners.forEach((listener) => {
      listener();
    });
  },
};
