import type { StateStorage } from "zustand/middleware";

/**
 * localStorage can throw in Safari private mode or when quota is exceeded.
 * Swallowing errors avoids blank-page crashes on iOS.
 */
export function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(name, value);
      } catch {
        /* quota / private browsing */
      }
    },
    removeItem: (name) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.removeItem(name);
      } catch {
        /* noop */
      }
    },
  };
}
