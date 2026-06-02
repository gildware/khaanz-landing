"use client";

import { useCallback, useSyncExternalStore } from "react";

const TAB_PARAM_EVENT = "khaanz:tab-param-change";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(TAB_PARAM_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(TAB_PARAM_EVENT, callback);
  };
}

/**
 * Keeps the active tab in sync with a URL query param so the selected tab
 * survives a page refresh (and is shareable/back-button friendly).
 *
 * Uses history.replaceState instead of the Next router so switching tabs
 * never triggers a navigation/data refetch. useSyncExternalStore lets the
 * server/first-client render use the default value (matching the SSR HTML)
 * and then resolve to the value from the URL after hydration, avoiding
 * hydration mismatches and tab flicker.
 */
export function useTabParam(defaultValue: string, key = "tab") {
  const getSnapshot = useCallback(() => {
    const param = new URLSearchParams(window.location.search).get(key);
    return param ?? defaultValue;
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set(key, next);
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event(TAB_PARAM_EVENT));
    },
    [key]
  );

  return [value, setTab] as const;
}
