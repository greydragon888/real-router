const data = new Map<string, unknown>();
const listeners = new Set<() => void>();

export const store = {
  get: (key: string) => data.get(key),
  set: (key: string, value: unknown) => {
    data.set(key, value);
    listeners.forEach((fn) => {
      fn();
    });
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn);

    return () => {
      listeners.delete(fn);
    };
  },
  clear: () => {
    data.clear();
    listeners.forEach((fn) => {
      fn();
    });
  },
};
