import { useSyncExternalStore } from "react";

/** A number kept in localStorage that components can subscribe to. Server render sees `fallback`. */
export function storedNumber(key: string, fallback = 0) {
  const listeners = new Set<() => void>();

  const get = () => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : Number(raw) || 0;
    } catch {
      return fallback;
    }
  };

  const set = (value: number) => {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // Private mode or storage full: keep playing without saving.
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  };

  const useValue = () => useSyncExternalStore(subscribe, get, () => fallback);

  return { get, set, useValue };
}

export const bestScore = storedNumber("barricade-run:best");
export const mutedPref = storedNumber("barricade-run:muted");
